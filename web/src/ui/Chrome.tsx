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
      // El nombre accesible va acá y no en el texto: la etiqueta sólo se
      // dibuja en la pestaña activa —es lo que mantiene la barra angosta— así
      // que sin esto las otras dos se anunciaban como enlaces sin nombre.
      aria-label={label}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 8,
        padding: isActive ? '11px 16px' : '11px 17px',
        borderRadius: 999, textDecoration: 'none',
        background: isActive ? 'var(--amber)' : 'transparent',
        color: isActive ? 'var(--base)' : 'var(--muted)',
        fontFamily: 'var(--display)', fontWeight: 500, fontSize: 'var(--t-3)',
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
      {/* La barra también es vidrio, con la misma receta que el resto. Tenía
          su propia mezcla —otro tinte, otro desenfoque, otro borde— por haber
          salido antes que `.glass`. */}
      <nav className="bottom-nav glass" style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)',
        bottom: 'var(--nav-gap)', zIndex: 50,
        display: 'flex', gap: 2, padding: 4, borderRadius: 999,
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
 *
 * **Lleva ✕ propio.** Salió confiando en que `closedby="any"` alcanzaba para
 * cerrarla tocando afuera, y eso Safari no lo implementa. Escape no existe en
 * un teléfono, y en la PWA instalada en iOS tampoco hay botón de atrás: quien
 * abría "Me tomé una birra" desde un iPhone y se arrepentía quedaba adentro.
 */
export function Sheet(
  { title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode },
) {
  return (
    <Modal label={title ?? 'Hoja'} onClose={onClose} variant="sheet">
      <div style={{ padding: `var(--s-3) var(--s-5) calc(var(--s-5) + var(--nav-gap))` }}>
        {/* El manijón no hace nada por sí solo: está para que la hoja se lea
            como algo que vino de abajo y se va para abajo, y no como una
            pantalla que reemplazó a la anterior. */}
        <div aria-hidden style={{
          width: 38, height: 4, borderRadius: 2, margin: '0 auto var(--s-3)',
          background: 'var(--film-3)',
        }} />

        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
          marginBottom: 'var(--s-4)',
        }}>
          {title && (
            <h2 className="ttl" style={{ margin: 0, flex: 1, fontSize: 'var(--t-6)' }}>{title}</h2>
          )}
          <button onClick={onClose} aria-label="Cerrar" className="icon-btn"
            style={{ marginLeft: 'auto', color: 'var(--muted)', background: 'var(--film-2)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
              <path d="M5 5l14 14M19 5L5 19" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

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
 * Cerrar tocando afuera se hace **a mano** y no con `closedby="any"`. El
 * atributo es lo correcto y donde está implementado hace exactamente esto,
 * pero Safari todavía no lo trae — y Safari es el navegador de la mitad de los
 * usuarios de una PWA. Se deja puesto igual: donde funciona, funciona, y el
 * handler de abajo es idempotente.
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

  /**
   * Un toque en el fondo cierra.
   *
   * El click del fondo llega al `<dialog>` mismo, así que no alcanza con mirar
   * el `target`: hay que comparar contra la caja. Lo que está fuera del
   * rectángulo del diálogo es fondo.
   *
   * El `rect.width > 0` descarta el caso del diálogo que se está cerrando, que
   * mide cero y haría que cualquier click cuente como "afuera".
   */
  const onBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target !== ref.current) return
    const r = ref.current.getBoundingClientRect()
    if (r.width === 0) return
    const fuera = e.clientX < r.left || e.clientX > r.right
      || e.clientY < r.top || e.clientY > r.bottom
    if (fuera) onClose()
  }

  return (
    <dialog
      ref={ref}
      aria-label={label}
      closedby="any"
      onClick={onBackdrop}
      onClose={onClose}
      onCancel={onClose}
      className={variant === 'sheet' ? 'glass modal modal-sheet' : 'glass modal'}
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
      <div style={{ padding: 24 }}>
        <h3 className="ttl" style={{ margin: '0 0 12px', fontSize: 'var(--t-5)' }}>{title}</h3>
        <div style={{ color: 'var(--muted)', fontSize: 'var(--t-4)', lineHeight: 1.55 }}>{body}</div>

        {requireWord && (
          <>
            <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '16px 0 8px' }}>
              Escribí {requireWord} para confirmar
            </p>
            <input value={typed} onChange={e => setTyped(e.target.value)} style={{
              width: '100%', padding: '12px 12px', borderRadius: 'var(--r-2)',
              background: 'transparent', border: '1px solid var(--hairline)',
            }} />
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
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
      className="glass"
      style={{
        position: 'fixed', left: 16, right: 16, bottom: `calc(84px + var(--nav-gap))`,
        zIndex: 70, borderRadius: 'var(--r-3)', padding: '12px 16px',
        fontSize: 'var(--t-3)',
        animation: 'toast-in .18s ease-out',
      }}
    >{text}</div>
  )
}
