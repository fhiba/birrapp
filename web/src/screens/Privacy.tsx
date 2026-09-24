import { useNavigate } from 'react-router-dom'
import { SectionLabel } from '../ui/Kit'

/**
 * La política de privacidad (BIR-15).
 *
 * ## Por qué existe y por qué es una pantalla y no un PDF
 *
 * Play y App Store no publican una app con cuentas sin una política accesible
 * por URL. Podría ser un documento subido a cualquier lado, pero entonces sería
 * un texto que envejece aparte del código que describe: se agrega una tabla, se
 * suma un servicio, y el PDF sigue diciendo lo de antes. Acá vive al lado de lo
 * que cuenta, en la misma ruta que lee la gente y la que se pega en la ficha de
 * la tienda: `/privacidad`.
 *
 * ## Cómo se escribió
 *
 * Mirando el esquema y el código, no una plantilla. Cada afirmación de esta
 * pantalla sale de un lugar concreto:
 *
 * - lo que se guarda de la cuenta → `users` (V1, V16, V20, V21)
 * - lo que se borra al borrar la cuenta → `Users.deleteAccount`
 * - el conteo de visitas → `traffic_sessions` y `pingTraffic`
 * - el EXIF de las fotos → `data/image.ts`, que recodifica en canvas
 * - los bares → OpenStreetMap, y nada de Google Places guardado (AGENTS.md)
 *
 * **Si cambia alguna de esas cosas, esta pantalla miente.** Es el costo de
 * escribirla con datos en vez de con generalidades, y vale la pena: una
 * política que dice "podemos recolectar información de uso" no le sirve a nadie
 * para decidir si entra.
 */

/**
 * El medio de contacto publicado.
 *
 * Va vacío a propósito: la dirección la elige Felipe (BIR-7) y publicar un mail
 * personal en una página que va a leer cualquiera es una decisión suya, no una
 * que tome el código. **Sin esto la política no se puede publicar**: Play pide
 * un canal de contacto y un texto que no dice a dónde escribir no cumple.
 *
 * Mientras esté vacío la pantalla lo dice en ámbar, a la vista. La alternativa
 * —omitir la sección— dejaba una política que parece completa y no lo está, que
 * es justo la forma de que esto se publique roto sin que nadie se entere.
 */
const CONTACTO = ''

/** Última vez que cambió el texto. Se actualiza a mano al tocarlo. */
const VIGENCIA = '21 de septiembre de 2026'

export function PrivacyScreen() {
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
        Privacidad
      </h1>
      <p style={{
        color: 'var(--faint)', fontSize: 'var(--t-2)', margin: 'var(--s-2) 0 0',
      }}>
        En vigencia desde el {VIGENCIA}.
      </p>

      <Section title="El resumen">
        birrapp es un mapa de precios de la pinta. Para mirarlo no hace falta
        cuenta ni dar nada. Si te hacés una cuenta es para poder aportar, y lo
        que se guarda es lo mínimo para que tus aportes sean tuyos: quién los
        cargó y cómo te llamás. No vendemos datos, no hay publicidad y no te
        seguimos por otras apps ni por otros sitios.
      </Section>

      <SectionLabel>Qué se guarda</SectionLabel>

      <Section title="De tu cuenta">
        Entrar es con Google, y de ahí se guarda el identificador que Google nos
        da para vos, tu mail, tu nombre y la foto de esa cuenta. Después, lo que
        elijas vos: un alias público —opcional; sin alias no aparecés en la
        página de colaboradores—, tu moneda, el radio y el tamaño de pinta con
        los que abrís la app, y tus estilos y marcas preferidas. Nunca vemos tu
        contraseña de Google: el que la pide es Google.
      </Section>

      <Section title="De lo que cargás">
        Los precios, las confirmaciones de "sigue igual", las puntuaciones, los
        comentarios, las fotos, los bares nuevos y las denuncias. Todo eso es
        público —es el mapa— y queda asociado a tu cuenta. Los precios además no
        se editan nunca: cada reporte es una fila nueva con su fecha, que es lo
        que hace que se pueda mostrar la antigüedad al lado del número.
      </Section>

      <Section title="De las birras que anotás">
        El contador de birras es tuyo y no se publica: no aparece en el mapa ni
        en el perfil que ve otra persona. Lo usamos para mostrarte tu cuenta, tu
        racha y tu nivel, y nada más.
      </Section>

      <Section title="De tu ubicación">
        Si le das permiso al navegador, tu ubicación se usa para buscar los bares
        de alrededor y para ordenar por distancia. El punto desde el que se
        busca viaja al servidor en cada consulta —sin eso no hay forma de
        contestarla— y queda un rato en el registro técnico del servidor junto
        con la dirección IP, que es lo que cualquier servidor anota de cualquier
        pedido. No se guarda asociado a tu cuenta, no se comparte y no se usa
        para nada más que contestar la consulta y diagnosticar fallas.
      </Section>

      <Section title="De tus fotos">
        Las fotos se achican en tu teléfono antes de subirse, y al recodificarlas
        se pierde el EXIF: las coordenadas de dónde sacaste la foto nunca salen
        de tu teléfono. La imagen queda guardada en Cloudflare R2 y se sirve por
        una dirección pública, como cualquier foto de la app.
      </Section>

      <Section title="En tu teléfono">
        Tu sesión, el orden que elegiste para la lista, si ya viste el tutorial y
        un identificador al azar para contar visitas. Todo eso vive en el
        almacenamiento del navegador, no en nuestra base, y se va si borrás los
        datos del sitio.
      </Section>

      <SectionLabel>Qué no se hace</SectionLabel>

      <Section title="No se vende ni se comparte para publicidad">
        No hay avisos en birrapp y no hay nadie comprando estos datos. Lo único
        que se comparte es lo que hace falta para que la app funcione, y está
        listado más abajo.
      </Section>

      <Section title="No se guardan datos de Google Places">
        Los bares salen de OpenStreetMap. Google se usa para el mapa y para
        entrar, pero sus datos de lugares no se guardan en nuestra base: sus
        términos no lo permiten más allá de 30 días, y preferimos no depender de
        eso.
      </Section>

      <Section title="No se mide quién hace qué">
        El conteo de visitas usa un identificador al azar guardado en tu
        teléfono, un renglón por día, y anota si la visita tenía sesión o no
        —pero no cuál—. No arma un historial tuyo ni se cruza con tu cuenta.
      </Section>

      <SectionLabel>Quién más ve algo</SectionLabel>

      <Tercero nombre="Google" que="Inicio de sesión y el mapa. Google ve que entraste a birrapp y, por el mapa, los pedidos que hace tu navegador a sus servidores." />
      <Tercero nombre="Cloudflare (R2)" que="Guarda las fotos y los avatares. Se sirven por una dirección pública." />
      <Tercero nombre="Vercel" que="Sirve la app web y cuenta visitas de forma agregada, sin cookies y sin identificarte." />
      <Tercero nombre="OpenStreetMap" que="De ahí salen los bares. No recibe nada tuyo: los datos vienen de ellos, no van." />

      <SectionLabel>Lo tuyo</SectionLabel>

      <Section title="Borrar la cuenta">
        Está en Configuración, adentro de la app, y no hay que pedirlo por mail.
        Se borran tu cuenta, tu mail, tu nombre, tu alias, tu foto de perfil, tus
        fotos subidas, tus puntuaciones, tus comentarios, tus favoritos, tu
        contador de birras y tus sesiones.
      </Section>

      <Section title="Lo que queda cuando borrás la cuenta">
        Los precios que cargaste no se borran: son observaciones sobre un bar, no
        datos tuyos, y borrarlos dejaría el mapa peor para todos. Lo que se hace
        es despegarlos de vos — dejan de estar asociados a ninguna cuenta, así
        que ya no se puede saber quién los cargó.
      </Section>

      <Section title="Pedir una copia o una corrección">
        Escribinos y te la damos. Lo mismo si querés corregir algo tuyo y no
        encontrás dónde hacerlo desde la app.
      </Section>

      <Section title="Menores">
        birrapp es sobre cerveza: es para mayores de 18 años. No pedimos la edad
        ni la guardamos, así que tampoco la usamos para nada.
      </Section>

      <SectionLabel>Contacto</SectionLabel>

      {CONTACTO ? (
        <Section title="Dónde escribir">
          Por cualquier cosa de esta política, o para ejercer cualquiera de las
          cosas de acá arriba: <a href={`mailto:${CONTACTO}`}
            style={{ color: 'var(--info-bright)' }}>{CONTACTO}</a>.
        </Section>
      ) : (
        /* Ver el comentario de `CONTACTO`. Esto es un cartel para nosotros, no
           para quien lee: si aparece publicado, la política está incompleta. */
        <p style={{
          margin: 'var(--s-4) 0 0', padding: 'var(--s-3)',
          borderRadius: 'var(--r-2)', border: '1px dashed var(--aging)',
          color: 'var(--aging)', fontSize: 'var(--t-3)', lineHeight: 1.5,
        }}>
          Falta publicar el medio de contacto. Hasta que esté, esta política no
          cumple con lo que pide Play y no se puede mandar a revisión.
        </p>
      )}

      <Section title="Si esto cambia">
        Cuando cambie lo que se guarda, cambia esta pantalla y se mueve la fecha
        de arriba. Los cambios que te den menos privacidad que hoy se avisan
        adentro de la app, no se cuelan en un renglón.
      </Section>

      <p style={{
        color: 'var(--faint)', fontSize: 'var(--t-1)', marginTop: 'var(--s-6)',
        lineHeight: 1.5, textWrap: 'pretty',
      }}>
        Datos de bares © colaboradores de OpenStreetMap, bajo licencia ODbL.
      </p>
      <p style={{ margin: 'var(--s-2) 0 0', fontSize: 'var(--t-1)', color: 'var(--faint)' }}>
        birrapp <span className="num" style={{ color: 'var(--faint)' }}>{__APP_VERSION__}</span>
      </p>
      </div>
    </div>
  )
}

/** Mismo par título + párrafo que `InfoScreen`: es la misma clase de página. */
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
 * Un tercero y qué hace.
 *
 * En filas con filete y no en párrafos: es una lista que se consulta —"¿quién
 * tiene mis fotos?"— y en prosa hay que leerla entera para contestar eso.
 */
const Tercero = ({ nombre, que }: { nombre: string; que: string }) => (
  <div style={{
    padding: 'var(--s-3) 0', borderBottom: '1px solid var(--hairline)',
  }}>
    <div className="lbl" style={{ fontSize: 'var(--t-3)' }}>{nombre}</div>
    <div style={{
      color: 'var(--muted)', fontSize: 'var(--t-3)', lineHeight: 1.5,
      marginTop: 2, textWrap: 'pretty',
    }}>{que}</div>
  </div>
)
