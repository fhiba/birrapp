import type { ReactNode } from 'react'

/**
 * Una pantalla vacía es una invitación, no un cartel de "no hay nada".
 *
 * La app tenía media docena de vacíos resueltos con un renglón gris: "No hay
 * bares cargados por acá todavía", "Todavía no cargaste ningún precio". Todos
 * verdaderos y ninguno útil — quien los lee no sabe qué hacer al respecto, y el
 * momento en que alguien se topa con un vacío es justo cuando más sirve
 * decirle cuál es el paso siguiente.
 *
 * Tres partes, y sólo la primera es obligatoria: qué pasa, por qué, y el botón
 * que lo resuelve. El "por qué" existe porque en esta app muchos vacíos no son
 * culpa de nadie —una zona sin bares cargados es una zona sin bares cargados—
 * y decirlo evita que se lea como un error.
 */
export function Empty({ title, hint, action, onAction }: {
  title: string
  hint?: string
  /** Texto del botón. Sin esto no hay botón: hay vacíos que no tienen salida. */
  action?: string
  onAction?: () => void
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', padding: '48px 24px', gap: 8,
    }}>
      {/* Un vaso vacío, dibujado con el mismo trazo que el resto de la app y
          no un emoji, que cambia de forma y de color en cada sistema. */}
      <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden
        style={{ color: 'var(--faint)', opacity: .55, marginBottom: 4 }}>
        <path
          d="M6.5 3h11l-1.2 17.1a1 1 0 0 1-1 .9H8.7a1 1 0 0 1-1-.9L6.5 3Z"
          fill="none" stroke="currentColor" strokeWidth="1.4"
        />
      </svg>

      <p className="lbl" style={{ fontSize: 'var(--t-4)', margin: 0 }}>{title}</p>

      {hint && (
        <p style={{
          color: 'var(--faint)', fontSize: 'var(--t-3)', margin: 0, lineHeight: 1.55, maxWidth: 320,
        }}>{hint}</p>
      )}

      {action && onAction && (
        <button onClick={onAction} className="lbl" style={{
          marginTop: 12, padding: '12px 24px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
          minHeight: 44, background: 'var(--amber)', color: 'var(--base)',
        }}>{action}</button>
      )}
    </div>
  )
}

/**
 * Lo que se muestra mientras carga una lista.
 *
 * Filas fantasma con la forma de las que vienen, en vez de una barra de un
 * pixel que sólo dice "esperá". La pantalla no salta cuando llegan los datos
 * —el alto ya estaba ocupado— y se entiende qué se está esperando.
 */
export function SkeletonRows({ rows = 6, children }: { rows?: number; children?: ReactNode }) {
  return (
    <div aria-hidden style={{ padding: '10px 18px 0' }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '15px 0', borderBottom: '1px solid var(--film-2)',
          // Se van apagando hacia abajo: dice "hay más" sin dibujar más filas.
          opacity: 1 - i * 0.13,
        }}>
          <div className="skeleton" style={{ width: 3, height: 34, borderRadius: 999 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 14, width: `${55 + (i % 3) * 12}%` }} />
            <div className="skeleton" style={{ height: 10, width: '35%', marginTop: 8 }} />
          </div>
          <div className="skeleton" style={{ height: 18, width: 62 }} />
        </div>
      ))}
      {children}
    </div>
  )
}
