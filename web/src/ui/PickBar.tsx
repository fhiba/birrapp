import { useEffect, useState } from 'react'
import * as api from '../data/api'
import type { BarPin } from '../data/types'
import { formatDistance, formatPrice, shortAge } from '../data/format'

/**
 * "¿En qué bar?" — el paso que faltaba para poder cargar un precio desde el
 * mapa y no sólo entrando al bar (BIR-36).
 *
 * Arranca mostrando los de al lado, que es la respuesta el 90% de las veces:
 * un precio se carga estando parado en el lugar. El buscador está para el
 * otro 10%, y consulta al servidor porque la caché del mapa sólo tiene lo que
 * entró en el radio que se está mirando.
 */
/**
 * Buscador y lista de bares, sin cáscara.
 *
 * Va aparte porque lo usan dos cosas con posicionamiento distinto: el paso 3
 * del flujo de carga de precio, a pantalla completa, y cualquier hoja que
 * necesite elegir un bar. La lógica de "los de al lado primero, el buscador
 * para el resto" existe una sola vez.
 */
export function BarSearchList({
  nearby, center, onPick,
}: {
  nearby: BarPin[]
  center: google.maps.LatLngLiteral | null
  onPick: (bar: BarPin) => void
}) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<BarPin[] | null>(null)
  const [busy, setBusy] = useState(false)

  const typed = q.trim()

  // Rebote de 250 ms: sin esto, escribir "Antares" son siete consultas y la
  // penúltima puede llegar después de la última.
  useEffect(() => {
    if (typed.length < 2) { setFound(null); return }
    let alive = true
    setBusy(true)
    const t = setTimeout(() => {
      api.searchBars(typed, center?.lat, center?.lng, 12)
        .then(r => { if (alive) setFound(r) })
        .catch(() => { if (alive) setFound([]) })
        .finally(() => { if (alive) setBusy(false) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [typed, center?.lat, center?.lng])

  const close = [...nearby]
    .filter(b => b.distanceMeters != null)
    .sort((a, b) => a.distanceMeters! - b.distanceMeters!)
    .slice(0, 8)

  const shown = found ?? close

  return (
    <>
      <input
        value={q} onChange={e => setQ(e.target.value)}
        placeholder="Buscar un bar" maxLength={60} autoComplete="off"
        style={{
          width: '100%', padding: '12px 12px', borderRadius: 'var(--r-2)',
          background: 'var(--elevated)', border: '1px solid var(--hairline)',
          fontSize: 'var(--t-4)',
        }}
      />

      <div style={{ marginTop: 12 }}>
        {shown.map(b => (
          <button key={b.id} onClick={() => onPick(b)} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            padding: '12px 4px', textAlign: 'left', borderBottom: '1px solid var(--hairline)',
          }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="lbl" style={{ fontSize: 'var(--t-4)' }}>{b.name}</span>
              <span style={{ display: 'block', fontSize: 'var(--t-2)', color: 'var(--faint)' }}>
                {formatDistance(b.distanceMeters) ?? 'sin distancia'}
              </span>
            </span>
            {/* El precio va con su antigüedad al lado, como en todos lados. */}
            {b.fromPrice != null && (
              <span style={{ textAlign: 'right' }}>
                <span className="num" style={{ fontSize: 'var(--t-4)' }}>
                  {formatPrice(b.fromPrice, b.currency)}
                </span>
                <span style={{ display: 'block', fontSize: 'var(--t-1)', color: 'var(--faint)' }}>
                  {shortAge(b.freshestAgeDays)}
                </span>
              </span>
            )}
          </button>
        ))}

        {shown.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-3)', padding: '16px 4px' }}>
            {busy ? 'Buscando…'
              : typed.length >= 2 ? 'No encontramos ese bar. Podés agregarlo desde el +.'
              : 'No hay bares cerca todavía.'}
          </p>
        )}
      </div>
    </>
  )
}
