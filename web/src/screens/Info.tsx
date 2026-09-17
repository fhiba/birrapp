import { useNavigate } from 'react-router-dom'
import { SectionLabel } from '../ui/Kit'

/**
 * Explica la regla de frescura. No es relleno: si alguien no entiende por qué
 * un precio más barato no aparece primero, o por qué hay precios en gris, va
 * a pensar que la app está rota.
 */
export function InfoScreen() {
  const nav = useNavigate()
  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 22px 60px`,
    }}>
      <div className="desk-narrow">
      <button onClick={() => nav(-1)} className="icon-btn"
        style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>

      <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: '24px 0 0' }}>
        Cómo funcionan los precios
      </h1>

      <Section title="La antigüedad importa tanto como el precio">
        Con la inflación, un precio de hace dos meses no dice mucho. Por eso birrapp
        nunca muestra un precio sin decirte de cuándo es.
      </Section>

      {/* La escala tiene su propia etiqueta y no cuelga del párrafo de arriba:
          es lo único de esta pantalla que hay que poder encontrar de nuevo
          cuando volvés a mirarla. */}
      <SectionLabel>La escala</SectionLabel>

      <Level color="var(--fresh)" label="Menos de 14 días" note="Confiable." />
      <Level color="var(--aging)" label="Entre 14 y 45 días" note="Probablemente subió un poco." />
      <Level color="var(--stale)" label="Más de 45 días" note="Tomalo como referencia nomás." />

      <Section title="Por qué el más barato no siempre aparece primero">
        Al ordenar por «más barata» se ignoran los precios de más de 45 días. Un precio
        viejo y barato no puede ganarle a uno reciente y honesto: te mandaría a cruzar
        la ciudad por un número que ya no existe.
      </Section>

      <Section title="«Sigue igual» es el botón más útil">
        Confirmar que un precio no cambió lleva un toque y lo vuelve a poner en
        fresco. Si nadie confirma, todo el mapa envejece.
      </Section>

      {/* En el mapa conviven DOS codificaciones de color, y esta sección
          existe para que no se confundan. Hasta la pizarra había una sola —el
          precio— y este párrafo alcanzaba con nombrarla; desde que la cápsula
          lleva el punto de frescura, decir "el color del pin va del más barato
          al más caro" es explicar mal justo el pin que más se mira.

          Van en este orden porque es el orden en que se los encuentra en
          pantalla: primero se ven las chapitas con número, y los puntos
          pelados son lo que queda cuando la etiqueta no entró. */}
      <Section title="El punto de la chapita es la frescura, no el precio">
        La chapita con el precio escrito lleva al lado un punto del color de la
        escala de acá arriba: el número ya dice cuánto sale, así que el color
        dice de cuándo es. Nunca vas a ver un precio sin ese punto.
      </Section>

      <Section title="Los puntos sin número sí van de barato a caro">
        Cuando dos bares quedan tan cerca que las chapitas se taparían, sólo
        una muestra el precio y el resto queda como punto. Ese punto es lo
        único que puede hablar de plata, y va del más barato al más caro según
        lo que tengas en pantalla, así que la escala se reacomoda al moverte.
      </Section>

      {/* La pastilla "barato ●●●● caro" se sacó del mapa —la escala se lee
          sola— pero que el gris NO sea "caro" hay que decirlo en algún lado. */}
      <Section title="Los pines grises no son bares caros">
        Un punto apagado es otra cosa: es un bar al que todavía nadie le cargó
        el precio. No está en el extremo caro de la escala, está afuera de la
        escala.
      </Section>

      <Section title="De dónde salen los bares">
        La base inicial viene de OpenStreetMap, y la comunidad agrega los que faltan.
        Los precios los carga siempre la gente: no hay ninguno estimado ni calculado
        por nosotros.
      </Section>

      <p style={{
        color: 'var(--faint)', fontSize: 'var(--t-1)', marginTop: 'var(--s-6)',
        lineHeight: 1.5, textWrap: 'pretty',
      }}>
        Datos de bares © colaboradores de OpenStreetMap, bajo licencia ODbL.
      </p>
      {/* La versión, acá abajo y en cifra tabular.
          Es el dato que se pide cuando algo anda mal —"¿qué versión tenés?"— y
          hasta ahora sólo estaba en el perfil, que es la pantalla que menos
          tiene que ver con un problema. */}
      <p style={{ margin: 'var(--s-2) 0 0', fontSize: 'var(--t-1)', color: 'var(--faint)' }}>
        birrapp <span className="num" style={{ color: 'var(--faint)' }}>{__APP_VERSION__}</span>
      </p>
      </div>
    </div>
  )
}

/**
 * Un título con su párrafo.
 *
 * El cuerpo pasa de `--muted` a `--cream-soft`: esto es texto para leer de
 * corrido, no un metadato al costado de un dato, y en `--muted` se leía como si
 * fuera menos importante que la fila de precios que vino a explicar. Con
 * `text-wrap: pretty` el navegador evita dejar una palabra sola en el último
 * renglón, que en párrafos cortos como estos pasa casi siempre.
 */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <h2 className="lbl" style={{ fontSize: 'var(--t-4)', margin: 'var(--s-5) 0 var(--s-2)' }}>{title}</h2>
    <p style={{
      color: 'var(--cream-soft)', fontSize: 'var(--t-4)', lineHeight: 1.55, margin: 0,
      textWrap: 'pretty',
    }}>{children}</p>
  </>
)

/**
 * Un escalón de la escala de frescura.
 *
 * El punto de 9px pasa a ser la misma barrita que lleva cada fila de la lista.
 * La leyenda tiene que enseñar la marca que después se ve en pantalla: con un
 * punto acá y una barra allá había que deducir que eran lo mismo.
 */
const Level = ({ color, label, note }: { color: string; label: string; note: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', marginTop: 'var(--s-3)' }}>
    <span className="fresh-bar" aria-hidden style={{ background: color }} />
    <span>
      <span style={{ display: 'block', fontSize: 'var(--t-4)' }}>{label}</span>
      <span style={{ color: 'var(--faint)', fontSize: 'var(--t-2)' }}>{note}</span>
    </span>
  </div>
)
