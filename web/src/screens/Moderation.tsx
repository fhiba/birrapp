import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { BarPin, BeerStyle, Brand, Flag, ModeratedPhoto } from '../data/types'
import { Confirm } from '../ui/Chrome'

export function ModerationScreen({ onChanged }: { onChanged: () => void }) {
  const nav = useNavigate()
  const [pending, setPending] = useState<BarPin[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [newBrands, setNewBrands] = useState<Brand[]>([])
  const [newStyles, setNewStyles] = useState<BeerStyle[]>([])
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
          <div className="lbl">{b.name}</div>
          {/* Las coordenadas en cifra tabular: se leen en columna contra las de
              la fila de al lado para ver si alguien cargó el mismo bar dos
              veces, y con cifras proporcionales eso obliga a leerlas. */}
          <div className="num" style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>
            {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
          </div>
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
          <div className="lbl">{b.name}</div>
          <div style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>
            {b.craft ? 'artesanal' : 'industrial'} · {b.slug}
          </div>
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
          <div className="lbl">{st.name}</div>
          <div style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>{st.slug}</div>
          <Acciones>
            <Btn primary onClick={() => act(() => api.approveStyle(st.slug))}>Aprobar</Btn>
            <Btn onClick={() => act(() => api.rejectStyle(st.slug))}>Rechazar</Btn>
          </Acciones>
        </Fila>
      ))}

      {flags.length > 0 && <H>Denuncias abiertas · {flags.length}</H>}
      {flags.map(f => (
        <Fila key={f.id}>
          <div className="lbl" style={{ fontSize: 'var(--t-4)' }}>{f.targetType} #{f.targetId}</div>
          <div style={{ fontSize: 'var(--t-3)', textWrap: 'pretty' }}>{f.reason}</div>
          {f.targetSummary && (
            <div style={{ color: 'var(--faint)', fontSize: 'var(--t-2)' }}>→ {f.targetSummary}</div>
          )}
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
