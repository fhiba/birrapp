import { useNavigate } from 'react-router-dom'

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
      <button onClick={() => nav(-1)} style={{
        width: 38, height: 38, borderRadius: '50%', background: 'var(--elevated)',
      }} aria-label="Volver">←</button>

      <h1 className="ttl" style={{ fontSize: 28, margin: '22px 0 0' }}>
        Cómo funcionan los precios
      </h1>

      <Section title="La antigüedad importa tanto como el precio">
        Con la inflación, un precio de hace dos meses no dice mucho. Por eso birrapp
        nunca muestra un precio sin decirte de cuándo es.
      </Section>

      <Level color="var(--fresh)" label="Menos de 14 días" note="Confiable." />
      <Level color="var(--aging)" label="Entre 14 y 45 días" note="Probablemente subió un poco." />
      <Level color="var(--stale)" label="Más de 45 días" note="Tomalo como referencia nomás." />

      <Section title="Por qué el más barato no siempre aparece primero">
        Al ordenar por «más barata» se ignoran los precios de más de 45 días. Un precio
        viejo y barato no puede ganarle a uno reciente y honesto: te mandaría a cruzar
        la ciudad por un número que ya no existe.
      </Section>

      <Section title="«Sigue igual» es el botón más útil">
        Confirmar que un precio no cambió lleva un toque y lo vuelve a poner en verde.
        Si nadie confirma, todo el mapa envejece.
      </Section>

      <Section title="De dónde salen los bares">
        La base inicial viene de OpenStreetMap, y la comunidad agrega los que faltan.
        Los precios los carga siempre la gente: no hay ninguno estimado ni calculado
        por nosotros.
      </Section>

      <p style={{ color: 'var(--faint)', fontSize: 11, marginTop: 30, lineHeight: 1.5 }}>
        Datos de bares © colaboradores de OpenStreetMap, bajo licencia ODbL.
      </p>
    </div>
  )
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <h2 className="lbl" style={{ fontSize: 16, margin: '26px 0 6px' }}>{title}</h2>
    <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.55, margin: 0 }}>{children}</p>
  </>
)

const Level = ({ color, label, note }: { color: string; label: string; note: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
    <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
    <span>
      <span style={{ display: 'block', fontSize: 14 }}>{label}</span>
      <span style={{ color: 'var(--faint)', fontSize: 12 }}>{note}</span>
    </span>
  </div>
)
