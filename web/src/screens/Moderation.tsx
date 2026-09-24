import { useCallback, useEffect, useState } from 'react'
import { useLocation as useRoute, useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type {
  Author, Contrib, Flag, ModeratedPhoto, PendingBar, PendingBrand, PendingStyle,
} from '../data/types'
import { formatPrice, shortAge } from '../data/format'
import { Confirm } from '../ui/Chrome'

/**
 * Lo que se está mirando en la ficha. Viaja en el `state` del historial y no
 * en un `useState`: así el botón de atrás del teléfono cierra la ficha en vez
 * de salirse de moderación, que es lo que hace cualquier pantalla que se abre
 * encima de otra. Recargar la deja cerrada, y está bien: la cola es lo que
 * importa, la ficha es una mirada a una fila.
 */
type Sel =
  | { kind: 'bar'; bar: PendingBar }
  | { kind: 'brand'; brand: PendingBrand }
  | { kind: 'style'; style: PendingStyle }
  | { kind: 'flag'; flag: Flag }

const TIPO: Record<string, string> = { bar: 'Bar', price: 'Precio', review: 'Reseña' }

export function ModerationScreen({ onChanged }: { onChanged: () => void }) {
  const nav = useNavigate()
  const route = useRoute()
  const sel = (route.state as { sel?: Sel } | null)?.sel ?? null
  const abrir = (s: Sel) => nav('/moderacion', { state: { sel: s } })
  const [pending, setPending] = useState<PendingBar[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [newBrands, setNewBrands] = useState<PendingBrand[]>([])
  const [newStyles, setNewStyles] = useState<PendingStyle[]>([])
  const [photos, setPhotos] = useState<ModeratedPhoto[]>([])
  const [killPhoto, setKillPhoto] = useState<ModeratedPhoto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [p, f, b, st, ph] = await Promise.all([
        api.pendingBars(), api.openFlags(), api.pendingBrands(), api.pendingStyles(),
        // El repaso de fotos no puede tirar abajo el resto de la pantalla: es
        // lo último que se mira y lo primero que conviene que falle solo.
        api.recentPhotos().catch(() => []),
      ])
      setPending(p); setFlags(f); setNewBrands(b); setNewStyles(st); setPhotos(ph)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); onChanged(); await load() }
    catch (e) { setError((e as Error).message) }
  }

  // Las fotos quedan afuera del contador a propósito: el repaso nunca llega a
  // cero, y un número que siempre está prendido deja de leerse a la semana.
  const total = pending.length + flags.length + newBrands.length + newStyles.length

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 0 60px`,
    }}>
      <div className="desk-narrow">
      <div style={{ padding: '0 18px' }}>
        <button onClick={() => nav(-1)} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--s-3)', margin: 'var(--s-4) 0 0',
        }}>
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: 0 }}>Moderación</h1>
          {!loading && total > 0 && (
            /* En ámbar y no en hueso: el número dice "hay esto esperando", que
               es el mismo estado que marca cada fila de la cola. En el acento
               se leía como un adorno del título. */
            <span className="num" style={{
              minWidth: 24, height: 24, padding: '0 var(--s-2)', borderRadius: 999,
              display: 'grid', placeItems: 'center', fontSize: 'var(--t-2)',
              background: 'var(--aging)', color: 'var(--base)',
            }}>{total}</span>
          )}
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>}

        {/* El dashboard vive detrás de moderación y no en el perfil: es la
            misma llave —hace falta el rol— y quien viene a moderar es quien
            quiere saber si la cuenta que cargó algo raro es de ayer.

            Fila con filete y no tarjeta: es un link a otra pantalla, y en
            tarjeta pesaba lo mismo que un bloque de contenido. El ícono y el
            chevron van en `--info`, que es el tono de lo analítico —el
            dashboard es exactamente eso— y de la acción secundaria. */}
        <button onClick={() => nav('/dashboard')} className="lbl row" style={{
          marginTop: 'var(--s-4)', minHeight: 44, fontSize: 'var(--t-3)',
          color: 'var(--cream)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--info)" aria-hidden>
            <path d="M3 13h4v8H3v-8Zm7-9h4v17h-4V4Zm7 5h4v12h-4V9Z" />
          </svg>
          <span style={{ flex: 1, textAlign: 'left' }}>Usuarios y aportes</span>
          <span aria-hidden style={{ color: 'var(--info)' }}>›</span>
        </button>
      </div>

      {loading && <div className="spinner" style={{ margin: '30px auto' }} />}

      {!loading && pending.length === 0 && flags.length === 0
        && newBrands.length === 0 && newStyles.length === 0 && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 48 }}>
          Nada pendiente. Todo en orden.
        </p>
      )}

      {pending.length > 0 && <H>Bares pendientes · {pending.length}</H>}
      {pending.map(b => (
        <Fila key={b.id}>
          <Abrir onClick={() => abrir({ kind: 'bar', bar: b })}>
            <div className="lbl">{b.name}</div>
            {/* La calle antes que las coordenadas: es lo que contesta si el
                lugar existe. Sin dirección quedan las coordenadas, en cifra
                tabular, que se leen en columna contra las de la fila de al
                lado para ver si alguien cargó el mismo bar dos veces. */}
            {b.address
              ? <div style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>{b.address}</div>
              : (
                <div className="num" style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>
                  {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
                </div>
              )}
            <Firma author={b.author} />
          </Abrir>
          <Acciones>
            <Btn primary onClick={() => act(() => api.approveBar(b.id))}>Aprobar</Btn>
            <Btn onClick={() => act(() => api.rejectBar(b.id))}>Rechazar</Btn>
            <Btn danger onClick={() => act(() => api.deleteBar(b.id))}>Eliminar</Btn>
          </Acciones>
        </Fila>
      ))}

      {/* Marcas nuevas.
          Van arriba de las denuncias porque son lo más barato de resolver y lo
          que más traba a quien las cargó: hasta que se apruebe, la marca la ve
          sólo esa persona. Aprobar es el caso normal —lo que falta en la lista
          es casi siempre una cervecería chica real—; rechazar es para
          duplicados y para nombres que no son una marca. */}
      {newBrands.length > 0 && <H>Marcas nuevas · {newBrands.length}</H>}
      {newBrands.map(b => (
        <Fila key={b.slug}>
          <Abrir onClick={() => abrir({ kind: 'brand', brand: b })}>
            <div className="lbl">{b.name}</div>
            <div style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>
              {b.craft ? 'artesanal' : 'industrial'}
              {b.contrib?.barName && ` · en ${b.contrib.barName}`}
            </div>
            <Firma author={b.author} />
          </Abrir>
          <Acciones>
            <Btn primary onClick={() => act(() => api.approveBrand(b.slug))}>Aprobar</Btn>
            <Btn onClick={() => act(() => api.rejectBrand(b.slug))}>Rechazar</Btn>
          </Acciones>
        </Fila>
      ))}

      {/* Estilos nuevos (BIR-35). Mismo trato que las marcas y por lo mismo:
          hasta que se apruebe, el estilo lo ve sólo quien lo propuso.
          Rechazar no lo borra —puede haber precios colgando— sólo lo saca de
          la lista. */}
      {newStyles.length > 0 && <H>Estilos nuevos · {newStyles.length}</H>}
      {newStyles.map(st => (
        <Fila key={st.slug}>
          <Abrir onClick={() => abrir({ kind: 'style', style: st })}>
            <div className="lbl">{st.name}</div>
            <div style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>
              {st.contrib?.barName ? `en ${st.contrib.barName}` : st.slug}
            </div>
            <Firma author={st.author} />
          </Abrir>
          <Acciones>
            <Btn primary onClick={() => act(() => api.approveStyle(st.slug))}>Aprobar</Btn>
            <Btn onClick={() => act(() => api.rejectStyle(st.slug))}>Rechazar</Btn>
          </Acciones>
        </Fila>
      ))}

      {flags.length > 0 && <H>Denuncias abiertas · {flags.length}</H>}
      {flags.map(f => (
        <Fila key={f.id}>
          <Abrir onClick={() => abrir({ kind: 'flag', flag: f })}>
            {/* El título es qué se quiso cargar y dónde, no "price #42": el id
                no le dice nada a nadie y era todo lo que había. */}
            <div className="lbl" style={{ fontSize: 'var(--t-4)' }}>
              {TIPO[f.targetType] ?? f.targetType}
              {f.contrib?.barName ? ` en ${f.contrib.barName}` : ` #${f.targetId}`}
            </div>
            <div style={{ fontSize: 'var(--t-3)', textWrap: 'pretty' }}>{f.reason}</div>
            {f.targetSummary && (
              <div style={{ color: 'var(--faint)', fontSize: 'var(--t-2)' }}>
                → {f.targetSummary}
              </div>
            )}
            <Firma author={f.author} />
          </Abrir>
          <Acciones>
            {f.targetType === 'price' ? (
              <>
                <Btn primary onClick={() => act(async () => {
                  await api.approvePrice(f.targetId); await api.resolveFlag(f.id)
                })}>Publicar</Btn>
                <Btn onClick={() => act(async () => {
                  await api.removePrice(f.targetId); await api.resolveFlag(f.id)
                })}>Descartar</Btn>
              </>
            ) : (
              <Btn primary onClick={() => act(() => api.resolveFlag(f.id))}>Resolver</Btn>
            )}
          </Acciones>
        </Fila>
      ))}

      {/* Repaso de fotos (BIR-10).
          Va último y sin contador porque no es trabajo pendiente: las fotos se
          publican al subirlas y así se quedan —retenerlas hasta que alguien
          las mire haría que subir una no tenga efecto visible, y nadie sube
          una segunda—. Esto es la pantalla donde mirar lo que entró, que hasta
          ahora no existía: una foto sólo se revisaba si alguien la denunciaba,
          o sea después de que ya pasó por la pantalla de todos. Con los
          pulgares subiendo el premio a subir fotos, esperar la denuncia deja
          de alcanzar. */}
      {photos.length > 0 && <H>Fotos recientes · {photos.length}</H>}
      {photos.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 10, padding: '0 18px',
        }}>
          {photos.map(ph => (
            <div key={ph.id} style={{
              borderRadius: 'var(--r-3)', overflow: 'hidden', background: 'var(--raised)',
            }}>
              <button onClick={() => nav(`/bar/${ph.barId}`)} style={{
                display: 'block', padding: 0, width: '100%', aspectRatio: '1',
              }}>
                <img src={ph.url} alt={ph.beerName} loading="lazy" style={{
                  width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                }} />
              </button>
              <div style={{ padding: 'var(--s-2) 10px 10px' }}>
                {/* La única fila de esta pantalla que no está pendiente: las
                    fotos se publican al subirlas. Va en `--fresh` —el color de
                    lo aprobado— para que se distinga de un vistazo de las colas
                    de arriba, que son todas ámbar. */}
                <div className="lbl" style={{
                  fontSize: 'var(--t-1)', letterSpacing: '.14em',
                  textTransform: 'uppercase', color: 'var(--fresh)',
                }}>Publicada</div>
                <div className="lbl" style={{
                  fontSize: 'var(--t-2)', marginTop: 2,
                }}>{ph.barName}</div>
                <div style={{ color: 'var(--faint)', fontSize: 'var(--t-1)', marginTop: 2 }}>
                  {ph.beerName}
                </div>
                <div style={{ color: 'var(--faint)', fontSize: 'var(--t-1)', marginTop: 2 }}>
                  {/* Quién y hace cuánto: es el contexto que decide. Una foto
                      rara de una cuenta de ayer no es lo mismo que una de
                      alguien que viene cargando precios hace meses. */}
                  {ph.authorName ?? 'sin autor'}
                  {' · '}
                  {ph.ageDays <= 0 ? 'hoy' : ph.ageDays === 1 ? 'ayer' : `hace ${ph.ageDays} d`}
                  {ph.votes > 0 && ` · ${ph.votes} 👍`}
                </div>
                {/* El mismo `Btn danger` que las colas de arriba y no un
                    texto coral suelto: era la única forma distinta de lo
                    destructivo que quedaba en la pantalla, y encima sin área de
                    toque propia. Borrar una foto borra el archivo del bucket. */}
                <div style={{ marginTop: 'var(--s-2)' }}>
                  <Btn danger onClick={() => setKillPhoto(ph)}>Eliminar</Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* La ficha va encima y no en otra ruta: la cola queda montada abajo con
          su scroll donde estaba, que después de resolver diez filas es la
          diferencia entre seguir donde ibas y volver a empezar. */}
      {sel && <Ficha sel={sel} onClose={() => nav(-1)} act={act} />}

      {killPhoto && (
        <Confirm
          title="¿Eliminar esta foto?"
          body={<>
            Se borra el archivo del bucket, no sólo de la lista.
            <br /><br />
            Es distinto de bajar un precio o una reseña: las fotos se sirven
            desde una URL pública, así que mientras el archivo exista cualquiera
            con el link la sigue viendo. Por eso hay que borrarlo, y por eso
            esto no se puede deshacer.
          </>}
          confirmLabel="Eliminar" danger
          onCancel={() => setKillPhoto(null)}
          onConfirm={() => {
            const ph = killPhoto
            setKillPhoto(null)
            act(() => api.removePhoto(ph.id))
          }}
        />
      )}
      </div>
    </div>
  )
}

/* La etiqueta de sección es la misma pieza que en el resto de la app: la
   escribe `.section-label`, y lo único propio de acá es el sangrado, porque
   estas listas van a ancho completo y no adentro de un contenedor con padding.

   Los hijos van tal cual y la mayúscula la pone `text-transform`. Acá adentro
   estaba `String(children).toUpperCase()` y los cinco llamadores pasan dos
   hijos —el texto y el número—, así que `String` caía en
   `Array.prototype.toString`, que une con coma: se leía «BARES PENDIENTES · ,3».
   El `.toUpperCase()` además duplicaba lo que ya hace el CSS. */
const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="section-label" style={{ padding: '0 var(--s-4)' }}>{children}</h2>
)

/**
 * Una fila de la cola, con la barra de estado al costado.
 *
 * Es la misma barrita de 3px que lleva cada bar en la lista, y por la misma
 * razón: dice el estado sin que haya que leer nada. El mapa de colores es el de
 * siempre —ámbar es "esperando", lima es "aprobado", coral es "se va"— así que
 * la cola entera va en `--aging`: todo lo que está acá es trabajo sin hacer.
 *
 * Los otros dos tonos aparecen donde aparece ese estado: `--fresh` en las fotos
 * de abajo, que ya están publicadas, y `--danger` en los botones que eliminan.
 */
const Fila = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    display: 'flex', gap: 'var(--s-3)',
    padding: 'var(--s-3) var(--s-4)', borderBottom: '1px solid var(--hairline)',
  }}>
    <span className="fresh-bar" aria-hidden style={{ background: 'var(--aging)' }} />
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
  </div>
)

/* Los botones de una fila. `wrap` porque con tres acciones de 44px de alto no
   entran en una sola línea en un teléfono angosto, y una acción que se sale de
   la pantalla es una acción que no existe. */
const Acciones = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', marginTop: 'var(--s-3)',
  }}>{children}</div>
)

/**
 * Aprobar, rechazar, eliminar.
 *
 * Sólo lo primario lleva relleno. Lo destructivo pasa de pastilla teñida —que
 * además era un hex suelto— a borde coral: un relleno lo hacía competir con
 * "Aprobar", que es el caso normal, y el botón que borra un bar no tiene que
 * ser el más fácil de apretar de la fila. La confirmación que ya tenía se
 * queda: el borde la anuncia, no la reemplaza.
 *
 * Y suben a 44px de alto. Moderar es apretar botones chicos de a decenas.
 *
 * `.cta` es el hundido al tocar, que inline no se puede escribir. Acá importa
 * más que en ningún lado: cada uno de estos botones dispara un pedido que
 * cambia datos, y sin respuesta al toque en una red lenta se aprieta dos veces
 * —aprobar dos veces el mismo bar, o borrarlo después de aprobarlo—.
 */
const Btn = ({ children, onClick, primary, danger }: {
  children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean
}) => (
  <button onClick={onClick} className="lbl cta" style={{
    minHeight: 44, padding: '0 var(--s-3)', borderRadius: 'var(--r-2)',
    fontSize: 'var(--t-3)',
    background: primary ? 'var(--acento)' : 'transparent',
    border: `1px solid ${primary ? 'var(--acento)'
      : danger ? 'var(--danger)' : 'var(--hairline)'}`,
    color: primary ? 'var(--base)' : danger ? 'var(--danger)' : 'var(--cream)',
  }}>{children}</button>
)

/**
 * El encabezado de una fila, que abre la ficha.
 *
 * Es un botón y no la fila entera: abajo están Aprobar y Rechazar, que son el
 * camino rápido y no tienen que quedar adentro de otra cosa tocable.
 */
const Abrir = ({ onClick, children }: {
  onClick: () => void; children: React.ReactNode
}) => (
  <button onClick={onClick} className="row" style={{ padding: 0, minHeight: 44 }}>
    <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    <span aria-hidden style={{ color: 'var(--info)' }}>›</span>
  </button>
)

/**
 * Quién cargó el aporte, en un renglón.
 *
 * La antigüedad de la cuenta va al lado del nombre porque es la mitad de la
 * decisión: lo mismo cargado por una cuenta de ayer o por alguien que viene
 * aportando hace meses no se mira igual.
 */
const Firma = ({ author }: { author: Author | null }) => (
  <div style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>
    {author
      ? `${author.name} · cuenta de ${shortAge(author.ageDays)}${author.banned ? ' · baneado' : ''}`
      : 'sin autor (la cuenta se borró)'}
  </div>
)

const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

/** Una fila etiqueta/valor de la ficha. */
const Dato = ({ label, value, num }: {
  label: string; value: React.ReactNode; num?: boolean
}) => (
  <div style={{
    display: 'flex', gap: 'var(--s-3)', padding: 'var(--s-2) 0',
    borderBottom: '1px solid var(--hairline)',
  }}>
    <span className="lbl" style={{
      width: 104, flexShrink: 0, color: 'var(--muted)', fontSize: 'var(--t-2)',
    }}>{label}</span>
    <span className={num ? 'num' : undefined} style={{
      flex: 1, minWidth: 0, fontSize: 'var(--t-3)', overflowWrap: 'anywhere',
    }}>{value}</span>
  </div>
)

/** Un link que sale de la app. Se abre aparte: moderar es ir y volver. */
const Fuera = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="lbl cta" style={{
    display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 var(--s-3)',
    borderRadius: 'var(--r-2)', border: '1px solid var(--hairline)',
    fontSize: 'var(--t-3)', color: 'var(--info)', textDecoration: 'none',
  }}>{children}</a>
)

/**
 * Qué se está queriendo hacer, en una frase: "Se quiere cargar $4.500 los 473
 * ml de IPA de Antares en Bar Tal".
 *
 * Es el dato que faltaba en las tres colas que no son bares. Una marca o un
 * estilo nunca se crean solos: se crean en medio de una carga de precio, y sin
 * esa carga a la vista la pregunta "¿apruebo esto?" no tiene con qué
 * contestarse.
 */
const Operacion = ({ verbo, contrib }: { verbo: string; contrib: Contrib | null }) => {
  if (!contrib) {
    return <p style={FRASE}>{verbo} — no quedó registro de la carga que lo trajo.</p>
  }
  const plata = contrib.price != null
    ? `${formatPrice(contrib.price, contrib.currency ?? 'ARS')} los ${contrib.sizeMl} ml`
    : null
  const birra = [contrib.styleName, contrib.brandName].filter(Boolean).join(' de ')
  return (
    <p style={FRASE}>
      {[verbo, plata, birra && `de ${birra}`, contrib.barName && `en ${contrib.barName}`]
        .filter(Boolean).join(' ')}.
    </p>
  )
}

const FRASE = {
  fontSize: 'var(--t-3)', textWrap: 'pretty', color: 'var(--cream)',
  margin: 'var(--s-3) 0 var(--s-4)',
} as const

/** Quién lo cargó, con el link a su perfil para ver el resto de sus aportes. */
const Quien = ({ author }: { author: Author | null }) => {
  const nav = useNavigate()
  if (!author) return <Dato label="Autor" value="sin autor: la cuenta se borró" />
  return (
    <>
      <Dato label="Autor" value={
        <button onClick={() => nav(`/usuario/${author.id}`)} className="lbl" style={{
          padding: 0, color: 'var(--info)', fontSize: 'var(--t-3)',
        }}>{author.name} ›</button>
      } />
      <Dato label="Cuenta" value={
        author.banned
          ? <span style={{ color: 'var(--danger)' }}>baneada · creada {shortAge(author.ageDays)}</span>
          : `creada ${shortAge(author.ageDays)}`
      } />
    </>
  )
}

/**
 * La ficha del aporte: todo lo que hay para decidir, en una pantalla.
 *
 * Existe porque la cola mostraba el nombre y dos coordenadas, y con eso no se
 * puede aprobar nada: había que abrir el dashboard para saber quién lo cargó y
 * el mapa para saber dónde queda. Acá está junto, y los dos links de afuera
 * —Street View y la búsqueda por nombre— son lo que de verdad contesta si el
 * bar existe.
 */
function Ficha({ sel, onClose, act }: {
  sel: Sel
  onClose: () => void
  act: (fn: () => Promise<unknown>) => void
}) {
  // Cerrar primero: la acción recarga la cola y la fila que estás mirando deja
  // de existir.
  const hacer = (fn: () => Promise<unknown>) => { onClose(); act(fn) }

  const titulo = sel.kind === 'bar' ? sel.bar.name
    : sel.kind === 'brand' ? sel.brand.name
      : sel.kind === 'style' ? sel.style.name
        : `${TIPO[sel.flag.targetType] ?? sel.flag.targetType}${
          sel.flag.contrib?.barName ? ` en ${sel.flag.contrib.barName}` : ` #${sel.flag.targetId}`}`

  const seccion = sel.kind === 'bar' ? 'Bar nuevo'
    : sel.kind === 'brand' ? 'Marca nueva'
      : sel.kind === 'style' ? 'Estilo nuevo'
        : 'Denuncia abierta'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, background: 'var(--base)',
      overflowY: 'auto', padding: 'calc(10px + var(--safe-top)) 0 60px',
    }}>
      <div className="desk-narrow" style={{ padding: '0 18px' }}>
        <button onClick={onClose} className="icon-btn" style={{ background: 'var(--elevated)' }}
          aria-label="Volver">←</button>

        <h2 className="section-label" style={{ padding: 0, marginTop: 'var(--s-4)' }}>{seccion}</h2>
        <h1 className="ttl" style={{ fontSize: 'var(--t-6)', margin: 0 }}>{titulo}</h1>

        {sel.kind === 'bar' && <FichaBar bar={sel.bar} hacer={hacer} />}

        {sel.kind === 'brand' && (
          <>
            <Operacion verbo="Se quiere habilitar esta marca. Se creó cargando"
              contrib={sel.brand.contrib} />
            <Dato label="Tipo" value={sel.brand.craft ? 'artesanal' : 'industrial'} />
            <Dato label="Slug" value={sel.brand.slug} />
            <Dato label="Cargada" value={fecha(sel.brand.createdAt)} />
            <Quien author={sel.brand.author} />
            <Acciones>
              <Btn primary onClick={() => hacer(() => api.approveBrand(sel.brand.slug))}>Aprobar</Btn>
              <Btn onClick={() => hacer(() => api.rejectBrand(sel.brand.slug))}>Rechazar</Btn>
            </Acciones>
          </>
        )}

        {sel.kind === 'style' && (
          <>
            <Operacion verbo="Se quiere habilitar este estilo. Se propuso cargando"
              contrib={sel.style.contrib} />
            <Dato label="Slug" value={sel.style.slug} />
            <Dato label="Propuesto" value={fecha(sel.style.contrib?.createdAt)} />
            <Quien author={sel.style.author} />
            <Acciones>
              <Btn primary onClick={() => hacer(() => api.approveStyle(sel.style.slug))}>Aprobar</Btn>
              <Btn onClick={() => hacer(() => api.rejectStyle(sel.style.slug))}>Rechazar</Btn>
            </Acciones>
          </>
        )}

        {sel.kind === 'flag' && <FichaDenuncia flag={sel.flag} hacer={hacer} />}
      </div>
    </div>
  )
}

/**
 * Un bar cargado a mano: todo lo que hay del lugar.
 *
 * Los links de afuera son el punto de la pantalla. Street View contesta la
 * única pregunta que importa —¿hay un bar en esa puerta?— y la búsqueda por
 * nombre encuentra el lugar aunque las coordenadas estén corridas media
 * cuadra, que es lo que pasa cuando alguien marca el pin desde la vereda de
 * enfrente.
 */
function FichaBar({ bar, hacer }: {
  bar: PendingBar; hacer: (fn: () => Promise<unknown>) => void
}) {
  const punto = `${bar.lat},${bar.lng}`
  const busqueda = encodeURIComponent([bar.name, bar.address].filter(Boolean).join(' '))
  return (
    <>
      <p style={FRASE}>
        Se quiere agregar este bar al mapa. Lo cargaron a mano
        {bar.googlePlaceId ? ', pero trae place_id de Google' : ', sin pasar por el buscador de Google'}.
      </p>
      <Dato label="Dirección" value={bar.address ?? 'no cargó ninguna'} />
      <Dato label="Barrio" value={bar.neighbourhood ?? '—'} />
      <Dato label="Coordenadas" num value={`${bar.lat.toFixed(6)}, ${bar.lng.toFixed(6)}`} />
      <Dato label="País" value={`${bar.countryCode ?? '—'} · precios en ${bar.currency}`} />
      <Dato label="Place ID" value={bar.googlePlaceId ?? 'no vino del buscador'} />
      <Dato label="Cargado" value={fecha(bar.createdAt)} />
      <Quien author={bar.author} />

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', margin: 'var(--s-4) 0',
      }}>
        <Fuera href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${punto}`}>
          Street View
        </Fuera>
        <Fuera href={`https://www.google.com/maps/search/?api=1&query=${punto}`}>
          Ver el punto
        </Fuera>
        <Fuera href={`https://www.google.com/maps/search/?api=1&query=${busqueda}`}>
          Buscar por nombre
        </Fuera>
      </div>

      <Acciones>
        <Btn primary onClick={() => hacer(() => api.approveBar(bar.id))}>Aprobar</Btn>
        <Btn onClick={() => hacer(() => api.rejectBar(bar.id))}>Rechazar</Btn>
        <Btn danger onClick={() => hacer(() => api.deleteBar(bar.id))}>Eliminar</Btn>
      </Acciones>
    </>
  )
}

/**
 * Una denuncia, con el aporte denunciado entero.
 *
 * Ojo con los dos nombres: el autor cargó el contenido, el denunciante lo
 * marcó. En los precios retenidos por outlier son la misma persona, porque la
 * denuncia la escribe el servidor solo al recibir la carga.
 */
function FichaDenuncia({ flag, hacer }: {
  flag: Flag; hacer: (fn: () => Promise<unknown>) => void
}) {
  const nav = useNavigate()
  const esPrecio = flag.targetType === 'price'
  return (
    <>
      <Operacion
        verbo={esPrecio ? 'Se quiere cargar' : 'Se denunció lo cargado'}
        contrib={flag.contrib}
      />
      <Dato label="Motivo" value={flag.reason} />
      <Dato label="Denunció" value={flag.reporterName ?? 'el servidor (automático)'} />
      <Dato label="Denunciado" value={fecha(flag.createdAt)} />
      {flag.targetSummary && <Dato label="Contenido" value={flag.targetSummary} />}
      <Dato label="Referencia" num value={`${flag.targetType} #${flag.targetId}`} />
      <Quien author={flag.author} />

      {flag.contrib?.barId != null && (
        <div style={{ margin: 'var(--s-4) 0' }}>
          <Btn onClick={() => nav(`/bar/${flag.contrib!.barId}`)}>Abrir el bar ›</Btn>
        </div>
      )}

      <Acciones>
        {esPrecio ? (
          <>
            <Btn primary onClick={() => hacer(async () => {
              await api.approvePrice(flag.targetId); await api.resolveFlag(flag.id)
            })}>Publicar</Btn>
            <Btn onClick={() => hacer(async () => {
              await api.removePrice(flag.targetId); await api.resolveFlag(flag.id)
            })}>Descartar</Btn>
          </>
        ) : (
          <Btn primary onClick={() => hacer(() => api.resolveFlag(flag.id))}>Resolver</Btn>
        )}
      </Acciones>
    </>
  )
}
