import { useEffect, useState } from 'react'
import * as api from '../data/api'
import type { PricePoint } from '../data/types'
import { formatPrice } from '../data/format'

/**
 * Historial de un precio.
 *
 * Sale gratis del modelo: los precios son append-only, así que cada bar ya
 * tiene su serie completa sin haber hecho nada extra. Es lo que ningún
 * competidor local tiene, y con inflación es justamente lo interesante:
 * no sólo cuánto sale hoy, sino cuánto subió.
 */
export function PriceHistory(
  { barId, styleSlug, brandSlug, currency, title, onClose }:
  {
    barId: number
    /** La del bar: todos los puntos de la serie están en la misma. */
    currency: string
    styleSlug: string
    /** La serie es de esta birra, no del estilo: dos marcas son dos series. */
    brandSlug: string | null
    title: string
    onClose: () => void
  },
) {
  const [points, setPoints] = useState<PricePoint[] | null>(null)

  useEffect(() => {
    api.priceHistory(barId, styleSlug, brandSlug).then(setPoints).catch(() => setPoints([]))
  }, [barId, styleSlug, brandSlug])

  const series = (points ?? []).slice().reverse()   // del más viejo al más nuevo
  const values = series.map(p => p.price)
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1

  const W = 300, H = 90
  const path = series.map((p, i) => {
    const x = series.length === 1 ? W / 2 : (i / (series.length - 1)) * W
    const y = H - ((p.price - min) / span) * (H - 12) - 6
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const first = series[0], last = series[series.length - 1]
  const change = first && last && first.price > 0
    ? Math.round(((last.price - first.price) / first.price) * 100) : null

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 65, background: 'rgba(0,0,0,.6)',
      display: 'grid', placeItems: 'center', padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--raised)', borderRadius: 'var(--r-4)', padding: 24,
        width: '100%', maxWidth: 380,
      }}>
        <h3 className="ttl" style={{ margin: 0, fontSize: 'var(--t-5)' }}>{title}</h3>
        <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '4px 0 18px' }}>
          Historial de precios
        </p>

        {points === null && <div className="spinner" style={{ margin: '30px auto' }} />}

        {points && series.length < 2 && (
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-4)' }}>
            Todavía no hay suficientes reportes para mostrar una evolución.
            Hace falta al menos un segundo precio.
          </p>
        )}

        {series.length >= 2 && (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden>
              <path d={path} fill="none" stroke="var(--amber)" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" />
              {series.map((p, i) => {
                const x = (i / (series.length - 1)) * W
                const y = H - ((p.price - min) / span) * (H - 12) - 6
                return <circle key={i} cx={x} cy={y} r="3" fill="var(--amber)" />
              })}
            </svg>

            <div style={{
              display: 'flex', justifyContent: 'space-between',
              color: 'var(--faint)', fontSize: 'var(--t-1)', marginTop: 4,
            }}>
              <span>{new Date(first.at).toLocaleDateString('es-AR')}</span>
              <span>{new Date(last.at).toLocaleDateString('es-AR')}</span>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
              <Box label="Primero" value={formatPrice(first.price, currency)} />
              <Box label="Ahora" value={formatPrice(last.price, currency)} />
              {change !== null && (
                <Box
                  label="Variación"
                  value={`${change > 0 ? '+' : ''}${change}%`}
                  color={change > 0 ? 'var(--danger)' : 'var(--fresh)'}
                />
              )}
            </div>
          </>
        )}

        <button onClick={onClose} className="lbl" style={{
          width: '100%', marginTop: 20, padding: 12, borderRadius: 'var(--r-2)',
          background: 'var(--film-2)',
        }}>Cerrar</button>
      </div>
    </div>
  )
}

const Box = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div style={{
    flex: 1, padding: '10px 0', borderRadius: 'var(--r-2)', textAlign: 'center',
    background: 'var(--film-1)',
  }}>
    <div className="num" style={{ fontSize: 'var(--t-4)', color: color ?? 'var(--cream)' }}>{value}</div>
    <div style={{ fontSize: 'var(--t-1)', color: 'var(--faint)', marginTop: 2 }}>{label}</div>
  </div>
)
