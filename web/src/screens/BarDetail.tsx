import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as api from '../data/api'
import * as fb from '../data/feedback'
import type {
  BarDetail as Bar, BeerStyle, Brand, MyRating, Photo, Review, StylePrice, User,
} from '../data/types'
import { isModerator } from '../data/types'
import {
  formatDistance, formatPrice, freshnessColor, shortAddress, shortAge,
} from '../data/format'
import { Confirm, Toast } from '../ui/Chrome'
import { ReportFlow } from './ReportFlow'
import { PriceHistory } from '../ui/PriceHistory'
import { Stars } from '../ui/Stars'
import { PillRow, chipStyle } from '../ui/PillRow'
import { PhotoStrip, Thumb } from '../ui/PhotoStrip'
import { SumarEnRotulo } from '../ui/Kit'
import { BeerComments } from '../ui/BeerComments'
import { KARMA, KARMA_VISIBLE } from '../data/karma'

/**
 * Lo que suma cada aporte de esta pantalla, para mostrarlo adentro del botón.
 *
 * Los números y el interruptor viven en `data/karma.ts`: hoy no se dibujan
 * porque el sistema de karma todavía no existe, y prometer una recompensa que
 * no llega gasta el gesto una sola vez. Los alias se quedan para que el día
 * que se prenda no haya que volver a buscar dónde iba cada uno.
 */
const PTS_CONFIRMAR = KARMA.confirmar
const PTS_PRECIO = KARMA.precio

/**
 * El vidrio espresso de los botones que flotan sobre la portada.
 *
 * Sale del token y no de un `rgba()` escrito a mano: es el fondo de la app al
 * 62%, así que el día que el espresso cambie de tono, los botones cambian con
 * él. Sin esto, sobre una foto clara un botón de `--film-2` desaparece.
 *
 * Los dos van juntos y en este orden: donde `color-mix` no exista —Safari
 * viejo— el shorthand se descarta entero y queda el `--elevated` opaco, que es
 * feo pero se ve. Un botón sin fondo sobre una foto es un ícono flotando.
 */
const VIDRIO_ESPRESSO = 'color-mix(in srgb, var(--base) 62%, transparent)'
const VIDRIO_FALLBACK = 'var(--elevated)'

/**
 * El filtro de ese vidrio, y el `brightness` no es adorno.
 *
 * El tinte al 62% deja pasar el 38% de lo que haya atrás, y atrás hay una foto
 * de la que no sabemos nada. Con una foto blanca —el peor caso, y es un caso
 * real: una pared de bar con flash— el fondo del botón compone rgb(114,105,111),
 * y ahí el corazón de favorito en `--favorito` daba **1,65:1**. Por debajo del
 * 3:1 que WCAG 1.4.11 pide para un ícono, y encima peor que el mismo corazón
 * SIN marcar, que es `--cream` y da 5,20: el estado "es mío" se veía peor que
 * el estado "no es mío", que es al revés de lo que el botón quiere decir.
 *
 * `brightness()` oscurece **lo de atrás**, no lo tapa: la foto se sigue viendo
 * y se sigue moviendo, apenas bajada de luz. Con .45 el peor caso pasa a
 * rgb(60,52,58) y el coral da **3,76:1** (el hueso, 11,84). Sobre una foto
 * oscura no cambia nada —multiplicar 0 por .45 sigue dando 0— así que no abre
 * un pozo negro donde hoy se ve bien.
 *
 * La otra salida era subir el tinte, y por eso no se eligió: para que el coral
 * llegara a 3:1 hacía falta `--base` al 80%, y a esa altura lo de atrás ya no
 * se ve. Sería pintar el botón de espresso y seguir llamándolo vidrio.
 *
 * El .45 es el mismo de `.glass` en theme.css y sale del mismo cálculo. Va
 * como constante y no escrito en cada botón porque son cinco botones en dos
 * pantallas y el día que el número se mueva tiene que moverse en los cinco.
 */
const VIDRIO_FILTRO = 'blur(10px) brightness(.45)'

/**
 * Identidad de una birra: estilo + marca.
 *
 * Existe como función y no como campo porque el estilo solo dejó de nombrar a
 * la cerveza. Un bar puede tener dos IPA, y decirle "IPA" a las dos —en el
 * historial, en la denuncia, en el diálogo de borrar— hace que el usuario
 * confirme una acción sobre una birra distinta de la que está mirando.
 */
const beerName = (p: StylePrice) =>
  p.brandName ? `${p.styleName} · ${p.brandName}` : p.styleName

/** Clave estable de una birra, para `key` y para marcar cuál está ocupada. */
const beerKey = (p: StylePrice) => `${p.styleSlug}|${p.brandSlug ?? ''}`

export function BarDetailScreen({
  user, center, styles, brands, onBrandCreated, onStyleCreated, onChanged, favorites,
}: {
  user: User | null
  center: google.maps.LatLngLiteral | null
  styles: BeerStyle[]
  brands: Brand[]
  onBrandCreated: (b: Brand) => void
  onStyleCreated: (s: BeerStyle) => void
  onChanged: () => void
  /** El conjunto de favoritos y su interruptor; ver useFavorites. */
  favorites: { ids: Set<number>; toggle: (barId: number) => void }
}) {
  const { id } = useParams()
  const barId = Number(id)
  const nav = useNavigate()
  const isFavorite = favorites.ids.has(barId)
  // Las birras favoritas de quien mira, para decidir qué tres pastillas van
  // adelante. Sin sesión quedan vacías y manda la puntuación, que es el
  // desempate para el que no eligió nada.
  const favStyles = new Set(user?.favoriteStyles ?? [])
  const favBrands = new Set(user?.favoriteBrands ?? [])

  const [bar, setBar] = useState<Bar | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reporting, setReporting] =
    useState<{ style?: string; brand?: string | null } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [history, setHistory] = useState<StylePrice | null>(null)
  const [reportingBad, setReportingBad] = useState<StylePrice | null>(null)
  const [modMode, setModMode] = useState(false)
  // `null` es "todavía no contestó el servidor" y `[]` es "no hay fotos". Son
  // dos cosas distintas y el layout las trata distinto: ver `hayCabecera`.
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [mine, setMine] = useState<MyRating[]>([])
  // La birra elegida se guarda como (estilo, marca) y no como un índice: si
  // se actualiza un precio y la lista se reordena, un índice apuntaría a otra
  // cerveza.
  const [tab, setTab] = useState<{ style: string; brand: string | null } | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [confirmPhoto, setConfirmPhoto] = useState<Photo | null>(null)
  const [confirmPrice, setConfirmPrice] = useState<StylePrice | null>(null)

  // Cerrar arrastrando hacia abajo: el mismo gesto con el que la ficha se
  // abrió desde el mapa, al revés. Sólo cuenta desde arriba de todo — más
  // abajo un arrastre vertical es scroll y nada más.
  const scroller = useRef<HTMLDivElement | null>(null)
  const gesture = useRef<{ x: number; y: number; live: boolean } | null>(null)
  const [pull, setPull] = useState(0)
  const [pulling, setPulling] = useState(false)
  const [closing, setClosing] = useState(false)

  // Primero la ficha termina de irse, después se navega. Al revés se
  // desmontaría en pleno arrastre y el mapa aparecería de golpe.
  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => nav(-1), 180)
    return () => clearTimeout(t)
  }, [closing, nav])

  const load = useCallback(async () => {
    try {
      setBar(await api.barDetail(barId, center?.lat, center?.lng))
      setReviews(await api.reviews(barId).catch(() => []))
      setPhotos(await api.barPhotos(barId).catch(() => []))
      // Sin sesión no hay votos propios que pintar, y el endpoint pide auth.
      setMine(api.currentUser() ? await api.myRatings(barId).catch(() => []) : [])
    } catch (e) { setError((e as Error).message) }
  }, [barId, center])

  useEffect(() => { load() }, [load])

  /**
   * El pulgar de una foto (BIR-10).
   *
   * Optimista: es la acción más barata de la pantalla y esperar al servidor
   * para pintarla la vuelve cara. Si falla se vuelve atrás, que es lo único
   * honesto cuando el número que se muestra no es el que quedó guardado.
   *
   * La foto del mes NO se recalcula acá: puede cambiar de dueña con este voto,
   * pero saberlo pide preguntarle al servidor, y una banda que salta de foto
   * mientras se vota se lee como un error. Se acomoda en la próxima carga.
   */
  const vote = useCallback(async (photo: Photo) => {
    const on = !photo.votedByMe
    fb.tap()
    const shift = (d: number) => setPhotos(cur => cur && cur.map(x =>
      x.id === photo.id ? { ...x, votedByMe: d > 0, votes: x.votes + d } : x))

    shift(on ? 1 : -1)
    try {
      const r = await api.votePhoto(photo.id, on)
      setPhotos(cur => cur && cur.map(x => x.id === photo.id ? { ...x, ...r } : x))
    } catch (e) {
      shift(on ? -1 : 1)
      setToast((e as Error).message)
    }
  }, [])

  // Nota: hasta la 0.9.0 se entraba acá con `?precio=1` desde el mapa y la
  // carga de precio se abría sola. Ya no: el "+" del mapa abre el flujo entero
  // —estilo, marca, bar y recién el monto— sin pasar por la ficha.

  /**
   * El embudo de las tres mutaciones de precio: confirmar, cargar y borrar.
   *
   * `load()` sólo recarga ESTA ficha. Sin el `onChanged()` de abajo, el pin del
   * mapa se quedaba con el precio viejo hasta que la caché de `useBars` se
   * vencía sola a los cinco minutos —o hasta recargar la app entera, que fue lo
   * que hubo que hacer para verlo—. Cargabas un precio, volvías al mapa y el
   * bar seguía diciendo lo de antes: la app parecía haber perdido el reporte.
   *
   * Va acá y no en cada botón porque los tres usos de `act` son precios y todos
   * mueven el pin. Un cuarto uso que no lo moviera tendría que decirlo, no al
   * revés: olvidarse de invalidar es el bug que estamos arreglando.
   */
  const act = async (fn: () => Promise<unknown>, slug?: string) => {
    setBusy(slug ?? '·')
    try {
      const r = await fn() as { message?: string }
      // Acá pasan las tres mutaciones de precio, que son el aporte que más se
      // repite: confirmar, cargar y borrar. Es el mejor lugar para el aviso,
      // porque es el único por el que pasan las tres.
      fb.exito()
      setToast(r?.message ?? 'Listo')
      await load()
      onChanged()
    }
    catch (e) { fb.error(); setToast((e as Error).message) }
    finally { setBusy(null) }
  }

  if (error) return (
    <Centered>
      <p style={{ color: 'var(--muted)' }}>{error}</p>
      <button onClick={load} className="lbl cta" style={{
        marginTop: 12, padding: '12px 16px', borderRadius: 'var(--r-2)',
        background: 'var(--acento)', color: 'var(--base)',
      }}>Reintentar</button>
    </Centered>
  )
  if (!bar) return <Centered><div className="spinner" /></Centered>

  // El barrio sí queda: en una ciudad que no conocés, "Palermo" ubica. Lo que
  // se va es el resto de la dirección — ver `shortAddress`.
  const meta = [formatDistance(bar.distanceMeters), bar.neighbourhood, shortAddress(bar.address)]
    .filter(Boolean).join(' · ')

  // El promedio del bar no se guarda: sale de sus birras. Guardarlo aparte
  // daría dos números que se pueden contradecir, y con el tiempo se
  // contradicen.
  //
  // Dos cosas que lo definen:
  //
  // 1. Sólo entran las birras votadas. Una birra sin nota NO es un cero: es
  //    ausencia de dato, y meterla como cero hundiría el promedio de un bar
  //    por tener una birra que nadie probó todavía.
  //
  // 2. Va `ratingRaw`, el promedio real, y no `ratingAvg`. El segundo lleva
  //    shrinkage hacia un prior de 3,5 y sirve para ordenar; usado acá hacía
  //    que un único voto de 5 mostrara 3,8 —el 5 promediado contra el prior,
  //    no contra un cero—. Es el mismo error que ya se había corregido en la
  //    nota de cada birra y que acá quedó sin corregir.
  //
  // La ponderación por cantidad de votos sí se queda: una birra con treinta
  // votos tiene que pesar más que una con uno.
  const voted = bar.prices.filter(p => p.ratingRaw != null && p.ratingCount > 0)
  const votes = voted.reduce((n, p) => n + p.ratingCount, 0)
  const barAvg = votes > 0
    ? voted.reduce((n, p) => n + p.ratingRaw! * p.ratingCount, 0) / votes
    : null

  /**
   * La portada del bar.
   *
   * En el modelo no hay una foto "del bar": las fotos son de una birra. Pero
   * la mejor foto que sacaron acá adentro es lo más parecido a la cara del
   * lugar que tenemos, y es un dato real y no una imagen de archivo. Así que
   * la portada es la foto del mes, y si no la más votada.
   *
   * Sin fotos no hay portada, y la ficha arranca como arrancaba. Un rectángulo
   * gris de 216px diciendo "todavía nadie sacó una foto" es media pantalla
   * gastada en una ausencia — y arriba de todo, que es el lugar más caro.
   *
   * Las fotos se piden después que la ficha —el nombre y el precio son lo
   * que se vino a ver, y adelantarlas los atrasaría a ellos— así que hay un
   * rato en que la ficha ya está dibujada y todavía no se sabe si hay
   * portada. Ese rato se resuelve abajo, en `hayCabecera`, y no dejando el
   * hueco sin reservar: insertar 216px arriba de todo cuando llegan las fotos
   * empuja hacia abajo justo lo que la persona está leyendo, y a veces justo
   * mientras apunta el dedo a "Sigue igual".
   */
  const portada = photos && photos.length > 0
    ? [...photos].sort((a, b) =>
      Number(b.topOfMonth) - Number(a.topOfMonth) || b.votes - a.votes)[0]
    : null

  /*
   * Si arriba va una banda de 216px, y por qué se reserva antes de saberlo.
   *
   * Mientras `photos` es null no se sabe, así que el alto se reserva igual con
   * un esqueleto: la banda ocupa su lugar desde el primer dibujo y, cuando la
   * respuesta llega, o se llena con la foto —sin mover un pixel, que es el
   * caso que importa— o se cierra.
   *
   * Sí: si el bar no tiene fotos, la banda se cierra y el contenido sube. Se
   * elige ese lado a propósito. Un esqueleto que se achica ya venía diciendo
   * "acá falta algo por llegar", así que cerrarse se lee como la respuesta;
   * un bloque que aparece de la nada y te corre la pantalla no se lee como
   * nada, se lee como que la app se movió sola. Y la app no sabe cuál de los
   * dos casos le tocó: lo único que puede hacer es elegir cuál de los dos
   * errores comete.
   *
   * La alternativa de dejar la banda puesta cuando no hay fotos está
   * descartada arriba: medio teléfono de rectángulo gris anunciando una
   * ausencia, y en el lugar más caro de la pantalla.
   */
  const cargandoFotos = photos == null
  const hayCabecera = portada != null || cargandoFotos

  /**
   * Los tres estados que la ficha puede afirmar con datos que tiene.
   *
   * Nada de "abierto ahora": el modelo no guarda horarios, y un cartel verde
   * que dice que el bar está abierto cuando nadie lo sabe es peor que no
   * decir nada. Lo que sí sabemos:
   *
   *  - **Al día**: todos los precios cargados se reportaron hace menos de 14
   *    días. Es la promesa entera de la app cumplida en este bar.
   *  - **Cuántas canillas** hay cargadas, que es el tamaño de lo que vas a
   *    encontrar acá adentro.
   *  - **Verificado · N**: cuánta gente hay detrás del precio mejor
   *    respaldado. Desde tres reportes el precio deja de ser el último que
   *    alguien tiró y pasa a ser la mediana de esa gente.
   */
  const conPrecio = bar.prices.filter(p => p.price != null)
  const alDia = conPrecio.length > 0 && conPrecio.every(p => p.freshness === 'fresh')
  const respaldo = Math.max(0, ...bar.prices.map(p => p.voters ?? 0))

  /**
   * Guarda la nota de una birra.
   *
   * Vivía adentro de la hoja de comentarios, que es de donde salió: puntuar
   * obligaba a abrirla. Ahora las estrellas están con la birra y guardan solas
   * — es una nota por persona, así que tocar de nuevo corrige la anterior.
   */
  const rate = async (p: StylePrice, n: number) => {
    if (!user) return nav('/perfil')
    fb.tap()
    try {
      await api.rateBeer({
        barId, styleSlug: p.styleSlug, brandSlug: p.brandSlug, rating: n,
      })
      await load()
    } catch (e) { setToast((e as Error).message) }
  }

  /**
   * Retirar la nota propia (BIR-11).
   *
   * Se podía corregir tocando otra estrella pero no sacar, así que quien votó
   * una birra que el bar dejó de tener seguía contando para siempre en el
   * promedio de algo que ya no se sirve.
   *
   * Sin diálogo de confirmación, a diferencia de borrar una foto o un
   * comentario: ahí se pierde algo que no vuelve, acá se vuelve tocando una
   * estrella. Confirmar lo que se deshace con un toque es un paso de más.
   */
  const retract = async (p: StylePrice) => {
    try {
      await api.retractRating({
        barId, styleSlug: p.styleSlug, brandSlug: p.brandSlug,
      })
      await load()
    } catch (e) { setToast((e as Error).message) }
  }

  const myRatingOf = (p: StylePrice) =>
    mine.find(m => m.styleSlug === p.styleSlug && m.brandSlug === p.brandSlug)?.rating ?? null

  // Las birras vienen agrupadas por estilo desde la API, con las marcas de un
  // mismo estilo contiguas. Acá sólo se parten en grupos: el orden lo decide
  // el servidor y duplicarlo del lado del cliente sería una segunda fuente de
  // verdad para lo mismo.
  const groups: { slug: string; name: string; beers: StylePrice[] }[] = []
  for (const p of bar.prices) {
    const last = groups[groups.length - 1]
    if (last && last.slug === p.styleSlug) last.beers.push(p)
    else groups.push({ slug: p.styleSlug, name: p.styleName, beers: [p] })
  }

  // La selección se resuelve al vuelo, con dos niveles de repliegue: la birra
  // exacta, si no la primera de ese estilo, si no la primera de todas. Hace
  // falta porque la lista cambia bajo los pies —se carga un precio, se borra
  // otro— y una marca elegida puede dejar de existir.
  const group = groups.find(g => g.slug === tab?.style) ?? groups[0] ?? null
  const active =
    group?.beers.find(b => b.brandSlug === (tab?.brand ?? null)) ?? group?.beers[0] ?? null

  // Las fotos son de la birra, no del estilo: sin filtrar por marca, las de la
  // IPA de Antares aparecían debajo de la de Juguetes Perdidos.
  const beerPhotos = active && photos
    ? photos.filter(f => f.styleSlug === active.styleSlug && f.brandSlug === active.brandSlug)
    : []

  // Los diálogos y el visor de fotos son hijos de este contenedor, así que
  // sus toques burbujean hasta acá. Con uno abierto el arrastre es de él.
  const overlayOpen = !!(
    reporting || confirmDelete || history || reportingBad ||
    viewing != null || confirmPhoto || confirmPrice
  )

  const onTouchStart = (e: React.TouchEvent) => {
    gesture.current = null
    if (overlayOpen || closing) return
    if ((scroller.current?.scrollTop ?? 0) > 0) return
    const t = e.touches[0]
    gesture.current = { x: t.clientX, y: t.clientY, live: false }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current
    if (!g) return
    const t = e.touches[0]
    const dx = t.clientX - g.x
    const dy = t.clientY - g.y
    if (!g.live) {
      // Hasta que el gesto no se define, nada se mueve: si arranca de costado
      // —las pestañas de birras, la tira de fotos— o hacia arriba, es de otro.
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { gesture.current = null; return }
      g.live = true
      setPulling(true)
    }
    // Sigue al dedo a media velocidad: se siente elástico y el umbral no se
    // cruza sin querer al empezar a scrollear desde arriba.
    setPull(Math.max(0, dy) * .55)
  }

  const onTouchEnd = () => {
    const g = gesture.current
    gesture.current = null
    setPulling(false)
    if (g?.live && pull > 70) setClosing(true)
    else setPull(0)
  }

  /*
   * Los botones de arriba, que viven en dos lugares según haya portada o no.
   *
   * Con banda arriba —la foto, o el esqueleto mientras no se sabe si la hay—
   * flotan encima de ella, círculos de 44px de vidrio espresso, que es lo
   * único que se lee sobre una foto de la que no sabemos nada. Sin banda son
   * la fila de siempre, apoyada sobre el espresso. El JSX es uno solo: dos
   * copias del mismo botón se separan a la primera corrección.
   */
  const barraSuperior = (
    <div style={{
      display: 'flex', alignItems: 'center',
      ...(hayCabecera ? {
        position: 'absolute' as const,
        top: 'calc(var(--safe-top) + var(--s-2))', left: 18, right: 18,
      } : null),
    }}>
      <button onClick={() => nav(-1)} className="icon-btn" aria-label="Volver"
        style={{
          backgroundColor: VIDRIO_FALLBACK,
          background: hayCabecera ? VIDRIO_ESPRESSO : 'var(--film-2)',
          backdropFilter: hayCabecera ? VIDRIO_FILTRO : undefined,
          WebkitBackdropFilter: hayCabecera ? VIDRIO_FILTRO : undefined,
          color: 'var(--cream)',
        }}>←</button>
      <span style={{ flex: 1 }} />

      {/* Favorito (BIR-37 / BIR-5). Arriba, al lado de volver, y no entre
          las acciones de abajo: no es un aporte a la comunidad como
          cargar un precio, es una marca propia sobre este bar. */}
      <button
        onClick={() => user ? favorites.toggle(barId) : nav('/perfil')}
        aria-label={isFavorite ? 'Sacar de favoritos' : 'Guardar en favoritos'}
        aria-pressed={isFavorite}
        className="icon-btn"
        style={{
          marginRight: 'var(--s-2)',
          // Sobre la foto el fondo es el mismo para los dos estados: el que
          // dice si el bar es tuyo es el corazón, que es coral y relleno.
          backgroundColor: VIDRIO_FALLBACK,
          background: hayCabecera ? VIDRIO_ESPRESSO
            : isFavorite ? 'var(--favorito-soft)' : 'var(--film-2)',
          // El `brightness` del filtro es lo que sostiene al coral acá arriba:
          // sin él, sobre una foto clara el corazón marcado daba 1,65:1 y se
          // veía peor que el sin marcar. Ver VIDRIO_FILTRO.
          backdropFilter: hayCabecera ? VIDRIO_FILTRO : undefined,
          WebkitBackdropFilter: hayCabecera ? VIDRIO_FILTRO : undefined,
          color: isFavorite ? 'var(--favorito)' : hayCabecera ? 'var(--cream)' : 'var(--muted)',
        }}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden
          fill={isFavorite ? 'currentColor' : 'none'}
          stroke="currentColor" strokeWidth={isFavorite ? 0 : 1.9}>
          <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z" />
        </svg>
      </button>

      {isModerator(user) && (
        // Modo moderador: un interruptor, no un menú. Prendido, aparecen
        // todas las herramientas destructivas juntas; apagado, un
        // moderador ve exactamente lo mismo que cualquiera. Así no hay
        // botones de borrar acechando en la vista de todos los días.
        <button
          onClick={() => setModMode(m => !m)}
          aria-label={modMode ? 'Salir del modo moderador' : 'Modo moderador'}
          aria-pressed={modMode}
          className="icon-btn"
          style={{
            backgroundColor: VIDRIO_FALLBACK,
            background: modMode ? 'var(--acento)'
              : hayCabecera ? VIDRIO_ESPRESSO : 'var(--film-2)',
            backdropFilter: hayCabecera && !modMode ? VIDRIO_FILTRO : undefined,
            WebkitBackdropFilter: hayCabecera && !modMode ? VIDRIO_FILTRO : undefined,
            color: modMode ? 'var(--base)' : hayCabecera ? 'var(--cream)' : 'var(--muted)',
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {modMode ? (
              <path d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7Zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9Zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
            ) : (
              <path d="M2.4 3.8 3.8 2.4l17.8 17.8-1.4 1.4-3.1-3.1c-1.6.6-3.3 1-5.1 1-5 0-9.3-3.1-11-7a12.4 12.4 0 0 1 4.2-5L2.4 3.8Zm7.1 7.1a2.5 2.5 0 0 0 3.6 3.6l-3.6-3.6ZM12 5c5 0 9.3 3.1 11 7a12.6 12.6 0 0 1-2.9 4l-3-3a4.5 4.5 0 0 0-6.1-6.1L8.6 5.5C9.7 5.2 10.8 5 12 5Z" />
            )}
          </svg>
        </button>
      )}
    </div>
  )

  return (
    <div
      ref={scroller}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
      style={{
        position: 'absolute', inset: 0, overflowY: 'auto',
        // Sin esto, arrastrar hacia abajo desde arriba dispara el
        // pull-to-refresh del navegador antes de que la ficha se mueva.
        overscrollBehaviorY: 'contain',
        // Con banda arriba la foto llega hasta el borde de la pantalla y el
        // margen seguro lo despeja la barra de botones, que flota encima.
        paddingTop: hayCabecera ? 0 : `calc(10px + var(--safe-top))`,
        paddingBottom: 48,
        // Sin arrastre no se deja `transform` puesto: un transform crea
        // bloque contenedor y los `position: fixed` de los diálogos dejarían
        // de medirse contra el viewport.
        transform: closing ? 'translateY(100%)'
          : pull ? `translateY(${pull}px)` : undefined,
        transition: pulling ? 'none' : 'transform .18s cubic-bezier(.2,.8,.3,1)',
      }}>
      <div className="desk-narrow">
      {hayCabecera && (
        /* La portada: alto fijo, foto recortada al centro y el degradado que
           la apoya contra el espresso. El degradado no es adorno — el nombre
           del bar se monta sobre el borde de abajo de la foto, y sin él se
           lee o no según qué haya salido en la foto.

           El alto es el mismo con foto y sin ella todavía: es la banda la que
           reserva el lugar, así que cuando la foto llega no empuja nada. */
        <div style={{ position: 'relative', height: 216, background: 'var(--elevated)' }}>
          {portada ? (
            <img src={portada.url} alt="" style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            }} />
          ) : (
            /* Esqueleto y no un gris quieto: la app usa esqueletos en todas
               las esperas, y acá además es lo que hace que cerrarse después
               se lea como "no había foto" y no como un salto. El radio se
               anula porque esta banda va pegada a los cuatro bordes. */
            <div className="skeleton" aria-hidden style={{
              position: 'absolute', inset: 0, borderRadius: 0,
            }} />
          )}
          <div aria-hidden style={{
            position: 'absolute', inset: 'auto 0 0 0', height: 110,
            // El espresso pleno en el tramo de abajo y recién después el
            // desvanecido: es donde se apoya el nombre, y ahí no puede quedar
            // ni un hilo de foto asomando debajo de las letras.
            background: 'linear-gradient(to top, var(--base) 0 28%, transparent)',
          }} />
          {barraSuperior}
        </div>
      )}

      <div style={{ padding: '0 18px' }}>
        {!hayCabecera && barraSuperior}

        {modMode && (
          <div style={{
            marginTop: 'var(--s-4)', padding: 'var(--s-2) var(--s-3)',
            borderRadius: 'var(--r-2)', fontSize: 'var(--t-2)',
            background: 'var(--acento-soft)', color: 'var(--acento)',
          }}>
            Modo moderador — las acciones de esta vista no se pueden deshacer
          </div>
        )}

        {/* El enlace va acá y no abajo: pegado a las pestañas quedaba
            separando el nombre del bar de sus birras, que es lo que se viene
            a mirar. Al lado del nombre es donde se lo busca.

            La nota del bar se fue de este renglón a su propia sección, más
            abajo: acá competía por ancho con el nombre y con el enlace, y
            sobre todo no había lugar para decir de qué es esa nota. La
            distinción entre "la nota del lugar" y "la nota de cada birra" es
            una decisión de producto y necesita una línea que la explique. */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 'var(--s-3)',
          // Con portada, el nombre se monta sobre el borde de abajo de la
          // foto: es lo que hace que la ficha se lea como una sola pieza y no
          // como una imagen con una pantalla debajo. Con el aviso de modo
          // moderador en el medio, no: ahí lo de arriba ya no es la foto y el
          // margen negativo le comería el aviso.
          margin: hayCabecera && !modMode
            ? '-18px 0 var(--s-2)' : 'var(--s-5) 0 var(--s-2)',
          position: 'relative',
        }}>
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: 0, flex: 1, minWidth: 0 }}>
            {bar.name}
          </h1>

          {/* Las birras que te tomaste acá.
              Es dato tuyo, no del bar, así que va en su propia columna y en el
              ámbar de la birra — no compite con la nota de la comunidad, que
              vive abajo y significa otra cosa. Sólo si tomaste alguna:
              un "0" en cada bar al que entrás es ruido. */}
          {(bar.myBeers ?? 0) > 0 && (
            <div style={{ flexShrink: 0, textAlign: 'right', marginRight: 'var(--s-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="15" height="15" viewBox="0 0 24 24"
                  fill="var(--birra)" aria-hidden>
                  <path d="M6 3h12l-1.3 17.2a1 1 0 0 1-1 .8H8.3a1 1 0 0 1-1-.8L6 3Zm1.8 5 .9 11.5h6.6L16.2 8H7.8Z" />
                </svg>
                <span className="num" style={{ fontSize: 'var(--t-5)', color: 'var(--cream)' }}>
                  {bar.myBeers}
                </span>
              </div>
              <div style={{ fontSize: 'var(--t-1)', color: 'var(--faint)', marginTop: 2 }}>
                {bar.myBeers === 1 ? 'tuya' : 'tuyas'}
              </div>
            </div>
          )}

          <a
            href={`https://www.google.com/maps/search/?api=1&query=${bar.lat},${bar.lng}`
              + (bar.googlePlaceId ? `&query_place_id=${bar.googlePlaceId}` : '')}
            target="_blank" rel="noreferrer" aria-label="Cómo llegar"
            style={{
              flexShrink: 0, width: 42, height: 42, borderRadius: '50%',
              display: 'grid', placeItems: 'center', marginTop: 2,
              background: 'var(--elevated)', color: 'var(--acento)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
            </svg>
          </a>
        </div>
        {/* El aire de abajo no es decoración: sin él la dirección quedaba
            pegada a la fila de pastillas y se leía como si fuera su rótulo.
            El espacio entre grupos tiene que superar al de adentro del grupo,
            y acá el grupo es "nombre + dirección". */}
        {meta && (
          <p style={{
            color: 'var(--muted)', fontSize: 'var(--t-3)', margin: 0,
          }}>{meta}</p>
        )}

        {/*
          La nota del bar, acá, y no en una sección al final de la pantalla.
          
          Vivió en tres lugares y los dos primeros estaban mal por motivos
          distintos. Pegada al nombre, en el mismo renglón, competía por ancho
          con el nombre y con el botón de cómo llegar, y no dejaba lugar para
          decir de qué es esa nota — que es una distinción de producto: NO es
          una nota al bar, es el promedio de las notas de sus birras. Mandada a
          una sección propia al fondo, se enteraba sólo quien scrolleaba hasta
          el final, y arriba quedaba un "★ 4,1" de once píxeles perdido entre
          las canillas y el "Al día".
          
          Acá abajo del nombre tiene el ancho entero: entra el número grande,
          las estrellas, los votos y el renglón que lo explica. Es lo segundo
          que se lee de la ficha, que es lo que es.
        */}
        {barAvg != null && (
          <div style={{ margin: 'var(--s-3) 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)' }}>
              <span className="num" style={{
                fontSize: 'var(--t-6)', lineHeight: 1, color: 'var(--cream)',
              }}>{barAvg.toFixed(1).replace('.', ',')}</span>
              <EstrellasNota value={barAvg} size={14} />
              <span style={{ fontSize: 'var(--t-2)', color: 'var(--muted)' }}>
                {votes === 1 ? '1 voto' : `${votes} votos`}
              </span>
            </div>
            {/* Una línea y no el párrafo de dos renglones que tenía la sección
                del fondo: lo que hay que aclarar es de dónde sale el número, y
                eso entra en media línea. */}
            <p style={{
              margin: '3px 0 0', fontSize: 'var(--t-1)', color: 'var(--faint)',
            }}>
              Promedio de las birras de este bar, no una nota al lugar.
            </p>
          </div>
        )}

        <FilaDeEstado
          alDia={alDia}
          canillas={bar.prices.length}
          respaldo={respaldo}
        />
      </div>

      {bar.prices.length === 0 ? (
        <div style={{ padding: '0 18px' }}>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-4)' }}>
            Todavía nadie cargó precios acá. ¿Los sabés?
          </p>
          <PrimaryAction
            label="Cargar el primer precio"
            puntos={PTS_PRECIO}
            onClick={() => user ? setReporting({}) : nav('/perfil')}
          />
        </div>
      ) : (
        <>
          {/* El rótulo y, contra el borde derecho, el "+" de cargar otra birra.

              Estaba adentro de la fila de pastillas, como una pastilla más. Ahí
              era una acción de ancho fijo peleando el renglón con N opciones de
              ancho variable: bastaba un estilo de nombre largo para que la fila
              se partiera en dos y el "⋯" se cayera solo al renglón de abajo.

              En el rótulo no compite con nada, está siempre en el mismo lugar
              —tenga el bar una birra o doce— y es el mismo gesto que el "+" de
              FOTOS. Ámbar punteado, que es como se dibuja "agregar algo que
              todavía no está" en toda la app. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--s-3)', padding: '0 18px',
          }}>
            <h2 className="section-label" style={{ flex: 1, minWidth: 0 }}>LA PINTA ACÁ</h2>
            <SumarEnRotulo
              label="Otra birra"
              aria="Cargar otra birra de este bar"
              onClick={() => user ? setReporting({}) : nav('/perfil')}
            />
          </div>

          {/* Una pestaña por birra en vez de apilarlas todas. Con cinco
              estilos, precio + nota + fotos de cada uno era una pantalla que
              no terminaba nunca; así se ve una birra a la vez y el largo no
              depende de cuántas tenga el bar. */}
          {/* La fila se muestra incluso con una sola birra: es donde vive el
              "+", y un control que aparece y desaparece según cuántas haya es
              un control que no se encuentra cuando se lo necesita. */}
          {/* `scrollPaddingLeft` va con el `padding` y no es decoración: al
              engancharse, el navegador alinea la pestaña contra el borde del
              scrollport, que está ANTES del padding. O sea que la fila se
              corría 18px sola y la primera pestaña terminaba pegada al borde
              de la pantalla, desalineada de todo lo demás de la ficha. Con
              esto, el enganche respeta el mismo margen que el resto. */}
          <PillRow
            dataTour="bar-tabs"
            sheetTitle="Qué birra"
            selected={group?.slug ?? null}
            items={groups.map(g => ({
              key: g.slug,
              label: g.name,
              favorita: favStyles.has(g.slug),
              // `ratingAvg` y no `ratingRaw`: éste lleva shrinkage, o sea que
              // un 5,0 con un voto no le gana a un 4,6 con cuarenta. Para
              // ordenar es exactamente lo que hace falta.
              score: Math.max(...g.beers.map(b => b.ratingAvg ?? -1)),
              extra: g.beers.length > 1
                ? <span style={{ fontSize: 'var(--t-1)', color: 'var(--faint)' }}>
                    {g.beers.length}
                  </span>
                : undefined,
            }))}
            // Cambiar de estilo cae en su primera marca. Conservar la marca
            // anterior llevaría a pedir una birra que no existe: "rubia de
            // Juguetes Perdidos" porque venías mirando su IPA.
            onPick={slug => {
              const g = groups.find(x => x.slug === slug)
              if (g) setTab({ style: g.slug, brand: g.beers[0].brandSlug })
            }}
            // El color del chip lo pone `chipStyle`, que es de PillRow: es la
            // pieza que más se repite en la app y cada copia se fue separando.
            // Acá el prendido era hueso lleno, o sea del mismo peso que "Sigue
            // igual", y una pestaña no manda: informa.
            // Apretadas: con el padding de 16 a los costados, tres estilos
            // más el "⋯" más "Otra birra" no entraban en un teléfono y la fila
            // se partía en dos renglones justo arriba del precio, que es el
            // dato. Con 11 entran, y el `flexWrap` de PillRow queda de red de
            // seguridad para los nombres largos.
            // El nombre se recorta en vez de empujar: la fila ya no envuelve
            // (ver PillRow) y lo que cede es el texto. "Hazy IPA de Juguetes
            // Perdidos" entra recortado y entero adentro del "⋯".
            renderPill={(p, on) => (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                padding: '8px 11px', borderRadius: 999, fontSize: 'var(--t-3)',
                ...chipStyle(on),
              }}>
                <span style={{
                  minWidth: 0, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.label}</span>
                {p.extra}
              </span>
            )}
          />

          {/* Segunda fila: las marcas de ese estilo, y **sólo si hay más de
              una**.
              Se ve una marca por vez y se alterna entre ellas — mostrar dos
              precios juntos bajo el rótulo "IPA" es exactamente lo que hacía
              que el número no significara nada.

              Aparecía siempre, incluso con una sola marca, y el argumento era
              que ahí vivía el "+". Con el "+" mudado al rótulo, lo que quedaba
              era una fila de una sola pastilla que no alterna nada: un segundo
              renglón de chips, debajo de otro renglón de chips, que en el caso
              normal —un bar con una marca por estilo— no ofrece ninguna
              elección. */}
          {group && group.beers.length > 1 && (
            <PillRow
              sheetTitle={`Qué ${group.name.toLowerCase()}`}
              selected={active?.brandSlug ?? '_'}
              /* La pastilla dice QUÉ marca, no cuánto sale.
                 Traía el monto al lado y era un precio sin su antigüedad, que
                 es lo único que esta app no hace nunca: en pesos, un número
                 sin fecha es información falsa.

                 Las dos salidas eran ponerle la edad o sacarle el monto, y se
                 le saca el monto. Por ancho, primero: "Juguetes Perdidos
                 $5.000 hace 12 d" no entra en un teléfono, y la fila de
                 PillRow envuelve, así que tres marcas se comían tres renglones
                 justo arriba del precio, que es lo que se vino a mirar.

                 Y por lo que dice el comentario de acá arriba, que es el mismo
                 argumento: mostrar dos precios juntos bajo el rótulo "IPA" es
                 exactamente lo que hacía que el número no significara nada. La
                 pastilla con precio estaba haciendo eso de vuelta, en chico.

                 El monto con su edad está una fila más abajo, en PriceRow,
                 para la marca elegida — y cambiar de marca es un tap. */
              items={group.beers.map(b => ({
                key: b.brandSlug ?? '_',
                label: b.brandName ?? 'Sin marca',
                favorita: b.brandSlug != null && favBrands.has(b.brandSlug),
                score: b.ratingAvg ?? -1,
              }))}
              onPick={key => setTab({ style: group.slug, brand: key === '_' ? null : key })}
              renderPill={(p, on) => (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                  padding: '8px 10px', borderRadius: 999, fontSize: 'var(--t-2)',
                  ...chipStyle(on),
                }}>
                  <span style={{
                    minWidth: 0, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{p.label}</span>
                  {p.extra}
                </span>
              )}
            />
          )}

          {active && (
            <>
              <PriceRow
                currency={bar.currency}
                key={beerKey(active)} price={active} busy={busy === beerKey(active)}
                name={beerName(active)}
                modMode={modMode}
                onConfirm={() => user
                  ? act(
                    () => api.confirmPrice(barId, active.styleSlug, active.brandSlug),
                    beerKey(active),
                  )
                  : nav('/perfil')}
                onUpdate={() => user
                  ? setReporting({ style: active.styleSlug, brand: active.brandSlug })
                  : nav('/perfil')}
                onRemove={() => setConfirmPrice(active)}
                onHistory={() => setHistory(active)}
                onFlag={() => user ? setReportingBad(active) : nav('/perfil')}
              />

              {/* Mismo canal de 18px que el resto de la ficha: antes este
                  bloque iba a 16 y la tira de fotos quedaba dos píxeles
                  corrida de las pestañas de arriba. */}
              <div style={{ padding: '0 18px' }}>
                {/* El rótulo dice de quién es la nota. Sin él, las estrellas
                    de la birra y la nota del lugar —que está más abajo— se
                    leen como lo mismo puntuado dos veces. */}
                <h3 className="section-label">TU NOTA DE ESTA BIRRA</h3>
                <BeerRating
                  price={active}
                  myRating={myRatingOf(active)}
                  canRate={user != null}
                  onRate={n => rate(active, n)}
                  onRetract={() => retract(active)}
                />

                <PhotoStrip
                  photos={beerPhotos}
                  canAdd={user != null}
                  onAdd={async file => {
                    await api.uploadPhoto(barId, active.styleSlug, active.brandSlug, file)
                    setPhotos(await api.barPhotos(barId))
                  }}
                  onOpen={setViewing}
                  // El pulgar de la tira es el mismo que el del visor: sin
                  // sesión no hay nada que tocar y queda sólo el número.
                  onVote={user ? vote : undefined}
                />

                {/* Los comentarios, abajo de las fotos y no detrás de un
                    ícono: es el orden en que se mira una birra —cuánto sale,
                    cómo se ve, qué dijeron— y lo que estaba escondido no lo
                    leía nadie. */}
                <BeerComments
                  key={beerKey(active)}
                  barId={barId}
                  styleSlug={active.styleSlug}
                  brandSlug={active.brandSlug}
                  canWrite={user != null}
                  modMode={modMode}
                  myRating={myRatingOf(active)}
                  onWrote={load}
                />
              </div>
            </>
          )}

        </>
      )}

      {reviews.length > 0 && (
        <section style={{ padding: '0 18px' }}>
          <h2 className="section-label">LO QUE DICEN</h2>
          {reviews.map(r => (
            <div key={r.id} style={{
              padding: 'var(--s-3) 0', borderBottom: '1px solid var(--hairline)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 'var(--s-2)', fontSize: 'var(--t-3)',
              }}>
                {/* Las estrellas en el tono de la nota y no en el hueso: acá
                    el hueso es el cromo, y una nota es un dato. */}
                <span style={{ color: 'var(--nota)' }}>{'★'.repeat(r.rating)}</span>
                <span style={{ color: 'var(--muted)' }}>{r.authorName}</span>
              </div>
              {r.body && (
                <p style={{
                  margin: 'var(--s-1) 0 0', fontSize: 'var(--t-3)', lineHeight: 1.5,
                  color: 'var(--cream-soft)', textWrap: 'pretty',
                }}>{r.body}</p>
              )}
            </div>
          ))}
        </section>
      )}

      {modMode && (
        <div style={{ padding: 'var(--s-5) 18px 0' }}>
          <button onClick={() => setConfirmDelete(true)} className="lbl cta" style={{
            width: '100%', minHeight: 46, borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
            // Lo destructivo es un botón con borde, no una pastilla teñida. La
            // forma vale más que el color: un relleno coral pesa como un CTA
            // primario y esto no se toca por error.
            background: 'transparent', border: '1px solid var(--danger)',
            color: 'var(--danger)',
          }}>Eliminar este bar y sus precios</button>
        </div>
      )}

      {reporting && (
        <ReportFlow
          styles={styles} brands={brands} user={user}
          // Entrando desde la ficha, el bar ya está: el flujo no lo pregunta.
          bar={{ id: bar.id, name: bar.name, currency: bar.currency }}
          // `reporting` ya tiene la forma de lo que se sabe: vacío desde
          // "Otra birra", con estilo desde "Otra marca", con los dos desde
          // "Actualizar". El flujo pregunta sólo lo que falta.
          preselected={reporting}
          nearby={[]} center={center}
          onStyleCreated={onStyleCreated}
          onBrandCreated={onBrandCreated}
          onCancel={() => setReporting(null)}
          onSubmit={({ styleSlug, brandSlug, price, sizeMl }) => {
            setReporting(null)
            // La birra cargada pasa a ser la que se está mirando: si no, se
            // carga la segunda IPA y la pantalla se queda mostrando la
            // primera, como si no hubiera pasado nada.
            setTab({ style: styleSlug, brand: brandSlug })
            act(
              () => api.reportPrice({ barId, styleSlug, brandSlug, price, sizeMl }),
              styleSlug + '|' + (brandSlug ?? ''),
            )
          }}
        />
      )}

      {confirmDelete && (
        <Confirm
          title={`¿Eliminar ${bar.name}?`}
          body={<>
            Se borran el bar y todos sus precios. No se puede deshacer.
            <br /><br />
            Si el bar existe pero está mal cargado, conviene corregirlo en vez de
            borrarlo: los precios son reportes de gente que estuvo ahí.
          </>}
          confirmLabel="Eliminar" danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false)
            try { await api.deleteBar(barId); onChanged(); nav('/') }
            catch (e) { setToast((e as Error).message) }
          }}
        />
      )}

      </div>
      {history && (
        <PriceHistory
          currency={bar.currency}
          barId={barId} styleSlug={history.styleSlug} brandSlug={history.brandSlug}
          title={beerName(history)}
          onClose={() => setHistory(null)}
        />
      )}

      {reportingBad && (
        <Confirm
          title="¿Reportar este precio?"
          body={<>
            Vas a avisar que el precio de <strong>{beerName(reportingBad)}</strong> está
            mal cargado. Un moderador lo revisa.
            <br /><br />
            Si sólo cambió, es mejor usar <strong>Actualizar</strong>: reportar es
            para precios que nunca fueron ciertos.
          </>}
          confirmLabel="Reportar"
          onCancel={() => setReportingBad(null)}
          onConfirm={async () => {
            const p = reportingBad
            setReportingBad(null)
            try {
              // Reportar sólo se ofrece desde la fila con precio, así que
              // acá no puede ser null.
              await api.flag({
                targetType: 'price', targetId: p.id!,
                reason: `precio incorrecto: ${beerName(p)} a ${formatPrice(p.price!, bar.currency)}`,
              })
              setToast('Reportado. Gracias, lo revisa un moderador.')
            } catch (e) { setToast((e as Error).message) }
          }}
        />
      )}

      {viewing != null && (
        <PhotoViewer
          photos={beerPhotos} start={viewing} modMode={modMode}
          canVote={user != null}
          onClose={() => setViewing(null)}
          onRemove={p => { setViewing(null); setConfirmPhoto(p) }}
          onVote={vote}
        />
      )}

      {confirmPhoto && (
        <Confirm
          title={confirmPhoto.mine ? '¿Borrar tu foto?' : '¿Eliminar esta foto?'}
          body={<>
            Se borra el archivo del bucket, no sólo de la lista.
            <br /><br />
            Es distinto de bajar un precio o una reseña: las fotos se sirven
            desde una URL pública, así que mientras el archivo exista cualquiera
            con el link la sigue viendo. Por eso hay que borrarlo, y por eso
            esto no se puede deshacer.
          </>}
          confirmLabel={confirmPhoto.mine ? 'Borrar' : 'Eliminar'} danger
          onCancel={() => setConfirmPhoto(null)}
          onConfirm={async () => {
            const p = confirmPhoto
            setConfirmPhoto(null)
            try {
              // Borrar lo propio no pasa por moderación: es otra ruta, que
              // comprueba la pertenencia en el WHERE.
              await (p.mine ? api.removeMyPhoto(p.id) : api.removePhoto(p.id))
              setPhotos(await api.barPhotos(barId))
              setToast('Foto borrada')
            } catch (e) { setToast((e as Error).message) }
          }}
        />
      )}

      {confirmPrice && (
        <Confirm
          title={`¿Eliminar el precio de ${beerName(confirmPrice)}?`}
          body={<>
            Se baja el reporte vigente de <strong>{beerName(confirmPrice)}</strong> a{' '}
            {formatPrice(confirmPrice.price!, bar.currency)}. No se puede deshacer.
            <br /><br />
            Las notas y las fotos de esta birra no se tocan: la birra sigue en la
            lista, sin precio, hasta que alguien cargue uno nuevo.
          </>}
          confirmLabel="Eliminar" danger
          onCancel={() => setConfirmPrice(null)}
          onConfirm={() => {
            const p = confirmPrice
            setConfirmPrice(null)
            act(() => api.removePrice(p.id!), beerKey(p))
          }}
        />
      )}

      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

/**
 * Quién respalda el número (BIR-8).
 *
 * El precio dejó de ser "lo último que alguien reportó" para ser la mediana de
 * lo que reportó la gente en las últimas tres semanas, un voto por persona. Ese
 * cambio no sirve de nada si en pantalla se ve igual que antes: la diferencia
 * entre un número que cargó uno y uno que confirmaron seis es justamente lo
 * que hay que poder ver.
 *
 * El rango sólo aparece cuando hay desacuerdo de verdad. Si los seis dicen lo
 * mismo, mostrar "$5.000–$5.000" es ruido; si dicen cosas distintas, esconderlo
 * sería precisión falsa — y esta app ya decide en otro lado que un número sin
 * su contexto es peor que no tener número.
 *
 * ## Por qué ahora además hay una barra
 *
 * Con el rango escrito solo —"$4.000–$4.800"— hay que leer dos números y
 * restarlos mentalmente para saber si la gente está de acuerdo o no. La barra
 * contesta eso de un vistazo: la pista es el rango completo que reportaron y
 * lo lleno llega hasta la mediana, que es el número grande de al lado. Si el
 * relleno queda al medio, el precio está parejo; si queda pegado a un extremo,
 * hay un reporte tirando del promedio y conviene mirarlo con pinzas.
 *
 * Todo en la familia de `--info` porque es el dato de segundo orden: el de
 * primer orden es el precio, y si esto se pintara con el mismo peso, dos cosas
 * competirían por la misma mirada.
 */
function Consenso({ price, currency }: { price: StylePrice; currency: string }) {
  // Menos de tres votantes es lo de siempre: el último reporte. No hay
  // consenso del que hablar, y un "1 persona" colgado de cada precio del mapa
  // sería un cartel permanente que nadie termina de leer.
  if ((price.voters ?? 0) < 3) return null

  const bajo = price.priceLow, alto = price.priceHigh
  const disperso = bajo != null && alto != null && bajo !== alto
  // Dónde cae la mediana adentro del rango, de 0 a 100.
  const medianaEn = disperso
    ? Math.max(0, Math.min(100, ((price.price! - bajo) / (alto - bajo)) * 100))
    : 0

  return (
    <div style={{ marginTop: 'var(--s-3)' }}>
      {disperso && (
        <div aria-hidden style={{
          position: 'relative', height: 4, borderRadius: 2, background: 'var(--elevated)',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: 4, borderRadius: 2,
            width: `${medianaEn}%`,
            backgroundColor: 'var(--info)',
            background: 'color-mix(in srgb, var(--info) 60%, transparent)',
          }} />
        </div>
      )}
      <div style={{
        marginTop: disperso ? 'var(--s-2)' : 0,
        fontSize: 'var(--t-1)', color: 'var(--info)',
      }}>
        consenso de {price.voters}
        {disperso && (
          <> · <span className="num">
            {formatPrice(bajo, currency)}–{formatPrice(alto, currency)}
          </span></>
        )}
      </div>
    </div>
  )
}

/**
 * La canilla: una fila con filete, no una tarjeta.
 *
 * A la izquierda quién es —nombre, tamaño, artesanal, su nota— y a la derecha
 * el precio grande con la antigüedad justo debajo, en el color de la frescura.
 * Nunca uno sin la otra: un precio sin su edad, en un país con esta inflación,
 * es información falsa.
 *
 * El nombre volvió a esta fila. Se lo había sacado porque lo dicen las
 * pestañas de arriba y repetirlo parecía gastar el renglón de más jerarquía;
 * con el precio corrido a la derecha, la columna de la izquierda quedaba con
 * un "473 ml" solo y había que mirar dos filas más arriba para saber de qué
 * birra era el número. La pestaña dice qué elegiste, la fila dice qué estás
 * mirando — y cuando las pestañas se parten en dos renglones, la segunda es
 * la única que queda a la vista del precio.
 *
 * "Sigue igual" es el botón hueso y "Actualizar" el de `--info`: confirmar
 * tiene que costar menos que corregir, o el dataset envejece. Los dos ocupan
 * media fila —el peso lo hace el relleno, no el tamaño— así que confirmar
 * nunca es más difícil de apuntar que actualizar.
 */
function PriceRow({
  price, currency, name, busy, modMode, onConfirm, onUpdate, onRemove, onHistory, onFlag,
}: {
  price: StylePrice; currency: string; busy: boolean; modMode: boolean
  /** "IPA · Antares". Lo arma quien llama, que es el que sabe de marcas. */
  name: string
  onConfirm: () => void; onUpdate: () => void; onRemove: () => void
  onHistory: () => void; onFlag: () => void
}) {
  // Una birra puede tener notas y fotos sin precio vigente: pasa cuando se
  // borra el reporte. Antes esa birra directamente desaparecía.
  if (price.price == null) {
    return (
      <div style={{ padding: 'var(--s-4) 18px', borderBottom: '1px solid var(--hairline)' }}>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 'var(--t-4)' }}>
          <strong style={{ color: 'var(--cream)', fontWeight: 500 }}>{name}</strong>{' '}
          todavía no tiene precio cargado.
        </p>
        <button onClick={onUpdate} className="lbl cta" style={{
          width: '100%', marginTop: 'var(--s-3)', minHeight: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
          background: 'var(--acento)', color: 'var(--base)',
        }}>
          Cargar su precio
          <Puntos n={PTS_PRECIO} />
        </button>
      </div>
    )
  }

  const color = freshnessColor(price.freshness!)
  const dim = price.freshness === 'stale'
  // El tamaño sólo cuando no es la pinta de 473: si es la de siempre, decirlo
  // es ruido; si no lo es, cambia el precio y hay que saberlo.
  const meta = [
    price.sizeMl !== 473 ? `${price.sizeMl} ml` : null,
    price.brandCraft ? 'artesanal' : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ padding: 'var(--s-4) 18px', borderBottom: '1px solid var(--hairline)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="lbl" style={{ fontSize: 'var(--t-4)', color: 'var(--cream)' }}>
            {name}
          </div>
          {meta && (
            <div style={{ fontSize: 'var(--t-2)', color: 'var(--muted)', marginTop: 3 }}>
              {meta}
            </div>
          )}
          {/* La nota de la birra, chiquita y al lado del nombre: es el segundo
              dato que se mira después del precio. El desglose y las estrellas
              para votar están más abajo, que es donde se vota. */}
          {price.ratingCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5, marginTop: 6,
              fontSize: 'var(--t-2)',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--nota)" aria-hidden>
                <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z" />
              </svg>
              <span className="num" style={{ color: 'var(--nota)' }}>
                {price.ratingRaw!.toFixed(1)}
              </span>
              <span style={{ color: 'var(--faint)' }}>
                {price.ratingCount === 1 ? '1 voto' : `${price.ratingCount} votos`}
              </span>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {/* El paso más grande de la escala, y es el único lugar donde se
              usa: esto es el dato que la app existe para contestar. */}
          <div className="num" style={{
            fontSize: 'var(--t-9)', lineHeight: 1.05, letterSpacing: '-.03em',
            color: dim ? 'var(--faint)' : 'var(--cream)',
          }}>{formatPrice(price.price!, currency)}</div>
          {/* La antigüedad, pegada abajo del monto y en el color de la
              frescura. Corta —"hace 12 d"— porque acá es una columna angosta;
              el aviso largo de los precios viejos va en su propio párrafo. */}
          <div className="num" style={{ fontSize: 'var(--t-1)', color, marginTop: 2 }}>
            {shortAge(price.ageDays)}
          </div>
        </div>
      </div>

      <Consenso price={price} currency={currency} />

      {dim && (
        <p style={{
          margin: 'var(--s-3) 0 0', padding: 'var(--s-3)', borderRadius: 'var(--r-1)',
          fontSize: 'var(--t-1)', background: 'var(--film-1)', color: 'var(--muted)',
        }}>
          Este precio tiene más de 45 días. Con la inflación, tomalo como referencia nomás.
        </p>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 'var(--s-3)', marginTop: 'var(--s-5)',
      }}>
        <button disabled={busy} onClick={onConfirm} className="lbl cta" data-tour="bar-confirm" style={{
          minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
          background: busy ? 'var(--acento-busy)' : 'var(--acento)', color: 'var(--base)',
        }}>
          {busy ? '…' : <>Sigue igual <Puntos n={PTS_CONFIRMAR} /></>}
        </button>
        <button disabled={busy} onClick={onUpdate} className="lbl cta" style={{
          minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
          background: 'var(--info-soft)', border: '1px solid var(--info-border)',
          color: 'var(--info-bright)',
        }}>
          Actualizar <Puntos n={PTS_PRECIO} />
        </button>
      </div>

      {/* Acciones secundarias en su propia línea, alineadas a la izquierda.
          Antes iban apretadas contra el borde derecho, debajo de la fecha,
          y competían visualmente con ella. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-4)', marginTop: 'var(--s-1)',
        fontSize: 'var(--t-2)', color: 'var(--faint)',
      }}>
        {/* Mirar cómo viene subiendo es analítico, no una acción sobre el
            precio: va en `--info`, que es la voz de lo que informa. */}
        <button onClick={onHistory} style={{
          fontSize: 'var(--t-2)', color: 'var(--info)', padding: 'var(--s-3) 0', minHeight: 44,
        }}>
          Ver historial
        </button>
        {/* Denunciar el precio quedó para moderación.

            Estaba para cualquiera, con el argumento de que quien ve el precio
            mal es el que está parado ahí. Pero para eso ya está **Actualizar**,
            que arregla el número en el acto y encima aporta el dato: la
            denuncia no corrige nada, abre un trámite que alguien tiene que
            revisar. Ofrecerle a todo el mundo el camino que no arregla nada, al
            lado del que sí, es empujar a la opción equivocada — y llena la cola
            de moderación de precios que sólo habían cambiado. */}
        {modMode && (
          <>
            <span aria-hidden>·</span>
            <button onClick={onFlag} style={{
              fontSize: 'var(--t-2)', color: 'var(--muted)',
              padding: 'var(--s-3) 0', minHeight: 44,
            }}>
              Este precio está mal
            </button>
            <span style={{ marginLeft: 'auto' }} />
            <button disabled={busy} onClick={onRemove} style={{
              fontSize: 'var(--t-2)', color: 'var(--danger)',
            }}>Eliminar</button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Los puntos que da una acción, adentro del botón que la hace.
 *
 * Chicos y al 60%: el botón dice qué hace y esto dice cuánto suma. Al 100%
 * competían con el verbo, y lo que hay que leer primero es el verbo — nadie
 * toca "Sigue igual" por los puntos, los puntos son el después.
 *
 * Con `KARMA_VISIBLE` apagado no dibuja nada, y el filtro vive acá adentro y
 * no en cada llamador: son cuatro botones en dos archivos, y un interruptor
 * que hay que acordarse de consultar en cada uno es un interruptor que en
 * algún lado se va a olvidar. Los botones quedan con su verbo solo, que es lo
 * que decían antes de que existieran los puntos.
 */
const Puntos = ({ n }: { n: number }) => KARMA_VISIBLE ? (
  <span className="num" style={{ fontSize: 'var(--t-1)', opacity: .6 }}>
    +{n} {n === 1 ? 'pt' : 'pts'}
  </span>
) : null

/**
 * Foto ampliada.
 *
 * Antes esto abría la URL del bucket en otra pestaña: se salía de la app, se
 * veía la barra de direcciones con un dominio `r2.dev` que no dice nada, y
 * volver era el botón de atrás del navegador. Un modal se cierra tocando al
 * lado y no rompe la navegación.
 */
function PhotoViewer({
  photos, start, modMode, canVote, onClose, onRemove, onVote,
}: {
  photos: Photo[]
  start: number
  modMode: boolean
  canVote: boolean
  onClose: () => void
  onRemove: (p: Photo) => void
  onVote: (p: Photo) => void
}) {
  const nav = useNavigate()
  const [i, setI] = useState(start)
  const touch = useRef<{ x: number; y: number } | null>(null)
  // Marca el golpe del pulgar, y sólo el que produjo un toque tuyo. Se apaga
  // sola y se apaga también al cambiar de foto: el golpe es de este toque.
  const [pop, setPop] = useState(false)
  useEffect(() => {
    if (!pop) return
    const t = setTimeout(() => setPop(false), 300)
    return () => clearTimeout(t)
  }, [pop])
  useEffect(() => { setPop(false) }, [i])

  const go = useCallback((d: number) => {
    setI(n => Math.min(photos.length - 1, Math.max(0, n + d)))
  }, [photos.length])

  // Teclado para escritorio: el swipe no existe con mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  const photo = photos[i]
  if (!photo) return null

  return (
    <div
      onClick={onClose}
      onTouchStart={e => {
        const t = e.touches[0]
        touch.current = { x: t.clientX, y: t.clientY }
      }}
      onTouchEnd={e => {
        const s = touch.current
        touch.current = null
        if (!s) return
        const t = e.changedTouches[0]
        const dx = t.clientX - s.x
        const dy = t.clientY - s.y
        // Se compara con el desplazamiento vertical: sin eso, un arrastre
        // diagonal para cerrar cambia de foto sin querer.
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1)
      }}
      style={{
        // Negro y no espresso: lo único que hay acá es la foto, y cualquier
        // tinte de la app se le mete adentro y le cambia los colores.
        position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.92)',
        display: 'grid', placeItems: 'center', padding: 16,
        touchAction: 'pan-y',
      }}
    >
      <img
        key={photo.id}
        src={photo.url} alt="Foto de la birra"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain',
          borderRadius: 'var(--r-2)', display: 'block',
        }}
      />

      {/* Las flechas sólo aparecen con puntero: en un teléfono el gesto es el
          swipe y dos botones encima de la foto son dos botones de más. */}
      {photos.length > 1 && (
        <div className="only-hover">
          <ViewerArrow side="left" disabled={i === 0} onClick={() => go(-1)} />
          <ViewerArrow side="right" disabled={i === photos.length - 1} onClick={() => go(1)} />
        </div>
      )}

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', left: 0, right: 0,
          bottom: `calc(22px + var(--safe-bottom))`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          color: 'var(--muted)', fontSize: 'var(--t-2)',
        }}
      >
        <span>
          {photo.authorName && (
            photo.mine ? <>Tu foto · </>
              : photo.authorId != null ? (
                <>
                  {/* Abre su perfil: es el otro lugar donde aparece contenido
                      firmado y desde donde hace falta poder actuar sobre la
                      persona (BIR-6). */}
                  <button onClick={() => nav(`/usuario/${photo.authorId}`)} className="lbl"
                    style={{
                      color: 'var(--sobre-vidrio)', fontSize: 'var(--t-2)',
                      textDecoration: 'underline',
                      textDecorationColor: 'var(--film-3)', textUnderlineOffset: 3,
                    }}>{photo.authorName}</button>
                  {' · '}
                </>
              ) : <>{photo.authorName} · </>
          )}
          {photo.ageDays <= 0 ? 'hoy' : photo.ageDays === 1 ? 'ayer' : `hace ${photo.ageDays} d`}
          {photos.length > 1 && <> · {i + 1}/{photos.length}</>}
          {photo.topOfMonth && <> · <span style={{ color: 'var(--acento)' }}>foto del mes</span></>}
        </span>

        {/*
          * Acá es donde se vota, y en ningún otro lado.
          *
          * Es el momento en que alguien está mirando la foto: nadie decide si
          * le gusta una foto de 108px en una tira que scrollea. Por eso el
          * botón es de verdad —44px de alto, con su etiqueta— en vez de la
          * pastilla de 24 que estaba encima de la miniatura.
          *
          * La etiqueta NO se va al votar. Antes el texto se reemplazaba por el
          * número y el botón quedaba siendo un "1" suelto: perdía lo único que
          * decía qué hacía, justo en el momento en que cambiaba de estado. El
          * número va al lado, apagado, porque es otro dato.
          */}
        {(canVote || photo.votes > 0) && (
          canVote ? (
            <button
              onClick={() => { if (!photo.votedByMe) setPop(true); onVote(photo) }}
              aria-pressed={photo.votedByMe}
              data-pop={pop ? '1' : undefined}
              className="like lbl"
            >
              <Thumb filled={photo.votedByMe} />
              {photo.votedByMe ? 'Te gusta' : 'Me gusta'}
              {photo.votes > 0 && <span className="like-n">{photo.votes}</span>}
            </button>
          ) : (
            // Sin sesión no hay nada que tocar: queda el número, que es dato.
            <span style={{
              display: 'flex', alignItems: 'center', gap: 'var(--s-2)',
              fontSize: 'var(--t-3)', color: 'var(--muted)',
            }}>
              <Thumb filled />
              {photo.votes}
            </span>
          )
        )}
        {/* Las propias se borran siempre, sin ser moderador. Hasta acá la
            única forma de sacar una foto tuya era ir a "Mis aportes", que es
            justo donde nadie la está mirando cuando se da cuenta. */}
        {(photo.mine || modMode) && (
          <button onClick={() => onRemove(photo)} className="lbl cta" style={{
            padding: 'var(--s-2) var(--s-4)', minHeight: 44, borderRadius: 999,
            fontSize: 'var(--t-2)',
            // Misma forma que el resto de lo destructivo: borde, no relleno.
            // Acá además comparte fila con `.like`, que sí va relleno — si los
            // dos fueran pastillas llenas, borrar pesaría igual que votar.
            background: 'transparent', border: '1px solid var(--danger)',
            color: 'var(--danger)',
          }}>{photo.mine ? 'Borrar tu foto' : 'Eliminar esta foto'}</button>
        )}
      </div>

      {/* Círculo de 44px de vidrio espresso, el mismo de los botones que
          flotan sobre la portada: es lo único que se lee encima de una foto
          de la que no sabemos nada. Antes eran 40px de `--hairline`, o sea
          por debajo del área de toque y casi invisible sobre una foto clara. */}
      <button onClick={onClose} aria-label="Cerrar" className="icon-btn" style={{
        position: 'absolute', top: `calc(14px + var(--safe-top))`, right: 14,
        backgroundColor: VIDRIO_FALLBACK, background: VIDRIO_ESPRESSO,
        backdropFilter: VIDRIO_FILTRO, WebkitBackdropFilter: VIDRIO_FILTRO,
        color: 'var(--cream)', fontSize: 'var(--t-6)',
      }}>×</button>
    </div>
  )
}

function ViewerArrow({
  side, disabled, onClick,
}: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      disabled={disabled}
      aria-label={side === 'left' ? 'Anterior' : 'Siguiente'}
      className="icon-btn"
      style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        [side]: 14,
        backgroundColor: VIDRIO_FALLBACK, background: VIDRIO_ESPRESSO,
        backdropFilter: VIDRIO_FILTRO, WebkitBackdropFilter: VIDRIO_FILTRO,
        color: 'var(--cream)',
        opacity: disabled ? 0.25 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path
          d={side === 'left' ? 'M15 4 7 12l8 8' : 'M9 4l8 8-8 8'}
          fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/**
 * Nota de una birra: estrellas, cuántos votaron y el ícono de comentarios.
 *
 * Las estrellas van en ámbar si ya votaste y en gris si no — de un vistazo se
 * ve dónde falta tu voto. La edad del último voto se muestra por lo mismo que
 * la del precio: una nota vieja sobre una canilla que ya cambió dice menos de
 * lo que aparenta.
 */
function BeerRating({
  price, myRating, canRate, onRate, onRetract,
}: {
  price: StylePrice; myRating: number | null
  canRate: boolean
  onRate: (n: number) => void
  onRetract: () => void
}) {
  const mine = myRating != null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }} data-tour="bar-rating">
      {/* Se arrastra el dedo y la nota lo sigue, de a medio punto. Grandes
          porque el tamaño acá es la resolución del gesto: con estrellas de 19
          píxeles, medio punto son cuatro píxeles de recorrido. */}
      <Stars
        value={mine ? myRating : price.ratingRaw} mine={mine}
        size={canRate ? 34 : 19}
        onRate={canRate ? onRate : undefined}
      />

      {/* Tu nota en número, al lado de las estrellas y sólo si votaste. Antes
          esto era un campo de texto siempre presente; ahora es la lectura de
          lo que dicen las estrellas, que es todo lo que hacía falta. */}
      {canRate && mine && (
        <span className="num" style={{ fontSize: 'var(--t-5)', color: 'var(--nota)' }}>
          {myRating!.toFixed(1)}
        </span>
      )}

      {price.ratingCount > 0 ? (
        <span style={{ marginLeft: 'auto', fontSize: 'var(--t-2)', color: 'var(--faint)' }}>
          {/* `ratingRaw` y no `ratingAvg`: el segundo lleva shrinkage y sirve
              para ordenar, pero mostrarle 3,8 a alguien que acaba de poner
              cinco estrellas hace que el número parezca roto. El conteo al
              lado es lo que comunica cuánta confianza tiene. */}
          {price.ratingRaw!.toFixed(1)} · {price.ratingCount === 1
            ? '1 voto' : `${price.ratingCount} votos`}
          {price.ratingAgeDays != null && price.ratingAgeDays > 45 && ' · sin votos nuevos'}
        </span>
      ) : (
        <span style={{
          marginLeft: 'auto', fontSize: 'var(--t-2)', color: 'var(--faint)',
        }}>Sin votos</span>
      )}

      {/* Sólo con nota puesta: sin voto, un botón para retirarlo no tiene qué
          retirar. Va en su propio renglón y en gris: es la salida, no una
          acción que haya que ofrecer a la altura de las estrellas. */}
      {canRate && mine && (
        <button onClick={onRetract} style={{
          flexBasis: '100%', textAlign: 'left', fontSize: 'var(--t-2)',
          color: 'var(--muted)', padding: 'var(--s-2) 0',
        }}>Retirar mi nota</button>
      )}
    </div>
  )
}

/**
 * La fila de estado, entre el nombre del bar y sus canillas.
 *
 * Tres afirmaciones cortas separadas por filete arriba y abajo: es la línea
 * que contesta "¿me sirve este lugar?" antes de bajar a los precios. Va en
 * mayúscula chica con tracking porque es rótulo y no texto — tiene que
 * leerse de un barrido, no leerse.
 *
 * Lo que NO está acá también es una decisión: no hay "abierto ahora" porque el
 * modelo no guarda horarios, ni "mejor precio de la zona" porque esta pantalla
 * no sabe qué hay alrededor. Un cartel que afirma algo que la app no sabe es
 * peor que un cartel que falta.
 */
function FilaDeEstado({ alDia, canillas, respaldo }: {
  /** Todos los precios cargados tienen menos de 14 días. */
  alDia: boolean
  canillas: number
  /** Cuánta gente hay detrás del precio mejor respaldado del bar. */
  respaldo: number
}) {
  if (canillas === 0) return null

  const chip = {
    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' as const,
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center',
      gap: 'var(--s-2) var(--s-4)',
      margin: 'var(--s-3) 0 0', padding: 'var(--s-3) 0',
      borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)',
      fontFamily: 'var(--display)', fontWeight: 500, fontSize: 'var(--t-1)',
      letterSpacing: '.1em', textTransform: 'uppercase', lineHeight: 1,
    }}>
      {alDia && (
        <span style={{ ...chip, color: 'var(--fresh)' }}>
          {/* El punto late porque "al día" es un estado vivo: es lo único de
              la ficha que puede dejar de ser cierto mientras la mirás. */}
          <span aria-hidden style={{
            width: 6, height: 6, borderRadius: 3, background: 'var(--fresh)',
            animation: 'pulso-fresco 2s ease-in-out infinite',
          }} />
          Al día
        </span>
      )}

      <span style={{ ...chip, color: 'var(--info)' }}>
        <span className="num">{canillas}</span>
        {canillas === 1 ? 'canilla' : 'canillas'}
      </span>

      {respaldo >= 3 && (
        <span style={{ ...chip, color: 'var(--info)' }}
          title={`${respaldo} personas confirmaron el precio`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2 4 5.4v5.2c0 4.7 3.4 9.1 8 10.2 4.6-1.1 8-5.5 8-10.2V5.4L12 2Zm-1 13.4L7.6 12l1.4-1.4 2 2 4.4-4.4L16.8 9 11 15.4Z" />
          </svg>
          Verificado · <span className="num">{respaldo}</span>
        </span>
      )}

      {/* El latido vive acá y no en theme.css porque es de esta fila y de
          ninguna otra. Con "reducir movimiento" prendido se apaga solo: la
          regla global de theme.css lo alcanza. */}
      <style>{`
        @keyframes pulso-fresco {
          0%, 100% { opacity: 1; }
          50%      { opacity: .32; }
        }
      `}</style>
    </div>
  )
}

/**
 * Cinco estrellas de lectura, en el tono de la nota.
 *
 * Se dibujan acá y no con el componente `Stars` porque aquél codifica con el
 * color de quién es el voto —el tuyo en `--nota`, el de los demás apagado— y
 * esto no es el voto de nadie: es el promedio del bar, y el promedio del bar
 * es lo que esta sección viene a decir.
 *
 * El relleno parcial va por degradado de dos paradas en el mismo punto, que es
 * la forma más corta de una media estrella sin recortar nada.
 */
function EstrellasNota({ value, size = 16 }: { value: number; size?: number }) {
  const uid = useId()
  return (
    <span style={{ display: 'inline-flex', gap: 2 }} aria-hidden>
      {[0, 1, 2, 3, 4].map(i => {
        const lleno = Math.max(0, Math.min(1, value - i)) * 100
        const id = `nota-${uid}-${i}`
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <defs>
              <linearGradient id={id}>
                <stop offset={`${lleno}%`} style={{ stopColor: 'var(--nota)' }} />
                <stop offset={`${lleno}%`} style={{ stopColor: 'var(--film-2)' }} />
              </linearGradient>
            </defs>
            <path fill={`url(#${id})`}
              d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z" />
          </svg>
        )
      })}
    </span>
  )
}

/**
 * El botón que manda cuando la pantalla tiene una sola cosa para ofrecer.
 *
 * Alto 52 y no un padding: los CTA de la app miden lo mismo en todas las
 * pantallas, y con padding el alto salía distinto según el tamaño de letra.
 */
function PrimaryAction({ label, puntos, onClick }: {
  label: string
  /** Lo que suma el aporte, adentro del botón y al lado del verbo. */
  puntos?: number
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="lbl cta" style={{
      width: '100%', minHeight: 52, marginTop: 'var(--s-4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
      background: 'var(--acento)', color: 'var(--base)',
    }}>
      {label}
      {puntos != null && <Puntos n={puntos} />}
    </button>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      textAlign: 'center', padding: 32,
    }}>{children}</div>
  )
}
