import { useState } from 'react'
import * as api from '../data/api'
import type { BeerStyle } from '../data/types'
import { AgregarOtro, Vocablo } from './Kit'
import { t } from '../i18n'

/**
 * La lista de estilos, con la posibilidad de proponer uno que no está (BIR-35).
 *
 * El vocabulario cerrado es lo que permite comparar IPA contra IPA. Pero uno
 * que no crece deja afuera a la birra que la persona tiene enfrente, y lo que
 * hace entonces no es abandonar: elige el estilo más parecido. Eso ensucia el
 * dato en silencio, que es peor que una lista con un estilo de más.
 *
 * "Otro estilo" va al final, donde llega quien ya buscó el suyo y no lo
 * encontró, y se dibuja **distinto de las palabras del vocabulario**: cápsula
 * punteada en ámbar, no texto con filete. Al principio era una palabra más de
 * la grilla, y esconder la salida adentro de la lista en la que alguien acaba
 * de no encontrar nada es esconderla. El campo se abre abajo en vez de en una
 * pantalla nueva — es un renglón de texto, no un trámite.
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

  /**
   * La lista vacía no es "no hay estilos": es que no llegó.
   *
   * El vocabulario de estilos nunca está vacío del lado del servidor —son
   * diecisiete sembrados desde V2—, así que si acá no hay ninguno es que el
   * pedido falló. Y callarlo es peor que mostrar el error: quien abría esto
   * veía "Sin estilo" y "Otro estilo", y la app le ofrecía crear "IPA" como si
   * no existiera. Crear algo que ya está no se puede, así que además no había
   * salida — sólo un formulario que rebota.
   *
   * `useBars` reintenta solo, incluso al volver a la app. Esto es lo que se
   * dice mientras tanto, y lo que queda si el pedido nunca llega: en una compu
   * con un bloqueador de contenido, `/styles` puede estar cayendo siempre.
   */
  const sinLista = styles.length === 0

  return (
    <>
      <div style={grid ? {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
        gap: 'var(--s-2) var(--s-4)', padding: '4px 16px',
      } : {
        display: 'flex', gap: 'var(--s-4)', overflowX: 'auto',
        padding: '4px 16px', scrollbarWidth: 'none',
      }}>
        {allowNone && (
          <Vocablo key="ninguno" label={t('StyleChips.sinEstilo')} centrado={grid}
            on={value === undefined} onClick={() => onChange(undefined)} />
        )}
        {styles.map(s => (
          <Vocablo key={s.slug} label={s.name} centrado={grid}
            on={value === s.slug} onClick={() => onChange(s.slug)} />
        ))}
        {/* Otra familia entera, a propósito: ver `AgregarOtro`. Era una palabra
            más de la grilla y quien no encontraba su estilo no veía la salida.

            Sin lista no se ofrece: proponer un estilo cuando no sabemos cuáles
            existen es invitar a duplicar los que ya están. */}
        {!sinLista && (
          <AgregarOtro key="otro" label={t('StyleChips.otro')} on={typing}
            onClick={() => setTyping(t => !t)} />
        )}
      </div>

      {sinLista && (
        <p style={{
          color: 'var(--aging)', fontSize: 'var(--t-2)',
          margin: '8px 16px 0', lineHeight: 1.5, textWrap: 'pretty',
        }}>
          {t('StyleChips.sinLista')}
        </p>
      )}

      {typing && (
        <div style={{ padding: '10px 14px 0', display: 'flex', gap: 8 }}>
          <input
            value={name} onChange={e => setName(e.target.value)}
            // Enter da de alta, igual que en las marcas: escribir un nombre y
            // que la tecla de confirmar no haga nada es la forma más fácil de
            // perder lo tecleado.
            onKeyDown={e => { if (e.key === 'Enter' && canCreate && !busy) create() }}
            placeholder={t('StyleChips.placeholder')} maxLength={40} autoFocus
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
          }}>{busy ? '…' : t('comun.agregar')}</button>
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
            ?? (canCreate ? t('StyleChips.nuevo', { nombre: typed })
              : typed.length >= 2 ? t('StyleChips.yaEsta', { nombre: typed })
              : t('StyleChips.dosLetras'))}
        </p>
      )}
    </>
  )
}
