import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BarPin } from '../data/types'
import { ageColor, formatDistance, formatPrice, formatRadius, shortAge } from '../data/format'
import type { Sort } from '../data/useBars'

interface Props {
  bars: BarPin[]; loading: boolean
  sort: Sort; radius: number; simulated: google.maps.LatLngLiteral | null
  styleFilter?: string
  onSort: (s: Sort) => void
  onRadius: (m: number) => void
  onClearSimulated: () => void
}

/**
 * La misma data del mapa, en lista. Sin tarjetas: una por bar mete dos bordes
 * y una sombra por fila y convierte una lista de precios en un muro de cajas.
 * Lo que tiene que saltar es el número.
 */
export function ListScreen(p: Props) {
  const nav = useNavigate()
  const scroller = useRef<HTMLDivElement>(null)

  // Al cambiar el orden o el filtro la lista es otra: quedarse a mitad de
  // scroll deja al usuario mirando el bar 40 de un ranking nuevo.
  //
  // No alcanza con scrollear al cambiar el orden: en ese instante la lista
  // vieja sigue en pantalla y el navegador restaura la posición cuando llega
  // la nueva. Hay que esperar a los datos.
  const pendingReset = useRef(false)
  useEffect(() => { pendingReset.current = true }, [p.sort, p.styleFilter])
  useEffect(() => {
    if (pendingReset.current && !p.loading) {
      scroller.current?.scrollTo({ top: 0 })
      pendingReset.current = false
    }
  }, [p.bars, p.loading])

  return (
    <div ref={scroller} style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      paddingTop: `calc(14px + var(--safe-top))`,
      paddingBottom: `calc(108px + var(--nav-gap))`,
    }}>
      <div className="desk-narrow">
      <header style={{ padding: '0 18px' }}>
        {/* Había un <h1> que decía "Más baratas" justo encima de una píldora
            que decía "Más barata": el título no agregaba nada que el selector
            no dijera ya, y se comía un renglón entero de pantalla. El conteo
            se queda, que sí es dato, al lado del selector. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px' }}>
          {(['distance', 'cheapest'] as Sort[]).map(s => (
            <button key={s} onClick={() => p.onSort(s)} className="lbl pill" style={{
              padding: '8px 15px', fontSize: 13, whiteSpace: 'nowrap',
              background: p.sort === s ? 'var(--cream)' : 'rgba(255,255,255,.07)',
              color: p.sort === s ? 'var(--base)' : 'var(--muted)',
            }}>{s === 'distance' ? 'Más cerca' : 'Más barata'}</button>
          ))}
          <span className="num" style={{
            marginLeft: 'auto', fontSize: 17, color: 'var(--faint)',
          }}>{p.bars.length}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', marginTop: 14 }}>
          {p.simulated ? (
            // Acá sí conviene el aviso: en la lista no se ve el mapa, así que
            // sin esto no hay forma de saber desde dónde se mide.
            <button onClick={p.onClearSimulated} className="pill" style={{
              background: 'var(--amber-soft)', color: 'var(--amber)',
              padding: '5px 10px', fontSize: 12,
            }}>Desde el punto elegido ✕</button>
          ) : (
            <span style={{ color: 'var(--faint)', fontSize: 12 }}>Desde tu ubicación</span>
          )}
          <span className="lbl" style={{ marginLeft: 'auto', color: 'var(--amber)', fontSize: 13 }}>
            {formatRadius(p.radius)}
          </span>
        </div>
        <input type="range" min={300} max={15000} step={100} value={p.radius}
          onChange={e => p.onRadius(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--amber)', marginTop: 4 }} />
      </header>

      {p.loading && <div style={{ height: 1, background: 'var(--amber)', margin: '8px 0' }} />}

      {!p.loading && p.bars.length === 0 && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>
          No hay bares cargados por acá todavía.
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
        {p.bars.map(b => (
          <li key={b.id}>
            <button className="row-hover" onClick={() => nav(`/bar/${b.id}`)} style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              padding: '15px 18px', textAlign: 'left',
              borderBottom: '1px solid rgba(255,255,255,.06)',
            }}>
              {/* Barra de frescura: se escanea en vertical sin leer nada. */}
              <span style={{
                width: 3, height: 34, borderRadius: 999, flexShrink: 0,
                background: b.fromPrice != null
                  ? ageColor(b.freshestAgeDays) : 'rgba(255,255,255,.12)',
              }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="lbl" style={{
                  display: 'block', fontSize: 16, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{b.name}</span>
                <span style={{ fontSize: 12, color: 'var(--faint)' }}>
                  {formatDistance(b.distanceMeters)}
                  {b.freshestAgeDays != null && (
                    <> · <span style={{ color: ageColor(b.freshestAgeDays) }}>
                      {shortAge(b.freshestAgeDays)}
                    </span></>
                  )}
                </span>
              </span>
              {b.fromPrice != null
                ? <span className="num" style={{ fontSize: 19 }}>{formatPrice(b.fromPrice)}</span>
                : <span style={{ fontSize: 12, color: 'var(--faint)' }}>Sin precio</span>}
            </button>
          </li>
        ))}
      </ul>
      </div>
    </div>
  )
}
