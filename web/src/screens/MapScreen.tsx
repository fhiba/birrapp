import { useCallback, useEffect, useRef, useState } from 'react'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import { useNavigate } from 'react-router-dom'
import type { BarPin, BeerStyle } from '../data/types'
import { ageColor, formatPrice, formatRadius } from '../data/format'
import { PintLoader } from '../ui/PintLoader'
import type { Sort } from '../data/useBars'
import { MAP_STYLE } from '../mapStyle'

/** Los extremos del slider, en metros. Compartidos con las etiquetas de abajo
 *  para que no se puedan desincronizar del `min`/`max` reales. */
const RADIUS_MIN = 300
const RADIUS_MAX = 15_000

interface Props {
  bars: BarPin[]; styles: BeerStyle[]; loading: boolean
  center: google.maps.LatLngLiteral | null
  simulated: google.maps.LatLngLiteral | null
  radius: number; sort: Sort; styleFilter?: string
  tooZoomedOut: boolean
  onSort: (s: Sort) => void
  onStyle: (s?: string) => void
  onRadius: (m: number) => void
  onSimulate: (p: google.maps.LatLngLiteral | null) => void
  onCamera: (c: google.maps.LatLngLiteral, zoom: number) => void
  onRecenter: () => void
  camera: { center: google.maps.LatLngLiteral; zoom: number } | null
  myLocation: google.maps.LatLngLiteral | null
  /** Cambia cuando se pide centrar: la cámara es imperativa, no reactiva. */
  panTo: { target: google.maps.LatLngLiteral; token: number } | null
}

export function MapScreen(p: Props) {
  const nav = useNavigate()
  const [radiusOpen, setRadiusOpen] = useState(false)

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
          // Un toque cierra primero el slider abierto; recién si no hay nada
          // abierto borra el punto elegido. Si no, cerrar el radio te costaba
          // el punto que estabas por ajustar.
          if (radiusOpen) setRadiusOpen(false)
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

        <Pins bars={p.bars} onOpen={id => nav(`/bar/${id}`)} />
      </Map>

      {/* Controles. Dos filas, no cinco: el mapa es el contenido. */}
      <div
        onPointerDown={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: `calc(10px + var(--safe-top))`, left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 10,
        }}
      >
        {/* `wrap` y `flexShrink: 0`: sin esto, en un teléfono angosto los tres
            controles no entran, flex los encoge y las etiquetas se parten en
            dos renglones dentro de píldoras pensadas para uno solo. Es
            preferible que el radio baje a una segunda fila. */}
        <div style={{
          display: 'flex', gap: 8, padding: '0 14px',
          alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center',
          maxWidth: '100%',
        }}>
          {/* La fila de chips scrolleaba mal: el gesto competía con el paneo
              del mapa, así que a veces se movía el mapa en vez de la lista, y
              encima ocupaba una franja permanente de pantalla. */}
          <StyleFilter styles={p.styles} selected={p.styleFilter} onSelect={p.onStyle} />

          <div className="glass pill" style={{ display: 'flex', padding: 4, flexShrink: 0 }}>
            {(['distance', 'cheapest'] as Sort[]).map(s => (
              <button key={s} onClick={() => p.onSort(s)} className="lbl" style={{
                padding: '9px 18px', borderRadius: 999, fontSize: 13,
                whiteSpace: 'nowrap',
                background: p.sort === s ? 'var(--amber)' : 'transparent',
                color: p.sort === s ? 'var(--base)' : 'rgba(251,246,238,.75)',
              }}>{s === 'distance' ? 'Más cerca' : 'Más barata'}</button>
            ))}
          </div>

          <button
            onClick={() => setRadiusOpen(o => !o)}
            className="lbl pill glass"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 44,
              padding: '0 14px', fontSize: 13,
              flexShrink: 0, whiteSpace: 'nowrap',
              background: radiusOpen ? 'var(--amber)' : undefined,
              color: radiusOpen ? 'var(--base)' : undefined,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24"
              fill={radiusOpen ? 'var(--base)' : 'var(--muted)'} aria-hidden>
              <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" />
            </svg>
            <span style={{ color: radiusOpen ? 'var(--base)' : 'var(--amber)' }}>
              {formatRadius(p.radius)}
            </span>
          </button>
        </div>

        {p.tooZoomedOut && (
          <div className="glass pill" style={{
            padding: '7px 14px', fontSize: 12, color: 'var(--muted)',
          }}>Acercá el mapa para ver bares</div>
        )}
      </div>

      {/* El slider va abajo, no dentro de la píldora: ahí hay ancho real.
          Metido arriba se desbordaba en web y quedaba impracticable en
          Android, donde apenas entraban unos pocos píxeles de recorrido. */}
      {radiusOpen && (
        <div
          onPointerDown={e => e.stopPropagation()}
          className="glass"
          style={{
            position: 'absolute', left: 12, right: 12,
            bottom: `calc(144px + var(--nav-gap))`, zIndex: 12,
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

      {/* Ubicación a la izquierda, agregar a la derecha: separados. */}
      <button onClick={p.onRecenter} className="glass" style={{
        position: 'absolute', left: 14, bottom: `calc(72px + var(--nav-gap))`,
        width: 48, height: 48, borderRadius: '50%', zIndex: 10,
        display: 'grid', placeItems: 'center',
      }} aria-label="Centrar en mi ubicación">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="var(--amber)" aria-hidden>
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
    </div>
  )
}

/** Filtro de estilo como desplegable. */
function StyleFilter({
  styles, selected, onSelect,
}: {
  styles: BeerStyle[]; selected?: string; onSelect: (s?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const active = selected != null
  const label = styles.find(s => s.slug === selected)?.name

  if (styles.length === 0) return null

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        className={active ? 'lbl pill' : 'lbl pill glass'}
        aria-label="Filtrar por estilo"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 44, padding: active ? '0 14px' : 0, width: active ? undefined : 44,
          justifyContent: 'center', flexShrink: 0, whiteSpace: 'nowrap',
          background: active ? 'var(--amber)' : undefined,
          color: active ? 'var(--base)' : 'var(--muted)',
          fontSize: 12,
        }}
      >
        <svg width={active ? 15 : 18} height={active ? 15 : 18} viewBox="0 0 24 24"
          fill="currentColor" aria-hidden>
          <path d="M4 5h16v2.2l-6 6V21l-4-2v-5.8l-6-6z" />
        </svg>
        {active && <span>{label}</span>}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{
            position: 'absolute', left: 0, top: 50, zIndex: 21, minWidth: 190,
            maxHeight: 320, overflowY: 'auto',
            background: 'var(--elevated)', borderRadius: 14, padding: 6,
            border: '.8px solid rgba(255,255,255,.12)',
            boxShadow: '0 10px 34px rgba(0,0,0,.5)',
          }}>
            <MenuItem on={selected == null} onClick={() => { onSelect(undefined); setOpen(false) }}>
              Todos los estilos
            </MenuItem>
            {styles.map(s => (
              <MenuItem key={s.slug} on={selected === s.slug}
                onClick={() => { onSelect(s.slug); setOpen(false) }}>
                {s.name}
              </MenuItem>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem(
  { on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode },
) {
  return (
    <button onClick={onClick} className="lbl row-hover" style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '10px 12px', borderRadius: 10, fontSize: 13.5,
      color: on ? 'var(--amber)' : 'var(--cream)',
    }}>{children}</button>
  )
}

/**
 * Descarte de etiquetas superpuestas.
 *
 * Se recorren del más barato al más caro y sólo recibe etiqueta el que no
 * cae encima de otro ya colocado; el resto queda como punto. El zIndex sólo
 * decide quién gana, no evita que la cápsula de abajo quede cortada.
 */
function Pins({ bars, onOpen }: { bars: BarPin[]; onOpen: (id: number) => void }) {
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

  const showLabels = zoom >= 14.5
  const labelled = new Set<number>()
  if (showLabels) {
    const metersPerPx = 156543.03392 * Math.cos((bars[0]?.lat ?? -34.6) * Math.PI / 180) / 2 ** zoom
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
        const withLabel = b.fromPrice != null && labelled.has(b.id)
        return (
          <Marker
            key={b.id}
            position={{ lat: b.lat, lng: b.lng }}
            onClick={() => onOpen(b.id)}
            zIndex={withLabel ? 10 : 1}
            icon={withLabel
              ? priceIcon(formatPrice(b.fromPrice!), ageColor(b.freshestAgeDays))
              : dotIcon(b.fromPrice != null ? ageColor(b.freshestAgeDays) : 'rgba(255,255,255,.35)',
                        b.fromPrice != null ? 13 : 9)}
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

/** Cápsula con el precio, como marcador. */
function priceIcon(label: string, color: string): google.maps.Icon {
  const fill = resolve(color)
  const w = 20 + label.length * 8.6
  const h = 26
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0.5" y="0.5" rx="${(h - 1) / 2}" width="${w - 1}" height="${h - 1}"
      fill="${fill}" stroke="rgba(255,255,255,.55)"/>
    <text x="${w / 2}" y="${h / 2 + 4.5}" text-anchor="middle"
      font-family="Bricolage Grotesque, system-ui, sans-serif" font-size="13"
      font-weight="700" fill="#1A1410">${label}</text>
  </svg>`
  return { url: svgUrl(svg), anchor: new google.maps.Point(w / 2, h / 2) }
}

function dotIcon(color: string, size: number): google.maps.Icon {
  const fill = resolve(color)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 0.5}" fill="${fill}"/>
  </svg>`
  return { url: svgUrl(svg), anchor: new google.maps.Point(size / 2, size / 2) }
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
