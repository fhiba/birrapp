import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

const ICON = {
  map: <path d="M12 2a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />,
  list: <path d="M4 6h2v2H4V6Zm4 0h12v2H8V6ZM4 11h2v2H4v-2Zm4 0h12v2H8v-2ZM4 16h2v2H4v-2Zm4 0h12v2H8v-2Z" />,
  person: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14Z" />,
}

export function Icon({ name, size = 19 }: { name: keyof typeof ICON; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {ICON[name]}
    </svg>
  )
}

/**
 * Barra flotante, igual que en Android: no ocupa el borde, deja ver el mapa
 * por debajo. El degradado evita que el contenido que scrollea quede
 * cortado en seco contra el borde de la píldora.
 */
export function BottomNav() {
  const tab = (to: string, label: string, icon: keyof typeof ICON) => (
    <NavLink
      to={to}
      end
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 7,
        padding: isActive ? '11px 16px' : '11px 17px',
        borderRadius: 999, textDecoration: 'none',
        background: isActive ? 'var(--amber)' : 'transparent',
        color: isActive ? 'var(--base)' : 'var(--muted)',
        fontFamily: 'var(--display)', fontWeight: 500, fontSize: 13,
        transition: 'background .15s',
      })}
    >
      {({ isActive }) => (
        <>
          <Icon name={icon} />
          {isActive && <span>{label}</span>}
        </>
      )}
    </NavLink>
  )

  return (
    <>
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, height: 130, zIndex: 40,
        pointerEvents: 'none',
        background: 'linear-gradient(transparent, rgba(26,20,16,.85) 55%, var(--base))',
      }} />
      <nav style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)',
        bottom: `calc(14px + var(--safe-bottom))`, zIndex: 50,
        display: 'flex', gap: 2, padding: 5, borderRadius: 999,
        background: 'rgba(38,30,24,.94)',
        border: '.8px solid rgba(255,255,255,.16)',
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
      }}>
        {tab('/', 'Mapa', 'map')}
        {tab('/lista', 'Lista', 'list')}
        {tab('/perfil', 'Perfil', 'person')}
      </nav>
    </>
  )
}

export function Sheet(
  { title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode },
) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxHeight: '86vh', overflowY: 'auto',
        background: 'var(--raised)', borderRadius: '22px 22px 0 0',
        padding: `18px 20px calc(20px + var(--safe-bottom))`,
      }}>
        {title && <h2 className="ttl" style={{ margin: '0 0 14px', fontSize: 20 }}>{title}</h2>}
        {children}
      </div>
    </div>
  )
}

export function Confirm({
  title, body, confirmLabel, danger, requireWord, onCancel, onConfirm,
}: {
  title: string; body: ReactNode; confirmLabel: string
  danger?: boolean; requireWord?: string
  onCancel: () => void; onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')
  // Una palabra escrita obliga a leer; un botón se acepta por reflejo.
  const armed = !requireWord || typed.trim().toUpperCase() === requireWord

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.6)',
      display: 'grid', placeItems: 'center', padding: 22,
    }}>
      <div style={{
        background: 'var(--raised)', borderRadius: 18, padding: 22,
        maxWidth: 400, width: '100%',
      }}>
        <h3 className="ttl" style={{ margin: '0 0 10px', fontSize: 19 }}>{title}</h3>
        <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.55 }}>{body}</div>

        {requireWord && (
          <>
            <p style={{ color: 'var(--faint)', fontSize: 12, margin: '16px 0 6px' }}>
              Escribí {requireWord} para confirmar
            </p>
            <input value={typed} onChange={e => setTyped(e.target.value)} style={{
              width: '100%', padding: '11px 13px', borderRadius: 11,
              background: 'transparent', border: '1px solid var(--hairline)',
            }} />
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onCancel} style={{ color: 'var(--muted)', padding: '10px 14px' }}>
            Cancelar
          </button>
          <button disabled={!armed} onClick={onConfirm} style={{
            padding: '10px 14px', fontWeight: 600,
            color: !armed ? 'var(--faint)' : danger ? 'var(--danger)' : 'var(--amber)',
            cursor: armed ? 'pointer' : 'not-allowed',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  setTimeout(onDone, 3200)
  return (
    <div style={{
      position: 'fixed', left: 16, right: 16, bottom: `calc(96px + var(--safe-bottom))`,
      zIndex: 70, background: 'var(--elevated)', borderRadius: 14, padding: '13px 16px',
      fontSize: 13.5, boxShadow: '0 8px 30px rgba(0,0,0,.45)',
    }}>{text}</div>
  )
}
