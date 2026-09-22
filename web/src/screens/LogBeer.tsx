import { useState } from 'react'
import * as api from '../data/api'
import * as fb from '../data/feedback'
import type { BarPin, BeerStyle, Brand } from '../data/types'
import { formatDistance } from '../data/format'
import { BrandPicker } from '../ui/BrandPicker'
import { Confirm, Sheet } from '../ui/Chrome'
import { SectionLabel } from '../ui/Kit'
import { StyleChips } from '../ui/StyleChips'

/** Más lejos que esto, "¿te la tomaste acá?" deja de ser una pregunta razonable. */
const SUGGEST_RADIUS_M = 250

/**
 * Anotar una birra tomada (BIR-34, con el enganche al bar de BIR-36).
 *
 * Todo viene resuelto de antemano: una birra, en el bar más cercano, ahora.
 * Quien no quiera cambiar nada toca "Anotar" y listo — es la misma idea que
 * "Sigue igual" con los precios. Si anotar cuesta lo mismo que cargar un
 * precio, nadie anota, y un contador que no se usa no cuenta nada.
 *
 * El bar sale de la ubicación, que es el dato que ya está en pantalla: los
 * bares que se ven en el mapa vienen con su distancia calculada. Por eso acá
 * no hay buscador ni una llamada más — se ofrecen los de al lado y se puede
 * no elegir ninguno.
 */
export function LogBeerSheet({
  nearby, styles, brands, onBrandCreated, onStyleCreated, onClose, onDone,
}: {
  /** Bares conocidos, con `distanceMeters` ya calculada. */
  nearby: BarPin[]
  styles: BeerStyle[]
  brands: Brand[]
  onBrandCreated: (b: Brand) => void
  onStyleCreated: (s: BeerStyle) => void
  onClose: () => void
  onDone: (message: string) => void
}) {
  const close = [...nearby]
    .filter(b => b.distanceMeters != null)
    .sort((a, b) => a.distanceMeters! - b.distanceMeters!)
    .slice(0, 6)

  // El más cercano viene elegido, pero sólo si está de verdad cerca: a seis
  // cuadras, preselecionarlo sería ponerle a la persona una respuesta falsa
  // en la boca y ensuciar las birras por bar de un bar donde no estuvo.
  const suggested = close[0]
  const [barId, setBarId] = useState<number | null>(
    suggested && (suggested.distanceMeters ?? Infinity) <= SUGGEST_RADIUS_M
      ? suggested.id : null,
  )
  const [qty, setQty] = useState(1)
  const [detail, setDetail] = useState(false)
  const [style, setStyle] = useState<string | undefined>()
  const [brand, setBrand] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** El mensaje del servidor cuando se llegó al tope del día. */
  const [tope, setTope] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await api.logBeer({
        barId: barId ?? undefined,
        styleSlug: style,
        brandSlug: brand,
        qty,
      })
      fb.exito()
      const donde = close.find(b => b.id === barId)?.name
      onDone(
        qty === 1
          ? `Anotada${donde ? ` en ${donde}` : ''}. ¡Salud!`
          : `${qty} birras anotadas${donde ? ` en ${donde}` : ''}. ¡Salud!`,
      )
    } catch (e) {
      fb.error()
      // El tope diario no se muestra como un error más. Ver `Tope`.
      if (e instanceof api.ApiError && e.code === 'limite_diario') setTope(e.message)
      else setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Sheet title="Me tomé una birra" onClose={onClose}>
      {close.length > 0 && (
        <>
          <SectionLabel>
            {suggested && barId === suggested.id
              ? '¿La birra te la tomaste acá?'
              : '¿Dónde?'}
          </SectionLabel>
          {/* Los bares dejan de ser cápsulas y pasan al segmentado de texto con
              subrayado, que es el mismo vocabulario de "esto está elegido" que
              usan el formato de la pinta y la barra de pestañas. La cápsula
              rellena de hueso pesaba como un CTA y había seis en fila.

              La distancia va abajo y en `--info`: es el dato que decide cuál
              tocar, y el azul es el tono de lo informativo en toda la app.
              Antes iba adentro de la cápsula al 60% de opacidad, o sea escrita
              como si molestara. */}
          <div style={{
            display: 'flex', gap: 'var(--s-4)', overflowX: 'auto',
            scrollbarWidth: 'none', margin: '0 -20px', padding: '0 20px 4px',
          }}>
            {close.map(b => (
              <button key={b.id} onClick={() => setBarId(b.id)}
                className="tab-underline" aria-pressed={barId === b.id}
                style={{ minHeight: 44, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {b.name}
                <span style={{
                  display: 'block', fontSize: 'var(--t-1)', color: 'var(--info)', marginTop: 2,
                }}>
                  {formatDistance(b.distanceMeters)?.replace('a ', '')}
                </span>
                <span className="tab-rule" />
              </button>
            ))}
            {/* No es un vacío: hay birras que no se toman en ningún bar del
                mapa, y obligar a elegir uno haría que se anoten en el de al
                lado. Eso rompe el conteo por bar, que es de lo que se trata. */}
            <button onClick={() => setBarId(null)}
              className="tab-underline" aria-pressed={barId === null}
              style={{ minHeight: 44, flexShrink: 0, whiteSpace: 'nowrap' }}>
              En otro lado
              <span style={{
                display: 'block', fontSize: 'var(--t-1)', color: 'var(--faint)', marginTop: 2,
              }}>sin bar</span>
              <span className="tab-rule" />
            </button>
          </div>
        </>
      )}

      <SectionLabel>¿Cuántas?</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Step label="−" disabled={qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))} />
        <span className="num" style={{ fontSize: 'var(--t-8)', minWidth: 34, textAlign: 'center' }}>
          {qty}
        </span>
        <Step label="+" disabled={qty >= 20} onClick={() => setQty(q => Math.min(20, q + 1))} />
      </div>

      {/* El detalle va plegado: quien quiera anotar cuál era la birra lo
          abre, y quien sólo lleva la cuenta no lo ve nunca.

          En `--info` y no en el acento: es la acción secundaria de la hoja, y
          con el acento en hueso se veía igual de fuerte que "Anotar". */}
      <button onClick={() => setDetail(d => !d)} className="lbl"
        aria-expanded={detail} style={{
          display: 'block', marginTop: 'var(--s-5)', minHeight: 44,
          fontSize: 'var(--t-3)', color: 'var(--info)',
        }}>
        {detail ? 'Listo' : '¿Cuál era? (opcional)'}
      </button>

      {detail && (
        <div style={{ margin: '12px -20px 0' }}>
          <StyleChips
            styles={styles} value={style} onChange={setStyle}
            onCreated={onStyleCreated} allowNone
          />
          <div style={{ padding: '10px 20px 0' }}>
            <BrandPicker
              brands={brands} value={brand} onChange={setBrand} onCreated={onBrandCreated}
            />
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)', margin: '16px 0 0' }}>{error}</p>
      )}

      <button disabled={busy} onClick={submit} className="lbl" style={{
        width: '100%', marginTop: 'var(--s-5)', minHeight: 52,
        borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
        background: busy ? 'var(--elevated)' : 'var(--acento)',
        color: busy ? 'var(--faint)' : 'var(--base)',
      }}>{busy ? '…' : 'Anotar'}</button>

      {tope && <Tope mensaje={tope} onCerrar={() => setTope(null)} />}
    </Sheet>
  )
}

function Step({ label, disabled, onClick }: {
  label: string; disabled: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label === '+' ? 'Una más' : 'Una menos'}
      className="num" style={{
        width: 46, height: 46, borderRadius: '50%', fontSize: 'var(--t-6)',
        // Mismo material que las teclas del monto: `--raised` con filete. Con
        // `--elevated` sin borde eran dos manchas grises al lado del número.
        background: 'var(--raised)', border: '1px solid var(--hairline)',
        color: disabled ? 'var(--faint)' : 'var(--cream)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}>{label}</button>
  )
}

/**
 * El aviso del tope diario.
 *
 * Quince birras en un día es mucho, y el momento en que alguien va por la
 * dieciséis es el único en que la app puede decir algo útil. Así que en vez de
 * un renglón rojo con "límite alcanzado" —que se lee como una traba y se
 * intenta de nuevo mañana— acá se dice qué pasa y dónde pedir ayuda.
 *
 * **El tono está medido a propósito.** No diagnostica a nadie ni lo trata de
 * alcohólico: quien de verdad esté en problemas es exactamente a quien un
 * chiste le cierra la puerta, y quien está de joda no necesita un reto. Dice
 * el hecho, dice el número, y se corre.
 *
 * La 141 es de SEDRONAR: gratis, anónima, todo el día y en todo el país. Se
 * aclara que no hace falta una emergencia porque esa creencia es justamente la
 * que hace que nadie llame a tiempo.
 *
 * Sin botón de cancelar: no es una pregunta.
 */
function Tope({ mensaje, onCerrar }: { mensaje: string; onCerrar: () => void }) {
  return (
    <Confirm
      title="Pará un poco"
      body={<>
        {mensaje} Quince en un mismo día es el tope, y no es un número
        caprichoso: de ahí para arriba ya no es una salida.
        <br /><br />
        Si te está pasando seguido, la <strong>línea 141</strong> es gratis,
        anónima y atiende todo el día en todo el país. No hace falta que sea una
        emergencia para llamar.
      </>}
      confirmLabel="Entendido"
      cancelLabel={null}
      onCancel={onCerrar}
      onConfirm={onCerrar}
    />
  )
}
