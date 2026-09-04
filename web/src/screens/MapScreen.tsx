import { useCallback, useEffect, useRef, useState } from 'react'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import { useNavigate } from 'react-router-dom'
import type { BarPin, BeerStyle } from '../data/types'
import { ageColor, formatPrice, formatRadius, priceColor, priceRanks } from '../data/format'
import { PintLoader } from '../ui/PintLoader'
import { MAP_STYLE } from '../mapStyle'
import { StyleFilter } from '../ui/StyleFilter'
import { BarPreview } from '../ui/BarPreview'

export type ColorBy = 'freshness' | 'price'

/** Los extremos del slider, en metros. Compartidos con las etiquetas de abajo
 *  para que no se puedan desincronizar del `min`/`max` reales. */
const RADIUS_MIN = 300
const RADIUS_MAX = 15_000

interface Props {
  bars: BarPin[]; styles: BeerStyle[]; loading: boolean
  center: google.maps.LatLngLiteral | null
  simulated: google.maps.LatLngLiteral | null
  radius: number; styleFilter?: string
  tooZoomedOut: boolean
  /** Qué codifica el color de los pines. Ver el comentario del toggle. */
  colorBy: ColorBy
  onColorBy: (c: ColorBy) => void
  onStyle: (s?: string) => void
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
  /** Cambia cuando se pide centrar: la cámara es imperativa, no reactiva. */
  panTo: { target: google.maps.LatLngLiteral; token: number } | null
}

export function MapScreen(p: Props) {
  const nav = useNavigate()
  const [radiusOpen, setRadiusOpen] = useState(false)

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

  if (!p.center) return <PintLoader message="Buscando dónde estás…" />

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Map
        defaultCenter={p.camera?.center ?? p.center}
        defaultZoom={p.camera?.zoom ?? 15}
        disableDefaultUI
        gestureHandling="greedy"
        styles={MAP_STYLE}
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

        <Pins bars={p.bars} colorBy={p.colorBy} selectedId={preview?.id ?? null}
          onOpen={setPreview} />
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
          position: 'absolute', top: `calc(10px + var(--safe-top))`, left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 10,
          // La franja ocupa todo el ancho y crece cuando el slider está
          // abierto. Sin esto se come el paneo del mapa en toda esa zona,
          // incluido el aire entre controles.
          pointerEvents: 'none',
        }}
      >
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
            tourId="map-style"
          />

          <button
            onClick={() => setRadiusOpen(o => !o)}
            data-tour="map-radius"
            className="lbl pill glass"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 44,
              padding: '0 var(--pill-pad)', fontSize: 13,
              flexShrink: 0, whiteSpace: 'nowrap',
              background: radiusOpen ? 'var(--amber)' : undefined,
              color: radiusOpen ? 'var(--base)' : undefined,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24"
              fill={radiusOpen ? 'var(--base)' : 'var(--muted)'} aria-hidden>
              <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" />
            </svg>
            {/* Ancho fijo: si la etiqueta crece al arrastrar ("15 km" contra
                "1.5 km"), la fila cambia de ancho y el botón salta de
                renglón mientras movés el slider. */}
            <span style={{
              color: radiusOpen ? 'var(--base)' : 'var(--amber)',
              minWidth: 46, textAlign: 'center',
            }}>
              {formatRadius(p.radius)}
            </span>
          </button>

          {/*
            El color del pin codifica una cosa u otra, y hasta ahora codificaba
            la frescura sin decirlo en ninguna parte. Verde/ámbar/rojo es una
            convención tan fuerte para barato/caro que ésa era la lectura por
            defecto, incluso para quien escribió la app.

            El toggle resuelve las dos mitades del problema: deja elegir qué
            mirar, y al nombrar el modo activo dice qué significan los colores.

            Va en la misma fila que el estilo y el radio, y no en un renglón
            propio: son los tres filtros del mapa y tenerlos en dos filas se
            comía una franja de mapa entera para tres botones. Por eso el modo
            apagado muestra sólo sus tres colores, sin texto — la fila no entra
            en un teléfono angosto con las dos etiquetas puestas, y el nombre
            del modo que importa es el del que está prendido.
          */}
          <div className="glass pill" data-tour="map-color" style={{
            display: 'flex', padding: 3, flexShrink: 0, alignItems: 'center',
          }}>
            {([
              ['freshness', 'Frescura'],
              ['price', 'Precio'],
            ] as [ColorBy, string][]).map(([mode, label]) => {
              const on = p.colorBy === mode
              return (
                <button
                  key={mode} onClick={() => p.onColorBy(mode)} className="lbl"
                  aria-pressed={on} aria-label={`Colorear por ${label.toLowerCase()}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, height: 38,
                    padding: on ? '0 11px' : '0 9px', borderRadius: 999, fontSize: 12,
                    whiteSpace: 'nowrap',
                    background: on ? 'var(--amber)' : 'transparent',
                    color: on ? 'var(--base)' : 'rgba(251,246,238,.7)',
                  }}
                >
                  <Swatch mode={mode} />
                  {on && <span>{label}</span>}
                </button>
              )
            })}
          </div>
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
              borderRadius: 18, padding: '10px 18px 8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ color: 'var(--muted)', fontSize: 12, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.simulated ? 'Desde el punto elegido' : 'Desde tu ubicación'}
              </span>
              <span className="lbl" style={{
                marginLeft: 'auto', paddingLeft: 10, color: 'var(--amber)', fontSize: 14,
                whiteSpace: 'nowrap',
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
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              color: 'var(--faint)', fontSize: 10.5, marginTop: 2,
            }}>
              <span>{formatRadius(RADIUS_MIN)}</span><span>{formatRadius(RADIUS_MAX)}</span>
            </div>
          </div>
        )}

        {p.tooZoomedOut && (
          <div className="glass pill" style={{
            padding: '7px 14px', fontSize: 12, color: 'var(--muted)',
            pointerEvents: 'auto',
          }}>Acercá el mapa para ver bares</div>
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
        {p.locationUnknown && (
          <div className="glass pill" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', fontSize: 12, color: 'var(--muted)',
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
                  color: 'var(--amber)', fontSize: 12, whiteSpace: 'nowrap',
                }}>Reintentar</button>
              </>
            )}
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
          {/* Ubicación a la izquierda, agregar a la derecha: separados. */}
          <button onClick={p.onRecenter} className="glass" style={{
            position: 'absolute', left: 14, bottom: `calc(72px + var(--nav-gap))`,
            width: 48, height: 48, borderRadius: '50%', zIndex: 10,
            display: 'grid', placeItems: 'center',
          }} aria-label={p.simulated ? 'Centrar en el punto elegido' : 'Centrar en mi ubicación'}>
            {/* Crema cuando apunta al punto elegido, ámbar cuando apunta a tu
                ubicación: es el color de cada uno de los dos puntos en el
                mapa, así el botón dice a cuál va antes de tocarlo. */}
            <svg width="21" height="21" viewBox="0 0 24 24"
              fill={p.simulated ? 'var(--cream)' : 'var(--amber)'} aria-hidden>
              <path d="M12 2a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
            </svg>
          </button>

          {/* El "+" va dibujado, no como texto: un glifo se posiciona por
              baseline y nunca queda centrado en un círculo, además de depender
              de la fuente que tenga cada quien. */}
          <button onClick={() => nav('/agregar')} style={{
            position: 'absolute', right: 14, bottom: `calc(72px + var(--nav-gap))`,
            width: 52, height: 52, borderRadius: '50%', background: 'var(--amber)',
            zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 22px rgba(0,0,0,.4)', padding: 0,
          }} aria-label="Agregar un bar">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 4.5v15M4.5 12h15" stroke="var(--base)"
                strokeWidth="2.6" strokeLinecap="round" />
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
        />
      )}
    </div>
  )
}

/**
 * Los tres colores del modo, en miniatura.
 *
 * Es la leyenda: sin esto el toggle diría qué se está mirando pero no qué
 * significa cada color, que es la mitad que faltaba.
 */
function Swatch({ mode }: { mode: ColorBy }) {
  const colors = mode === 'freshness'
    ? ['var(--fresh)', 'var(--aging)', 'var(--stale)']
    : [priceColor(0), priceColor(0.5), priceColor(1)]
  return (
    <span style={{ display: 'flex', gap: 2 }} aria-hidden>
      {colors.map(c => (
        <span key={c} style={{
          width: 6, height: 6, borderRadius: '50%', background: c,
        }} />
      ))}
    </span>
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
  bars, colorBy, selectedId, onOpen,
}: {
  bars: BarPin[]; colorBy: ColorBy
  selectedId: number | null
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
  const ranks = colorBy === 'price'
    ? priceRanks(bars.filter(b => b.fromPrice != null).map(b => [b.id, b.fromPrice!]))
    : null

  const colorOf = (b: BarPin) =>
    ranks != null
      ? (ranks.has(b.id) ? priceColor(ranks.get(b.id)!) : 'rgba(255,255,255,.35)')
      : (b.fromPrice != null ? ageColor(b.freshestAgeDays) : 'rgba(255,255,255,.35)')

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
              ? priceIcon(formatPrice(b.fromPrice!), colorOf(b), on)
              : dotIcon(colorOf(b), b.fromPrice != null ? 13 : 9, on)}
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
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#FFB627'
}

const svgUrl = (svg: string) =>
  'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)

/**
 * Cápsula con el precio, como marcador.
 *
 * `on` es el bar abierto en la preview. Se lo marca con un aro crema y un
 * poco más grande: sin eso, con la tarjeta arriba no había forma de saber
 * cuál de los treinta pines es el que se está leyendo.
 */
function priceIcon(label: string, color: string, on = false): google.maps.Icon {
  const fill = resolve(color)
  const s = on ? 1.16 : 1
  const w = (20 + label.length * 8.6) * s
  const h = 26 * s
  // El aro se dibuja por dentro del borde, así que el lienzo tiene que
  // agrandarse o WebKit lo recorta a la mitad.
  const pad = on ? 4 : 0
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w + pad * 2}" height="${h + pad * 2}">
    <rect x="${pad + 0.5}" y="${pad + 0.5}" rx="${(h - 1) / 2}" width="${w - 1}" height="${h - 1}"
      fill="${fill}" stroke="${on ? '#FBF6EE' : 'rgba(255,255,255,.55)'}"
      stroke-width="${on ? 2.5 : 1}"/>
    <text x="${pad + w / 2}" y="${pad + h / 2 + 4.5 * s}" text-anchor="middle"
      font-family="Bricolage Grotesque, system-ui, sans-serif" font-size="${13 * s}"
      font-weight="700" fill="#1A1410">${label}</text>
  </svg>`
  return {
    url: svgUrl(svg),
    anchor: new google.maps.Point(pad + w / 2, pad + h / 2),
  }
}

function dotIcon(color: string, size: number, on = false): google.maps.Icon {
  const fill = resolve(color)
  const pad = on ? 5 : 0
  const box = size + pad * 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}">
    ${on ? `<circle cx="${box / 2}" cy="${box / 2}" r="${size / 2 + 2.5}"
      fill="none" stroke="#FBF6EE" stroke-width="2.5"/>` : ''}
    <circle cx="${box / 2}" cy="${box / 2}" r="${size / 2 - 0.5}" fill="${fill}"/>
  </svg>`
  return { url: svgUrl(svg), anchor: new google.maps.Point(box / 2, box / 2) }
}

function simulatedIcon(): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26">
    <circle cx="13" cy="13" r="13" fill="rgba(251,246,238,.28)"/>
    <circle cx="13" cy="13" r="6.5" fill="#FBF6EE"/>
  </svg>`
  return { url: svgUrl(svg), anchor: new google.maps.Point(13, 13) }
}

/** Punto azul con halo, como el de Google Maps. */
function MyLocationDot({ position }: { position: google.maps.LatLngLiteral }) {
  const map = useMap()
  if (!map) return null
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26">
    <circle cx="13" cy="13" r="12" fill="rgba(66,133,244,.22)"/>
    <circle cx="13" cy="13" r="6.5" fill="#4285F4" stroke="#fff" stroke-width="2.5"/>
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
