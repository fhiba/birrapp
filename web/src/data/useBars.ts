import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import type { BarPin, BeerStyle, Brand } from './types'

export const BA_CENTER = { lat: -34.6037, lng: -58.3816 }
const OVER_FETCH = 2.5
const MAX_AGE_MS = 5 * 60_000
const MIN_QUERY_ZOOM = 12

export type Sort = 'distance' | 'cheapest'

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

  /** '' es "sin filtro". Sirve de clave y no choca con ningún slug. */
  const keyOf = (style?: string) => style ?? ''

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

  const covers = (c: google.maps.LatLngLiteral, radius: number, style?: string) => {
    const cur = covered.current.get(keyOf(style))
    if (!cur) return false
    if (Date.now() - cur.at > MAX_AGE_MS) return false
    return haversine(cur.center, c) + radius <= cur.radius
  }

  const project = useCallback((
    c: google.maps.LatLngLiteral, radius: number, sort: Sort, style?: string,
  ): BarPin[] => {
    // Ya no se filtra por estilo acá: lo hace el servidor, y con el precio
    // del estilo correcto. El filtro que había —descartar los que no tienen
    // precio— no filtraba por estilo en absoluto.
    const out = [...(known.current.get(style ?? '') ?? new Map<number, BarPin>()).values()]
      .map(b => ({ ...b, distanceMeters: haversine(c, { lat: b.lat, lng: b.lng }) }))
      .filter(b => b.distanceMeters! <= radius)
    out.sort(sort === 'cheapest'
      // NULLS LAST igual que el servidor: un bar sin precio fresco no puede
      // encabezar el ranking de más barata.
      ? (a, b) => (a.fromPrice ?? Infinity) - (b.fromPrice ?? Infinity)
      : (a, b) => a.distanceMeters! - b.distanceMeters!)
    return out.slice(0, 400)
  }, [])

  const load = useCallback(async (
    c: google.maps.LatLngLiteral, radius: number, sort: Sort,
    opts: { style?: string; force?: boolean; zoom?: number } = {},
  ) => {
    if (opts.zoom !== undefined && opts.zoom < MIN_QUERY_ZOOM) { setLoading(false); return }

    if (!opts.force && covers(c, radius, opts.style)) {
      setBars(project(c, radius, sort, opts.style)); setLoading(false); return
    }

    const mine = ++seq.current
    setLoading(true); setError(null)
    try {
      const big = Math.min(50_000, Math.max(1000, Math.round(radius * OVER_FETCH)))
      // El estilo VA en el pedido. Antes iba `undefined` y el filtro no
      // llegaba nunca al servidor.
      const fresh = await api.nearbyBars(c.lat, c.lng, big, 'distance', opts.style, 500)
      if (mine !== seq.current) return   // llegó una respuesta vieja, se descarta
      const k = keyOf(opts.style)
      known.current.set(k, new Map(fresh.map(b => [b.id, b])))
      covered.current.set(k, { center: c, radius: big, at: Date.now() })
      setBars(project(c, radius, sort, opts.style))
    } catch (e) {
      if (mine !== seq.current) return
      // Con datos en pantalla no se molesta con un cartel: sigue siendo
      // usable, sólo que sin refrescar.
      if ((known.current.get(keyOf(opts.style))?.size ?? 0) === 0) setError((e as Error).message)
      else setBars(project(c, radius, sort, opts.style))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [project])

  // Se limpia todo, no sólo el filtro activo: un precio nuevo puede cambiar
  // el pin de cualquiera de las cachés.
  const invalidate = useCallback(() => { covered.current.clear() }, [])

  return {
    bars, styles, brands, addBrand, loading, error, load, invalidate, MIN_QUERY_ZOOM,
  }
}

/**
 * Ubicación del navegador. Igual que en la app: nunca bloquea la primera
 * pintura.
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

export function useLocation() {
  const stored = useRef(readFix()).current
  const [coords, setCoords] = useState<google.maps.LatLngLiteral | null>(
    stored ? { lat: stored.lat, lng: stored.lng } : null,
  )
  const [denied, setDenied] = useState(false)
  const lastAt = useRef(stored?.at ?? 0)

  const locate = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      p => {
        const f = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() }
        lastAt.current = f.at
        writeFix(f)
        setCoords({ lat: f.lat, lng: f.lng })
      },
      () => {
        setDenied(true)
        // Sin permiso y sin nada guardado hay que mostrar algo: el centro.
        setCoords(c => c ?? BA_CENTER)
      },
      // `maximumAge` alto a propósito: dentro de una misma sesión, dos pedidos
      // seguidos reusan el fix del navegador en vez de encender el GPS.
      { enableHighAccuracy: true, timeout: 8000, maximumAge: FIX_FRESH_MS },
    )
  }, [])

  /** Pedido explícito —el botón de centrar—. Ahí sí vale mostrar el cartel. */
  const request = useCallback(() => {
    if (!navigator.geolocation) { setDenied(true); return }
    // Ya sabemos dónde estás y es reciente: no hay nada que preguntar.
    if (Date.now() - lastAt.current < FIX_FRESH_MS) return
    locate()
  }, [locate])

  useEffect(() => {
    if (askedThisLoad) return
    askedThisLoad = true

    if (!navigator.geolocation) { setDenied(true); setCoords(c => c ?? BA_CENTER); return }

    const perms = navigator.permissions?.query?.({ name: 'geolocation' as PermissionName })
    // Safari viejo no expone el permiso de geolocalización: no queda otra que
    // preguntar, como antes.
    if (!perms) { locate(); return }

    perms.then(status => {
      if (status.state === 'granted') { locate(); return }
      if (status.state === 'denied') { setDenied(true); setCoords(c => c ?? BA_CENTER); return }
      // 'prompt': con una posición guardada la app ya abre bien, así que el
      // cartel espera al botón. Sin ella no hay alternativa: se pregunta.
      if (stored) setDenied(false)
      else locate()
    }).catch(() => locate())
  }, [locate, stored])

  return { coords, denied, request }
}
