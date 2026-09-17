import { useState } from 'react'
import * as api from '../data/api'
import type { BeerStyle } from '../data/types'

/**
 * La lista de estilos, con la posibilidad de proponer uno que no está (BIR-35).
 *
 * El vocabulario cerrado es lo que permite comparar IPA contra IPA. Pero uno
 * que no crece deja afuera a la birra que la persona tiene enfrente, y lo que
 * hace entonces no es abandonar: elige el estilo más parecido. Eso ensucia el
 * dato en silencio, que es peor que una lista con un estilo de más.
 *
 * "Otro" es una opción más y no un botón aparte: aparece al final, donde llega
 * quien ya buscó el suyo y no lo encontró. El campo se abre abajo en vez de en
 * una pantalla nueva — es un renglón de texto, no un trámite.
 *
 * **Vestido heritage: palabras con filete, no cápsulas.** La cápsula rellena
 * pesaba lo mismo que un CTA, y acá hay diez seguidas: la pantalla se veía
 * como una botonera. Ahora el vocabulario es texto en `--info` con un filete
 * abajo —la voz de lo informativo en toda la app— y el elegido es el único en
 * hueso, con el filete de 2px que usa la barra de pestañas. El alto de toque
 * sigue en 44px: cambió el vestido, no el blanco al que hay que apuntar.
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

  // Los diacríticos van escritos con `\u`: el rango son marcas combinantes
  // invisibles, y crudas se pegan al `[` y al `-` en cualquier editor. De
  // este rango depende que «Kölsch» matchee «kolsch» más abajo.
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

  /** Una palabra del vocabulario, con su filete. */
  const opcion = (label: string, on: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick} className="lbl" aria-pressed={on} style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      minHeight: 44, padding: 'var(--s-2) 0 0', flexShrink: 0,
      fontSize: 'var(--t-3)', whiteSpace: 'nowrap',
      textAlign: grid ? 'center' : 'left',
      color: on ? 'var(--cream)' : 'var(--info)',
    }}>
      {label}
      {/* Siempre 2px, cambia el color: con un filete de 1px apagado y otro de
          2px encendido, elegir un estilo movía la fila entera un pixel. */}
      <span aria-hidden style={{
        display: 'block', height: 2, marginTop: 'var(--s-2)',
        background: on ? 'var(--cream)' : 'var(--info-border)',
      }} />
    </button>
  )

  return (
    <>
      <div style={grid ? {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
        gap: 'var(--s-2) var(--s-4)', padding: '4px 16px',
      } : {
        display: 'flex', gap: 'var(--s-4)', overflowX: 'auto',
        padding: '4px 16px', scrollbarWidth: 'none',
      }}>
        {allowNone && opcion('Sin estilo', value === undefined, () => onChange(undefined))}
        {styles.map(s => opcion(s.name, value === s.slug, () => onChange(s.slug)))}
        {opcion('+ Otro', typing, () => setTyping(t => !t))}
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
              background: 'var(--raised)', border: '1px solid var(--hairline)',
              fontSize: 'var(--t-field)',
            }}
          />
          {/* `.cta` es el hundido compartido del botón que manda (theme.css):
              sin él, en una red lenta, "Agregar" no acusa el tap y se toca dos
              veces — dos altas del mismo estilo esperando a un moderador. */}
          <button disabled={!canCreate || busy} onClick={create} className="lbl cta" style={{
            padding: '12px 16px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
            minHeight: 46,
            background: canCreate && !busy ? 'var(--acento)' : 'var(--elevated)',
            color: canCreate && !busy ? 'var(--base)' : 'var(--faint)',
          }}>{busy ? '…' : 'Agregar'}</button>
        </div>
      )}

      {/*
        El aviso de vocabulario nuevo.

        Antes decía siempre lo mismo mientras el campo estuviera abierto, y en
        `--faint` —el color de cualquier metadato—, así que no avisaba nada. Lo
        que hay que decir cambia según lo que se escribió, y sólo el caso "esto
        no está en la lista" merece el ámbar: es el único donde lo cargado
        queda esperando a un moderador.
      */}
      {typing && (
        <p style={{
          color: error ? 'var(--danger)'
            : canCreate ? 'var(--aging)'
            : typed.length >= 2 ? 'var(--info)' : 'var(--faint)',
          fontSize: 'var(--t-1)', margin: '8px 16px 0', lineHeight: 1.5,
        }}>
          {error
            ?? (canCreate ? `“${typed}” no está en la lista. Se acepta igual y la podés usar al toque; queda a revisión de un moderador.`
              : typed.length >= 2 ? `“${typed}” ya está en la lista: tocalo arriba.`
              : 'Escribí al menos dos letras.')}
        </p>
      )}
    </>
  )
}
