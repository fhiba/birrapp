import { useEffect, useState } from 'react'
import { currencyPrefix, groupThousands } from '../data/format'
import { SectionLabel } from '../ui/Kit'
import { t } from '../i18n'

/**
 * El último paso: cuánto sale y de qué tamaño.
 *
 * Se usa parado en un bar, con una mano, con poca luz. De ahí el teclado
 * propio (el del sistema tapa media pantalla), la tecla 000 (los precios de
 * acá tienen tres ceros) y el separador de miles en vivo, que es donde se
 * cuela el cero de más.
 *
 * Tocar el monto o el formato edita ese campo directamente; el activo se
 * resalta. Nada de modos escondidos.
 *
 * **Acá ya no se elige la birra.** Antes esta pantalla tenía encima la fila de
 * estilos y el selector de marca, y el teclado competía con dos decisiones más
 * en el mismo alto. Ahora eso lo preguntó [ReportFlow] antes, de a una, y lo
 * elegido se muestra arriba sólo para poder corregirlo: el botón de volver
 * lleva al paso anterior, no afuera.
 *
 * **Vestido heritage.** El monto pasa a ser lo único grande de la pantalla —
 * símbolo de moneda chico y apagado, número en `--t-10` y un caret que
 * parpadea donde está tecleando el teclado. El tamaño deja de ser una cápsula
 * con los ml adentro y pasa a ser un segmentado de texto con subrayado, que es
 * el mismo vocabulario de "posición activa" que usa la barra de pestañas.
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
   * Los formatos que se piden en un bar, y "Otro" para lo que no entra.
   *
   * "Pinta" es la de tu configuración y no 473 fijo: una pinta no mide lo
   * mismo en todos lados, y ese tamaño ya lo contestaste una vez en el perfil.
   *
   * "Otro" no es relleno ni un adorno del rediseño: el teclado sigue pudiendo
   * cargar cualquier tamaño entre 100 y 2000 ml, que es lo que esta pantalla
   * ya hacía. Tres botones fijos cubren el 95% de los casos con un tap; el
   * 5% restante no se pierde.
   *
   * El filtro es por si tu pinta mide justo 330 o 1000: dos columnas con el
   * mismo número serían dos botones que hacen lo mismo.
   */
  const formatos = [
    { label: t('ReportPrice.pinta'), ml: defaultSizeMl },
    { label: t('ReportPrice.media'), ml: 330 },
    { label: t('ReportPrice.litro'), ml: 1000 },
  ].filter((f, i, xs) => xs.findIndex(x => x.ml === f.ml) === i)

  // Tecleando los ml, o con un tamaño que no es ninguno de los tres.
  const otro = editingSize || !formatos.some(f => f.ml === sizeMl)

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
      {/*
        Las dos cosas de esta pantalla que un `style` inline no puede escribir:
        el parpadeo del caret y el hundido de las teclas. Se quedan acá porque
        son de esta pantalla y de ninguna otra —el teclado propio existe sólo
        para cargar un precio— y porque el hundido de la tecla no es el del
        CTA: la tecla se toca doce veces seguidas, así que baja menos (.97) y
        más rápido (.08s), y además cambia de fondo.

        El hundido del CTA, en cambio, ya es de toda la app: vive en theme.css
        como `.cta` y acá lo usamos. La copia local que había decía que `.cta`
        todavía no existía, y hace rato que sí.
      */}
      <style>{`
        @keyframes caret-parpadeo { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
        .monto-caret {
          display: inline-block; width: 3px; border-radius: 1px;
          background: var(--cream);
          animation: caret-parpadeo 1.1s step-end infinite;
        }
        .monto-tecla {
          height: 54px; display: grid; place-items: center;
          border-radius: var(--r-1); border: 1px solid var(--hairline);
          background: var(--raised); font-size: var(--t-6);
          transition: transform .08s ease-out, background-color .08s ease-out;
        }
        .monto-tecla:active { transform: scale(.97); background: var(--elevated); }
      `}</style>

      <header style={{
        padding: '10px 18px var(--s-3)', borderBottom: '1px solid var(--hairline)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* La flecha vuelve un paso, no sale del flujo: quien llegó hasta acá
              eligiendo tres cosas y se equivocó en la marca no tiene que
              empezar de nuevo. Salir es la cruz. */}
          <button onClick={onBack} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label={t('ReportPrice.volverPaso')}>←</button>
          <h2 className="section-label" style={{ flex: 1, margin: 0 }}>{t('ReportPrice.ultimoPaso')}</h2>
          <button onClick={onCancel} className="lbl" style={{
            fontSize: 'var(--t-3)', color: 'var(--muted)', minHeight: 44, padding: '0 4px',
          }} aria-label={t('ReportPrice.cancelarAria')}>{t('comun.cancelar')}</button>
        </div>

        {/* Qué se está cargando, en una línea. Es lo que evita el precio
            cargado sobre la birra equivocada: el monto va a quedar pegado a
            esto, así que tiene que estar a la vista mientras se teclea.

            La marca va en `--info` y no en el acento: el acento ahora es el
            mismo hueso que el texto, así que ahí no se distinguía del estilo.
            El azul la separa sin gritar, que es lo que hace `--info` en toda
            la app. */}
        <div style={{ margin: 'var(--s-3) 0 0' }}>
          <div className="ttl" style={{ fontSize: 'var(--t-6)' }}>
            {styleName}
            {brandName && (
              <span style={{ color: 'var(--info)' }}> · {brandName}</span>
            )}
          </div>
          {barName && (
            <div style={{ color: 'var(--muted)', fontSize: 'var(--t-3)', marginTop: 4 }}>
              {t('ReportPrice.enBar', { bar: barName })}
            </div>
          )}
        </div>
      </header>

      {/* El monto y el formato scrollean; el teclado y el CTA quedan fijos
          abajo. En una pantalla de 667px el teclado entra igual, pero con el
          teclado del sistema abierto en escritorio o con el texto agrandado,
          lo que cede es la parte de arriba y no la que se toca. */}
      <div className="desk-narrow" style={{
        flex: 1, minHeight: 0, overflowY: 'auto', width: '100%',
      }}>
        <div style={{ padding: '0 18px' }}>
          <div style={{ paddingBottom: 'var(--s-4)', borderBottom: '1px solid var(--hairline)' }}>
            <SectionLabel>{t('ReportPrice.monto')}</SectionLabel>
            {/*
              El caret es lo único que dice dónde está escribiendo el teclado, y
              por eso se mueve: acá cuando se carga el precio, abajo del formato
              cuando se cargan los ml. Antes eso lo decía un renglón de texto
              ("editando el precio") que había que leer.
            */}
            {/*
              Sin `aria-label`. El nombre accesible de este botón tiene que
              salir de su contenido —o sea, ser el monto— porque es el único
              lugar donde el precio que se está tecleando se puede leer: un
              `aria-label` lo reemplaza, y el contenido de un `button` no se
              recorre en modo exploración. Con la etiqueta puesta, un lector de
              pantalla anunciaba la instrucción y nunca la cifra.
              La instrucción sigue estando, pero como descripción: se lee
              después del monto en vez de taparlo.
            */}
            <button
              onClick={() => setEditingSize(false)}
              aria-pressed={!editingSize}
              aria-describedby="monto-ayuda"
              style={{
                display: 'flex', alignItems: 'baseline', gap: 'var(--s-1)',
                width: '100%', padding: 0, minHeight: 44, textAlign: 'left',
              }}
            >
              <span className="num" style={{ fontSize: 'var(--t-7)', color: 'var(--faint)' }}>
                {currencyPrefix(currency)}
              </span>
              <span className="num" style={{
                fontSize: 'var(--t-10)', lineHeight: 1, letterSpacing: '-.04em',
                color: digits === '' ? 'var(--faint)'
                  : editingSize ? 'var(--muted)' : 'var(--cream)',
              }}>{digits === '' ? '0' : groupThousands(digits)}</span>
              {!editingSize && <span className="monto-caret" style={{ height: 40 }} aria-hidden />}
            </button>
            <span id="monto-ayuda" className="sr">{t('ReportPrice.ayuda')}</span>
          </div>

          <SectionLabel>{t('ReportPrice.formato')}</SectionLabel>
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            {formatos.map(f => {
              const on = !otro && f.ml === sizeMl
              return (
                <button
                  key={f.label} className="tab-underline" aria-pressed={on}
                  onClick={() => { setEditingSize(false); setSize(String(f.ml)) }}
                  style={{ flex: 1, minHeight: 44, textAlign: 'center' }}
                >
                  {f.label}
                  <span className="num" style={{
                    display: 'block', fontSize: 'var(--t-1)', fontWeight: 500,
                    color: 'var(--faint)', marginTop: 2,
                  }}>{t('ReportPrice.ml', { n: f.ml })}</span>
                  <span className="tab-rule" />
                </button>
              )
            })}

            <button
              className="tab-underline" aria-pressed={otro}
              onClick={() => setEditingSize(true)}
              style={{ flex: 1, minHeight: 44, textAlign: 'center' }}
            >
              {t('ReportPrice.otro')}
              <span className="num" style={{
                display: 'block', fontSize: 'var(--t-1)', fontWeight: 500,
                color: 'var(--faint)', marginTop: 2,
              }}>
                {/* Con el campo vacío se muestra el tamaño que se va a
                    guardar, que es el de tu configuración: un guión diría que
                    no hay tamaño, y sí lo hay. */}
                {otro ? t('ReportPrice.ml', { n: size === '' ? defaultSizeMl : size }) : t('ReportPrice.aMano')}
                {editingSize && (
                  <span className="monto-caret" style={{ height: 12, marginLeft: 3 }} aria-hidden />
                )}
              </span>
              <span className="tab-rule" />
            </button>
          </div>

          {/* Un CTA apagado sin explicación es un callejón: el tamaño quedó
              fuera de rango y el botón se apaga sin decir por qué. */}
          {price > 0 && (sizeMl < 100 || sizeMl > 2000) && (
            <p style={{
              color: 'var(--aging)', fontSize: 'var(--t-2)', margin: 'var(--s-3) 0 0',
              lineHeight: 1.5,
            }}>
              {t('ReportPrice.tamano')}
            </p>
          )}

          {/* Para quien no ve el caret: el teclado cambia de destino sin
              cambiar de lugar, así que hay que anunciarlo.

              Y va también el valor. Tocando una tecla el foco se queda en la
              tecla —que se anuncia como el dígito— y el monto de arriba cambia
              sin que nadie lo diga: con este teclado propio, el único eco de
              lo tecleado es éste. */}
          <span className="sr" aria-live="polite">
            {editingSize
              ? t('ReportPrice.tecladoMl', { n: size === '' ? defaultSizeMl : size })
              : t('ReportPrice.tecladoPrecio', { monto: `${currencyPrefix(currency)} ${digits === '' ? '0' : groupThousands(digits)}` })}
          </span>

          <div style={{ height: 'var(--s-4)' }} />
        </div>
      </div>

      <div className="desk-narrow" style={{ padding: '0 18px', width: '100%' }}>
        {/* Grilla de tres y no cuatro filas de flex: con `grid` las teclas
            miden todas lo mismo sin depender de cuántos caracteres tenga cada
            una, que es por lo que "000" quedaba más ancha. */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--s-2)',
        }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'].map(k => (
            <button
              key={k} onClick={() => press(k)} className="num monto-tecla"
              aria-label={k === '⌫' ? t('ReportPrice.borrarUltimo') : k}
              style={{ color: k === '⌫' ? 'var(--muted)' : 'var(--cream)' }}
            >{k}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: 'var(--s-3) 18px var(--s-4)' }}>
        <button
          disabled={!valid}
          onClick={() => onSubmit(price, sizeMl)}
          className="lbl cta"
          style={{
            width: '100%', minHeight: 52, borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
            background: valid ? 'var(--acento)' : 'var(--elevated)',
            color: valid ? 'var(--base)' : 'var(--faint)',
            cursor: valid ? 'pointer' : 'not-allowed',
          }}
        >{t('ReportPrice.cargar')}</button>
      </div>
    </div>
  )
}
