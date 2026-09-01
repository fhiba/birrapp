import { useCallback, useEffect, useRef, useState } from 'react'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import { useNavigate } from 'react-router-dom'
import type { BarPin, BeerStyle } from '../data/types'
import { ageColor, formatPrice, formatRadius } from '../data/format'
import { PintLoader } from '../ui/PintLoader'
import type { Sort } from '../data/useBars'
import { MAP_STYLE } from '../mapStyle'

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
          // Un toque cierra primero el slider abierto; recién si no hay nada
          // abierto borra el punto elegido. Si no, cerrar el radio te costaba
          // el punto que estabas por ajustar.
          if (radiusOpen) setRadiusOpen(false)
          else p.onSimulate(null)
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <CameraWatcher onCamera={p.onCamera} />
        <LongPress onLongPress={p.onSimulate} />
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
        <div style={{ display: 'flex', gap: 8, padding: '0 14px' }}>
          <div className="glass pill" style={{ display: 'flex', padding: 4 }}>
            {(['distance', 'cheapest'] as Sort[]).map(s => (
              <button key={s} onClick={() => p.onSort(s)} className="lbl" style={{
                padding: '9px 18px', borderRadius: 999, fontSize: 13,
                background: p.sort === s ? 'var(--amber)' : 'transparent',
                color: p.sort === s ? 'var(--base)' : 'rgba(251,246,238,.75)',
              }}>{s === 'distance' ? 'Más cerca' : 'Más barata'}</button>
            ))}
          </div>

          <div className="glass" style={{
            borderRadius: 22, padding: radiusOpen ? '0 13px 10px' : '0 13px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <button onClick={() => setRadiusOpen(o => !o)} className="lbl" style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '13px 6px', fontSize: 13,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--muted)" aria-hidden>
                <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" />
              </svg>
              <span style={{ color: 'var(--amber)' }}>{formatRadius(p.radius)}</span>
            </button>
            {radiusOpen && (
              <input type="range" min={300} max={15000} step={100} value={p.radius}
                onChange={e => p.onRadius(Number(e.target.value))}
                style={{ width: 210, display: 'block', margin: 0, accentColor: 'var(--amber)' }} />
            )}
          </div>
        </div>

        {p.styles.length > 0 && (
          <div style={{
            display: 'flex', gap: 7, overflowX: 'auto', maxWidth: '100%',
            padding: '0 14px', scrollbarWidth: 'none',
          }}>
            <Chip on={!p.styleFilter} onClick={() => p.onStyle(undefined)}>Todos</Chip>
            {p.styles.map(s => (
              <Chip key={s.slug} on={p.styleFilter === s.slug}
                onClick={() => p.onStyle(p.styleFilter === s.slug ? undefined : s.slug)}>
                {s.name}
              </Chip>
            ))}
          </div>
        )}

        {p.tooZoomedOut && (
          <div className="glass pill" style={{
            padding: '7px 14px', fontSize: 12, color: 'var(--muted)',
          }}>Acercá el mapa para ver bares</div>
        )}
      </div>

      {/* Ubicación a la izquierda, agregar a la derecha: separados. */}
      <button onClick={p.onRecenter} className="glass" style={{
        position: 'absolute', left: 14, bottom: `calc(84px + var(--safe-bottom))`,
        width: 48, height: 48, borderRadius: '50%', zIndex: 10,
        display: 'grid', placeItems: 'center',
      }} aria-label="Centrar en mi ubicación">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="var(--amber)" aria-hidden>
          <path d="M12 2a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
        </svg>
      </button>

      <button onClick={() => nav('/agregar')} style={{
        position: 'absolute', right: 14, bottom: `calc(84px + var(--safe-bottom))`,
        width: 52, height: 52, borderRadius: '50%', background: 'var(--amber)',
        color: 'var(--base)', fontSize: 27, zIndex: 10, lineHeight: 1,
        boxShadow: '0 6px 22px rgba(0,0,0,.4)',
      }} aria-label="Agregar un bar">+</button>
    </div>
  )
}

function Chip(
  { on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode },
) {
  return (
    <button onClick={onClick} className={on ? 'lbl pill' : 'lbl pill glass'} style={{
      padding: '7px 14px', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0,
      background: on ? 'var(--cream)' : undefined,
      color: on ? 'var(--base)' : 'rgba(251,246,238,.8)',
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

/** Mantener apretado deja un punto para explorar otra zona. */
function LongPress(
  { onLongPress }: { onLongPress: (p: google.maps.LatLngLiteral) => void },
) {
  const map = useMap()
  const cb = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) onLongPress({ lat: e.latLng.lat(), lng: e.latLng.lng() })
  }, [onLongPress])

  useEffect(() => {
    if (!map) return
    // 'contextmenu' cubre el long-press táctil y el clic derecho de escritorio.
    const l = map.addListener('contextmenu', cb)
    return () => l.remove()
  }, [map, cb])
  return null
}
