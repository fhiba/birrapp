import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { AreaStats, BeerStyle } from '../data/types'
import { formatPrice, formatRadius, shortAge } from '../data/format'

/**
 * "¿Cómo viene la zona?" — el promedio de la pinta en el radio (BIR-33).
 *
 * Va arriba de la lista y no en una pantalla propia: la pregunta aparece
 * mirando precios, y una pantalla aparte sería un lugar al que habría que
 * acordarse de ir.
 *
 * Los montos están normalizados a una pinta de 473 ml. Sin eso, un schop de
 * 330 y una pinta de 473 se promedian como si fueran lo mismo y el número
 * baja cuando lo que cambió fue el tamaño del vaso. Lo dice el pie de la
 * tarjeta, porque un promedio sin su unidad es otra forma de mentir.
 */
export function AreaStatsCard({ center, radius, styleFilter, styles }: {
  center: google.maps.LatLngLiteral | null
  radius: number
  styleFilter?: string
  styles: BeerStyle[]
}) {
  const nav = useNavigate()
  const [data, setData] = useState<AreaStats | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!center) return
    let alive = true
    // Se espera un poco: el radio se mueve con un slider y sin rebote sería
    // una consulta por cada pixel que se arrastra.
    const t = setTimeout(() => {
      api.areaStats(center.lat, center.lng, radius, styleFilter)
        .then(d => { if (alive) setData(d) })
        .catch(() => { if (alive) setData(null) })
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [center?.lat, center?.lng, radius, styleFilter])

  // Con menos de tres precios un promedio no es un promedio, es un precio con
  // pretensiones. Mejor no mostrar nada que mostrar un número que no
  // significa nada.
  if (!data || data.samples < 3 || data.medianPint == null) return null

  const styleName = styles.find(s => s.slug === styleFilter)?.name

  return (
    <div style={{ margin: '12px 18px 0', borderRadius: 15, background: 'var(--raised)' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '13px 15px', textAlign: 'left',
      }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="lbl" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {styleName ? `${styleName} · ` : ''}{formatRadius(radius)} a la redonda
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 3 }}>
            <span className="num" style={{ fontSize: 22 }}>
              {formatPrice(data.medianPint, data.currency)}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>
              la pinta, típico
            </span>
          </span>
        </span>
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden style={{
          color: 'var(--muted)', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
        }}>
          <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor"
            strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: '0 15px 14px' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <Cell label="Promedio" value={formatPrice(data.avgPint!, data.currency)} />
            <Cell label="La más barata" value={formatPrice(data.minPint!, data.currency)} />
            <Cell label="Bares" value={String(data.bars)} />
          </div>

          {data.bestValue && (
            <Pick
              title="El mejor de la zona"
              why={`${data.bestValue.ratingRaw?.toFixed(1)} ★ con ${data.bestValue.ratingCount} ${
                data.bestValue.ratingCount === 1 ? 'voto' : 'votos'}, a ${
                formatPrice(data.bestValue.price, data.currency)}`}
              name={data.bestValue.barName}
              beer={beerLabel(data.bestValue.styleName, data.bestValue.brandName)}
              age={data.bestValue.ageDays}
              onClick={() => nav(`/bar/${data.bestValue!.barId}`)}
            />
          )}

          {data.cheapest && (
            <Pick
              title="La más barata"
              why={`${formatPrice(data.cheapest.price, data.currency)} los ${data.cheapest.sizeMl} ml`}
              name={data.cheapest.barName}
              beer={beerLabel(data.cheapest.styleName, data.cheapest.brandName)}
              age={data.cheapest.ageDays}
              onClick={() => nav(`/bar/${data.cheapest!.barId}`)}
            />
          )}

          <p style={{
            fontSize: 10.5, color: 'var(--faint)', margin: '10px 0 0', lineHeight: 1.5,
          }}>
            Todo llevado a una pinta de 473 ml, sobre {data.samples} precios de
            menos de 45 días. Los más viejos no entran.
          </p>
        </div>
      )}
    </div>
  )
}

const beerLabel = (style: string, brand: string | null) =>
  brand ? `${style} · ${brand}` : style

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div className="num" style={{ fontSize: 15 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Pick({ title, why, name, beer, age, onClick }: {
  title: string; why: string; name: string; beer: string; age: number; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
      padding: '9px 0', textAlign: 'left', borderTop: '1px solid var(--hairline)',
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="lbl" style={{ fontSize: 10, color: 'var(--faint)' }}>
          {title.toUpperCase()}
        </span>
        <span className="lbl" style={{
          display: 'block', fontSize: 14, whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{name}</span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {beer} — {why}
        </span>
      </span>
      {/* Ningún precio sin su antigüedad al lado, tampoco en un ranking. */}
      <span style={{ fontSize: 11, color: 'var(--faint)', flexShrink: 0 }}>
        {shortAge(age)}
      </span>
    </button>
  )
}
