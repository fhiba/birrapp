import { useEffect, useState } from 'react'
import type { BeerStyle, Brand } from '../data/types'
import { groupThousands } from '../data/format'
import { BrandPicker } from '../ui/BrandPicker'

/**
 * Carga de precio: una pantalla, teclado propio.
 *
 * Se usa parado en un bar, con una mano, con poca luz. De ahí el teclado
 * propio (el del sistema tapa media pantalla), la tecla 000 (los precios de
 * acá tienen tres ceros) y el separador de miles en vivo, que es donde se
 * cuela el cero de más.
 *
 * Tocar el monto o el tamaño edita ese campo directamente; el activo se
 * resalta. Nada de modos escondidos.
 *
 * La marca va debajo del estilo y es opcional: se sabe siempre si es rubia o
 * IPA, no siempre de qué marca. Sin ella, el precio se carga igual — y esa
 * birra "sin marca" es una birra propia, no un dato a medio cargar.
 */
export function ReportPrice({
  styles, brands, preselected, preselectedBrand, barName,
  onCancel, onSubmit, onBrandCreated,
}: {
  styles: BeerStyle[]
  brands: Brand[]
  preselected?: string
  preselectedBrand?: string | null
  barName?: string
  onCancel: () => void
  onSubmit: (
    styleSlug: string, brandSlug: string | null, price: number, sizeMl: number,
  ) => void
  onBrandCreated: (b: Brand) => void
}) {
  const [style, setStyle] = useState(preselected ?? styles[0]?.slug)
  const [brand, setBrand] = useState<string | null>(preselectedBrand ?? null)
  const [digits, setDigits] = useState('')
  const [size, setSize] = useState('473')
  const [editingSize, setEditingSize] = useState(false)

  // Cambiar de estilo limpia la marca elegida: una IPA de Antares y una rubia
  // de Antares son birras distintas, pero arrastrar la marca sin querer
  // convierte un cambio de estilo en un precio cargado sobre otra cerveza.
  // Se conserva sólo cuando el estilo vuelve a ser el que venía preseleccionado
  // (el caso de "Actualizar" sobre una birra concreta).
  useEffect(() => {
    setBrand(style === preselected ? (preselectedBrand ?? null) : null)
  }, [style, preselected, preselectedBrand])

  const price = Number(digits) || 0
  const sizeMl = Number(size) || 473
  const valid = !!style && price > 0 && sizeMl >= 100 && sizeMl <= 2000

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
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
        <button onClick={onCancel} style={{
          width: 38, height: 38, borderRadius: '50%', background: 'var(--elevated)',
        }} aria-label="Cancelar">←</button>
        {barName && <span className="lbl" style={{ fontSize: 16 }}>{barName}</span>}
      </header>

      <div style={{
        display: 'flex', gap: 7, overflowX: 'auto', padding: '4px 14px', scrollbarWidth: 'none',
      }}>
        {styles.map(s => (
          <button key={s.slug} onClick={() => setStyle(s.slug)} className="lbl pill" style={{
            padding: '9px 15px', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0,
            background: style === s.slug ? 'var(--cream)' : 'var(--elevated)',
            color: style === s.slug ? 'var(--base)' : 'var(--muted)',
          }}>{s.name}</button>
        ))}
      </div>

      <div style={{ padding: '10px 14px 0' }}>
        <BrandPicker
          brands={brands} value={brand} onChange={setBrand}
          onCreated={onBrandCreated}
        />
      </div>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <button onClick={() => setEditingSize(false)} className="num" style={{
          fontSize: 48, letterSpacing: '-.04em', padding: '8px 18px', borderRadius: 14,
          background: editingSize ? 'transparent' : 'var(--amber-soft)',
          color: digits === '' ? 'var(--faint)' : editingSize ? 'var(--muted)' : 'var(--cream)',
        }}>$ {digits === '' ? '0' : groupThousands(digits)}</button>

        <button onClick={() => setEditingSize(true)} className="num pill" style={{
          fontSize: editingSize ? 22 : 18, padding: '9px 16px', marginTop: 10,
          background: editingSize ? 'var(--amber-soft)' : 'transparent',
          color: editingSize ? 'var(--amber)' : 'var(--muted)',
        }}>{size} ml</button>

        <span style={{ color: 'var(--faint)', fontSize: 11 }}>
          editando {editingSize ? 'el tamaño' : 'el precio'}
        </span>
      </div>

      <div className="desk-narrow" style={{ padding: '0 18px', width: '100%' }}>
        {[['1','2','3'],['4','5','6'],['7','8','9'],['000','0','⌫']].map((row, i) => (
          <div key={i} style={{ display: 'flex' }}>
            {row.map(k => (
              <button key={k} onClick={() => press(k)} className="num" style={{
                flex: 1, margin: 5, padding: '16px 0', borderRadius: 18,
                background: 'var(--raised)', fontSize: k === '000' ? 20 : 24,
                color: k === '⌫' ? 'var(--muted)' : 'var(--cream)',
              }}>{k}</button>
            ))}
          </div>
        ))}
      </div>

      <button
        disabled={!valid}
        onClick={() => onSubmit(style!, brand, price, sizeMl)}
        className="lbl"
        style={{
          margin: '12px 18px 18px', padding: 16, borderRadius: 16, fontSize: 15,
          background: valid ? 'var(--amber)' : 'var(--elevated)',
          color: valid ? 'var(--base)' : 'var(--faint)',
          cursor: valid ? 'pointer' : 'not-allowed',
        }}
      >Enviar</button>
    </div>
  )
}
