import { useState } from 'react'
import * as api from '../data/api'
import type { BeerStyle } from '../data/types'

/**
 * La fila de estilos, con la posibilidad de proponer uno que no está (BIR-35).
 *
 * El vocabulario cerrado es lo que permite comparar IPA contra IPA. Pero uno
 * que no crece deja afuera a la birra que la persona tiene enfrente, y lo que
 * hace entonces no es abandonar: elige el estilo más parecido. Eso ensucia el
 * dato en silencio, que es peor que una lista con un estilo de más.
 *
 * "Otro" es un chip más y no un botón aparte: aparece al final de la fila,
 * donde llega quien ya buscó el suyo y no lo encontró. El campo se abre abajo
 * en vez de en una pantalla nueva — es un renglón de texto, no un trámite.
 */
export function StyleChips({
  styles, value, onChange, onCreated, allowNone = false, layout = 'row',
}: {
  styles: BeerStyle[]
  value: string | undefined
  onChange: (slug: string | undefined) => void
  /** El estilo nuevo todavía no está en la lista del servidor: lo agrega el padre. */
  onCreated: (s: BeerStyle) => void
  /** "Sin estilo" como opción real. En el contador sí; cargando un precio no. */
  allowNone?: boolean
  /**
   * `row` es la fila que se arrastra, para cuando el estilo es un control más
   * al costado de otra cosa. `grid` los muestra todos a la vez, para cuando
   * elegir el estilo ES la pantalla: ahí esconder la mitad detrás de un gesto
   * sería pedir que adivinen que hay más.
   */
  layout?: 'row' | 'grid'
}) {
  const [typing, setTyping] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const typed = name.trim()
  // No se ofrece crear algo que ya está: ese duplicado es justo lo que el
  // vocabulario controlado viene a evitar.
  const canCreate = typed.length >= 2 && !styles.some(s => norm(s.name) === norm(typed))

  const create = async () => {
    setBusy(true); setError(null)
    try {
      const s = await api.createStyle(typed)
      onCreated(s)
      onChange(s.slug)
      setTyping(false); setName('')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const grid = layout === 'grid'

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick} className="lbl pill" style={{
      padding: grid ? '13px 16px' : '9px 15px',
      fontSize: grid ? 14 : 13,
      whiteSpace: 'nowrap', flexShrink: 0,
      textAlign: grid ? 'center' : undefined,
      background: on ? 'var(--cream)' : 'var(--elevated)',
      color: on ? 'var(--base)' : 'var(--muted)',
    }}>{label}</button>
  )

  return (
    <>
      <div style={grid ? {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 8, padding: '4px 16px',
      } : {
        display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 16px', scrollbarWidth: 'none',
      }}>
        {allowNone && chip('Sin estilo', value === undefined, () => onChange(undefined))}
        {styles.map(s => chip(s.name, value === s.slug, () => onChange(s.slug)))}
        <button onClick={() => setTyping(t => !t)} className="lbl pill" style={{
          padding: grid ? '13px 16px' : '9px 15px',
          fontSize: grid ? 14 : 13, whiteSpace: 'nowrap', flexShrink: 0,
          background: 'transparent', color: 'var(--amber)',
          border: '1px dashed rgba(255,182,39,.5)',
        }}>+ Otro</button>
      </div>

      {typing && (
        <div style={{ padding: '10px 14px 0', display: 'flex', gap: 8 }}>
          <input
            value={name} onChange={e => setName(e.target.value)}
            // Enter da de alta, igual que en las marcas: escribir un nombre y
            // que la tecla de confirmar no haga nada es la forma más fácil de
            // perder lo tecleado.
            onKeyDown={e => { if (e.key === 'Enter' && canCreate && !busy) create() }}
            placeholder="Kellerbier, Gose, Sour…" maxLength={40} autoFocus
            autoComplete="off" autoCorrect="off" spellCheck={false}
            style={{
              flex: 1, minWidth: 0, padding: '12px 12px', borderRadius: 'var(--r-2)',
              background: 'var(--elevated)', border: '1px solid var(--hairline)',
              fontSize: 'var(--t-4)',
            }}
          />
          <button disabled={!canCreate || busy} onClick={create} className="lbl" style={{
            padding: '12px 16px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
            background: canCreate && !busy ? 'var(--amber)' : 'var(--elevated)',
            color: canCreate && !busy ? 'var(--base)' : 'var(--faint)',
          }}>{busy ? '…' : 'Agregar'}</button>
        </div>
      )}

      {typing && (
        <p style={{
          color: error ? 'var(--danger)' : 'var(--faint)',
          fontSize: 'var(--t-2)', margin: '8px 16px 0', lineHeight: 1.5,
        }}>
          {error ?? 'Lo podés usar al toque; un moderador lo revisa después.'}
        </p>
      )}
    </>
  )
}
