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
  { barId, styleSlug, styleName, onClose }:
  { barId: number; styleSlug: string; styleName: string; onClose: () => void },
) {
  const [points, setPoints] = useState<PricePoint[] | null>(null)

  useEffect(() => {
    api.priceHistory(barId, styleSlug).then(setPoints).catch(() => setPoints([]))
  }, [barId, styleSlug])

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
      display: 'grid', placeItems: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--raised)', borderRadius: 20, padding: 22,
        width: '100%', maxWidth: 380,
      }}>
        <h3 className="ttl" style={{ margin: 0, fontSize: 19 }}>{styleName}</h3>
        <p style={{ color: 'var(--faint)', fontSize: 12, margin: '4px 0 18px' }}>
          Historial de precios
        </p>

        {points === null && <div className="spinner" style={{ margin: '30px auto' }} />}

        {points && series.length < 2 && (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
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
              color: 'var(--faint)', fontSize: 11, marginTop: 4,
            }}>
              <span>{new Date(first.at).toLocaleDateString('es-AR')}</span>
              <span>{new Date(last.at).toLocaleDateString('es-AR')}</span>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <Box label="Primero" value={formatPrice(first.price)} />
              <Box label="Ahora" value={formatPrice(last.price)} />
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
          width: '100%', marginTop: 20, padding: 12, borderRadius: 12,
          background: 'rgba(255,255,255,.07)',
        }}>Cerrar</button>
      </div>
    </div>
  )
}

const Box = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div style={{
    flex: 1, padding: '10px 0', borderRadius: 12, textAlign: 'center',
    background: 'rgba(255,255,255,.05)',
  }}>
    <div className="num" style={{ fontSize: 15, color: color ?? 'var(--cream)' }}>{value}</div>
    <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 2 }}>{label}</div>
  </div>
)
