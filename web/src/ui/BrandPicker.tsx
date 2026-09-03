import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../data/api'
import type { Brand } from '../data/types'

/**
 * Selector de marca.
 *
 * Va después del estilo y no antes por una razón de uso: quien carga un precio
 * sabe siempre si es rubia o IPA, y no siempre de qué marca. Primero lo que se
 * sabe seguro; la marca queda como un paso opcional que se puede saltear.
 *
 * "Sin marca" es una opción de primera clase y no un vacío. Hay bares donde la
 * birra no tiene marca declarada, y forzar a elegir una haría que la gente
 * invente. Una birra sin marca es una birra concreta, con su precio y su nota.
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
      {/* Compacto y alineado a la izquierda, no una barra de ancho completo.
          Con ancho completo competía visualmente con el monto, que es lo único
          que esta pantalla tiene que hacer grande. */}
      <button
        onClick={() => setOpen(true)}
        className="lbl"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '7px 12px', borderRadius: 999, fontSize: 12.5,
          background: selected ? 'var(--amber-soft)' : 'rgba(255,255,255,.06)',
          color: selected ? 'var(--amber)' : 'var(--muted)',
        }}
      >
        {selected ? selected.name : 'Sin marca'}
        <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden>
          <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor"
            strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
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

/**
 * La lista, a pantalla completa.
 *
 * Era una hoja anclada abajo y estaba rota de dos formas a la vez. Se abre
 * desde la pantalla de carga de precio, que es `fixed` con `z-index: 70`,
 * mientras la hoja usaba 60: quedaba tapada. Y aunque no lo estuviera, un
 * panel pegado al borde inferior con un campo de texto adentro es lo que peor
 * se lleva con el teclado de iOS, que lo empuja fuera de la pantalla.
 *
 * A pantalla completa las dos cosas desaparecen: el buscador queda arriba,
 * fijo, y lo único que se mueve es la lista.
 */
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
  const input = useRef<HTMLInputElement>(null)

  // Cerrar con Escape: en escritorio es el gesto natural y acá no hay fondo
  // que tocar para salir.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const typed = q.trim()
  const shown = useMemo(() => {
    const needle = norm(typed)
    return needle ? brands.filter(b => norm(b.name).includes(needle)) : brands
  }, [brands, typed])

  // Sólo si lo escrito no coincide con algo que ya existe: sin esto la
  // pantalla ofrece crear "Antares" teniendo Antares en la lista, que es justo
  // el duplicado que el vocabulario controlado viene a evitar.
  const canCreate = typed.length >= 2 && !brands.some(b => norm(b.name) === norm(typed))

  const create = async () => {
    setBusy(true); setError(null)
    try {
      // `craft: true` por defecto: lo que falta en la lista es casi siempre
      // una cervecería chica, no una industrial. Un moderador lo corrige.
      onCreated(await api.createBrand(typed, true))
    } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  const craft = shown.filter(b => b.craft)
  const industrial = shown.filter(b => !b.craft)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90, background: 'var(--base)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      }}>
        <button onClick={onClose} style={{
          width: 38, height: 38, borderRadius: '50%', background: 'var(--elevated)',
          flexShrink: 0,
        }} aria-label="Cancelar">←</button>
        <input
          ref={input}
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Buscar o escribir una marca" maxLength={60}
          autoComplete="off" autoCorrect="off" spellCheck={false}
          style={{
            flex: 1, minWidth: 0, padding: '11px 13px', borderRadius: 12,
            background: 'var(--elevated)', border: '1px solid var(--hairline)',
            fontFamily: 'inherit', fontSize: 16, color: 'inherit',
          }}
        />
      </header>

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 18px' }}>{error}</p>
      )}

      {/* Agregar va arriba y no al final de la lista: si escribiste algo que no
          está, bajar treinta marcas para encontrar el botón es justo lo que
          hace que la gente abandone y cargue el precio sin marca. */}
      {canCreate && (
        <div style={{ padding: '4px 18px 10px' }}>
          <button disabled={busy} onClick={create} className="lbl" style={{
            width: '100%', padding: 13, borderRadius: 13, fontSize: 13.5,
            background: busy ? 'var(--amber-deep)' : 'var(--amber)', color: 'var(--base)',
          }}>{busy ? '…' : `Agregar "${typed}"`}</button>
          <p style={{
            color: 'var(--faint)', fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.5,
          }}>
            La podés usar al toque; un moderador la revisa después.
          </p>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 24px' }}>
        {!typed && (
          <Option
            label="Sin marca" hint="No la sé o el bar no la declara"
            on={value === null} onClick={() => onPick(null)}
          />
        )}

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

        {shown.length === 0 && !canCreate && (
          <p style={{ color: 'var(--muted)', fontSize: 14, padding: '12px 4px' }}>
            Escribí al menos dos letras para agregarla.
          </p>
        )}
      </div>
    </div>
  )
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h3 className="lbl" style={{
    fontSize: 10, letterSpacing: '.12em', color: 'var(--faint)', margin: '16px 4px 4px',
  }}>{String(children).toUpperCase()}</h3>
)

function Option({
  label, hint, on, onClick,
}: { label: string; hint?: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="lbl" style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
      padding: '12px 13px', borderRadius: 12, fontSize: 14.5, textAlign: 'left',
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
