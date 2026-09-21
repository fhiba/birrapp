import { useCallback, useEffect, useRef, useState } from 'react'
import * as fb from '../data/feedback'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import { useNavigate } from 'react-router-dom'
import type { BarPin, BeerStyle } from '../data/types'
import type { FlowBar } from './ReportFlow'
import {
  FRESCO_DIAS, ageColor, formatPrice, formatRadius, priceColor, priceRanks,
} from '../data/format'
import { PintLoader } from '../ui/PintLoader'
import { CALLES_DESDE_ZOOM, MAP_STYLE, MAP_STYLE_CON_CALLES } from '../mapStyle'
import { RatingFilter, StyleFilter } from '../ui/StyleFilter'
import { BarPreview } from '../ui/BarPreview'

/*
 * Qué dice el color de un pin: el precio, y siempre el precio.
 *
 * Verde es el más barato de lo que hay en pantalla, rojo el más caro, y el
 * medio es el puesto de cada uno adentro de ese rango. El puesto y no el
 * valor: con escala lineal un solo precio disparatado aplasta a todos los
 * demás contra el extremo barato y el mapa se ve todo verde. Se recalcula al
 * moverse, así que en Palermo "barato" es otro número que en Liniers y el
 * color significa lo mismo en los dos.
 *
 * Entre la 0.11.0 y la 0.22 el color de la cápsula pasó a codificar la
 * frescura, con el argumento de que el número ya decía el precio. Se probó y
 * no funciona: verde/ámbar/rojo es una convención tan fuerte para
 * barato/caro que la gente lee precio igual, y un mapa cuyos colores dicen
 * una cosa y se leen otra es peor que uno que repite el dato. Vuelve el
 * precio, que es lo que la pantalla viene a contestar de un vistazo —antes de
 * leer un solo número— y lo único que un punto pelado, sin lugar para
 * etiqueta, puede decir.
 *
 * La antigüedad no se pierde con eso, porque no se negocia: ningún precio se
 * dibuja sin su edad al lado. Va como un punto de color adentro de una chapita
 * oscura, a la izquierda del número. La chapita no es decoración — la escala
 * de frescura y la de precio son los mismos tres colores, así que un punto
 * lima apoyado sobre una cápsula lima no se vería; sobre espresso se ve
 * siempre, sea cual sea el precio.
 */

/** Los extremos del slider, en metros. Compartidos con las etiquetas de abajo
 *  para que no se puedan desincronizar del `min`/`max` reales. */
const RADIUS_MIN = 300
const RADIUS_MAX = 15_000

interface Props {
  bars: BarPin[]; styles: BeerStyle[]; loading: boolean
  /** Ids favoritos: los pines de esos bares llevan un corazón. */
  favorites: Set<number>
  /** Marca o desmarca desde la vista previa. Sin sesión, lleva a Perfil. */
  onToggleFavorite: (barId: number) => void
  /**
   * Arranca la carga de precio con este bar ya elegido, desde la vista previa
   * de un bar sin precio. El flujo vive en `Shell`, junto al "+" de la barra
   * de pestañas: es el mismo flujo, entrado por otra puerta.
   */
  onAddPrice: (bar: FlowBar) => void
  center: google.maps.LatLngLiteral | null
  simulated: google.maps.LatLngLiteral | null
  radius: number; styleFilter: string[]
  minRating?: number
  onMinRating: (n?: number) => void
  tooZoomedOut: boolean
  onStyle: (s: string[]) => void
  onRadius: (m: number) => void
  onSimulate: (p: google.maps.LatLngLiteral | null) => void
  onCamera: (c: google.maps.LatLngLiteral, zoom: number) => void
  onRecenter: () => void
  camera: { center: google.maps.LatLngLiteral; zoom: number } | null
  myLocation: google.maps.LatLngLiteral | null
  /** No se pudo ubicar a la persona: el mapa arranca en el centro y hay que decirlo. */
  locationUnknown: boolean
  /** El permiso está bloqueado para el sitio: reintentar no puede funcionar. */
  locationBlocked: boolean
  /** Abre el tutorial de esta pantalla. Ver el "?" más abajo. */
  onHelp: () => void
  /** Cambia cuando se pide centrar: la cámara es imperativa, no reactiva. */
  panTo: { target: google.maps.LatLngLiteral; token: number } | null
}

export function MapScreen(p: Props) {
  const nav = useNavigate()
  const [radiusOpen, setRadiusOpen] = useState(false)
  // Ver el botón de cerrar, más abajo.
  const [cartelCerrado, setCartelCerrado] = useState(false)
  /*
   * Ver sólo los favoritos en el mapa.
   *
   * Filtra los pines que ya están cargados, no vuelve a pedir. Es lo correcto
   * acá y no en la lista: el mapa muestra lo que entra en la pantalla, así que
   * "mis favoritos" significa "de lo que estoy viendo, cuáles marqué". En la
   * lista sí se pide al servidor, porque ahí el favorito que buscás suele
   * estar en otro barrio.
   */
  const [soloFavoritos, setSoloFavoritos] = useState(false)

  /*
   * Ver sólo los precios frescos, o sea de menos de 14 días.
   *
   * El umbral no es nuevo ni elegido acá: 14 días es el corte de `fresh` en
   * todo el proyecto, el mismo que pinta la barra de la izquierda de cada fila
   * y el punto de cada cápsula. Un filtro con su propio número sería un cuarto
   * significado de "fresco".
   *
   * Un bar sin precio **no pasa el filtro**, y eso es deliberado: "sólo
   * frescos" es una pregunta sobre el precio, y un bar sin precio no la
   * contesta que sí. Que desaparezca es la respuesta honesta.
   *
   * Filtra lo cargado y no vuelve a pedir, por lo mismo que el de favoritos:
   * en el mapa la pregunta es siempre "de lo que estoy viendo, cuáles".
   */
  const [soloFrescos, setSoloFrescos] = useState(false)

  const pines = p.bars.filter(b =>
    (!soloFavoritos || p.favorites.has(b.id)) &&
    (!soloFrescos || (b.freshestAgeDays != null && b.freshestAgeDays < FRESCO_DIAS)))

  /*
   * El fondo que pinta Google mientras bajan las teselas.
   *
   * Por defecto es un gris claro, y en una app oscura eso es un flash blanco
   * cada vez que se panea rápido. Se lee de `--base` en vez de escribir el
   * hex acá para que el día que cambie la paleta no queden dos espressos.
   *
   * `useState` con inicializador perezoso y no una constante de módulo:
   * `getComputedStyle` necesita el DOM montado, y una constante se evaluaría
   * al importar el módulo.
   */
  const [fondoMapa] = useState(() => resolve('var(--base)'))

  // El bar de la preview se guarda entero y no por id: la lista de bares se
  // recarga sola cada vez que se mueve la cámara —y la preview mueve la
  // cámara—, así que buscarlo por id en `p.bars` dejaba la tarjeta vacía cada
  // tanto, justo después de abrirla.
  const [preview, setPreview] = useState<BarPin | null>(null)

  // Al soltar el dedo después de un long-press, el mapa emite igual un
  // 'click'. Sin este sello, ese click borraba el punto en el mismo gesto que
  // lo acababa de poner — y el long-press parecía no hacer nada.
  const longPressAt = useRef(0)
  const onLongPress = useCallback((pt: google.maps.LatLngLiteral) => {
    longPressAt.current = Date.now()
    p.onSimulate(pt)
  }, [p.onSimulate])

  // Los nombres de calle aparecen recién de cerca. Dos arrays constantes: la
  // identidad no cambia entre renders, así el mapa no se re-estila por nada.
  const styles = (p.camera?.zoom ?? 0) >= CALLES_DESDE_ZOOM
    ? MAP_STYLE_CON_CALLES : MAP_STYLE

  /*
   * Acá vivía el encabezado: el título "Mapa" y, debajo, el resumen de lo que
   * había en pantalla ("18 bares con precio fresco").
   *
   * Se fue entero. El título nombraba la pestaña en la que ya estabas parado,
   * y arriba del mapa el alto es caro: la barra le comía una franja al único
   * contenido de la pantalla. Lo que el resumen resolvía —saber que un filtro
   * está puesto y que por eso hay menos— lo dicen mejor las píldoras, que se
   * ven prendidas, y la tarjeta de vacío, que además explica cuál sacar.
   *
   * Lo que NO vuelve, esté donde esté: un promedio de precio armado con los
   * pines. Lo único que el cliente tiene para promediar es `fromPrice`, y ese
   * número no es "el precio de la zona" de ninguna manera honesta — es el más
   * barato de cada bar, viene sin `sizeMl` (un schop de 330 y una pinta de 473
   * al mismo saco) y sin antigüedad al lado rompe la regla que no se negocia.
   * El promedio que sí sirve lo calcula el servidor, normalizado a 473 ml y
   * con su alcance temporal: es `AreaStats`, y se dibuja en `AreaStatsCard`.
   */

  if (!p.center) return <PintLoader message="Buscando dónde estás…" />

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/*
        La pizarra, debajo del mapa.

        Es uno de los dos únicos lugares donde va la textura de grilla —el
        otro es la bienvenida— y está por una razón concreta: si la API de
        Google no carga (sin señal, la clave bloqueada, un bloqueador de
        anuncios), `<Map>` deja un div vacío y lo que se veía era el blanco
        del navegador. Una pizarra vacía al menos se parece a la app.

        Con el mapa cargado no se ve: Google pinta encima con `fondoMapa`.
      */}
      <div className="pizarra" aria-hidden style={{
        position: 'absolute', inset: 0,
        // `backgroundColor` y no el atajo `background`: el atajo inline gana
        // por especificidad y le borraría el `background-image` a `.pizarra`,
        // que es justamente la grilla.
        backgroundColor: 'var(--base)',
      }} />

      <Map
        defaultCenter={p.camera?.center ?? p.center}
        defaultZoom={p.camera?.zoom ?? 15}
        disableDefaultUI
        gestureHandling="greedy"
        styles={styles}
        backgroundColor={fondoMapa}
        onClick={() => {
          if (Date.now() - longPressAt.current < 600) return
          // Un toque cierra lo que esté abierto, de arriba hacia abajo, y
          // recién con todo cerrado borra el punto elegido. Si no, cerrar el
          // radio o la preview te costaba el punto que estabas por ajustar.
          if (radiusOpen) setRadiusOpen(false)
          else if (preview) setPreview(null)
          else p.onSimulate(null)
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <CameraWatcher onCamera={p.onCamera} />
        <LongPress onLongPress={onLongPress} />
        <PanTo target={p.panTo} />

        {/* El SDK web no dibuja la ubicación del usuario por su cuenta, a
            diferencia del de Android: hay que ponerla a mano. */}
        {p.myLocation && <MyLocationDot position={p.myLocation} />}

        {p.simulated && <SimulatedPin position={p.simulated} />}

        <Pins bars={pines} selectedId={preview?.id ?? null}
          favorites={p.favorites} onOpen={setPreview} />
      </Map>

      {/* Blanco del tutorial para el paso del punto secundario.
          Ese paso habla de un gesto sobre el mapa, no de un botón, así que no
          hay control al que apuntar: se marca un pedazo del mapa y el recorte
          de luz cae ahí. No se ve ni recibe toques; existe sólo para que el
          tutorial tenga qué medir. */}
      <div
        data-tour="map-longpress"
        aria-hidden
        style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 190, height: 190, marginLeft: -95, marginTop: -95,
          pointerEvents: 'none',
        }}
      />

      {/*
        Controles. Dos filas, no cinco: el mapa es el contenido.

        Acá había también un selector de "más cerca / más barata". Se sacó
        porque en el mapa no ordena nada visible: los pines se dibujan todos, y
        el descarte de etiquetas se reordena por precio por su cuenta. Lo único
        que hacía era decidir cuáles 400 bares sobreviven al recorte de
        `project()` cuando hay más que eso en el radio — o sea, cambiaba el
        mapa sin explicar por qué. El orden vive en la lista, que es donde
        significa algo.
      */}
      <div
        onPointerDown={e => e.stopPropagation()}
        className="map-controls"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 'var(--s-2)', zIndex: 10,
          // El aire de arriba lo ponía el encabezado, que se fue: la barra
          // decía "Mapa" estando parado en la pestaña Mapa, y le comía una
          // franja de alto al único contenido de la pantalla.
          paddingTop: 'calc(var(--safe-top) + var(--s-2))',
          // La franja ocupa todo el ancho y crece cuando el slider está
          // abierto. Sin esto se come el paneo del mapa en toda esa zona,
          // incluido el aire entre controles.
          pointerEvents: 'none',
        }}
      >

        {/*
          La franja de controles.

          Dos grupos y no una fila sola: a la izquierda lo que acota QUÉ se ve
          —ayuda, estilo, nota, frescura, radio—, y pegado al canto derecho el
          de favoritos. El `marginLeft: auto` es lo que lo manda allá y lo deja
          ahí aunque el grupo de la izquierda baje de renglón.

          `flexShrink: 0` en cada píldora para que las etiquetas no se partan
          en dos renglones adentro de una cápsula de una sola línea, y el
          padding apretado por ancho de pantalla (`.map-controls`) para que
          entren todas. El `wrap` del grupo izquierdo queda de red de
          seguridad: en una pantalla muy chica es mejor que bajen de línea a
          que se desborden.
        */}
        <div style={{
          display: 'flex', gap: 'var(--ctl-gap)', padding: '0 14px',
          alignItems: 'flex-start', width: '100%',
          // La fila ocupa el ancho entero para poder empujar el corazón contra
          // el canto derecho, y entre los dos grupos queda un hueco largo. Ese
          // hueco es mapa: si la fila capturara el toque, panear desde ahí no
          // haría nada. Los toques los reciben los grupos, no la fila.
          pointerEvents: 'none',
        }}>
          <div style={{
            display: 'flex', gap: 'var(--ctl-gap)', flexWrap: 'wrap',
            alignItems: 'flex-start', minWidth: 0, pointerEvents: 'auto',
          }}>
            {/* La fila de chips scrolleaba mal: el gesto competía con el paneo
                del mapa, así que a veces se movía el mapa en vez de la lista, y
                encima ocupaba una franja permanente de pantalla. */}
            <StyleFilter
              styles={p.styles} selected={p.styleFilter} onSelect={p.onStyle}
              tourId="map-style"
            />

            {/* La nota, en su propia píldora. Antes era el pie del menú de
                estilos: un piso de estrellas puesto sin querer no se veía con
                el menú cerrado y había que reabrirlo entero para sacarlo. */}
            <RatingFilter minRating={p.minRating} onMinRating={p.onMinRating} />

            {/* El de frescura va siempre, sin la condición del de favoritos: no
                hace falta haber hecho nada antes para preguntarse cuáles de
                estos precios son de esta semana, y es la pregunta que la app
                entera viene a contestar. */}
            <ChipFiltro
              on={soloFrescos}
              onClick={() => setSoloFrescos(v => !v)}
              etiqueta="Frescos"
              aria={soloFrescos
                ? 'Ver también los precios viejos'
                : `Ver sólo precios de menos de ${FRESCO_DIAS} días`}
              tinte="fresh"
              icono={
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden
                  fill="none" stroke="currentColor" strokeWidth="1.9"
                  strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2.5 2M9 2h6" />
                </svg>
              }
            />

            <button
              onClick={() => setRadiusOpen(o => !o)}
              data-tour="map-radius"
              className="lbl pill glass"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, height: 44,
                padding: '0 var(--pill-pad)', fontSize: 'var(--t-3)',
                flexShrink: 0, whiteSpace: 'nowrap',
                background: radiusOpen ? 'var(--acento)' : undefined,
                color: radiusOpen ? 'var(--base)' : undefined,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24"
                fill={radiusOpen ? 'var(--base)' : 'var(--sobre-vidrio)'} aria-hidden>
                <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" />
              </svg>
              {/* Ancho fijo: si la etiqueta crece al arrastrar ("15 km" contra
                  "1.5 km"), la fila cambia de ancho y el botón salta de
                  renglón mientras movés el slider. `.num` ataca el mismo
                  problema por el otro lado: con cifras tabulares el número
                  deja de cambiar de ancho dígito a dígito. */}
              <span className="num" style={{
                color: radiusOpen ? 'var(--base)' : 'var(--acento)',
                minWidth: 46, textAlign: 'center',
              }}>
                {formatRadius(p.radius)}
              </span>
            </button>
          </div>

          {/* Favoritos: pegado al canto derecho y sólo el corazón.

              La palabra "Favoritos" no agregaba nada que el corazón no diga
              —es de los pocos íconos que de verdad son universales— y sí le
              robaba el ancho que necesitan las tres píldoras que sí se leen
              por su texto. Suelto a la derecha, además, deja de competir con
              ellas: no acota lo mismo, acota a lo tuyo.

              Sigue apareciendo sólo si hay alguno marcado o si el filtro está
              puesto: un botón que siempre deja el mapa vacío no ayuda a nadie.
              Mismo criterio que el de la lista. */}
          {(p.favorites.size > 0 || soloFavoritos) && (
            <ChipFiltro
              on={soloFavoritos}
              onClick={() => setSoloFavoritos(v => !v)}
              aria={soloFavoritos ? 'Ver todos los bares' : 'Ver sólo mis favoritos'}
              tinte="favorito"
              style={{
                marginLeft: 'auto', width: 44, padding: 0,
                justifyContent: 'center', pointerEvents: 'auto',
              }}
              icono={
                <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden
                  fill={soloFavoritos ? 'currentColor' : 'none'}
                  stroke="currentColor" strokeWidth={soloFavoritos ? 0 : 1.9}>
                  <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z" />
                </svg>
              }
            />
          )}
        </div>

        {/* El slider va acá, pegado a los controles: es el control que lo
            abre, y arriba hay ancho real. Al pie quedaba lejos del botón y
            competía con los dos botones flotantes y la barra de navegación. */}
        {radiusOpen && (
          <div
            className="glass"
            style={{
              // Ancho tope: `alignSelf: stretch` lo estiraba a todo el
              // viewport, y en un monitor eso son 1900px de slider para
              // elegir entre 300 m y 15 km. Arrastrar de punta a punta
              // cambiaba el radio 8 metros por píxel.
              width: 'calc(100% - 28px)', maxWidth: 420, pointerEvents: 'auto',
              borderRadius: 'var(--r-3)', padding: 'var(--s-3) var(--s-4) var(--s-2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--s-1)' }}>
              <span style={{ color: 'var(--sobre-vidrio)', fontSize: 'var(--t-2)', minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.simulated ? 'Desde el punto elegido' : 'Desde tu ubicación'}
              </span>
              <span className="num" style={{
                marginLeft: 'auto', paddingLeft: 'var(--s-3)', color: 'var(--acento)',
                fontSize: 'var(--t-4)', whiteSpace: 'nowrap',
              }}>{formatRadius(p.radius)}</span>
            </div>
            <input
              className="range"
              type="range" min={RADIUS_MIN} max={RADIUS_MAX} step={100} value={p.radius}
              onChange={e => { fb.paso(); p.onRadius(Number(e.target.value)) }}
              style={{
                ['--fill' as string]:
                  `${((p.radius - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN)) * 100}%`,
              }}
            />
            <div className="num" style={{
              display: 'flex', justifyContent: 'space-between',
              color: 'var(--sobre-vidrio)', fontSize: 'var(--t-1)',
              marginTop: 'var(--s-1)', opacity: .75,
            }}>
              <span>{formatRadius(RADIUS_MIN)}</span><span>{formatRadius(RADIUS_MAX)}</span>
            </div>
          </div>
        )}

        {p.tooZoomedOut && (
          <div className="glass pill" style={{
            padding: 'var(--s-2) var(--s-4)', fontSize: 'var(--t-2)',
            color: 'var(--sobre-vidrio)',
            pointerEvents: 'auto',
          }}>Acercá el mapa para ver bares</div>
        )}

        {/*
          Zona sin un solo bar cargado.
          
          Desde que se pueden cargar bares de cualquier parte del mundo, éste
          pasó a ser el primer contacto más probable de alguien nuevo: abre la
          app en una ciudad donde nadie cargó nada y ve un mapa mudo, sin una
          palabra que le diga si la app está rota, si está mal parado, o si
          simplemente no hay nada todavía.
          
          Sólo cuando terminó de cargar y el zoom alcanza: con el mapa lejos ya
          lo dice el cartel de arriba, y mientras carga decir "no hay nada"
          sería mentir por un segundo.
        */}
        {!p.loading && !p.tooZoomedOut && pines.length === 0 && (
          <div className="glass" style={{
            pointerEvents: 'auto', maxWidth: 340, borderRadius: 'var(--r-3)',
            padding: 'var(--s-4)', textAlign: 'center',
          }}>
            {/* El vacío por filtro y el vacío de verdad no son lo mismo, y el
                texto tiene que decir cuál es: ofrecerle "agregá un bar" a
                alguien que sólo tiene un filtro puesto lo manda a resolver un
                problema que no tiene. */}
            {soloFavoritos || soloFrescos ? (
              <>
                <p className="lbl" style={{ margin: 0, fontSize: 'var(--t-4)' }}>
                  {soloFavoritos && soloFrescos ? 'Ningún favorito con precio fresco por acá'
                    : soloFavoritos ? 'Ninguno de tus favoritos por acá'
                      : 'Ningún precio fresco por acá'}
                </p>
                <p style={{
                  margin: 'var(--s-2) 0 0', fontSize: 'var(--t-2)',
                  color: 'var(--sobre-vidrio)', lineHeight: 1.5,
                }}>
                  {/* Cada vacío dice por qué está vacío y qué hacer. El de
                      frescura además cuenta algo que no se ve: que sí hay
                      bares, y que lo que les falta es alguien que pase a
                      mirar la pizarra. */}
                  {soloFavoritos
                    ? 'Están en otra zona del mapa, o todavía no marcaste ninguno acá.'
                    : `Hay bares, pero ninguno con un precio de menos de ${FRESCO_DIAS} días. Si pasás por uno, cargalo.`}
                </p>
                {/* El CTA primario de la dirección: hueso pleno sobre
                    espresso, radio --r-2 y 46 de alto, que es el paso corto
                    de los dos que define el spec — esto vive adentro de una
                    tarjeta que flota sobre el mapa, no al pie de una
                    pantalla entera. Sigue arriba del piso de 44px.

                    `.cta` es el hundido del spec, y no es decorativo: el
                    botón flota sobre el mapa, o sea sobre algo que se mueve,
                    y sin acuse de recibo no hay forma de saber si el tap
                    entró o si lo que se movió fue el mapa. Va por clase
                    porque `:active` no se puede escribir inline. */}
                <button
                  onClick={() => { setSoloFavoritos(false); setSoloFrescos(false) }}
                  className="lbl cta"
                  style={{
                    marginTop: 'var(--s-3)', padding: '0 var(--s-4)',
                    borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)', height: 46,
                    background: 'var(--acento)', color: 'var(--base)',
                  }}
                >Ver todos</button>
              </>
            ) : (
              <>
                <p className="lbl" style={{ margin: 0, fontSize: 'var(--t-4)' }}>
                  Por acá no hay bares cargados
                </p>
                <p style={{
                  margin: 'var(--s-2) 0 0', fontSize: 'var(--t-2)',
                  color: 'var(--sobre-vidrio)', lineHeight: 1.5,
                }}>
                  El mapa lo hacemos entre todos. Si conocés uno en esta zona,
                  cargalo y queda para el resto.
                </p>
                {/* Mismo CTA primario y mismo `.cta` que el de arriba. */}
                <button onClick={() => nav('/agregar')} className="lbl cta" style={{
                  marginTop: 'var(--s-3)', padding: '0 var(--s-4)',
                  borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)', height: 46,
                  background: 'var(--acento)', color: 'var(--base)',
                }}>Agregar un bar</button>
              </>
            )}
          </div>
        )}

        {/*
          Sin esto, un mapa centrado en el Obelisco es indistinguible de un
          mapa centrado en vos. Ya no hay punto azul mintiendo, pero el
          encuadre solo sigue sugiriendo que estás ahí: hay que decirlo con
          palabras.

          Y hay DOS mensajes, no uno, porque hay dos situaciones que se
          arreglan de formas opuestas. Con el permiso bloqueado, "Reintentar"
          es un botón que no puede funcionar: el navegador contesta el error al
          instante y no vuelve a preguntar nunca. Desde JavaScript no se puede
          reabrir el pedido, así que lo único accionable es decir dónde se
          destraba. Un botón muerto es la misma clase de mentira que el punto
          azul en el Obelisco.
        */}
        {p.locationUnknown && !cartelCerrado && (
          <div className="glass pill" style={{
            display: 'flex', alignItems: 'center', gap: 'var(--s-2)',
            padding: 'var(--s-2) var(--s-4)', fontSize: 'var(--t-2)',
            color: 'var(--sobre-vidrio)',
            pointerEvents: 'auto', maxWidth: 'calc(100% - 28px)',
          }}>
            {p.locationBlocked ? (
              <span>
                Bloqueaste la ubicación para este sitio — esto es el centro.
                Se destraba desde el candado <span aria-hidden>🔒</span> de la barra de direcciones.
              </span>
            ) : (
              <>
                <span>No pudimos ubicarte — esto es el centro</span>
                <button onClick={p.onRecenter} className="lbl" style={{
                  color: 'var(--acento)', fontSize: 'var(--t-2)', whiteSpace: 'nowrap',
                }}>Reintentar</button>
              </>
            )}

            {/* Cerrar.
                El cartel tapa parte del mapa y, para quien decidió mirar los
                precios sin dar la ubicación, no hay nada más que hacer con él:
                era un aviso permanente sobre una decisión ya tomada. Se cierra
                sólo para esta pantalla; al volver a entrar aparece de nuevo,
                porque la situación sigue siendo cierta y el botón de centrar
                sigue estando para arreglarla. */}
            <button
              onClick={() => setCartelCerrado(true)}
              aria-label="Cerrar el aviso"
              className="lbl"
              style={{
                marginLeft: 2, marginRight: -6, width: 26, height: 26,
                flexShrink: 0, borderRadius: '50%',
                display: 'grid', placeItems: 'center',
                color: 'var(--sobre-vidrio)', fontSize: 'var(--t-4)',
              }}
            >×</button>
          </div>
        )}
      </div>

      {/*
        Los dos flotantes se van mientras hay preview: ocupan exactamente la
        franja donde entra la tarjeta. Google Maps hace lo mismo, y por la
        misma razón — mientras mirás un lugar, ni moverte de lugar ni leer el
        tutorial es lo que estás por hacer.

        A la derecha estaba el "+", que se mudó al centro de la barra de
        pestañas: agregar algo no es una acción del mapa sino de la app, y ahí
        está a mano desde las cuatro pantallas. La esquina quedó libre y la
        ocupa el "?".
      */}
      {!preview && (
        <>
        {/*
          El "?", abajo a la derecha, en el lugar que dejó el "+".

          Probamos subirlo a la franja de controles de arriba y no va: esa
          franja ya lleva cuatro píldoras y el corazón, y un botón más la
          apilaba en dos renglones sobre el mapa, que es lo que no se puede
          gastar. Abajo tiene una esquina entera para él.

          Lo que sí se queda del intento anterior: el signo es un `<path>` y no
          el glifo "?". Un glifo se posiciona por baseline y adentro de un
          círculo nunca queda centrado, que era el otro defecto.
        */}
        <button
          onClick={p.onHelp}
          aria-label="Cómo funciona la app"
          className="glass"
          style={{
            position: 'absolute', right: 14, bottom: `calc(72px + var(--nav-gap))`,
            width: 48, height: 48, borderRadius: '50%', zIndex: 10,
            display: 'grid', placeItems: 'center', padding: 0,
            color: 'var(--sobre-vidrio)',
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 17.1a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7Zm.2-13.1c2.5 0 4.4 1.7 4.4 4.1 0 1.9-1.1 3-2.4 3.8-1 .7-1.3 1.1-1.3 1.9v.7h-2.2v-1c0-1.6.7-2.5 1.9-3.3 1-.7 1.6-1.2 1.6-2.1 0-1.1-.9-1.9-2.1-1.9-1.3 0-2.2.8-2.3 2.1H7.5C7.6 5.7 9.6 4 12.2 4Z" />
          </svg>
        </button>

        <button onClick={p.onRecenter} className="glass" style={{
          position: 'absolute', left: 14, bottom: `calc(72px + var(--nav-gap))`,
          width: 48, height: 48, borderRadius: '50%', zIndex: 10,
          display: 'grid', placeItems: 'center',
        }} aria-label={p.simulated ? 'Centrar en el punto elegido' : 'Centrar en mi ubicación'}>
          {/* Hueso cuando apunta al punto elegido, azul acero cuando apunta
              a tu ubicación: es el color de cada uno de los dos puntos en el
              mapa, así el botón dice a cuál va antes de tocarlo.

              Con heritage esto había que corregirlo: `--cream` y `--acento`
              pasaron a ser el mismo hex, o sea que los dos estados del botón
              se veían idénticos. El punto del GPS ahora es `--info` —el rol
              "ubicación" de la dirección— así que el botón lo sigue. */}
          <svg width="21" height="21" viewBox="0 0 24 24"
            fill={p.simulated ? 'var(--cream)' : 'var(--info)'} aria-hidden>
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
          </svg>
        </button>
        </>
      )}

      {preview && (
        <BarPreview
          key={preview.id}
          bar={preview}
          onClose={() => setPreview(null)}
          onOpen={() => nav(`/bar/${preview.id}`)}
          onAddPrice={() => p.onAddPrice({
            id: preview.id, name: preview.name, currency: preview.currency,
          })}
          isFavorite={p.favorites.has(preview.id)}
          onToggleFavorite={() => p.onToggleFavorite(preview.id)}
        />
      )}
    </div>
  )
}

/**
 * Un filtro del mapa, prendido o apagado.
 *
 * ## Por qué lleva etiqueta y antes no
 *
 * Los controles del mapa eran píldoras de 44px con un ícono adentro y nada
 * más, apoyadas justo debajo del encabezado, que también es de vidrio. Tres
 * piezas del mismo material y sin una palabra entre las tres: se leían como
 * parte del cromo de la barra y no como cosas que se tocan. Con la palabra al
 * lado del ícono dejan de ser adivinanza — es lo mismo que la dirección hizo
 * con las pestañas de abajo, que ahora muestran las tres etiquetas.
 *
 * ## Por qué sigue siendo vidrio
 *
 * La dirección deja el vidrio sólo donde algo flota sobre el mapa, y esto es
 * exactamente eso. El `backdrop-filter` no es decoración acá: es lo que
 * garantiza el contraste de la etiqueta pase lo que pase por debajo, que en un
 * mapa es a veces una cápsula de precio clara.
 *
 * ## El prendido es opaco, y no es una decisión de gusto
 *
 * Un filtro puesto se pinta con el color pleno del dato —coral para lo tuyo,
 * lima para la frescura— y la etiqueta en espresso encima. La tentación era
 * usar la gramática de acción secundaria de la dirección (relleno tenue +
 * borde + texto claro), que es más tranquila y es la que usa el resto de la
 * app. Sobre el mapa no se puede: un relleno translúcido deja el contraste a
 * merced de lo que pase por debajo, y medido contra una cápsula de precio
 * clara ese estado da 1,28:1 en coral y 3,02:1 en lima. Opaco da 5,86 y
 * 17,59, y no depende del fondo.
 *
 * Es la misma razón por la que el botón de favoritos ya se soltaba de
 * `.glass` al prenderse antes de esto. Lo que cambia es que ahora los tres
 * filtros lo hacen igual, y que se ve qué son antes de tocarlos.
 */
function ChipFiltro({ on, onClick, etiqueta, aria, icono, tinte, style }: {
  on: boolean
  onClick: () => void
  /** Ausente = sólo el ícono. Ver el de favoritos, que es el único así. */
  etiqueta?: string
  /** Lo que se anuncia: dice qué va a pasar al tocar, no qué se ve. */
  aria: string
  icono: React.ReactNode
  /** De qué habla el filtro. Decide el tono del prendido, no la forma. */
  tinte: 'favorito' | 'fresh'
  /** Sólo para ubicarlo en la fila. Los colores los pone el `tinte`. */
  style?: React.CSSProperties
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={aria}
      // Prendido se suelta del vidrio: el relleno es opaco y el
      // `backdrop-filter` debajo ya no aporta nada.
      className={on ? 'lbl pill' : 'lbl pill glass'}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, height: 44,
        padding: '0 var(--pill-pad)', flexShrink: 0, whiteSpace: 'nowrap',
        fontSize: 'var(--t-2)',
        background: on
          ? (tinte === 'favorito' ? 'var(--favorito)' : 'var(--fresh)')
          : undefined,
        // Apagado va en `--sobre-vidrio` y no en `--muted`: adentro del vidrio
        // lo que pasa por detrás puede ser una cápsula clara, y `--muted` ahí
        // se cae del contraste.
        color: on ? 'var(--base)' : 'var(--sobre-vidrio)',
        ...style,
      }}
    >
      {icono}
      {etiqueta}
    </button>
  )
}

/**
 * Descarte de etiquetas superpuestas.
 *
 * Se recorren del más barato al más caro y sólo recibe etiqueta el que no
 * cae encima de otro ya colocado; el resto queda como punto. El zIndex sólo
 * decide quién gana, no evita que la cápsula de abajo quede cortada.
 */
function Pins({
  bars, selectedId, favorites, onOpen,
}: {
  bars: BarPin[]
  selectedId: number | null
  favorites: Set<number>
  onOpen: (b: BarPin) => void
}) {
  const map = useMap()
  const [zoom, setZoom] = useState(15)
  /** El rectángulo visible, con un margen. Ver `enPantalla`. */
  const [caja, setCaja] = useState<google.maps.LatLngBoundsLiteral | null>(null)

  useEffect(() => {
    if (!map) return
    const l = map.addListener('zoom_changed', () => setZoom(map.getZoom() ?? 15))
    return () => l.remove()
  }, [map])

  /**
   * El recuadro visible, releído cuando el mapa se queda quieto.
   *
   * `idle` y no `bounds_changed`: el segundo dispara decenas de veces por
   * gesto y cada uno recalcularía qué pines van, en medio del paneo.
   *
   * El margen del 35% es para que panear no haga aparecer los pines de golpe
   * contra el borde: cuando entran a pantalla ya estaban dibujados.
   */
  useEffect(() => {
    if (!map) return
    const leer = () => {
      const b = map.getBounds()
      if (!b) return
      const ne = b.getNorthEast(), sw = b.getSouthWest()
      const mLat = (ne.lat() - sw.lat()) * 0.35
      const mLng = (ne.lng() - sw.lng()) * 0.35
      setCaja({
        north: ne.lat() + mLat, south: sw.lat() - mLat,
        east: ne.lng() + mLng, west: sw.lng() - mLng,
      })
    }
    leer()
    const l = map.addListener('idle', leer)
    return () => l.remove()
  }, [map])

  // Hasta que el SDK esté cargado no se dibuja nada: los íconos construyen
  // google.maps.Point, y tocar `google` antes de tiempo es un ReferenceError
  // que tumba la app entera en blanco, no sólo el mapa.
  if (!map) return null

  /**
   * Sólo se dibujan los pines que están en pantalla.
   *
   * **Cuántos bares trae la consulta y cuántos marcadores existen son dos
   * preguntas distintas, y antes eran la misma.** El radio decide lo primero:
   * si pedís 7 km, los bares de 7 km tienen que estar, y por eso el techo de
   * filas subió a mil (ver `core/Limits.kt`). Pero cada pin es un
   * `google.maps.Marker`, o sea un objeto del SDK con su overlay: mil de esos
   * en un teléfono se sienten al panear, y la mayoría está fuera de la
   * pantalla, donde no los ve nadie.
   *
   * Recortar por el recuadro visible desacopla las dos cosas: los datos quedan
   * completos —la lista, el promedio de la zona y "más barata cerca" siguen
   * viendo todo— y el mapa dibuja las decenas que de verdad se están mirando.
   * Al alejarte entran más, que es exactamente cuando querés verlos.
   *
   * Sin caja todavía —el primer render, antes del primer `idle`— se dibuja
   * todo: es preferible un cuadro pesado a un mapa vacío.
   */
  const enPantalla = caja == null ? bars : bars.filter(b =>
    // El abierto se dibuja siempre, aunque quede afuera del recuadro. Al
    // tocarlo el mapa se centra en él, pero entre el toque y el `idle` el
    // recuadro todavía es el de antes: sin esta excepción, el pin del bar que
    // acabás de abrir desaparecía debajo de su propia tarjeta.
    b.id === selectedId ||
    (b.lat >= caja.south && b.lat <= caja.north &&
     b.lng >= caja.west && b.lng <= caja.east))

  // El puesto se calcula sobre lo que hay en pantalla, así que la escala se
  // reajusta al moverse: en Palermo lo barato es otro número que en Liniers, y
  // un color absoluto no diría nada en ninguno de los dos.
  const ranks = priceRanks(
    enPantalla.filter(b => b.fromPrice != null).map(b => [b.id, b.fromPrice!]),
  )

  // Sin precio no hay puesto, y un bar sin precio no es "caro": es desconocido.
  // Por eso va en hueso bajado y no en un extremo de la escala: un punto
  // apagado se lee como "acá no sabemos", que es la verdad.
  const colorOf = (b: BarPin) =>
    ranks.has(b.id) ? priceColor(ranks.get(b.id)!) : alpha('var(--cream)', .35)

  /**
   * Centrar el bar tocado, pero arriba de la tarjeta y no debajo.
   *
   * `panTo` al bar lo dejaba justo en el medio, o sea tapado por la preview.
   * El corrimiento se calcula en coordenadas y se manda en un solo `panTo`:
   * encadenar `panTo` + `panBy` son dos animaciones que compiten y el mapa
   * termina en cualquier lado.
   */
  const reveal = (b: BarPin) => {
    const metersPerPx = 156543.03392 * Math.cos(b.lat * Math.PI / 180) / 2 ** zoom
    const offsetPx = (map.getDiv().clientHeight || 640) * 0.18
    map.panTo({ lat: b.lat - (offsetPx * metersPerPx) / 111_320, lng: b.lng })
  }

  const showLabels = zoom >= 14.5
  const labelled = new Set<number>()
  if (showLabels) {
    // La escala se toma de la latitud del centro del mapa, no de `bars[0]`.
    // Con el primer bar del array, el umbral de separación dependía de en qué
    // orden venía la lista —y ese orden lo elegía el selector de la pantalla
    // de lista, desde otra pantalla—. En Buenos Aires la diferencia es de
    // milésimas, pero era una dependencia escondida entre dos pantallas.
    const lat = map.getCenter()?.lat() ?? -34.6
    const metersPerPx = 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** zoom
    const minSep = 132 * metersPerPx
    const kept: BarPin[] = []
    for (const b of enPantalla.filter(b => b.fromPrice != null)
      .sort((a, b) => a.fromPrice! - b.fromPrice!)) {
      const clash = kept.some(k => {
        const dLat = (k.lat - b.lat) * 111_320
        const dLng = (k.lng - b.lng) * 111_320 * Math.cos(b.lat * Math.PI / 180)
        return Math.hypot(dLat, dLng) < minSep
      })
      if (!clash) { kept.push(b); labelled.add(b.id) }
    }
  }

  return (
    <>
      {enPantalla.map(b => {
        const on = b.id === selectedId
        // El elegido siempre con su precio: es el que se está mirando, y que
        // el descarte de etiquetas lo dejara como punto era perder el dato
        // justo del bar que se abrió.
        const withLabel = b.fromPrice != null && (on || labelled.has(b.id))
        return (
          <Marker
            key={b.id}
            position={{ lat: b.lat, lng: b.lng }}
            onClick={() => { onOpen(b); reveal(b) }}
            zIndex={on ? 30 : withLabel ? 10 : 1}
            icon={withLabel
              ? priceIcon(
                  formatPrice(b.fromPrice!, b.currency),
                  colorOf(b), ageColor(b.freshestAgeDays), on, favorites.has(b.id),
                )
              : dotIcon(colorOf(b), b.fromPrice != null ? 13 : 9, on,
                  favorites.has(b.id))}
          />
        )
      })}
    </>
  )
}

/** Los colores llegan como var(--x): en un SVG hay que resolverlos. */
function resolve(color: string) {
  if (!color.startsWith('var(')) return color
  const name = color.slice(4, -1).trim()
  // El único hex escrito a mano del archivo, y es el piso de esta función, no
  // un color de la interfaz: si `getComputedStyle` devuelve vacío —hoja sin
  // cargar, token borrado— hay que devolver algo, y devolver nada pinta el
  // dibujo de negro. Es el valor de `--cream`.
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#FFFDF4'
}

/**
 * Un token con transparencia.
 *
 * Los pines se arman como texto SVG dentro de un `data:` URI, y ahí no hay
 * hoja de estilos: no corren `var()` ni `color-mix()`. Así que el token se
 * resuelve y el alfa se aplica a mano. Existe para no tener que escribir
 * `rgba(27,13,23,.88)` en el código — el día que `--base` cambie, la cápsula
 * cambia con él y no queda un espresso viejo colgado acá.
 */
function alpha(token: string, a: number) {
  const hex = resolve(token)
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

const svgUrl = (svg: string) =>
  'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)

/**
 * Cuánto mide un texto en la tipografía del pin.
 *
 * Los pines son un SVG dentro de un `data:` URI, así que no hay layout que
 * pregunte: el ancho de la cápsula hay que saberlo antes de escribirla. Se mide
 * con un canvas, que usa las mismas métricas que va a usar el navegador al
 * dibujar.
 *
 * `letterSpacing` no entra en `measureText` en todos los navegadores, así que se
 * descuenta a mano con el mismo −.02em que pide el `<text>`.
 *
 * Si no hay canvas se vuelve a la estimación vieja: una cápsula con aire de más
 * es mejor que un pin que no se dibuja.
 *
 * La caché existe porque los íconos se rehacen en cada movimiento de cámara y
 * los precios se repiten mucho entre pines.
 */
// Un objeto y no un `Map`: en este archivo `Map` es el componente del mapa de
// `@vis.gl/react-google-maps`, y `new Map()` acá construiría eso.
let anchos: Record<string, number> = {}
let lienzo: CanvasRenderingContext2D | null | undefined

/**
 * Se descarta lo medido cuando termina de cargar la tipografía.
 *
 * Sin esto la caché sería una trampa: los primeros pines se dibujan antes de
 * que Bricolage esté disponible, así que `measureText` mide con la tipografía
 * de respaldo del sistema, y ese ancho equivocado quedaría guardado para el
 * resto de la sesión. Es el mismo error que este cambio vino a arreglar, sólo
 * que llegando por otro lado.
 */
if (typeof document !== 'undefined') {
  document.fonts?.ready.then(() => { anchos = {} }).catch(() => { /* da igual */ })
}

function anchoTexto(label: string, px: number): number {
  const clave = `${label}|${px.toFixed(2)}`
  const guardado = anchos[clave]
  if (guardado !== undefined) return guardado

  if (lienzo === undefined) lienzo = document.createElement('canvas').getContext('2d')
  let w: number
  if (lienzo) {
    lienzo.font = `700 ${px}px "Bricolage Grotesque", system-ui, sans-serif`
    w = lienzo.measureText(label).width - 0.02 * px * label.length
  } else {
    w = label.length * 8.6
  }

  // Un tope para que la caché no crezca sin fin con precios de toda la ciudad.
  if (Object.keys(anchos).length > 1000) anchos = {}
  anchos[clave] = w
  return w
}

/**
 * Cápsula con el precio, como marcador.
 *
 * La cápsula **es** el color del precio —lima el más barato de la pantalla,
 * coral el más caro, ámbar en el medio— con el número escrito en espresso
 * adentro. Ver el comentario del principio del archivo por qué es el precio y
 * no la frescura lo que se pinta.
 *
 * A la izquierda del número va la edad de ese precio: un punto de 6px en
 * `--fresh|--aging|--stale` metido adentro de una chapita de espresso. La
 * chapita es lo que hace que se lea. Las dos escalas —precio y frescura— usan
 * los mismos tres colores, así que un punto lima apoyado directamente sobre la
 * cápsula del bar más barato, que también es lima, sería invisible justo en el
 * caso que más se mira. Sobre espresso contrasta siempre, sea cual sea el
 * precio del bar.
 *
 * Y va: ningún precio se dibuja sin su antigüedad al lado, tampoco acá.
 *
 * `on` es el bar abierto en la preview. Gana escala y un aro de hueso de 2px
 * en vez de invertirse a hueso pleno, que es lo que hacía antes: invertido
 * perdía el color del precio, que ahora es el dato.
 *
 * `precio` y `freshness` llegan como `var(--x)`.
 */
function priceIcon(
  label: string, precio: string, freshness: string, on = false, fav = false,
): google.maps.Icon {
  const s = on ? 1.16 : 1
  const fondo = resolve(precio)
  const borde = on ? resolve('var(--cream)') : alpha('var(--base)', .5)
  const tinta = resolve('var(--base)')

  /*
   * El corazón va a la izquierda de todo y grande.
   *
   * Estaba a la derecha, de 10px y calzado contra el borde con un ancho extra
   * de 13: o sea que su "padding" no era un padding sino la diferencia entre
   * dos números que nadie había vuelto a mirar, y quedaba pegado al canto y
   * apretado contra el último dígito.
   *
   * A la izquierda funciona mejor por cómo se lee un pin: el ojo entra por ahí,
   * y "es tuyo" es la primera cosa que querés saber de un bar que marcaste,
   * antes que el número. Después del corazón viene la chapita de frescura y
   * recién ahí el precio: marca, estado, dato.
   */
  const padX = 10 * s           // el aire contra el canto de la cápsula
  const gap = 6 * s             // el aire entre las tres piezas
  const chapa = 15 * s          // la chapita oscura que lleva el punto de edad
  const punto = 6 * s           // el punto de frescura, adentro de la chapita
  const heart = 14 * s          // el dibujo del corazón
  const heartBox = fav ? heart + gap : 0   // lo que reserva, dibujo + aire
  // El ancho del texto se MIDE, no se estima.
  //
  // Era `label.length * 8,6`, o sea 8,6px por carácter contando el espacio y
  // el punto de los miles, que miden la mitad. En "$ 7.125" son dos caracteres
  // angostos cobrados como anchos: sobraban unos 8px, todos del lado derecho,
  // porque el texto arranca pegado a la chapita y lo que quede libre queda
  // atrás. De ahí que las cápsulas se vieran desbalanceadas — el padding
  // izquierdo era el de verdad y el derecho era el error de la cuenta.
  const w = padX * 2 + heartBox + chapa + gap + anchoTexto(label, 13 * s)
  const h = 26 * s
  // El borde se dibuja por dentro, así que el lienzo tiene que agrandarse o
  // WebKit lo recorta a la mitad.
  const pad = on ? 4 : 0
  // 8 es --r-1, el radio de las píldoras chicas. Va como número porque esto
  // es un SVG dentro de un `data:` URI y ahí no llega el CSS. Deja de ser
  // píldora a propósito: una chapita rectangular con la esquina redondeada se
  // parece a un cartel de precio y se apila mejor con sus vecinas.
  const rx = 8 * s
  const izq = pad + padX
  const chapaX = izq + heartBox
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + pad * 2}" height="${h + pad * 2}">
    <rect x="${pad + 0.5}" y="${pad + 0.5}" rx="${rx}" width="${w - 1}" height="${h - 1}"
      fill="${fondo}" stroke="${borde}" stroke-width="${on ? 2 : 1}"/>
    ${fav ? heartPath(izq, pad + (h - heart) / 2, heart) : ''}
    <rect x="${chapaX}" y="${pad + (h - chapa) / 2}" rx="${4 * s}"
      width="${chapa}" height="${chapa}" fill="${resolve('var(--base)')}"/>
    <circle cx="${chapaX + chapa / 2}" cy="${pad + h / 2}" r="${punto / 2}"
      fill="${resolve(freshness)}"/>
    <text x="${chapaX + chapa + gap}" y="${pad + h / 2 + 4.5 * s}"
      text-anchor="start"
      font-family="Bricolage Grotesque, system-ui, sans-serif" font-size="${13 * s}"
      font-weight="700" font-variant-numeric="tabular-nums"
      style="font-variant-numeric:tabular-nums;letter-spacing:-.02em"
      fill="${tinta}">${label}</text>
  </svg>`
  return {
    url: svgUrl(svg),
    anchor: new google.maps.Point(pad + w / 2, pad + h / 2),
  }
}

/**
 * Un corazón chiquito, en coordenadas absolutas dentro del SVG del pin.
 *
 * Dibujado y no un emoji: un emoji dentro de un `data:` URI depende de la
 * fuente de cada sistema y en Android sale de otro color y otro tamaño.
 */
function heartPath(x: number, y: number, size: number) {
  const k = size / 24
  // Coral, no hueso: el corazón rojo es una convención más fuerte que
  // cualquier paleta, y es la misma marca que el de la ficha. El contorno en
  // `--base` lo despega cuando la cápsula es la del bar abierto, que se
  // invierte a hueso pleno y dejaría el coral flotando sin canto.
  return `<g transform="translate(${x} ${y}) scale(${k})"
      fill="${resolve('var(--favorito)')}" stroke="${resolve('var(--base)')}"
      stroke-width="1.6" stroke-linejoin="round" paint-order="stroke">
    <path d="M12 21 3.2 12.2a5.6 5.6 0 0 1 7.9-7.9l.9.9.9-.9a5.6 5.6 0 0 1 7.9 7.9L12 21Z"/>
  </g>`
}

/**
 * El punto, para los bares cuya etiqueta no entró.
 *
 * El favorito se marca con un aro y no con un corazón: a 9 píxeles, un
 * corazón es una mancha. El aro se distingue igual y no pretende ser un
 * dibujo.
 *
 * El aro va en `--acento-deep` y no en `--acento` a secas. El favorito es
 * marca ("es tuyo"), no dato, así que le toca la familia del acento; pero el
 * aro del bar abierto es `--cream`, y en la paleta Hueso el acento pleno
 * quedaba a un suspiro de ese blanco: dos aros de 2px a 9 píxeles pasaban a
 * ser el mismo aro. Con heritage `--acento-deep` es azul acero claro, así que
 * la distinción ahora es de tono y no de un punto de luminosidad — se ve de
 * lejos y sin meter un color que signifique un precio.
 */
function dotIcon(
  color: string, size: number, on = false, fav = false,
): google.maps.Icon {
  const fill = resolve(color)
  const pad = on ? 5 : fav ? 3 : 0
  const box = size + pad * 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}">
    ${on ? `<circle cx="${box / 2}" cy="${box / 2}" r="${size / 2 + 2.5}"
      fill="none" stroke="${resolve('var(--cream)')}" stroke-width="2.5"/>`
      : fav ? `<circle cx="${box / 2}" cy="${box / 2}" r="${size / 2 + 1.5}"
      fill="none" stroke="${resolve('var(--acento-deep)')}" stroke-width="2"/>` : ''}
    <circle cx="${box / 2}" cy="${box / 2}" r="${size / 2 - 0.5}" fill="${fill}"/>
  </svg>`
  return { url: svgUrl(svg), anchor: new google.maps.Point(box / 2, box / 2) }
}

function simulatedIcon(): google.maps.Icon {
  // Hueso, que es lo que dice "esto lo pusiste vos": el punto elegido es una
  // decisión, no un dato. Por eso no lleva ningún color de la escala.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26">
    <circle cx="13" cy="13" r="13" fill="${alpha('var(--cream)', .28)}"/>
    <circle cx="13" cy="13" r="6.5" fill="${resolve('var(--cream)')}"/>
  </svg>`
  return { url: svgUrl(svg), anchor: new google.maps.Point(13, 13) }
}

/**
 * Dónde estás: punto con halo.
 *
 * Deja el azul de Google (#4285F4) y pasa a `--info`. No es cosmética: el
 * azul de Google era el único color de la pantalla que no salía de la paleta,
 * y encima competía con la escala de precios como si fuera un valor más. En
 * la dirección heritage el azul acero es el rol informativo —distancias,
 * radio, telemetría, ubicación— así que el punto del GPS entra en la familia
 * en vez de ser un extranjero.
 *
 * El halo son dos círculos y no una sombra: un `filter` de SVG adentro de un
 * `data:` URI se rasteriza distinto en cada navegador y en iOS a veces
 * directamente no se dibuja.
 *
 * El aro de hueso se queda. Es la convención del punto de ubicación en todos
 * los mapas, y acá además garantiza que el punto se encuentre aunque quede
 * justo encima de una cápsula de precio invertida.
 */
function MyLocationDot({ position }: { position: google.maps.LatLngLiteral }) {
  const map = useMap()
  if (!map) return null
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26">
    <circle cx="13" cy="13" r="12" fill="${alpha('var(--info)', .18)}"/>
    <circle cx="13" cy="13" r="9" fill="${alpha('var(--info)', .3)}"/>
    <circle cx="13" cy="13" r="6" fill="${resolve('var(--info)')}"
      stroke="${resolve('var(--cream)')}" stroke-width="2.5"/>
  </svg>`
  return (
    <Marker
      position={position}
      clickable={false}
      zIndex={50}
      icon={{
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        anchor: new google.maps.Point(13, 13),
      }}
    />
  )
}

/**
 * Mueve la cámara cuando cambia el token.
 *
 * El mapa es no-controlado (defaultCenter/defaultZoom), así que cambiar el
 * estado no lo mueve: por eso el botón de ubicación no hacía nada. Hay que
 * pedírselo a la instancia.
 */
function PanTo({ target }: { target: { target: google.maps.LatLngLiteral; token: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !target) return
    map.panTo(target.target)
    if ((map.getZoom() ?? 0) < 15) map.setZoom(15)
  }, [map, target?.token])
  return null
}

function SimulatedPin({ position }: { position: google.maps.LatLngLiteral }) {
  const map = useMap()
  if (!map) return null
  return <Marker position={position} icon={simulatedIcon()} />
}

function CameraWatcher(
  { onCamera }: { onCamera: (c: google.maps.LatLngLiteral, z: number) => void },
) {
  const map = useMap()
  const timer = useRef<number>(0)
  useEffect(() => {
    if (!map) return
    const l = map.addListener('idle', () => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        const c = map.getCenter()
        if (c) onCamera({ lat: c.lat(), lng: c.lng() }, map.getZoom() ?? 15)
      }, 220)
    })
    return () => { l.remove(); window.clearTimeout(timer.current) }
  }, [map, onCamera])
  return null
}

/**
 * Mantener apretado deja un punto para explorar otra zona.
 *
 * 'contextmenu' alcanza en escritorio (clic derecho) y en Chrome de Android,
 * que sintetiza el evento al mantener apretado. Safari de iOS no lo emite
 * nunca: ahí el long-press abre el menú del sistema y el mapa no se entera.
 * Por eso el gesto táctil se detecta a mano sobre el div del mapa y el píxel
 * se traduce a coordenadas con la proyección de un OverlayView, que es la
 * única forma pública de hacer pantalla → LatLng.
 */
function LongPress(
  { onLongPress }: { onLongPress: (p: google.maps.LatLngLiteral) => void },
) {
  const map = useMap()
  // Los dos caminos pueden dispararse por el mismo gesto en Android. El sello
  // de tiempo deja pasar sólo al primero.
  const firedAt = useRef(0)

  const fire = useCallback((pt: google.maps.LatLngLiteral) => {
    if (Date.now() - firedAt.current < 700) return
    firedAt.current = Date.now()
    onLongPress(pt)
  }, [onLongPress])

  useEffect(() => {
    if (!map) return
    const l = map.addListener('contextmenu', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) fire({ lat: e.latLng.lat(), lng: e.latLng.lng() })
    })
    return () => l.remove()
  }, [map, fire])

  useEffect(() => {
    if (!map) return
    const div = map.getDiv()

    // Un overlay vacío, sólo para que `getProjection()` exista.
    const overlay = new google.maps.OverlayView()
    overlay.onAdd = () => {}
    overlay.draw = () => {}
    overlay.onRemove = () => {}
    overlay.setMap(map)

    let timer = 0
    let start: { x: number; y: number } | null = null
    const cancel = () => { window.clearTimeout(timer); start = null }

    const onStart = (e: TouchEvent) => {
      // Dos dedos es zoom, no long-press.
      if (e.touches.length !== 1) return cancel()
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY }
      timer = window.setTimeout(() => {
        const proj = overlay.getProjection()
        if (!proj || !start) return cancel()
        const r = div.getBoundingClientRect()
        const at = proj.fromContainerPixelToLatLng(
          new google.maps.Point(start.x - r.left, start.y - r.top),
        )
        if (at) {
          fire({ lat: at.lat(), lng: at.lng() })
          navigator.vibrate?.(12)
        }
        cancel()
      }, 450)
    }

    // Si el dedo se corrió, era un paneo: se cancela.
    const onMove = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]
      if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 12) cancel()
    }

    div.addEventListener('touchstart', onStart, { passive: true })
    div.addEventListener('touchmove', onMove, { passive: true })
    div.addEventListener('touchend', cancel, { passive: true })
    div.addEventListener('touchcancel', cancel, { passive: true })

    return () => {
      cancel()
      overlay.setMap(null)
      div.removeEventListener('touchstart', onStart)
      div.removeEventListener('touchmove', onMove)
      div.removeEventListener('touchend', cancel)
      div.removeEventListener('touchcancel', cancel)
    }
  }, [map, fire])

  return null
}
