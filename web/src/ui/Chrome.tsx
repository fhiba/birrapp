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
 * El alto exacto de la barra de pestañas, sin el margen de seguridad de abajo.
 *
 * Está escrito y no medido porque hay dos cosas que se apoyan en él: el
 * degradado, que tiene que terminar de oscurecer justo donde arranca la barra
 * —si termina antes o después se ve el escalón—, y los `padding-bottom` de las
 * pantallas, que vienen calculados desde afuera. Sale de sumar la pieza:
 * 2 del filete indicador + 10 de aire + 22 del ícono + 3 + 10 de la etiqueta
 * + 2 abajo. De ahí que la etiqueta lleve `lineHeight: 1`: con el 1.5 heredado
 * el alto dependía de la fuente y dejaba de ser previsible.
 *
 * Da 49 + `--nav-gap`, que es lo mismo que medía la píldora flotante que había
 * antes: las pantallas no tienen que cambiar sus paddings.
 */
const ALTO_BARRA = 49

/**
 * Barra de pestañas: plana, apoyada contra el borde de abajo, con filete
 * arriba.
 *
 * Antes era una píldora de vidrio flotando sobre el mapa. El vidrio queda para
 * lo que de verdad flota —los controles del mapa, la preview del bar, las
 * hojas—; las pestañas no flotan, son el piso de la app, y una píldora que se
 * despega del borde estaba diciendo lo contrario. La pizarra tiene filetes, no
 * cápsulas.
 *
 * Las tres etiquetas se ven siempre. La píldora sólo mostraba la de la pestaña
 * activa —era lo que la mantenía angosta— así que las otras dos había que
 * adivinarlas por el ícono, y "lista" y "perfil" en 19px no se adivinan. Con la
 * barra plana el ancho lo da la pantalla y entran las tres.
 *
 * El indicador de la activa es una barra de 2px **arriba** del ícono, el mismo
 * vocabulario que `.tab-underline` usa para los segmentados: una sola forma
 * para "estás acá" en toda la app.
 */
export function BottomNav() {
  const tab = (to: string, label: string, icon: keyof typeof ICON) => (
    <NavLink
      to={to}
      end
      // Sin `aria-label`: la etiqueta ahora es texto de verdad y alcanza como
      // nombre accesible. El atributo estaba porque las pestañas inactivas no
      // tenían texto; dejarlo puesto sería repetir la misma palabra dos veces
      // en el mismo enlace. El "estás acá" lo pone `NavLink`, que marca la
      // activa con `aria-current="page"`.
      style={({ isActive }) => ({
        flex: 1,
        display: 'block',
        textDecoration: 'none',
        // Toda la jerarquía de la barra es un solo salto de color: hueso contra
        // metadato. El ícono no cambia de forma porque los tres son siluetas
        // rellenas, así que el color tiene que hacer todo el trabajo y por eso
        // va al extremo de la rampa y no a un paso intermedio.
        color: isActive ? 'var(--cream)' : 'var(--faint)',
        transition: 'color .15s',
      })}
    >
      {({ isActive }) => (
        <>
          <div aria-hidden style={{
            height: 2,
            background: isActive ? 'var(--cream)' : 'transparent',
            transition: 'background .15s',
          }} />
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '10px 0 2px',
          }}>
            <Icon name={icon} size={22} />
            {/* 10px queda por debajo de `--t-1`, y es a propósito: es una
                etiqueta pegada a su ícono, no un texto que se lee solo. Más
                grande, la barra empieza a competir con el precio, que es lo
                único que esta app viene a contestar. */}
            <span className="lbl" style={{
              fontSize: 10, letterSpacing: '.02em', lineHeight: 1,
            }}>{label}</span>
          </div>
        </>
      )}
    </NavLink>
  )

  return (
    <>
      {/* El degradado que muere justo donde arranca la barra.
          Está para que la lista que scrollea por debajo no quede cortada en
          seco contra el filete. Va a `--base` y no a un rgba escrito a mano:
          era el único color de este archivo que no salía de un token, y con el
          cambio de paleta apuntaba a un gris frío que ya no existe. */}
      <div aria-hidden style={{
        position: 'fixed', left: 0, right: 0,
        bottom: `calc(${ALTO_BARRA}px + var(--nav-gap))`,
        height: 40, zIndex: 40, pointerEvents: 'none',
        background: 'linear-gradient(transparent, var(--base))',
      }} />

      {/*
        Sin la clase `bottom-nav`: la usaba una regla de escritorio que
        recentraba la píldora con `translateX(-50%)`, y sobre una barra de ancho
        completo eso la corre media pantalla. Lo que sí se acota en escritorio
        es la fila de adentro, con el mismo `.desk-narrow` que el resto del
        contenido — la barra pinta hasta el borde, las pestañas quedan donde
        está la lista.

        El `padding-bottom` en `--nav-gap` es el indicador de home de iOS: la
        barra apoya contra el borde, pero el filete y los íconos no se meten
        debajo de la rayita del sistema.
      */}
      <nav aria-label="Secciones" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50,
        padding: `0 var(--s-3) var(--nav-gap)`,
        background: 'var(--base)',
      }}>
        <div className="desk-narrow" style={{
          display: 'flex',
          borderTop: '1px solid var(--hairline)',
        }}>
          {tab('/', 'Mapa', 'map')}
          {tab('/lista', 'Lista', 'list')}
          {tab('/perfil', 'Perfil', 'person')}
        </div>
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
 *
 * Sigue siendo vidrio con la dirección nueva: acá el vidrio se justifica
 * porque la pieza flota sobre la pantalla anterior y conviene seguir viendo de
 * dónde venís. Lo que dejó de ser vidrio es lo que apoya contra un borde.
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
      {/* Los espacios salen de la escala `--s-*` y no de números sueltos: eran
          24, 12, 16 y 8 escritos a mano, que es la escala por casualidad. */}
      <div style={{ padding: 'var(--s-5)' }}>
        <h3 className="ttl" style={{ margin: '0 0 var(--s-3)', fontSize: 'var(--t-5)' }}>{title}</h3>
        <div style={{ color: 'var(--muted)', fontSize: 'var(--t-4)', lineHeight: 1.55 }}>{body}</div>

        {requireWord && (
          <>
            <p style={{
              color: 'var(--faint)', fontSize: 'var(--t-2)',
              margin: 'var(--s-4) 0 var(--s-2)',
            }}>
              Escribí {requireWord} para confirmar
            </p>
            <input value={typed} onChange={e => setTyped(e.target.value)} style={{
              width: '100%', padding: 'var(--s-3)', borderRadius: 'var(--r-2)',
              background: 'transparent', border: '1px solid var(--hairline)',
              // El piso de 16px es lo que evita que Safari iOS haga zoom al
              // enfocar y no lo devuelva después.
              fontSize: 'var(--t-field)',
            }} />
          </>
        )}

        <div style={{
          display: 'flex', gap: 'var(--s-2)', justifyContent: 'flex-end',
          marginTop: 'var(--s-5)',
        }}>
          <button onClick={onCancel} style={{
            color: 'var(--muted)', padding: 'var(--s-3) var(--s-4)', minHeight: 44,
          }}>
            Cancelar
          </button>
          <button disabled={!armed} onClick={onConfirm} style={{
            padding: 'var(--s-3) var(--s-4)', fontWeight: 600, minHeight: 44,
            color: !armed ? 'var(--faint)' : danger ? 'var(--danger)' : 'var(--acento)',
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
        // Flota sobre la barra de pestañas, no encima: los 84px lo dejan por
        // arriba del filete incluso con el indicador de home puesto.
        position: 'fixed', left: 'var(--s-4)', right: 'var(--s-4)',
        bottom: `calc(84px + var(--nav-gap))`,
        zIndex: 70, borderRadius: 'var(--r-3)',
        padding: 'var(--s-3) var(--s-4)',
        fontSize: 'var(--t-3)',
        animation: 'toast-in .18s ease-out',
      }}
    >{text}</div>
  )
}
