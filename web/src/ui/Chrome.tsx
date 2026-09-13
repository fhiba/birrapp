import { useEffect, useRef, useState, type ReactNode } from 'react'
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
        position: 'fixed', left: 0, right: 0, bottom: 0, height: 88, zIndex: 40,
        pointerEvents: 'none',
        background: 'linear-gradient(transparent, rgba(26,20,16,.9) 60%, var(--base))',
      }} />
      <nav className="bottom-nav" style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)',
        bottom: 'var(--nav-gap)', zIndex: 50,
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

/**
 * Hoja anclada abajo. Sobre el mismo `<dialog>` que los diálogos del medio, y
 * por lo mismo: el foco queda adentro, Escape y el botón de atrás del teléfono
 * la cierran, y al cerrar el foco vuelve a donde estaba. Antes era un `div`
 * que se veía bien y con teclado no existía.
 */
export function Sheet(
  { title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode },
) {
  return (
    <Modal label={title ?? 'Hoja'} onClose={onClose} variant="sheet">
      <div style={{ padding: `18px 20px calc(20px + var(--nav-gap))` }}>
        {title && <h2 className="ttl" style={{ margin: '0 0 14px', fontSize: 20 }}>{title}</h2>}
        {children}
      </div>
    </Modal>
  )
}

/**
 * Diálogo modal sobre el `<dialog>` nativo.
 *
 * Antes era un `div` con `position: fixed`. Se veía igual y le faltaba todo lo
 * que hace usable un modal: el foco se quedaba en la página de atrás —con
 * teclado se podía tabular hasta los botones tapados—, Escape no cerraba, el
 * botón de atrás del teléfono tampoco, y al cerrar el foco no volvía a donde
 * estaba. `showModal()` da las cuatro cosas y el `::backdrop` gratis.
 *
 * `closedby="any"` agrega cerrar tocando afuera donde el navegador lo soporta;
 * donde no, sigue andando todo lo demás.
 */
function Modal({ label, onClose, variant = 'center', children }: {
  label: string
  onClose: () => void
  /** `center` es el diálogo chico; `sheet`, la hoja pegada al borde de abajo. */
  variant?: 'center' | 'sheet'
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-label={label}
      // Los tipos de React ya lo conocen; donde el navegador no, se ignora y
      // el diálogo sigue cerrando con Escape y con el botón.
      closedby="any"
      onClose={onClose}
      onCancel={onClose}
      className={variant === 'sheet' ? 'modal modal-sheet' : 'modal'}
    >{children}</dialog>
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
    <Modal label={title} onClose={onCancel}>
      <div style={{ padding: 22 }}>
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
          <button onClick={onCancel} style={{
            color: 'var(--muted)', padding: '12px 16px', minHeight: 44,
          }}>
            Cancelar
          </button>
          <button disabled={!armed} onClick={onConfirm} style={{
            padding: '12px 16px', fontWeight: 600, minHeight: 44,
            color: !armed ? 'var(--faint)' : danger ? 'var(--danger)' : 'var(--amber)',
            cursor: armed ? 'pointer' : 'not-allowed',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * El aviso de "pasó algo", abajo y por unos segundos.
 *
 * El temporizador va en un efecto y no en el cuerpo del componente. Estaba
 * suelto en el render: cada vez que el padre se volvía a dibujar —y se dibuja
 * seguido, el mapa se redibuja con cada movimiento de cámara— se programaba
 * otro `setTimeout`, así que un toast podía cerrarse antes de tiempo por el
 * temporizador de un render anterior. Con el efecto hay uno solo, y se cancela
 * si el texto cambia.
 *
 * `role="status"` es lo que hace que un lector de pantalla lo anuncie: sin
 * eso, la única confirmación de que el precio se cargó es visual.
 */
export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3800)
    return () => clearTimeout(t)
    // `onDone` suele ser una lambda nueva en cada render: incluirla reiniciaría
    // el temporizador sin parar. Lo que manda es el texto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  return (
    <div
      role="status" aria-live="polite"
      style={{
        position: 'fixed', left: 16, right: 16, bottom: `calc(84px + var(--nav-gap))`,
        zIndex: 70, background: 'var(--elevated)', borderRadius: 14, padding: '13px 16px',
        fontSize: 13.5, boxShadow: '0 8px 30px rgba(0,0,0,.45)',
        animation: 'toast-in .18s ease-out',
      }}
    >{text}</div>
  )
}
