import { useState } from 'react'
import * as api from '../data/api'
import type { BarPin, BeerStyle, Brand } from '../data/types'
import { formatDistance } from '../data/format'
import { BrandPicker } from '../ui/BrandPicker'
import { Sheet } from '../ui/Chrome'
import { StyleChips } from '../ui/StyleChips'

/** Más lejos que esto, "¿te la tomaste acá?" deja de ser una pregunta razonable. */
const SUGGEST_RADIUS_M = 250

/**
 * Anotar una birra tomada (BIR-34, con el enganche al bar de BIR-36).
 *
 * Todo viene resuelto de antemano: una birra, en el bar más cercano, ahora.
 * Quien no quiera cambiar nada toca "Anotar" y listo — es la misma idea que
 * "Sigue igual" con los precios. Si anotar cuesta lo mismo que cargar un
 * precio, nadie anota, y un contador que no se usa no cuenta nada.
 *
 * El bar sale de la ubicación, que es el dato que ya está en pantalla: los
 * bares que se ven en el mapa vienen con su distancia calculada. Por eso acá
 * no hay buscador ni una llamada más — se ofrecen los de al lado y se puede
 * no elegir ninguno.
 */
export function LogBeerSheet({
  nearby, styles, brands, onBrandCreated, onStyleCreated, onClose, onDone,
}: {
  /** Bares conocidos, con `distanceMeters` ya calculada. */
  nearby: BarPin[]
  styles: BeerStyle[]
  brands: Brand[]
  onBrandCreated: (b: Brand) => void
  onStyleCreated: (s: BeerStyle) => void
  onClose: () => void
  onDone: (message: string) => void
}) {
  const close = [...nearby]
    .filter(b => b.distanceMeters != null)
    .sort((a, b) => a.distanceMeters! - b.distanceMeters!)
    .slice(0, 6)

  // El más cercano viene elegido, pero sólo si está de verdad cerca: a seis
  // cuadras, preselecionarlo sería ponerle a la persona una respuesta falsa
  // en la boca y ensuciar las birras por bar de un bar donde no estuvo.
  const suggested = close[0]
  const [barId, setBarId] = useState<number | null>(
    suggested && (suggested.distanceMeters ?? Infinity) <= SUGGEST_RADIUS_M
      ? suggested.id : null,
  )
  const [qty, setQty] = useState(1)
  const [detail, setDetail] = useState(false)
  const [style, setStyle] = useState<string | undefined>()
  const [brand, setBrand] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await api.logBeer({
        barId: barId ?? undefined,
        styleSlug: style,
        brandSlug: brand,
        qty,
      })
      const donde = close.find(b => b.id === barId)?.name
      onDone(
        qty === 1
          ? `Anotada${donde ? ` en ${donde}` : ''}. ¡Salud!`
          : `${qty} birras anotadas${donde ? ` en ${donde}` : ''}. ¡Salud!`,
      )
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Sheet title="Me tomé una birra" onClose={onClose}>
      {close.length > 0 && (
        <>
          <Label>
            {suggested && barId === suggested.id
              ? '¿La birra te la tomaste acá?'
              : '¿Dónde?'}
          </Label>
          <div style={{
            display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
            scrollbarWidth: 'none', margin: '0 -20px', padding: '0 20px 4px',
          }}>
            {close.map(b => (
              <button key={b.id} onClick={() => setBarId(b.id)} className="lbl pill" style={{
                padding: '8px 16px', fontSize: 'var(--t-3)', whiteSpace: 'nowrap', flexShrink: 0,
                background: barId === b.id ? 'var(--cream)' : 'var(--elevated)',
                color: barId === b.id ? 'var(--base)' : 'var(--muted)',
              }}>
                {b.name}
                <span style={{ opacity: .6, marginLeft: 6, fontSize: 'var(--t-2)' }}>
                  {formatDistance(b.distanceMeters)?.replace('a ', '')}
                </span>
              </button>
            ))}
            {/* No es un vacío: hay birras que no se toman en ningún bar del
                mapa, y obligar a elegir uno haría que se anoten en el de al
                lado. Eso rompe el conteo por bar, que es de lo que se trata. */}
            <button onClick={() => setBarId(null)} className="lbl pill" style={{
              padding: '8px 16px', fontSize: 'var(--t-3)', whiteSpace: 'nowrap', flexShrink: 0,
              background: barId === null ? 'var(--cream)' : 'var(--elevated)',
              color: barId === null ? 'var(--base)' : 'var(--muted)',
            }}>En otro lado</button>
          </div>
        </>
      )}

      <Label>¿Cuántas?</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Step label="−" disabled={qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))} />
        <span className="num" style={{ fontSize: 'var(--t-8)', minWidth: 34, textAlign: 'center' }}>
          {qty}
        </span>
        <Step label="+" disabled={qty >= 20} onClick={() => setQty(q => Math.min(20, q + 1))} />
      </div>

      {/* El detalle va plegado: quien quiera anotar cuál era la birra lo
          abre, y quien sólo lleva la cuenta no lo ve nunca. */}
      <button onClick={() => setDetail(d => !d)} className="lbl" style={{
        display: 'block', marginTop: 20, fontSize: 'var(--t-3)', color: 'var(--amber)',
      }}>
        {detail ? 'Listo' : '¿Cuál era? (opcional)'}
      </button>

      {detail && (
        <div style={{ margin: '12px -20px 0' }}>
          <StyleChips
            styles={styles} value={style} onChange={setStyle}
            onCreated={onStyleCreated} allowNone
          />
          <div style={{ padding: '10px 20px 0' }}>
            <BrandPicker
              brands={brands} value={brand} onChange={setBrand} onCreated={onBrandCreated}
            />
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)', margin: '14px 0 0' }}>{error}</p>
      )}

      <button disabled={busy} onClick={submit} className="lbl" style={{
        width: '100%', marginTop: 22, padding: 16, borderRadius: 'var(--r-3)', fontSize: 'var(--t-4)',
        background: busy ? 'var(--amber-deep)' : 'var(--amber)', color: 'var(--base)',
      }}>{busy ? '…' : 'Anotar'}</button>
    </Sheet>
  )
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <h3 className="lbl" style={{
    fontSize: 'var(--t-1)', letterSpacing: '.12em', color: 'var(--faint)', margin: '18px 0 8px',
  }}>{String(children).toUpperCase()}</h3>
)

function Step({ label, disabled, onClick }: {
  label: string; disabled: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label === '+' ? 'Una más' : 'Una menos'}
      className="num" style={{
        width: 46, height: 46, borderRadius: '50%', fontSize: 'var(--t-6)',
        background: 'var(--elevated)',
        color: disabled ? 'var(--faint)' : 'var(--cream)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}>{label}</button>
  )
}
