import { useCallback, useEffect, useRef, useState } from 'react'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { BarPin, BeerStyle, Brand, User } from '../data/types'
import { ageColor, formatPrice, formatRadius, priceColor, priceRanks } from '../data/format'
import { PintLoader } from '../ui/PintLoader'
import { CALLES_DESDE_ZOOM, MAP_STYLE, MAP_STYLE_CON_CALLES } from '../mapStyle'
import { StyleFilter } from '../ui/StyleFilter'
import { BarPreview } from '../ui/BarPreview'
import { AddMenu, type AddAction } from '../ui/AddMenu'
import { ReportFlow } from './ReportFlow'
import { LogBeerSheet } from './LogBeer'
import { Toast } from '../ui/Chrome'

/*
 * Un pin dice una cosa, y cuál dice depende de si tiene número.
 *
 * Hasta la 0.11.0 había un interruptor para elegir entre frescura y precio.
 * Verde/ámbar/rojo es una convención tan fuerte para barato/caro que ésa era
 * la lectura por defecto aunque estuviera en modo frescura — o sea que la
 * mitad del tiempo el mapa decía una cosa y se leía otra. Un control que
 * existe para desambiguar algo que no debería ser ambiguo es el síntoma, no
 * la solución. El interruptor se fue y no vuelve.
 *
 * Con la pizarra el reparto queda así, y no es un empate entre dos escalas
 * sino una división por trabajo:
 *
 *  - **La cápsula con precio** es espresso con el número en hueso, y lleva
 *    al lado el punto de frescura. El cuánto ya está escrito con todas las
 *    letras, así que el color no tiene que repetirlo: lo que falta saber de
 *    un precio que ya leíste es de cuándo es. Encima esto cierra la regla
 *    que la app respeta en todas las otras pantallas y que en el mapa era la
 *    excepción: ningún precio se dibuja sin su antigüedad al lado.
 *  - **El punto pelado** —el bar cuya etiqueta no entró— sigue codificando
 *    el precio, porque es lo único que puede decir. Sin número, un punto que
 *    hablara de frescura sería un punto que no contesta la pregunta de la
 *    pantalla.
 */

/** Los extremos del slider, en metros. Compartidos con las etiquetas de abajo
 *  para que no se puedan desincronizar del `min`/`max` reales. */
const RADIUS_MIN = 300
const RADIUS_MAX = 15_000

interface Props {
  bars: BarPin[]; styles: BeerStyle[]; loading: boolean
  /** Anotar birras y cargar precios pide sesión; mirar el mapa no. */
  user: User | null
  /** Ids favoritos: los pines de esos bares llevan un corazón. */
  favorites: Set<number>
  /** Marca o desmarca desde la vista previa. Sin sesión, lleva a Perfil. */
  onToggleFavorite: (barId: number) => void
  brands: Brand[]
  onBrandCreated: (b: Brand) => void
  onStyleCreated: (s: BeerStyle) => void
  /** Invalida la caché de bares: un precio nuevo cambia el pin. */
  onChanged: () => void
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
  const pines = soloFavoritos ? p.bars.filter(b => p.favorites.has(b.id)) : p.bars

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

  // Qué eligió la persona en el menú del "+". Null = el menú está cerrado o
  // no eligió nada.
  const [action, setAction] = useState<AddAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const onPick = (a: AddAction) => {
    // Agregar un bar se puede sin cuenta hasta el formulario, que ya avisa.
    // Las otras dos escriben en nombre de la persona, así que sin sesión no
    // hay nada que hacer más que ofrecerle entrar.
    if (a !== 'bar' && !p.user) { nav('/perfil'); return }
    if (a === 'bar') { nav('/agregar'); return }
    setAction(a)
  }

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
   * El resumen del ámbito: qué hay en pantalla, en once píxeles.
   *
   * Cuenta lo que se está mirando y no lo que hay cargado. Con el filtro de
   * favoritos prendido, decir "18 bares" mientras se ven dos es mentir sobre
   * lo que hay en pantalla, y es justo la clase de mentira que hace que
   * alguien crea que el filtro no se aplicó.
   *
   * Y cuenta eso y nada más: acá NO va ningún promedio de precio, a
   * propósito, aunque el renglón tenga lugar de sobra.
   *
   * Lo único que el cliente tiene para promediar es `fromPrice`, y ese número
   * no es "el precio de la zona" de ninguna manera honesta:
   *
   *  - Es el precio MÁS BARATO de cada bar, así que un promedio de mínimos
   *    da siempre por debajo de lo que se paga.
   *  - Viene sin `sizeMl` —`BarPin` ni siquiera lo trae—, así que un schop de
   *    330 y una pinta de 473 entran al mismo saco: el número baja cuando lo
   *    que cambió fue el tamaño del vaso.
   *  - Y sin la antigüedad al lado rompe la regla que no se negocia. No
   *    alcanza con que `from_price` ya excluya los precios viejos: si el
   *    número no dice su alcance, en pantalla es un precio pelado.
   *
   * El promedio que sí sirve ya existe y lo calcula el servidor, normalizado
   * a una pinta de 473 ml y con su acotación temporal: es `AreaStats.avgPint`,
   * y se dibuja en `ui/AreaStatsCard.tsx`, arriba de la Lista. Si algún día
   * hace falta uno acá, es ése el que hay que traer — no un promedio armado
   * con los pines.
   *
   * Lo último: "Buscando" sólo cuando no hay nada que mostrar todavía.
   *
   * `p.loading` se prende en cada paneo, y cambiar el renglón a "Buscando
   * bares…" cada vez que se mueve el mapa lo convierte en un cartel que
   * parpadea. Mientras haya pines en pantalla, el número anterior sigue
   * siendo la mejor respuesta que tenemos.
   */
  const resumen =
    p.tooZoomedOut ? 'Acercá para contar lo que hay'
    : p.loading && pines.length === 0 ? 'Buscando bares…'
    : pines.length === 0
      ? (soloFavoritos ? 'Ningún favorito por acá' : 'Sin bares cargados por acá')
      : `${pines.length} ${soloFavoritos
          ? (pines.length === 1 ? 'favorito' : 'favoritos')
          : (pines.length === 1 ? 'bar' : 'bares')}`

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
          // La franja ocupa todo el ancho y crece cuando el slider está
          // abierto. Sin esto se come el paneo del mapa en toda esa zona,
          // incluido el aire entre controles.
          pointerEvents: 'none',
        }}
      >
        {/*
          El encabezado.

          Sigue siendo vidrio, y es de las pocas piezas que lo siguen siendo:
          la dirección deja el vidrio sólo donde algo flota sobre el mapa. Va
          pegado al borde y sin radio —una barra, no una tarjeta— y con el
          filete abajo en vez del borde completo, que es lo que la separa del
          mapa sin dibujarle una caja alrededor.

          No captura toques (hereda `pointerEvents: none`): es una etiqueta,
          y el mapa tiene que poder panearse desde abajo del encabezado.

          La segunda línea es la que hace el trabajo. Antes, la única forma de
          saber cuántos bares había en pantalla era contarlos, y con el filtro
          de favoritos puesto no había ninguna señal de que estuviera puesto
          salvo el botón lejos y chiquito. Ahora el encabezado dice qué se
          está mirando, y cambia de ícono y de tono cuando el ámbito cambia.

          El título va en `--t-6` y no en el `--t-7` del resto de las
          pantallas: las otras son encabezados de página con la pantalla
          entera detrás, y éste es una barra que flota sobre el mapa y le come
          altura. Lo que importa acá es el renglón de abajo; el título es el
          percherito del que cuelga, y para eso alcanza el paso corto.
        */}
        <header className="glass" style={{
          alignSelf: 'stretch',
          borderRadius: 0,
          // Se queda sólo el filete de abajo: el color lo sigue poniendo
          // `.glass`, que ya es el de la dirección.
          borderWidth: '0 0 .8px',
          padding: 'calc(var(--safe-top) + var(--s-3)) var(--s-4) var(--s-3)',
        }}>
          <h1 className="ttl" style={{
            margin: 0, fontSize: 'var(--t-6)', color: 'var(--cream)',
          }}>Mapa</h1>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--s-1)',
            marginTop: 'var(--s-1)',
          }}>
            {/* El ícono dice el ámbito antes que el texto: corazón coral
                cuando se está mirando sólo lo marcado, radar azul acero —el
                rol informativo de la dirección— cuando es todo lo que entra
                en el radio. */}
            {soloFavoritos ? (
              <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden
                fill="var(--favorito)">
                <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden
                fill="none" stroke="var(--info)" strokeWidth="1.8">
                <circle cx="12" cy="12" r="8.5" />
                <circle cx="12" cy="12" r="3" fill="var(--info)" strokeWidth="0" />
              </svg>
            )}
            <span style={{
              fontSize: 'var(--t-1)', color: 'var(--cream-soft)',
              // Tabular para que el número no baile al pasar de 9 a 10
              // mientras se panea.
              fontVariantNumeric: 'tabular-nums',
              minWidth: 0, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{resumen}</span>
          </div>
        </header>

        {/* `flexShrink: 0` para que las etiquetas no se partan en dos
            renglones dentro de píldoras de una sola línea, y el padding
            apretado por ancho de pantalla (.map-controls) para que los tres
            entren en una fila. El `wrap` queda de red de seguridad: en una
            pantalla muy chica es mejor que baje de línea a que se desborde. */}
        <div style={{
          display: 'flex', gap: 'var(--ctl-gap)', padding: '0 14px',
          alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center',
          maxWidth: '100%', pointerEvents: 'auto',
        }}>
          {/* La fila de chips scrolleaba mal: el gesto competía con el paneo
              del mapa, así que a veces se movía el mapa en vez de la lista, y
              encima ocupaba una franja permanente de pantalla. */}
          <StyleFilter
            styles={p.styles} selected={p.styleFilter} onSelect={p.onStyle}
            minRating={p.minRating} onMinRating={p.onMinRating}
            tourId="map-style"
          />

          {/* Sólo si hay alguno marcado, o si el filtro está puesto: un botón
              que siempre deja el mapa vacío no ayuda a nadie. Mismo criterio
              que el de la lista. */}
          {(p.favorites.size > 0 || soloFavoritos) && (
            <button
              onClick={() => setSoloFavoritos(v => !v)}
              aria-pressed={soloFavoritos}
              aria-label={soloFavoritos ? 'Ver todos los bares' : 'Ver sólo mis favoritos'}
              className={soloFavoritos ? 'lbl pill' : 'lbl pill glass'}
              style={{
                width: 44, height: 44, flexShrink: 0,
                display: 'grid', placeItems: 'center',
                background: soloFavoritos ? 'var(--favorito)' : undefined,
                // Apagado va en `--sobre-vidrio` y no en `--muted`: adentro
                // del vidrio lo que pasa por detrás puede ser una cápsula
                // clara, y `--muted` ahí se cae del contraste.
                color: soloFavoritos ? 'var(--base)' : 'var(--sobre-vidrio)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden
                fill={soloFavoritos ? 'currentColor' : 'none'}
                stroke="currentColor" strokeWidth={soloFavoritos ? 0 : 1.9}>
                <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z" />
              </svg>
            </button>
          )}

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
              onChange={e => p.onRadius(Number(e.target.value))}
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
            {soloFavoritos ? (
              <>
                <p className="lbl" style={{ margin: 0, fontSize: 'var(--t-4)' }}>
                  Ninguno de tus favoritos por acá
                </p>
                <p style={{
                  margin: 'var(--s-2) 0 0', fontSize: 'var(--t-2)',
                  color: 'var(--sobre-vidrio)', lineHeight: 1.5,
                }}>
                  Están en otra zona del mapa, o todavía no marcaste ninguno acá.
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
                <button onClick={() => setSoloFavoritos(false)} className="lbl cta" style={{
                  marginTop: 'var(--s-3)', padding: '0 var(--s-4)',
                  borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)', height: 46,
                  background: 'var(--acento)', color: 'var(--base)',
                }}>Ver todos</button>
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
        misma razón — mientras mirás un lugar, "agregar un bar" no es lo que
        estás por hacer.
      */}
      {!preview && (
        <>
          {/*
            El "?".
            Va acá y no en Perfil por quién lo necesita: alguien que abrió la
            app, ve pines de colores y no sabe qué está mirando. Pedirle que
            encuentre el tutorial en otra pantalla —o peor, que se cree una
            cuenta para verlo— es pedirle el trabajo que el tutorial viene a
            ahorrar. Con sesión arranca solo; sin sesión, éste es el único
            camino, y es justo quien más lo necesita.
          */}
          <button
            onClick={p.onHelp}
            aria-label="Cómo funciona la app"
            className="glass lbl"
            style={{
              position: 'absolute', left: 14,
              bottom: `calc(72px + var(--nav-gap) + 58px)`,
              width: 40, height: 40, borderRadius: '50%',
              display: 'grid', placeItems: 'center',
              color: 'var(--sobre-vidrio)', fontSize: 'var(--t-4)',
              pointerEvents: 'auto', zIndex: 5,
            }}
          >?</button>

          {/* Ubicación a la izquierda, agregar a la derecha: separados. */}
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

          {/* Antes iba derecho a "agregar un bar". Ahora pregunta qué, que
              es lo que pedía BIR-36: cargar un precio y anotar una birra
              tomada son acciones tanto o más frecuentes que dar de alta un
              bar, y no tenían por dónde entrar desde el mapa. */}
          <AddMenu onPick={onPick} />
        </>
      )}

      {action === 'beer' && (
        <LogBeerSheet
          nearby={p.bars} styles={p.styles} brands={p.brands}
          onBrandCreated={p.onBrandCreated} onStyleCreated={p.onStyleCreated}
          onClose={() => setAction(null)}
          onDone={m => { setAction(null); setToast(m) }}
        />
      )}

      {/* Desde el mapa se pregunta todo: estilo, marca y bar, y recién ahí el
          monto. Antes esto elegía el bar y te dejaba en su ficha con el
          teclado abierto; el resto de la birra lo tenías que resolver ahí
          arriba, encima del teclado. */}
      {action === 'price' && (
        <ReportFlow
          styles={p.styles} brands={p.brands} user={p.user}
          nearby={p.bars} center={p.myLocation ?? p.camera?.center ?? null}
          onStyleCreated={p.onStyleCreated}
          onBrandCreated={p.onBrandCreated}
          // Se pierde el flujo, y no hay forma de que no se pierda: el precio
          // necesita un bar que exista. Al menos no es un callejón.
          onAddBar={() => { setAction(null); nav('/agregar') }}
          onCancel={() => setAction(null)}
          onSubmit={async ({ bar, styleSlug, brandSlug, price, sizeMl }) => {
            setAction(null)
            try {
              const r = await api.reportPrice({
                barId: bar.id, styleSlug, brandSlug, price, sizeMl,
              })
              setToast(r.message)
              // El pin tiene que reflejarlo al toque: es el agujero de BIR-23,
              // que se arregló en la ficha del bar y volvería a aparecer acá.
              p.onChanged()
            } catch (e) { setToast((e as Error).message) }
          }}
        />
      )}

      {toast && <Toast text={toast} onDone={() => setToast(null)} />}

      {preview && (
        <BarPreview
          key={preview.id}
          bar={preview}
          onClose={() => setPreview(null)}
          onOpen={() => nav(`/bar/${preview.id}`)}
          isFavorite={p.favorites.has(preview.id)}
          onToggleFavorite={() => p.onToggleFavorite(preview.id)}
        />
      )}
    </div>
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

  useEffect(() => {
    if (!map) return
    const l = map.addListener('zoom_changed', () => setZoom(map.getZoom() ?? 15))
    return () => l.remove()
  }, [map])

  // Hasta que el SDK esté cargado no se dibuja nada: los íconos construyen
  // google.maps.Point, y tocar `google` antes de tiempo es un ReferenceError
  // que tumba la app entera en blanco, no sólo el mapa.
  if (!map) return null

  // El puesto se calcula sobre lo que hay en pantalla, así que la escala se
  // reajusta al moverse: en Palermo lo barato es otro número que en Liniers, y
  // un color absoluto no diría nada en ninguno de los dos.
  const ranks = priceRanks(
    bars.filter(b => b.fromPrice != null).map(b => [b.id, b.fromPrice!]),
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
    for (const b of bars.filter(b => b.fromPrice != null)
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
      {bars.map(b => {
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
                  // La cápsula lleva la edad, no el precio: el precio ya está
                  // escrito adentro. Ver el comentario del principio.
                  ageColor(b.freshestAgeDays), on, favorites.has(b.id),
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
 * Cápsula con el precio, como marcador.
 *
 * Es la pieza que más cambió con la pizarra, y el cambio es de gramática, no
 * de tonos: antes la cápsula **era** el color del precio, con el número en
 * negro adentro. Ahora es una chapita de espresso con el número escrito en
 * hueso y, a la izquierda, un punto de 6px con el color de la edad de ese
 * precio.
 *
 * Los tres motivos, en orden de peso:
 *
 * 1. Con treinta cápsulas de color pleno flotando, el mapa se volvía el
 *    dibujo y los bares el fondo. Sobre espresso, treinta chapitas oscuras
 *    con el número en tiza se leen como lo que son: precios escritos sobre
 *    una pizarra.
 * 2. El color repetía lo que el número ya decía. La frescura, en cambio, no
 *    estaba en ningún lado del mapa, y es la mitad del dato: "$4.500" de hace
 *    ochenta días no es el mismo precio que "$4.500" de ayer.
 * 3. Cierra la regla de la app: ningún precio se dibuja sin su antigüedad al
 *    lado. El mapa era la única pantalla que la incumplía.
 *
 * `on` es el bar abierto en la preview, y en vez de ganar un aro **invierte**:
 * hueso pleno con el número en espresso. A treinta pines de distancia, un
 * relleno invertido se encuentra de un vistazo y un aro hay que buscarlo.
 *
 * `freshness` llega como `var(--fresh|--aging|--stale)`.
 */
function priceIcon(
  label: string, freshness: string, on = false, fav = false,
): google.maps.Icon {
  const s = on ? 1.16 : 1
  const fondo = on ? resolve('var(--acento)') : alpha('var(--base)', .88)
  const borde = on ? resolve('var(--acento)') : resolve('var(--film-3)')
  const tinta = on ? resolve('var(--base)') : resolve('var(--cream)')

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
   * antes que el número. Después del corazón viene el punto de frescura y
   * recién ahí el precio: marca, estado, dato.
   */
  const padX = 10 * s           // el aire contra el canto de la cápsula
  const gap = 6 * s             // el aire entre las tres piezas
  const punto = 6 * s           // el punto de frescura
  const heart = 14 * s          // el dibujo del corazón
  const heartBox = fav ? heart + gap : 0   // lo que reserva, dibujo + aire
  // El ancho se estima como 8,6px por carácter, y eso sólo es cierto si todos
  // los dígitos miden lo mismo — por eso el `<text>` de abajo pide cifras
  // tabulares. Sin ellas, "$11.111" queda nadando en una cápsula de más y
  // "$8.888" se sale por los costados.
  const w = padX * 2 + heartBox + punto + gap + label.length * 8.6 * s
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + pad * 2}" height="${h + pad * 2}">
    <rect x="${pad + 0.5}" y="${pad + 0.5}" rx="${rx}" width="${w - 1}" height="${h - 1}"
      fill="${fondo}" stroke="${borde}" stroke-width="${on ? 2 : 1}"/>
    ${fav ? heartPath(izq, pad + (h - heart) / 2, heart) : ''}
    <circle cx="${izq + heartBox + punto / 2}" cy="${pad + h / 2}" r="${punto / 2}"
      fill="${resolve(freshness)}"/>
    <text x="${izq + heartBox + punto + gap}" y="${pad + h / 2 + 4.5 * s}"
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
