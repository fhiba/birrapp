import { useEffect, useState } from 'react'
import { currencyPrefix, groupThousands } from '../data/format'

/**
 * El último paso: cuánto sale y de qué tamaño.
 *
 * Se usa parado en un bar, con una mano, con poca luz. De ahí el teclado
 * propio (el del sistema tapa media pantalla), la tecla 000 (los precios de
 * acá tienen tres ceros) y el separador de miles en vivo, que es donde se
 * cuela el cero de más.
 *
 * Tocar el monto o el tamaño edita ese campo directamente; el activo se
 * resalta. Nada de modos escondidos.
 *
 * **Acá ya no se elige la birra.** Antes esta pantalla tenía encima la fila de
 * estilos y el selector de marca, y el teclado competía con dos decisiones más
 * en el mismo alto. Ahora eso lo preguntó [ReportFlow] antes, de a una, y lo
 * elegido se muestra arriba sólo para poder corregirlo: el botón de volver
 * lleva al paso anterior, no afuera.
 */
export function ReportPrice({
  barName, currency, defaultSizeMl, styleName, brandName,
  onBack, onCancel, onSubmit,
}: {
  barName?: string
  /** La del bar: el precio se carga en la moneda del lugar, no en la tuya. */
  currency: string
  /** El de tu configuración. Una pinta no mide lo mismo en todos lados. */
  defaultSizeMl: number
  styleName: string
  /** Null es "sin marca", que es una birra concreta y no un dato faltante. */
  brandName: string | null
  /** Al paso anterior. */
  onBack: () => void
  /** Salir del flujo entero. */
  onCancel: () => void
  onSubmit: (price: number, sizeMl: number) => void
}) {
  const [digits, setDigits] = useState('')
  const [size, setSize] = useState(String(defaultSizeMl))
  const [editingSize, setEditingSize] = useState(false)

  const price = Number(digits) || 0
  const sizeMl = Number(size) || defaultSizeMl
  const valid = price > 0 && sizeMl >= 100 && sizeMl <= 2000

  /**
   * El teclado de verdad, en escritorio.
   *
   * El teclado propio existe porque en el teléfono el del sistema tapa media
   * pantalla. En una notebook es al revés: hay un teclado físico delante y la
   * única forma de cargar el precio era apuntarle a los botones con el mouse,
   * dígito por dígito.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key >= '0' && e.key <= '9') press(e.key)
      else if (e.key === 'Backspace') press('⌫')
      else if (e.key === 'Enter' && valid) onSubmit(price, sizeMl)
      else return
      e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const press = (k: string) => {
    const cur = editingSize ? size : digits
    let next = k === '⌫' ? cur.slice(0, -1)
      : k === '000' ? (cur === '' ? cur : cur + '000')
      : cur + k
    next = next.replace(/^0+/, '').slice(0, editingSize ? 4 : 8)
    editingSize ? setSize(next) : setDigits(next)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 70, background: 'var(--base)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'var(--safe-top)', paddingBottom: 'var(--nav-gap)',
    }}>
      <header style={{ padding: '10px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* La flecha vuelve un paso, no sale del flujo: quien llegó hasta acá
              eligiendo tres cosas y se equivocó en la marca no tiene que
              empezar de nuevo. Salir es la cruz. */}
          <button onClick={onBack} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label="Volver al paso anterior">←</button>
          <span className="lbl" style={{
            fontSize: 'var(--t-1)', letterSpacing: '.1em', color: 'var(--faint)', flex: 1,
          }}>ÚLTIMO PASO</span>
          <button onClick={onCancel} className="lbl" style={{
            fontSize: 'var(--t-3)', color: 'var(--muted)',
          }} aria-label="Cancelar la carga">Cancelar</button>
        </div>

        {/* Qué se está cargando, en una línea. Es lo que evita el precio
            cargado sobre la birra equivocada: el monto va a quedar pegado a
            esto, así que tiene que estar a la vista mientras se teclea. */}
        <div style={{ margin: '16px 0 0' }}>
          <div className="ttl" style={{ fontSize: 'var(--t-6)' }}>
            {styleName}
            {brandName && (
              <span style={{ color: 'var(--amber)' }}> · {brandName}</span>
            )}
          </div>
          {barName && (
            <div style={{ color: 'var(--muted)', fontSize: 'var(--t-3)', marginTop: 4 }}>
              en {barName}
            </div>
          )}
        </div>
      </header>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <button onClick={() => setEditingSize(false)} className="num" style={{
          fontSize: 'var(--t-10)', letterSpacing: '-.04em', padding: '8px 16px', borderRadius: 'var(--r-3)',
          background: editingSize ? 'transparent' : 'var(--amber-soft)',
          color: digits === '' ? 'var(--faint)' : editingSize ? 'var(--muted)' : 'var(--cream)',
        }}>{currencyPrefix(currency)} {digits === '' ? '0' : groupThousands(digits)}</button>

        <button onClick={() => setEditingSize(true)} className="num pill" style={{
          fontSize: editingSize ? 22 : 18, padding: '8px 16px', marginTop: 12,
          background: editingSize ? 'var(--amber-soft)' : 'transparent',
          color: editingSize ? 'var(--amber)' : 'var(--muted)',
        }}>{size} ml</button>

        <span style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>
          editando {editingSize ? 'el tamaño' : 'el precio'}
        </span>
      </div>

      <div className="desk-narrow" style={{ padding: '0 18px', width: '100%' }}>
        {[['1','2','3'],['4','5','6'],['7','8','9'],['000','0','⌫']].map((row, i) => (
          <div key={i} style={{ display: 'flex' }}>
            {row.map(k => (
              <button key={k} onClick={() => press(k)} className="num" style={{
                flex: 1, margin: 4, padding: '16px 0', borderRadius: 'var(--r-3)',
                background: 'var(--raised)', fontSize: k === '000' ? 20 : 24,
                color: k === '⌫' ? 'var(--muted)' : 'var(--cream)',
              }}>{k}</button>
            ))}
          </div>
        ))}
      </div>

      <button
        disabled={!valid}
        onClick={() => onSubmit(price, sizeMl)}
        className="lbl"
        style={{
          margin: '12px 16px 16px', padding: 16, borderRadius: 'var(--r-3)', fontSize: 'var(--t-4)',
          background: valid ? 'var(--amber)' : 'var(--elevated)',
          color: valid ? 'var(--base)' : 'var(--faint)',
          cursor: valid ? 'pointer' : 'not-allowed',
        }}
      >Cargar el precio</button>
    </div>
  )
}
