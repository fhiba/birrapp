import { useEffect, useState } from 'react'
import * as api from '../data/api'
import type { PricePoint } from '../data/types'
import { formatPrice } from '../data/format'
import { LOCALE, t } from '../i18n'

/**
 * Historial de un precio.
 *
 * Sale gratis del modelo: los precios son append-only, así que cada bar ya
 * tiene su serie completa sin haber hecho nada extra. Es lo que ningún
 * competidor local tiene, y con inflación es justamente lo interesante:
 * no sólo cuánto sale hoy, sino cuánto subió.
 *
 * Toda la pieza es analítica, así que va en la familia de `--info`: la línea,
 * los extremos del eje y el botón de cerrar. Antes la serie iba en `--acento`
 * —el mismo hueso del nombre del bar y del botón que manda— y un gráfico
 * pintado con el color del cromo se lee como decoración de la tarjeta en vez
 * de como el dato que es.
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
      position: 'fixed', inset: 0, zIndex: 65,
      // El mismo velo que `.modal::backdrop` en theme.css, y no un negro casi
      // opaco: acá atrás está la ficha del bar, que es de dónde venís. Lo que
      // separa las dos capas es el desenfoque, no la oscuridad.
      background: 'rgba(0,0,0,.18)',
      backdropFilter: 'blur(10px) saturate(120%)',
      WebkitBackdropFilter: 'blur(10px) saturate(120%)',
      display: 'grid', placeItems: 'center', padding: 'var(--s-5)',
    }}>
      <div onClick={e => e.stopPropagation()} className="glass" style={{
        borderRadius: 'var(--r-4)', padding: 'var(--s-5)',
        width: '100%', maxWidth: 380,
      }}>
        {/* El rótulo primero y el nombre después: el rótulo dice qué es esta
            ventana, el nombre cuál birra. Al revés había que leer las dos
            líneas para entender la de arriba. */}
        <h2 className="section-label" style={{ margin: '0 0 var(--s-1)' }}>
          {t('PriceHistory.titulo')}
        </h2>
        <h3 className="ttl" style={{ margin: '0 0 var(--s-4)', fontSize: 'var(--t-5)' }}>{title}</h3>

        {points === null && <div className="spinner" style={{ margin: '30px auto' }} />}

        {points && series.length < 2 && (
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-4)', margin: 0 }}>
            {t('PriceHistory.faltanDatos')}
          </p>
        )}

        {series.length >= 2 && (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden>
              <path d={path} fill="none" stroke="var(--info)" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" />
              {series.map((p, i) => {
                const x = (i / (series.length - 1)) * W
                const y = H - ((p.price - min) / span) * (H - 12) - 6
                // El último punto en hueso: es el precio vigente, el único de
                // la serie que todavía sirve para ir a tomar algo.
                const ahora = i === series.length - 1
                return (
                  <circle key={i} cx={x} cy={y} r={ahora ? 4 : 3}
                    fill={ahora ? 'var(--cream)' : 'var(--info)'} />
                )
              })}
            </svg>

            <div style={{
              display: 'flex', justifyContent: 'space-between',
              color: 'var(--info)', fontSize: 'var(--t-1)', marginTop: 'var(--s-1)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <span>{new Date(first.at).toLocaleDateString(LOCALE)}</span>
              <span>{new Date(last.at).toLocaleDateString(LOCALE)}</span>
            </div>

            {/* Tres cifras separadas por filete y sin fondo propio: es la
                gramática de la pizarra, y además tres tarjetitas adentro de
                una tarjeta era una caja adentro de otra por nada. */}
            <div style={{
              display: 'flex', gap: 'var(--s-3)', marginTop: 'var(--s-4)',
              paddingTop: 'var(--s-3)', borderTop: '1px solid var(--hairline)',
            }}>
              <Box label={t('PriceHistory.primero')} value={formatPrice(first.price, currency)} />
              <Box label={t('PriceHistory.ahora')} value={formatPrice(last.price, currency)} />
              {change !== null && (
                <Box
                  label={t('PriceHistory.variacion')}
                  value={`${change > 0 ? '+' : ''}${change}%`}
                  color={change > 0 ? 'var(--danger)' : 'var(--fresh)'}
                />
              )}
            </div>
          </>
        )}

        {/* Cerrar es la acción secundaria de la ventana —lo que se vino a
            hacer acá es mirar— así que va en la familia de `--info` y no en el
            hueso, que es el del botón que manda. */}
        <button onClick={onClose} className="lbl" style={{
          width: '100%', marginTop: 'var(--s-5)', minHeight: 46,
          borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
          background: 'var(--info-soft)', border: '1px solid var(--info-border)',
          color: 'var(--info-bright)',
        }}>{t('comun.cerrar')}</button>
      </div>
    </div>
  )
}

const Box = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div style={{ flex: 1, minWidth: 0 }}>
    <div className="num" style={{ fontSize: 'var(--t-4)', color: color ?? 'var(--cream)' }}>{value}</div>
    <div style={{ fontSize: 'var(--t-1)', color: 'var(--faint)', marginTop: 2 }}>{label}</div>
  </div>
)
