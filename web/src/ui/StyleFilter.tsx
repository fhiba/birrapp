import { useState } from 'react'
import type { BeerStyle } from '../data/types'

/**
 * Filtro de estilo, compartido por el mapa y la lista.
 *
 * Era un desplegable y no una fila de chips porque la fila scrolleaba mal
 * sobre el mapa: el gesto competía con el paneo y a veces se movía el mapa en
 * vez de la lista, además de ocupar una franja permanente de pantalla.
 *
 * `tone` es lo único que cambia entre las dos pantallas: sobre el mapa va de
 * vidrio, en la lista de sólido. El resto es idéntico, y tenerlo dos veces
 * garantizaba que se fueran separando con cada retoque.
 */
export function StyleFilter({
  styles, selected, onSelect, tone = 'glass', size = 44, tourId,
}: {
  styles: BeerStyle[]
  selected?: string
  onSelect: (s?: string) => void
  tone?: 'glass' | 'plain'
  size?: number
  /** Ancla del tutorial, si esta instancia es la que se explica. */
  tourId?: string
}) {
  const [open, setOpen] = useState(false)
  const active = selected != null
  const label = styles.find(s => s.slug === selected)?.name

  if (styles.length === 0) return null

  const idle = tone === 'glass' ? 'lbl pill glass' : 'lbl pill'

  return (
    <div style={{ position: 'relative', flexShrink: 0 }} data-tour={tourId}>
      <button
        onClick={() => setOpen(o => !o)}
        className={active ? 'lbl pill' : idle}
        aria-label="Filtrar por estilo"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: size, padding: active ? '0 14px' : 0, width: active ? undefined : size,
          justifyContent: 'center', flexShrink: 0, whiteSpace: 'nowrap',
          background: active ? 'var(--amber)'
            : tone === 'plain' ? 'rgba(255,255,255,.07)' : undefined,
          color: active ? 'var(--base)' : 'var(--muted)',
          fontSize: 12,
        }}
      >
        <svg width={active ? 15 : 18} height={active ? 15 : 18} viewBox="0 0 24 24"
          fill="currentColor" aria-hidden>
          <path d="M4 5h16v2.2l-6 6V21l-4-2v-5.8l-6-6z" />
        </svg>
        {active && <span>{label}</span>}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{
            position: 'absolute', left: 0, top: size + 6, zIndex: 21, minWidth: 190,
            maxHeight: 320, overflowY: 'auto',
            background: 'var(--elevated)', borderRadius: 14, padding: 6,
            border: '.8px solid rgba(255,255,255,.12)',
            boxShadow: '0 10px 34px rgba(0,0,0,.5)',
          }}>
            <MenuItem on={selected == null} onClick={() => { onSelect(undefined); setOpen(false) }}>
              Todos los estilos
            </MenuItem>
            {styles.map(s => (
              <MenuItem key={s.slug} on={selected === s.slug}
                onClick={() => { onSelect(s.slug); setOpen(false) }}>
                {s.name}
              </MenuItem>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem(
  { on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode },
) {
  return (
    <button onClick={onClick} className="lbl row-hover" style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '10px 12px', borderRadius: 10, fontSize: 13.5,
      color: on ? 'var(--amber)' : 'var(--cream)',
    }}>{children}</button>
  )
}
