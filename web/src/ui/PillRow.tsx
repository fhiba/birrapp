import { useState, type ReactNode } from 'react'
import { Sheet } from './Chrome'

/** Cuántas pastillas se ven sin desplegar. */
const MAX = 3

export interface Pastilla {
  key: string
  label: string
  /** Lo que va pegado a la derecha del nombre: un precio, un contador. */
  extra?: ReactNode
  /** Está entre las favoritas de quien mira. */
  favorita?: boolean
  /** Para desempatar cuando no hay favoritas. Más alto, mejor. */
  score?: number | null
}

/**
 * Una fila de pastillas que no scrollea: tres y un "⋯".
 *
 * Antes la fila mostraba todas y se arrastraba a la derecha. Con seis birras
 * eso significa que la cuarta, la quinta y la sexta **no existen** para quien
 * no descubra que la fila se puede correr — y las filas horizontales adentro
 * de una página que ya scrollea vertical son de los gestos que menos se
 * descubren solos.
 *
 * Tres y un desplegable dicen la verdad: hay más, y están acá. El "⋯" siempre
 * ocupa el mismo lugar, así que se aprende una vez.
 *
 * ## Cuáles son los tres
 *
 * En orden, y sin repetir:
 *
 *  1. **La que estás mirando.** Si la solapa activa se escondiera detrás del
 *     "⋯", la fila diría que estás viendo algo que no está.
 *  2. **Tus favoritas**, en el orden en que las elegiste. Es para lo que
 *     existen: si sabemos que tomás IPA, la IPA va adelante.
 *  3. **Las mejor puntuadas**, para quien no eligió ninguna. Es el mejor
 *     desempate que tenemos con lo que ya sabemos del bar.
 *
 * Y se dibujan en el orden original de la lista, no en el orden en que se
 * eligieron: si no, las pastillas se reacomodan cada vez que tocás una y la
 * fila baila debajo del dedo.
 */
export function PillRow({
  items, selected, onPick, sheetTitle, trailing, renderPill, dataTour,
}: {
  items: Pastilla[]
  selected: string | null
  onPick: (key: string) => void
  sheetTitle: string
  /** El botón de "agregar otra", que va siempre al final. */
  trailing?: ReactNode
  renderPill: (p: Pastilla, on: boolean) => ReactNode
  dataTour?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const visibles = elegirVisibles(items, selected)
  const hayMas = items.length > visibles.length

  return (
    <>
      <div data-tour={dataTour} style={{
        display: 'flex', gap: 8, padding: '4px 18px 0',
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        {visibles.map(p => (
          <button
            key={p.key}
            onClick={() => onPick(p.key)}
            aria-pressed={p.key === selected}
            className="lbl"
            style={{ flex: '0 0 auto' }}
          >
            {renderPill(p, p.key === selected)}
          </button>
        ))}

        {hayMas && (
          <button
            onClick={() => setAbierto(true)}
            aria-label={`Ver las ${items.length} opciones`}
            className="lbl"
            style={{
              flex: '0 0 auto',
              // Mismo alto que las pastillas para que la fila no se escalone.
              minWidth: 44, height: 36, borderRadius: 999,
              display: 'grid', placeItems: 'center',
              background: 'var(--film-2)', color: 'var(--muted)',
              fontSize: 'var(--t-4)', letterSpacing: '.08em',
            }}
          >⋯</button>
        )}

        {trailing}
      </div>

      {abierto && (
        <Sheet title={sheetTitle} onClose={() => setAbierto(false)}>
          <div style={{ display: 'grid', gap: 6 }}>
            {items.map(p => {
              const on = p.key === selected
              return (
                <button
                  key={p.key}
                  onClick={() => { onPick(p.key); setAbierto(false) }}
                  className="lbl"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '13px 14px', borderRadius: 'var(--r-2)', textAlign: 'left',
                    fontSize: 'var(--t-4)',
                    background: on ? 'var(--acento-soft)' : 'var(--film-1)',
                    color: on ? 'var(--acento)' : 'var(--cream)',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>{p.label}</span>
                  {/* La estrellita marca las tuyas: en una lista de doce
                      estilos, saber cuáles elegiste es lo que la hace tuya y
                      no un menú. */}
                  {p.favorita && (
                    <span aria-label="Entre tus favoritas" style={{ color: 'var(--nota)' }}>★</span>
                  )}
                  {p.extra}
                </button>
              )
            })}
          </div>
        </Sheet>
      )}
    </>
  )
}

/** Ver el comentario de arriba: la activa, después las tuyas, después las mejores. */
function elegirVisibles(items: Pastilla[], selected: string | null): Pastilla[] {
  if (items.length <= MAX) return items

  const elegidas = new Set<string>()
  const sumar = (p?: Pastilla) => {
    if (p && elegidas.size < MAX) elegidas.add(p.key)
  }

  sumar(items.find(p => p.key === selected))
  for (const p of items) if (p.favorita) sumar(p)
  for (const p of [...items].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))) sumar(p)

  return items.filter(p => elegidas.has(p.key))
}
