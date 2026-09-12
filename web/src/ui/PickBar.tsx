import { useEffect, useState } from 'react'
import * as api from '../data/api'
import type { BarPin } from '../data/types'
import { formatDistance, formatPrice, shortAge } from '../data/format'
import { Sheet } from './Chrome'

/**
 * "¿En qué bar?" — el paso que faltaba para poder cargar un precio desde el
 * mapa y no sólo entrando al bar (BIR-36).
 *
 * Arranca mostrando los de al lado, que es la respuesta el 90% de las veces:
 * un precio se carga estando parado en el lugar. El buscador está para el
 * otro 10%, y consulta al servidor porque la caché del mapa sólo tiene lo que
 * entró en el radio que se está mirando.
 */
export function PickBarSheet({
  title, nearby, center, onClose, onPick,
}: {
  title: string
  nearby: BarPin[]
  center: google.maps.LatLngLiteral | null
  onClose: () => void
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
    <Sheet title={title} onClose={onClose}>
      <input
        value={q} onChange={e => setQ(e.target.value)}
        placeholder="Buscar un bar" maxLength={60} autoComplete="off"
        style={{
          width: '100%', padding: '12px 13px', borderRadius: 12,
          background: 'var(--elevated)', border: '1px solid var(--hairline)',
          fontSize: 16,
        }}
      />

      <div style={{ marginTop: 12 }}>
        {shown.map(b => (
          <button key={b.id} onClick={() => onPick(b)} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '12px 4px', textAlign: 'left', borderBottom: '1px solid var(--hairline)',
          }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="lbl" style={{ fontSize: 14.5 }}>{b.name}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--faint)' }}>
                {formatDistance(b.distanceMeters) ?? 'sin distancia'}
              </span>
            </span>
            {/* El precio va con su antigüedad al lado, como en todos lados. */}
            {b.fromPrice != null && (
              <span style={{ textAlign: 'right' }}>
                <span className="num" style={{ fontSize: 14 }}>
                  {formatPrice(b.fromPrice)}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--faint)' }}>
                  {shortAge(b.freshestAgeDays)}
                </span>
              </span>
            )}
          </button>
        ))}

        {shown.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13.5, padding: '14px 4px' }}>
            {busy ? 'Buscando…'
              : typed.length >= 2 ? 'No encontramos ese bar. Podés agregarlo desde el +.'
              : 'No hay bares cerca todavía.'}
          </p>
        )}
      </div>
    </Sheet>
  )
}
