import { useEffect, useState } from 'react'
import * as api from '../data/api'
import type { BarPin } from '../data/types'
import { ageColor, formatDistance } from '../data/format'
import { PriceColumn } from './Empty'
import { t } from '../i18n'

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
        placeholder={t('PickBar.buscar')} maxLength={60} autoComplete="off"
        style={{
          width: '100%', padding: '12px 12px', borderRadius: 'var(--r-2)',
          background: 'var(--elevated)', border: '1px solid var(--hairline)',
          fontSize: 'var(--t-field)',
        }}
      />

      <div style={{ marginTop: 12 }}>
        {shown.map(b => (
          <button key={b.id} onClick={() => onPick(b)} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--s-3)', width: '100%',
            padding: '12px 4px', textAlign: 'left', borderBottom: '1px solid var(--hairline)',
          }}>
            {/* La barra de frescura, igual que en la lista: elegir el bar para
                cargar un precio es también comparar, y acá se ve de un vistazo
                cuál está desactualizado. Sin precio va en filete y no en
                `--stale`: no hay dato viejo, no hay dato. */}
            <span aria-hidden className="fresh-bar" style={{
              background: b.fromPrice != null
                ? ageColor(b.freshestAgeDays)
                : 'var(--hairline)',
            }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="lbl" style={{ fontSize: 'var(--t-4)' }}>{b.name}</span>
              {/* La distancia es el dato informativo por excelencia, así que
                  va en --info: en --faint competía con todo lo demás apagado
                  de la fila y no se encontraba. */}
              <span style={{ display: 'block', fontSize: 'var(--t-2)', color: 'var(--info)' }}>
                {formatDistance(b.distanceMeters) ?? t('PickBar.sinDistancia')}
              </span>
            </span>
            {/* El precio con su antigüedad al lado, la misma columna que la
                lista: la regla vive adentro de `PriceColumn` y no repetida
                acá, que es como esta copia se había quedado sin el pie para
                cuando no hay fecha y sin cifras tabulares en la edad.

                En --t-5 y no en --t-6: esto es la hoja de elegir bar, no la
                lista de precios; acá el dato que se busca es el nombre.
                Sin precio no se dibuja nada —la fila ya lo dice con el filete
                apagado de la izquierda— y por eso `sinPrecio={null}`. */}
            <PriceColumn
              price={b.fromPrice} currency={b.currency} ageDays={b.freshestAgeDays}
              size="var(--t-5)" sinPrecio={null}
            />
          </button>
        ))}

        {shown.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-3)', padding: '16px 4px' }}>
            {busy ? t('comun.buscando')
              : typed.length >= 2 ? t('PickBar.noEncontramos')
              : t('PickBar.noHayCerca')}
          </p>
        )}
      </div>
    </>
  )
}
