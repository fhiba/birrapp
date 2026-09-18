import { useState } from 'react'
import * as api from '../data/api'
import type { BarPin, BeerStyle, Brand, User } from '../data/types'
import { Confirm } from '../ui/Chrome'
import { BrandList } from '../ui/BrandPicker'
import { BarSearchList } from '../ui/PickBar'
import { StyleChips } from '../ui/StyleChips'
import { ReportPrice } from './ReportPrice'
import { AddBarScreen } from './AddBar'

/** El bar elegido, sea de dónde venga el flujo. */
export interface FlowBar { id: number; name: string; currency: string }

type Step = 'style' | 'brand' | 'bar' | 'price'

/**
 * Cargar un precio, de a una pregunta por vez.
 *
 * Antes era una sola pantalla con todo encima: la fila de estilos, el selector
 * de marca y el teclado del monto, con el bar dado por dónde habías entrado.
 * Funciona cuando ya sabés cómo se usa; para alguien que entra por primera vez
 * son tres decisiones y un teclado compitiendo por la misma pantalla, y lo que
 * pasa es que carga el precio con el estilo que venía puesto.
 *
 * Ahora son tres preguntas, en el orden en que se saben:
 *
 * 1. **Qué tipo de birra.** Se sabe siempre: rubia o IPA se ve en el vaso.
 * 2. **Qué marca.** No siempre se sabe, y "sin marca" es una respuesta
 *    legítima — no un dato faltante.
 * 3. **En qué bar.** Casi siempre es el de al lado, así que aparecen primero
 *    los cercanos.
 *
 * Recién con las tres contestadas aparece el teclado del monto. El precio sin
 * saber de qué birra y de qué bar es un número suelto, y pedirlo primero es
 * pedir el dato antes de saber a qué se lo pega.
 *
 * **Los pasos que ya están contestados no se preguntan.** Entrando desde un
 * bar, el bar no se pregunta; tocando "Actualizar" sobre una birra concreta,
 * el estilo y la marca tampoco y se va derecho al monto. Un paso cuya
 * respuesta ya se sabe no guía a nadie: molesta.
 */
export function ReportFlow({
  styles, brands, user, nearby, center, bar, preselected,
  onStyleCreated, onBrandCreated, onCancel, onSubmit,
}: {
  styles: BeerStyle[]
  brands: Brand[]
  user: User | null
  /** Bares conocidos con su distancia, para el paso 3. */
  nearby: BarPin[]
  center: google.maps.LatLngLiteral | null
  /** Fijo cuando se entra desde la ficha de un bar; null desde el mapa. */
  bar?: FlowBar
  /**
   * Lo que ya se sabe al entrar. Cada campo presente es un paso que no se
   * pregunta: `{style}` viene del "+" de una marca nueva sobre un estilo que
   * ya está en la ficha, y `{style, brand}` de "Actualizar" sobre una birra
   * concreta. Ojo con la distinción: `brand: null` es "sin marca", una
   * respuesta; ausente es "todavía no se preguntó".
   */
  preselected?: { style?: string; brand?: string | null }
  onStyleCreated: (s: BeerStyle) => void
  onBrandCreated: (b: Brand) => void
  onCancel: () => void
  onSubmit: (r: {
    bar: FlowBar
    styleSlug: string
    brandSlug: string | null
    price: number
    sizeMl: number
  }) => void
}) {
  const brandAnswered = preselected != null && 'brand' in preselected

  const [style, setStyle] = useState<string | undefined>(preselected?.style)
  const [brand, setBrand] = useState<string | null>(preselected?.brand ?? null)
  const [chosenBar, setChosenBar] = useState<FlowBar | undefined>(bar)

  /**
   * Los pasos de ESTA vuelta: sólo los que hay que preguntar.
   *
   * Se calcula una vez, de lo que se sabía al entrar, y no cambia — por eso
   * avanzar y volver es moverse en una lista y nada más. Un paso que aparece
   * o desaparece a mitad de camino haría que "paso 2 de 3" mienta.
   */
  const steps: Step[] = [
    ...(preselected?.style ? [] : ['style' as Step]),
    ...(brandAnswered ? [] : ['brand' as Step]),
    ...(bar ? [] : ['bar' as Step]),
    'price' as Step,
  ]

  const [step, setStep] = useState<Step>(steps[0])
  const [confirmExit, setConfirmExit] = useState(false)
  const stepNumber = steps.indexOf(step) + 1

  /**
   * El alta de bar, adentro del flujo y no en vez del flujo.
   *
   * Antes "El bar no está — agregalo" navegaba a `/agregar`, y eso desmontaba
   * el flujo entero: la flecha de la pantalla de alta te devolvía al mapa con
   * el estilo y la marca ya elegidos perdidos, y había que empezar de cero
   * justo a quien más ganas de cargar tenía. Lo peor es que era silencioso —
   * no avisaba que ir para allá costaba el progreso.
   *
   * Ahora el alta se monta encima, como una capa. La flecha vuelve al paso 3
   * con todo puesto, y si el bar se crea queda elegido y el flujo sigue al
   * monto: el desvío pasó a ser parte del camino.
   */
  const [agregandoBar, setAgregandoBar] = useState(false)

  /**
   * Salir tira lo que se eligió, así que se pregunta — pero sólo si hay algo
   * que tirar. Preguntar en el primer paso, donde no se contestó nada
   * todavía, es un diálogo que sobra: ahí salir es salir.
   */
  const leave = () => {
    if (steps.indexOf(step) === 0) return onCancel()
    setConfirmExit(true)
  }

  const next = () => setStep(steps[Math.min(steps.indexOf(step) + 1, steps.length - 1)])

  const back = () => {
    const i = steps.indexOf(step)
    if (i <= 0) return onCancel()
    setStep(steps[i - 1])
  }

  /**
   * El bar recién elegido desde el alta, con su moneda.
   *
   * `POST /bars` devuelve sólo el id: la moneda la deduce el servidor del país
   * del lugar de Google, así que no la sabemos hasta preguntarla. Y sin moneda
   * el teclado del monto no puede dibujar un símbolo honesto — un número sin
   * unidad no es un precio. Si la consulta falla se usa la de la persona, que
   * es la del lugar donde está y el mejor default que hay.
   */
  const elegirBarNuevo = async (b: { id: number; name: string }) => {
    setAgregandoBar(false)
    let currency = user?.currency ?? 'ARS'
    try { currency = (await api.barDetail(b.id)).currency } catch { /* la de la persona */ }
    setChosenBar({ id: b.id, name: b.name, currency })
    next()
  }

  const styleName = styles.find(s => s.slug === style)?.name
  const brandName = brands.find(b => b.slug === brand)?.name

  // El teclado del monto es la pantalla que ya existía y no cambia: se le pasa
  // la birra y el bar ya resueltos, y muestra arriba lo elegido para que se
  // pueda corregir sin salir.
  if (step === 'price' && chosenBar && style) {
    return (
      <>
      <ReportPrice
        barName={chosenBar.name}
        currency={chosenBar.currency}
        defaultSizeMl={user?.defaultSizeMl ?? 473}
        styleName={styleName ?? style}
        brandName={brandName ?? null}
        onBack={back}
        onCancel={leave}
        onSubmit={(price, sizeMl) => onSubmit({
          bar: chosenBar, styleSlug: style, brandSlug: brand, price, sizeMl,
        })}
      />
      {/* Va también en esta rama: el paso del monto sale por su propio
          `return`, así que un diálogo dibujado sólo abajo no aparecería nunca
          — y es justo acá, con las tres respuestas puestas, donde salir
          cuesta más caro. */}
      {confirmExit && <SalirSinCargar
        onStay={() => setConfirmExit(false)}
        onLeave={() => { setConfirmExit(false); onCancel() }}
      />}
      </>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 70, background: 'var(--base)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
    }}>
      <Header
        step={stepNumber} total={steps.length}
        title={step === 'style' ? '¿Qué tipo de birra?'
          : step === 'brand' ? '¿De qué marca?'
          : '¿En qué bar?'}
        hint={step === 'brand' ? 'Si no la sabés, seguí sin marca.'
          : step === 'bar' ? 'Primero los de acá cerca.'
          : undefined}
        chosen={[
          step !== 'style' ? styleName : null,
          step === 'bar' ? (brandName ?? 'Sin marca') : null,
        ].filter(Boolean) as string[]}
        onBack={back}
      />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingTop: 8 }}>
        {step === 'style' && (
          <StyleChips
            layout="grid"
            styles={styles} value={style} onCreated={onStyleCreated}
            onChange={s => { if (s) { setStyle(s); next() } }}
          />
        )}

        {step === 'brand' && (
          <BrandList
            brands={brands} value={brand}
            onBack={back}
            onPick={slug => { setBrand(slug); next() }}
            onCreated={b => { onBrandCreated(b); setBrand(b.slug); next() }}
          />
        )}

        {step === 'bar' && (
          <div style={{ padding: '0 18px' }}>
            <BarSearchList
              nearby={nearby} center={center}
              onPick={b => {
                setChosenBar({ id: b.id, name: b.name, currency: b.currency })
                next()
              }}
            />

            {/* Acción secundaria, con el vestido de acción secundaria: fondo
                `--info-soft`, borde `--info-border` y texto `--info-bright`.
                Con el borde punteado y el acento se leía como un CTA apagado,
                y esto no es el camino principal — es la salida para cuando el
                bar no está. */}
            <button onClick={() => setAgregandoBar(true)} className="lbl" style={{
              width: '100%', marginTop: 16, padding: 'var(--s-3) var(--s-4)',
              borderRadius: 'var(--r-2)',
              fontSize: 'var(--t-3)', minHeight: 46, textAlign: 'center',
              background: 'var(--info-soft)', color: 'var(--info-bright)',
              border: '1px solid var(--info-border)',
            }}>El bar no está — agregalo</button>
          </div>
        )}
      </div>

      {/* Encima del flujo, no en lugar de él. Ver `agregandoBar`. */}
      {agregandoBar && (
        <AddBarScreen
          embedded
          user={user} center={center}
          onBack={() => setAgregandoBar(false)}
          onAdded={b => { if (b) elegirBarNuevo(b) }}
        />
      )}

      {confirmExit && <SalirSinCargar
        onStay={() => setConfirmExit(false)}
        onLeave={() => { setConfirmExit(false); onCancel() }}
      />}
    </div>
  )
}

/** El aviso de que salir tira lo elegido. Una sola definición, dos ramas. */
function SalirSinCargar({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <Confirm
      title="¿Salir sin cargar el precio?"
      body="Lo que elegiste hasta acá se pierde y hay que empezar de nuevo."
      confirmLabel="Salir"
      onCancel={onStay}
      onConfirm={onLeave}
    />
  )
}

/**
 * El encabezado de cada paso.
 *
 * Lleva el número de paso y, debajo, lo que ya se contestó. Sin eso, tres
 * pantallas seguidas se sienten como un formulario que no termina: ver "IPA ·
 * Antares" arriba es lo que dice que se está avanzando y sobre qué.
 *
 * Lo contestado dejó de ser dos cápsulas y pasó a ser una línea en `--info`.
 * Las cápsulas pesaban lo mismo que un botón —eran lo más marcado de la
 * pantalla— y no son tocables: no eligen nada, cuentan de dónde venís. El azul
 * informativo es exactamente esa voz, y de paso el título vuelve a ser lo
 * primero que se lee.
 */
function Header({ step, total, title, hint, chosen, onBack }: {
  step: number; total: number; title: string
  hint?: string; chosen: string[]; onBack: () => void
}) {
  return (
    <header style={{ padding: '10px 18px var(--s-3)', borderBottom: '1px solid var(--hairline)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
        <h2 className="section-label" style={{ margin: 0 }}>PASO {step} DE {total}</h2>
      </div>

      <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: 'var(--s-4) 0 0' }}>{title}</h1>
      {hint && (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-3)', margin: '4px 0 0' }}>{hint}</p>
      )}

      {chosen.length > 0 && (
        <div className="lbl" style={{
          marginTop: 'var(--s-2)', fontSize: 'var(--t-2)', color: 'var(--info)',
        }}>{chosen.join(' · ')}</div>
      )}
    </header>
  )
}
