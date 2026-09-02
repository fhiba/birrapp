import { useMemo, useState } from 'react'
import * as api from '../data/api'
import type { Brand } from '../data/types'
import { Sheet } from './Chrome'

/**
 * Selector de marca, detrás de un desplegable.
 *
 * Va después del estilo y no antes por una razón de uso: quien carga un precio
 * sabe siempre si es rubia o IPA, y no siempre de qué marca. Primero lo que se
 * sabe seguro; la marca queda como un paso opcional que se puede saltear.
 *
 * "Sin marca" es una opción de primera clase y no un vacío: hay bares donde la
 * birra no tiene marca declarada, y forzar a elegir una haría que la gente
 * invente. Una birra sin marca es una birra concreta, con su precio, su nota y
 * sus fotos, distinta de la misma canilla con marca conocida.
 *
 * La lista se puede ampliar desde acá: las marcas son cola larga —cada
 * cervecería chica es una— y mandar a alguien a "pedir que agreguen la marca"
 * en el momento en que está parado en el bar es perder el dato.
 */
export function BrandPicker({
  brands, value, onChange, onCreated,
}: {
  brands: Brand[]
  value: string | null
  onChange: (slug: string | null) => void
  /** Una marca nueva no está en `brands` todavía: el padre la agrega. */
  onCreated: (b: Brand) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = brands.find(b => b.slug === value) ?? null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lbl"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '11px 14px', borderRadius: 13, fontSize: 13.5,
          background: 'var(--elevated)',
          color: selected ? 'var(--cream)' : 'var(--muted)',
        }}
      >
        <span style={{ color: 'var(--faint)', fontSize: 11.5, letterSpacing: '.08em' }}>
          MARCA
        </span>
        <span style={{ flex: 1, textAlign: 'left' }}>
          {selected ? selected.name : 'Sin marca'}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
          <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <BrandSheet
          brands={brands} value={value}
          onClose={() => setOpen(false)}
          onPick={slug => { onChange(slug); setOpen(false) }}
          onCreated={b => { onCreated(b); onChange(b.slug); setOpen(false) }}
        />
      )}
    </>
  )
}

function BrandSheet({
  brands, value, onClose, onPick, onCreated,
}: {
  brands: Brand[]
  value: string | null
  onClose: () => void
  onPick: (slug: string | null) => void
  onCreated: (b: Brand) => void
}) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const shown = useMemo(() => {
    const needle = norm(q.trim())
    return needle ? brands.filter(b => norm(b.name).includes(needle)) : brands
  }, [brands, q])

  const craft = shown.filter(b => b.craft)
  const industrial = shown.filter(b => !b.craft)

  // Sólo si lo escrito no coincide exactamente con algo que ya existe: sin
  // esto la pantalla ofrece crear "Antares" teniendo Antares en la lista, que
  // es justo el duplicado que el vocabulario controlado viene a evitar.
  const typed = q.trim()
  const canCreate = typed.length >= 2 &&
    !brands.some(b => norm(b.name) === norm(typed))

  const create = async () => {
    setBusy(true); setError(null)
    try {
      // `craft: true` por defecto: lo que falta en la lista es casi siempre
      // una cervecería chica, no una industrial. Un moderador lo corrige.
      onCreated(await api.createBrand(typed, true))
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <Sheet title="Marca" onClose={onClose}>
      <input
        value={q} onChange={e => setQ(e.target.value)}
        placeholder="Buscar marca" maxLength={60}
        style={{
          width: '100%', padding: '11px 13px', borderRadius: 12, marginBottom: 12,
          background: 'var(--base)', border: '1px solid var(--hairline)',
          fontFamily: 'inherit', fontSize: 14, color: 'inherit',
        }}
      />

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 10px' }}>{error}</p>
      )}

      <Option
        label="Sin marca" hint="No la sé o el bar no la declara"
        on={value === null} onClick={() => onPick(null)}
      />

      {craft.length > 0 && <H>Artesanales</H>}
      {craft.map(b => (
        <Option key={b.slug} label={b.name} on={value === b.slug}
          onClick={() => onPick(b.slug)} />
      ))}

      {industrial.length > 0 && <H>Industriales</H>}
      {industrial.map(b => (
        <Option key={b.slug} label={b.name} on={value === b.slug}
          onClick={() => onPick(b.slug)} />
      ))}

      {canCreate && (
        <button disabled={busy} onClick={create} className="lbl" style={{
          width: '100%', marginTop: 14, padding: 13, borderRadius: 13, fontSize: 13.5,
          background: busy ? 'var(--amber-deep)' : 'var(--amber)', color: 'var(--base)',
        }}>{busy ? '…' : `Agregar "${typed}"`}</button>
      )}

      {canCreate && (
        <p style={{ color: 'var(--faint)', fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.5 }}>
          La marca queda cargada al toque y un moderador la revisa después.
        </p>
      )}

      {!canCreate && shown.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '12px 0 0' }}>
          Ninguna marca coincide.
        </p>
      )}
    </Sheet>
  )
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className="lbl" style={{
    fontSize: 10, letterSpacing: '.12em', color: 'var(--faint)',
    margin: '18px 0 6px',
  }}>{String(children).toUpperCase()}</h3>
)

function Option({
  label, hint, on, onClick,
}: { label: string; hint?: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="lbl" style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
      padding: '11px 13px', borderRadius: 12, fontSize: 14, textAlign: 'left',
      background: on ? 'var(--amber-soft)' : 'transparent',
      color: on ? 'var(--amber)' : 'var(--cream)',
    }}>
      <span style={{ flex: 1 }}>
        {label}
        {hint && (
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--faint)' }}>
            {hint}
          </span>
        )}
      </span>
      {on && <span aria-hidden>✓</span>}
    </button>
  )
}
