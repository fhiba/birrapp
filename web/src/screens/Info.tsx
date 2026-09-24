import { useNavigate } from 'react-router-dom'
import { SectionLabel } from '../ui/Kit'
import { t } from '../i18n'

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
        style={{ background: 'var(--elevated)' }} aria-label={t('comun.volver')}>←</button>

      <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: '24px 0 0' }}>
        {t('Info.titulo')}
      </h1>

      <Section title={t('Info.s1.titulo')}>
        {t('Info.s1.texto')}
      </Section>

      {/* La escala tiene su propia etiqueta y no cuelga del párrafo de arriba:
          es lo único de esta pantalla que hay que poder encontrar de nuevo
          cuando volvés a mirarla. */}
      <SectionLabel>{t('Info.escala')}</SectionLabel>

      <Level color="var(--fresh)" label={t('Info.fresco.titulo')} note={t('Info.fresco.nota')} />
      <Level color="var(--aging)" label={t('Info.viejo.titulo')} note={t('Info.viejo.nota')} />
      <Level color="var(--stale)" label={t('Info.rancio.titulo')} note={t('Info.rancio.nota')} />

      <Section title={t('Info.s2.titulo')}>
        {t('Info.s2.texto')}
      </Section>

      <Section title={t('Info.s3.titulo')}>
        {t('Info.s3.texto')}
      </Section>

      {/* En el mapa conviven DOS codificaciones de color, y esta sección
          existe para que no se confundan: el fondo de la chapita habla de
          plata, el puntito de adentro habla de tiempo.

          Van en este orden porque es el orden en que se los lee: primero el
          color de la chapita, que se ve de lejos, y después el punto, que hay
          que mirar. */}
      <Section title={t('Info.s4.titulo')}>
        {t('Info.s4.texto')}
      </Section>

      <Section title={t('Info.s5.titulo')}>
        {t('Info.s5.texto')}
      </Section>

      {/* La pastilla "barato ●●●● caro" se sacó del mapa —la escala se lee
          sola— pero que el gris NO sea "caro" hay que decirlo en algún lado. */}
      <Section title={t('Info.s6.titulo')}>
        {t('Info.s6.texto')}
      </Section>

      <Section title={t('Info.s7.titulo')}>
        {t('Info.s7.texto')}
      </Section>

      <p style={{
        color: 'var(--faint)', fontSize: 'var(--t-1)', marginTop: 'var(--s-6)',
        lineHeight: 1.5, textWrap: 'pretty',
      }}>
        {t('Info.osm')}
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
