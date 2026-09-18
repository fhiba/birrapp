import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import type { BarPin, BeerStyle, Brand } from './types'

export const BA_CENTER = { lat: -34.6037, lng: -58.3816 }
const OVER_FETCH = 2.5

/**
 * Los techos de `/bars`, espejados del servidor (`core/Limits.kt` y Routes.kt:
 * MAX_RADIUS_M).
 *
 * Están acá y no sólo en el backend porque `covered` guarda lo que se pidió: si
 * el cliente pidiera de más y el servidor recortara, la caché anotaría una
 * cobertura que no tiene.
 *
 * **`MAX_LIMIT` valía 200 y por eso el radio mentía.** Los bares vuelven
 * ordenados por distancia, así que el tope recorta por afuera: con el radio en
 * 7,2 km desde Palermo hay 526 bares en rango y se veían los 200 más cercanos.
 * Uno a 4,7 km, bien dentro del radio, no aparecía porque tenía 377 más cerca
 * que él. Ver `core/Limits.kt` por qué el número nuevo es del tamaño de la base.
 */
const MAX_RADIUS = 20_000
const MAX_LIMIT = 1_000
const MAX_AGE_MS = 5 * 60_000

/** Los filtros que acotan QUÉ bares se traen. El orden y el radio van aparte. */
type Filtro = { style?: string[]; minRating?: number }
const MIN_QUERY_ZOOM = 12

export type Sort = 'distance' | 'cheapest' | 'rated'

function haversine(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral) {
  const R = 6_371_000, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Caché por región, igual que en Android.
 *
 * Se trae un área 2,5 veces más grande que la pantalla y mientras el usuario
 * se mueva dentro de ella todo sale de memoria. Las distancias se recalculan
 * en el cliente, así que ordenar por cercanía sigue siendo correcto desde
 * cualquier punto sin volver a consultar.
 *
 * Se cachea dónde están los bares, que casi no cambia — no cuánto salen, que
 * sí. El detalle siempre se pide fresco.
 */
export function useBars() {
  const [bars, setBars] = useState<BarPin[]>([])
  const [styles, setStyles] = useState<BeerStyle[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Una caché por filtro de estilo, no una sola.
  //
  // Con filtro, el servidor devuelve el precio DE ESE estilo, así que los
  // pines de "IPA" y los de "sin filtro" son datos distintos para el mismo
  // bar. Guardarlos juntos era el bug: se pedía siempre sin filtro y después
  // se pretendía filtrar en memoria algo que ya venía mezclado.
  const known = useRef(new Map<string, Map<number, BarPin>>())
  const covered = useRef(
    new Map<string, { center: google.maps.LatLngLiteral; radius: number; at: number }>(),
  )
  const seq = useRef(0)

  /**
   * La clave de la caché, que ahora es la combinación entera de filtros.
   *
   * Era sólo el slug del estilo. Con varios estilos y un piso de estrellas,
   * usar el primero —o cualquiera— haría que "IPA" y "IPA + APA" compartan
   * caché: al agregar el segundo estilo se verían los bares del primero.
   *
   * Se ordenan los slugs para que ["ipa","apa"] y ["apa","ipa"] sean la misma
   * clave: es la misma pregunta escrita en otro orden.
   */
  const keyOf = (f: Filtro = {}) =>
    `${[...(f.style ?? [])].sort().join(',')}|${f.minRating ?? ''}`

  useEffect(() => { api.styles().then(setStyles).catch(() => {}) }, [])
  useEffect(() => { api.brands().then(setBrands).catch(() => {}) }, [])

  /**
   * Una marca recién creada todavía no está en la lista del servidor —queda
   * pendiente de moderación— pero quien la creó tiene que poder usarla en el
   * mismo paso. Sin esto, cargar el precio de una marca nueva serían dos
   * viajes a la app: uno para crearla y otro, después de que la aprueben,
   * para cargar el precio.
   */
  const addBrand = useCallback((b: Brand) => {
    setBrands(cur => cur.some(x => x.slug === b.slug) ? cur : [...cur, b])
  }, [])

  /** Lo mismo para un estilo recién propuesto (BIR-35). */
  const addStyle = useCallback((s: BeerStyle) => {
    setStyles(cur => cur.some(x => x.slug === s.slug) ? cur : [...cur, s])
  }, [])

  const covers = (c: google.maps.LatLngLiteral, radius: number, f: Filtro) => {
    const cur = covered.current.get(keyOf(f))
    if (!cur) return false
    if (Date.now() - cur.at > MAX_AGE_MS) return false
    return haversine(cur.center, c) + radius <= cur.radius
  }

  const project = useCallback((
    c: google.maps.LatLngLiteral, radius: number, sort: Sort, f: Filtro,
  ): BarPin[] => {
    // Ya no se filtra por estilo acá: lo hace el servidor, y con el precio
    // del estilo correcto. El filtro que había —descartar los que no tienen
    // precio— no filtraba por estilo en absoluto.
    const out = [...(known.current.get(keyOf(f)) ?? new Map<number, BarPin>()).values()]
      .map(b => ({ ...b, distanceMeters: haversine(c, { lat: b.lat, lng: b.lng }) }))
      .filter(b => b.distanceMeters! <= radius)
    // NULLS LAST igual que el servidor, en los dos rankings: ni un bar sin
    // precio fresco puede encabezar "más barata", ni uno sin votos "mejor
    // puntuada". No saber no es ser el mejor.
    //
    // Ojo: acá se ordena por la nota REAL y el servidor lo hace por la que
    // lleva shrinkage, que no viaja. Es una diferencia chica y sólo en los
    // empates de arriba, pero está anotada porque el día que se note, la
    // respuesta es mandar también la nota de ordenar, no replicar la fórmula
    // en el cliente.
    out.sort(
      sort === 'cheapest'
        ? (a, b) => (a.fromPrice ?? Infinity) - (b.fromPrice ?? Infinity)
        : sort === 'rated'
          ? (a, b) => (b.rating ?? -1) - (a.rating ?? -1) ||
              a.distanceMeters! - b.distanceMeters!
          : (a, b) => a.distanceMeters! - b.distanceMeters!,
    )
    // El mismo techo que el pedido, y no uno más bajo.
    //
    // Acá había un `slice(0, 400)` que era un segundo recorte, tapado por el
    // primero: aunque el servidor mandara todo lo del radio, el cliente se
    // quedaba con los 400 más cercanos y el resto no llegaba a dibujarse. Dos
    // topes distintos para lo mismo garantizan que arreglar uno no arregle
    // nada, que es exactamente lo que pasó.
    return out.slice(0, MAX_LIMIT)
  }, [])

  const load = useCallback(async (
    c: google.maps.LatLngLiteral, radius: number, sort: Sort,
    opts: Filtro & { force?: boolean; zoom?: number } = {},
  ) => {
    if (opts.zoom !== undefined && opts.zoom < MIN_QUERY_ZOOM) { setLoading(false); return }

    if (!opts.force && covers(c, radius, opts)) {
      setBars(project(c, radius, sort, opts)); setLoading(false); return
    }

    const mine = ++seq.current
    setLoading(true); setError(null)
    try {
      // Los dos topes son los del servidor (Routes.kt: MAX_RADIUS_M y
      // MAX_LIMIT). Pedir de más no rompe nada —el backend recorta— pero
      // `covered` guardaría el radio pedido y no el servido, y a partir de ahí
      // la caché diría que cubre una zona que en realidad no tiene.
      const big = Math.min(MAX_RADIUS, Math.max(1000, Math.round(radius * OVER_FETCH)))
      // El estilo VA en el pedido. Antes iba `undefined` y el filtro no
      // llegaba nunca al servidor.
      const fresh = await api.nearbyBars(
        c.lat, c.lng, big, 'distance', opts.style, MAX_LIMIT, opts.minRating,
      )
      if (mine !== seq.current) return   // llegó una respuesta vieja, se descarta
      const k = keyOf(opts)
      known.current.set(k, new Map(fresh.map(b => [b.id, b])))
      // Si la respuesta vino llena, el servidor recortó por `limit` y lo que
      // realmente se cubrió no es `big` sino hasta el bar más lejano que llegó
      // —vienen ordenados por distancia, así que es el último—.
      //
      // Anotar `big` cuando hubo recorte era una mentira que se pagaba después:
      // `covers()` daba por cubierta una zona sin datos y no volvía a
      // consultar, así que al panear hacia el borde el mapa se veía vacío. Ya
      // pasaba con el tope viejo de 500; con 200 pasa más seguido.
      const reached = fresh.length < MAX_LIMIT
        ? big
        : Math.max(1000, Math.round(fresh[fresh.length - 1]?.distanceMeters ?? big))
      covered.current.set(k, { center: c, radius: reached, at: Date.now() })
      setBars(project(c, radius, sort, opts))
    } catch (e) {
      if (mine !== seq.current) return
      // Con datos en pantalla no se molesta con un cartel: sigue siendo
      // usable, sólo que sin refrescar.
      if ((known.current.get(keyOf(opts))?.size ?? 0) === 0) setError((e as Error).message)
      else setBars(project(c, radius, sort, opts))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [project])

  // Se limpia todo, no sólo el filtro activo: un precio nuevo puede cambiar
  // el pin de cualquiera de las cachés.
  const invalidate = useCallback(() => { covered.current.clear() }, [])

  return {
    bars, styles, brands, addBrand, addStyle, loading, error, load, invalidate, MIN_QUERY_ZOOM,
  }
}

/**
 * Ubicación del navegador. Igual que en la app: nunca bloquea la primera
 * pintura.
 *
 * **`coords` es null hasta que haya una posición real, y puede quedarse en
 * null para siempre.** Nunca se rellena con un valor por defecto: un punto
 * inventado ahí termina dibujado como el punto azul de "acá estás", y decirle
 * a alguien que está en el Obelisco cuando está en Quilmes es peor que no
 * decirle nada. Quien necesite un lugar donde apuntar la cámara resuelve el
 * defecto en su propio código —eso es encuadre, no una afirmación sobre dónde
 * está la persona— y mira `denied` para avisar que no se pudo ubicar.
 *
 * Tres reglas, todas para no vivir pidiendo permiso:
 *
 * 1. La última posición se guarda en localStorage. Al abrir se arranca de
 *    ahí, así que la app ya sirve antes de que el navegador conteste —y si no
 *    contesta nunca, sigue sirviendo.
 * 2. Un solo pedido por carga. El doble montaje de StrictMode y cualquier
 *    remontaje del árbol disparaban `getCurrentPosition` de nuevo, y cada
 *    llamada es otro cartel de permiso encima del anterior.
 * 3. Si el permiso todavía está en "preguntar" y hay una posición guardada,
 *    no se pregunta al abrir: se espera al botón de centrar, que es el gesto
 *    que de verdad quiere decir "dónde estoy". El cartel aparece cuando lo
 *    pediste, no cada vez que entrás.
 *
 * Lo que no se puede arreglar desde acá: iOS no recuerda el permiso entre
 * lanzamientos de una PWA instalada. Por eso importa el punto 1 — sin GPS la
 * app abre igual, donde la dejaste.
 */
const LAST_FIX_KEY = 'birrapp.lastFix'
/** Más viejo que esto y la posición guardada ya no sirve para centrar. */
const FIX_TTL_MS = 7 * 24 * 60 * 60_000
/** Con un fix más nuevo que esto, "centrar" no vuelve a molestar al GPS. */
const FIX_FRESH_MS = 60_000

type Fix = { lat: number; lng: number; at: number }

function readFix(): Fix | null {
  try {
    const raw = localStorage.getItem(LAST_FIX_KEY)
    if (!raw) return null
    const f = JSON.parse(raw) as Fix
    if (typeof f?.lat !== 'number' || typeof f?.lng !== 'number') return null
    return Date.now() - f.at > FIX_TTL_MS ? null : f
  } catch { return null }
}

function writeFix(f: Fix) {
  try { localStorage.setItem(LAST_FIX_KEY, JSON.stringify(f)) } catch { /* modo privado */ }
}

/**
 * Por carga de la app, no por componente: es lo que impide que el doble
 * montaje de StrictMode pida permiso dos veces seguidas.
 */
let askedThisLoad = false

/**
 * En qué estado está el permiso de ubicación.
 *
 * `denied` era un booleano y colapsaba dos situaciones que se arreglan de
 * formas opuestas: "el GPS no pudo darnos una posición", donde reintentar
 * sirve, y "la persona bloqueó la ubicación para el sitio", donde reintentar
 * **no puede funcionar** — el navegador contesta el error al instante y no
 * vuelve a preguntar nunca. Ofrecer un botón que no puede cumplir es la misma
 * clase de mentira que decirle a alguien que está en el Obelisco.
 */
export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unknown'

export function useLocation() {
  const stored = useRef(readFix()).current
  const [coords, setCoords] = useState<google.maps.LatLngLiteral | null>(
    stored ? { lat: stored.lat, lng: stored.lng } : null,
  )
  const [denied, setDenied] = useState(false)
  const [permission, setPermission] = useState<LocationPermission>('unknown')
  const lastAt = useRef(stored?.at ?? 0)

  const locate = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      p => {
        const f = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() }
        lastAt.current = f.at
        writeFix(f)
        setCoords({ lat: f.lat, lng: f.lng })
      },
      (err) => {
        // Bloqueo contra fallo. El código 1 es PERMISSION_DENIED, y es la
        // única señal que hay en Safari viejo, donde no existe la Permissions
        // API. Donde SÍ existe se prefiere aquélla: un prompt que la persona
        // cierra sin decidir también llega acá como código 1, pero el permiso
        // sigue en 'prompt' y reintentar todavía sirve.
        if (err.code === err.PERMISSION_DENIED && !navigator.permissions?.query) {
          setPermission('denied')
        }
        // Acá NO se rellena `coords` con nada.
        //
        // Antes caía en el Obelisco para "mostrar algo", y eso es lo que
        // dibujaba el punto azul de "acá estás" en pleno centro a todo el que
        // negara el permiso o cuyo GPS diera timeout. La app le decía a la
        // gente que estaba en un lugar donde no estaba, con la misma
        // confianza con la que muestra una ubicación real.
        //
        // El centro sigue sirviendo para APUNTAR LA CÁMARA —lo hace App.tsx—
        // pero eso es "por dónde empezar a mirar", que no es lo mismo que
        // "acá estás". `coords` guarda sólo posiciones reales; cuando no hay,
        // no hay punto azul.
        setDenied(true)
      },
      // `maximumAge` alto a propósito: dentro de una misma sesión, dos pedidos
      // seguidos reusan el fix del navegador en vez de encender el GPS.
      { enableHighAccuracy: true, timeout: 8000, maximumAge: FIX_FRESH_MS },
    )
  }, [])

  /**
   * Pedido explícito —el botón de centrar, o "Reintentar" en el cartel—.
   *
   * El atajo por frescura vale **sólo con el permiso ya dado**. Antes valía
   * siempre, y ahí estaba el bug: a quien tenía una posición guardada de una
   * sesión anterior pero el permiso todavía en `prompt` —permisos reseteados,
   * la PWA reinstalada, el navegador limpiando el sitio sin limpiar el
   * `localStorage`— el botón le salía por acá sin llegar nunca a
   * `getCurrentPosition`. O sea que **el navegador nunca preguntaba**, y la
   * única forma de dar el permiso era no tener el botón que lo pide.
   *
   * Con el permiso dado, el atajo se queda: dos toques seguidos no tienen por
   * qué encender el GPS de nuevo.
   */
  const request = useCallback(() => {
    if (!navigator.geolocation) { setDenied(true); return }
    if (permission === 'granted' && Date.now() - lastAt.current < FIX_FRESH_MS) return
    locate()
  }, [locate, permission])

  useEffect(() => {
    if (askedThisLoad) return
    askedThisLoad = true

    if (!navigator.geolocation) { setDenied(true); return }

    const perms = navigator.permissions?.query?.({ name: 'geolocation' as PermissionName })
    // Safari viejo no expone el permiso de geolocalización: no queda otra que
    // preguntar, como antes.
    if (!perms) { locate(); return }

    perms.then(status => {
      setPermission(status.state as LocationPermission)
      // Si la persona lo destraba desde la configuración del sitio, el estado
      // cambia sin recargar. Sin esto habría que decirle "y ahora recargá",
      // que es un paso más para algo que el navegador ya nos está avisando.
      status.onchange = () => {
        const next = status.state as LocationPermission
        setPermission(next)
        if (next === 'granted') { setDenied(false); locate() }
      }
      if (status.state === 'granted') { locate(); return }
      if (status.state === 'denied') { setDenied(true); return }
      // 'prompt', o sea que todavía no decidió.
      //
      // Con una posición guardada la app abre bien y no se interrumpe al
      // entrar: pedir el permiso de arranque, antes de que se vea para qué
      // sirve, es la forma más rápida de que lo nieguen para siempre.
      //
      // Pero antes acá se marcaba `denied = false` y se terminaba, y eso
      // dejaba a esa persona sin cartel y sin pedido: la app usaba una
      // posición vieja para siempre y nunca preguntaba nada. Ahora el pedido
      // no desaparece, sólo espera al botón — que con el arreglo de `request`
      // sí llega a `getCurrentPosition`.
      if (stored) { setDenied(false); return }
      locate()
    }).catch(() => locate())
  }, [locate, stored])

  return { coords, denied, permission, request }
}
