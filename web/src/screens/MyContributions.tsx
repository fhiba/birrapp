import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as api from '../data/api'
import type {
  ContributionKind, MyComment, MyContributions, MyPhoto, MyPrice,
} from '../data/types'
import { ageColor, formatPrice, shortAge } from '../data/format'
import { Confirm, Toast } from '../ui/Chrome'
import { Empty, SkeletonRows } from '../ui/Empty'

/** Las cuatro listas, cada una con su pantalla. La ruta es `/mis-aportes/:tipo`. */
type Kind = 'precios' | 'fotos' | 'comentarios' | 'bares'

/**
 * El nombre de la ruta es castellano y el de la API inglés, así que hace falta
 * la traducción. Se pide UNA clase (BIR-44): antes la pantalla se bajaba las
 * cuatro listas —hasta ochocientas filas— para dibujar la que se estaba
 * mirando.
 */
const API_KIND: Record<Kind, ContributionKind> = {
  precios: 'prices',
  fotos: 'photos',
  comentarios: 'comments',
  bares: 'bars',
}

/** Pega la página nueva abajo de lo que ya había, sin perder el tipo. */
function append(
  prev: MyContributions, next: MyContributions, k: ContributionKind,
): MyContributions {
  switch (k) {
    case 'bars': return { ...next, bars: [...prev.bars, ...next.bars] }
    case 'prices': return { ...next, prices: [...prev.prices, ...next.prices] }
    case 'photos': return { ...next, photos: [...prev.photos, ...next.photos] }
    case 'comments': return { ...next, comments: [...prev.comments, ...next.comments] }
  }
}

const TITLE: Record<Kind, string> = {
  precios: 'Mis precios',
  fotos: 'Mis fotos',
  comentarios: 'Mis comentarios',
  bares: 'Mis bares',
}

/** Qué decir cuando la lista está vacía, y cuál es el paso siguiente. */
const EMPTY: Record<Kind, { title: string; hint: string; action: string }> = {
  precios: {
    title: 'Todavía no cargaste ningún precio',
    hint: 'Un precio se carga desde el "+" del mapa o desde la ficha del bar. Es lo que mantiene vivo el mapa.',
    action: 'Cargar un precio',
  },
  fotos: {
    title: 'Todavía no subiste ninguna foto',
    hint: 'Las fotos van en la birra, abajo del precio. Se achican en tu teléfono antes de subirse.',
    action: 'Ir al mapa',
  },
  comentarios: {
    title: 'Todavía no escribiste ningún comentario',
    hint: 'Debajo de las fotos de cada birra hay un cuadro para contar cómo estaba.',
    action: 'Ir al mapa',
  },
  bares: {
    title: 'Todavía no agregaste ningún bar',
    hint: 'Si conocés uno que no está en el mapa, cargalo: queda para todos.',
    action: 'Agregar un bar',
  },
}

/**
 * Lo que cargó una persona, de a un tipo por pantalla.
 *
 * Para encontrar algo propio mal cargado había que acordarse en qué bar fue y
 * navegar hasta ahí; con veinte aportes eso deja de funcionar. Antes esto era
 * una sola pantalla con los cuatro tipos apilados, y tenía el problema de
 * siempre de las vistas compartidas: tocabas "Fotos" en el perfil y caías
 * arriba de todo, con los precios por delante. El número que tocaste tiene que
 * ser el que te recibe.
 *
 * La consulta sigue siendo una sola —el endpoint devuelve todo junto— y cada
 * pantalla muestra su parte. Partir el endpoint sería cuatro viajes para el
 * mismo dato.
 *
 * Los bares no se pueden borrar desde acá a propósito: un bar que creaste
 * puede tener precios y fotos de otra gente, así que borrarlo no es deshacer
 * tu aporte sino borrar el de terceros. Para eso está la denuncia, que la
 * revisa un moderador.
 */
export function MyContributionsScreen(
  {
    /**
     * Invalida la caché del mapa. Borrar un reporte propio puede cambiar el pin
     * —si era el precio vigente, el bar pasa a mostrar otro o ninguno—, y sin
     * esto el mapa seguía mostrando un precio que ya no existe. Es el mismo
     * agujero que tenía la ficha del bar (BIR-23).
     */
    onChanged,
  }: { onChanged: () => void },
) {
  const nav = useNavigate()
  const { tipo } = useParams()
  const kind: Kind = (['precios', 'fotos', 'comentarios', 'bares'] as Kind[])
    .includes(tipo as Kind) ? tipo as Kind : 'precios'
  const [data, setData] = useState<MyContributions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [killPrice, setKillPrice] = useState<MyPrice | null>(null)
  const [killPhoto, setKillPhoto] = useState<MyPhoto | null>(null)
  const [killComment, setKillComment] = useState<MyComment | null>(null)

  const [more, setMore] = useState(false)

  const load = useCallback(async () => {
    // Al cambiar de solapa se limpia lo que había: si no, se ven los precios
    // mientras cargan las fotos y parece que la pantalla se equivocó.
    setData(null); setError(null)
    try { setData(await api.myContributions(API_KIND[kind])) }
    catch (e) { setError((e as Error).message) }
  }, [kind])

  useEffect(() => { load() }, [load])

  /** La página siguiente, pegada abajo. */
  const loadMore = async () => {
    if (!data?.nextCursor || more) return
    setMore(true)
    try {
      const next = await api.myContributions(API_KIND[kind], data.nextCursor)
      setData(cur => cur && append(cur, next, API_KIND[kind]))
    } catch (e) { setError((e as Error).message) }
    finally { setMore(false) }
  }

  const list = data && data[API_KIND[kind]]
  const count = list?.length ?? null

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 0 60px`,
    }}>
      <div className="desk-narrow">
        <div style={{ padding: '0 var(--s-4)' }}>
          <button onClick={() => nav(-1)} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: 'var(--s-4) 0 0' }}>
            {TITLE[kind]}
            {count != null && count > 0 && (
              /* Cuántos son va en el tono informativo: es el ámbito de lo que
                 estás mirando, no parte del título. En `--faint` se leía como
                 un título a medio apagar. */
              <span className="num" style={{ color: 'var(--info)', fontSize: 'var(--t-5)' }}>
                {/* El "+" cuando falta una página: con paginación, el número
                    es cuántos se bajaron y no cuántos hay. Decir "30" cuando
                    son ochenta es el mismo pecado que un precio sin su edad. */}
                {' '}· {count}{data?.nextCursor ? '+' : ''}
              </span>
            )}
          </h1>
          {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>}
        </div>

        {/* Esqueleto y no ruedita: ocupa la forma de las filas que vienen, así
            la pantalla no salta cuando llegan y se entiende qué se espera. */}
        {!data && !error && <SkeletonRows rows={5} />}

        {count === 0 && (
          <Empty
            title={EMPTY[kind].title}
            hint={EMPTY[kind].hint}
            action={EMPTY[kind].action}
            onAction={() => nav(kind === 'bares' ? '/agregar' : '/')}
          />
        )}

        {/* El monto sale del título y se va a la derecha, grande y tabular, con
            la edad debajo: es la forma que usa toda la app y es lo que deja
            comparar dos filas de un vistazo en vez de leerlas. */}
        {kind === 'precios' && data?.prices.map(p => (
          <Item
            key={p.id}
            onOpen={() => nav(`/bar/${p.barId}`)}
            onRemove={() => setKillPrice(p)}
            title={p.styleName + (p.brandName ? ` · ${p.brandName}` : '')}
            sub={`${p.barName}${p.sizeMl !== 473 ? ` · ${p.sizeMl} ml` : ''}`}
            age={p.ageDays}
            price={formatPrice(p.price, p.currency)}
            tag={p.isConfirmation ? 'confirmación' : undefined}
            highlight={p.isCurrent}
          />
        ))}

        {kind === 'fotos' && data?.photos.map(f => (
          <Item
            key={f.id}
            onOpen={() => nav(`/bar/${f.barId}`)}
            onRemove={() => setKillPhoto(f)}
            title={f.brandName ? `${f.styleName} · ${f.brandName}` : f.styleName}
            sub={f.barName}
            age={f.ageDays}
            thumb={f.url}
          />
        ))}

        {kind === 'comentarios' && data?.comments.map(c => (
          <Resena
            key={c.id}
            onOpen={() => nav(`/bar/${c.barId}`)}
            onRemove={() => setKillComment(c)}
            c={c}
          />
        ))}

        {kind === 'bares' && data?.bars.map(b => (
          <Item
            key={b.id}
            onOpen={() => nav(`/bar/${b.id}`)}
            title={b.name}
            sub={b.status === 'pending' ? 'Esperando aprobación'
              : b.status === 'rejected' ? 'Rechazado' : 'Publicado'}
            age={b.ageDays}
          />
        ))}

        {kind === 'bares' && data && data.bars.length > 0 && (
          <p style={{
            color: 'var(--faint)', fontSize: 'var(--t-2)', lineHeight: 1.5,
            padding: 'var(--s-4) var(--s-4) 0',
          }}>
            Los bares no se borran desde acá: pueden tener precios y fotos de otra
            gente, así que borrarlos no deshace tu aporte, borra el de terceros. Si
            uno está mal cargado, reportalo desde el bar.
          </p>
        )}

        {/* "Ver más" y no scroll infinito: en una lista de aportes propios uno
            viene a buscar algo puntual, y el scroll infinito le saca el final
            de la pantalla justo cuando quiere saber cuántos lleva. */}
        {data?.nextCursor && (
          <div style={{ padding: 'var(--s-4)' }}>
            {/* El CTA secundario de la pizarra: relleno informativo, borde
                informativo, texto claro. No es la acción principal de la
                pantalla —esa es abrir un aporte— así que no lleva el hueso
                lleno, que acá gritaría más que las propias filas. */}
            <button onClick={loadMore} disabled={more} className="lbl" style={{
              width: '100%', minHeight: 46, borderRadius: 'var(--r-2)',
              fontSize: 'var(--t-3)', background: 'var(--info-soft)',
              border: '1px solid var(--info-border)', color: 'var(--info-bright)',
            }}>{more ? 'Cargando…' : 'Ver más'}</button>
          </div>
        )}
      </div>

      {killPrice && (
        <Confirm
          title="¿Borrar este precio?"
          body={<>
            {killPrice.isCurrent ? (
              <>Es el precio que la app <strong>muestra hoy</strong> para{' '}
              {killPrice.styleName} en {killPrice.barName}. Al borrarlo, queda el
              reporte anterior si lo hay, y si no, el bar se queda sin precio.</>
            ) : (
              <>Es un reporte viejo, así que no cambia lo que se ve hoy: sale del
              historial de {killPrice.styleName} en {killPrice.barName}.</>
            )}
            <br /><br />No se puede deshacer.
          </>}
          confirmLabel="Borrar" danger
          onCancel={() => setKillPrice(null)}
          onConfirm={async () => {
            const p = killPrice
            setKillPrice(null)
            try {
              await api.removeMyPrice(p.id); await load()
              onChanged()
              setToast('Precio borrado')
            }
            catch (e) { setToast((e as Error).message) }
          }}
        />
      )}

      {killPhoto && (
        <Confirm
          title="¿Borrar esta foto?"
          body={<>
            Se borra el archivo, no sólo de la lista. No se puede deshacer.
          </>}
          confirmLabel="Borrar" danger
          onCancel={() => setKillPhoto(null)}
          onConfirm={async () => {
            const f = killPhoto
            setKillPhoto(null)
            try { await api.removeMyPhoto(f.id); await load(); setToast('Foto borrada') }
            catch (e) { setToast((e as Error).message) }
          }}
        />
      )}

      {killComment && (
        <Confirm
          title="¿Borrar este comentario?"
          body={<>
            Se borra sólo el texto. Tu puntaje de esa birra queda como está:
            borrar lo que escribiste no es retirar tu voto.
            <br /><br />No se puede deshacer.
          </>}
          confirmLabel="Borrar" danger
          onCancel={() => setKillComment(null)}
          onConfirm={async () => {
            const c = killComment
            setKillComment(null)
            try {
              await api.removeMyComment(c.id); await load(); setToast('Comentario borrado')
            } catch (e) { setToast((e as Error).message) }
          }}
        />
      )}

      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

/**
 * Una fila de aporte: fila con filete, nunca tarjeta.
 *
 * El cambio de fondo es el precio. Antes iba metido adentro del título —"$ 4.500
 * · IPA · Antares"— y la edad colgaba del pie, mezclada con el nombre del bar.
 * Así, comparar dos precios propios obligaba a leer dos oraciones. Ahora el
 * monto va a la derecha, grande y tabular, con la antigüedad justo debajo y en
 * el color de la frescura: nunca un precio sin su edad al lado, y los dos
 * apilados en la misma columna para que se lean de arriba abajo.
 */
function Item({
  title, sub, age, price, tag, thumb, highlight, onOpen, onRemove,
}: {
  title: string; sub: string; age: number
  /** Ya formateado con su moneda. Sin esto no hay columna derecha. */
  price?: string
  tag?: string; thumb?: string; highlight?: boolean
  onOpen: () => void; onRemove?: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
      padding: 'var(--s-3) var(--s-4)', borderBottom: '1px solid var(--hairline)',
    }}>
      {thumb && (
        <img src={thumb} alt="" loading="lazy" style={{
          width: 44, height: 44, borderRadius: 'var(--r-1)', objectFit: 'cover', flexShrink: 0,
        }} />
      )}
      <button onClick={onOpen} style={{
        flex: 1, textAlign: 'left', minWidth: 0, padding: 0, minHeight: 44,
      }}>
        <div className="lbl" style={{
          fontSize: 'var(--t-4)', color: highlight ? 'var(--cream)' : 'var(--muted)',
        }}>
          {title}
          {/* "Vigente" pasa de cápsula rellena a etiqueta: dice qué es este
              reporte —el que la app muestra hoy—, o sea información, y en la
              pizarra lo informativo es Steel Blue y va en mayúscula chica. */}
          {highlight && (
            <span className="lbl" style={{
              marginLeft: 'var(--s-2)', fontSize: 10, letterSpacing: '.12em',
              textTransform: 'uppercase', color: 'var(--info)',
            }}>vigente</span>
          )}
          {tag && (
            <span style={{
              marginLeft: 'var(--s-2)', fontSize: 'var(--t-1)', color: 'var(--faint)',
            }}>{tag}</span>
          )}
        </div>
        <div style={{
          fontSize: 'var(--t-2)', color: 'var(--faint)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {/* Con precio, la edad vive en la columna de la derecha, debajo del
              monto. Sin precio —una foto, un bar— no hay columna, así que se
              queda acá: la fecha nunca se va del todo. */}
          {sub}{price ? '' : ` · ${shortAge(age)}`}
        </div>
      </button>

      {price && (
        <span style={{ textAlign: 'right', flexShrink: 0 }}>
          {/* El monto sigue la jerarquía del título: el reporte vigente en
              hueso, los viejos apagados. Un precio que ya no es el que la app
              muestra no tiene por qué gritar más que el que sí. */}
          <span className="num" style={{
            display: 'block', fontSize: 'var(--t-5)',
            color: highlight ? 'var(--cream)' : 'var(--muted)',
          }}>
            {price}
          </span>
          <span className="num" style={{
            display: 'block', fontSize: 'var(--t-1)', color: ageColor(age),
          }}>{shortAge(age)}</span>
        </span>
      )}

      {onRemove && <Borrar onClick={onRemove} />}
    </div>
  )
}

/**
 * Un comentario propio.
 *
 * Tiene fila propia y no la genérica porque lo que uno viene a buscar acá es
 * **lo que escribió**, y como pie de una línea con `text-overflow` el texto
 * quedaba cortado en la cuarta palabra. Acá va entero, abajo y en el hueso
 * suave, que es el tono del texto de párrafo.
 *
 * La etiqueta de arriba dice de qué es el comentario. Hoy siempre dice "birra"
 * porque `/auth/me/contributions` devuelve sólo comentarios de birra —las
 * reseñas del lugar viven en la ficha del bar— y decirlo importa igual: sin la
 * etiqueta, quien escribió las dos cosas se queda buscando en esta lista una
 * reseña que nunca estuvo. La distinción es de producto y se mantiene; el día
 * que las del lugar lleguen acá, esa etiqueta va en `--info` y ésta se queda
 * en `--nota`, que es el tono de lo que se puntúa.
 */
function Resena({ c, onOpen, onRemove }: {
  c: MyComment; onOpen: () => void; onRemove: () => void
}) {
  return (
    <div style={{
      padding: 'var(--s-3) var(--s-4)', borderBottom: '1px solid var(--hairline)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        <button onClick={onOpen} className="lbl" style={{
          flex: 1, minWidth: 0, textAlign: 'left', padding: 0, minHeight: 44,
          fontSize: 'var(--t-4)',
        }}>
          <span style={{
            display: 'block', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{c.brandName ? `${c.styleName} · ${c.brandName}` : c.styleName}</span>
          <span style={{
            display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', marginTop: 3,
          }}>
            {/* 10px queda por debajo de `--t-1`, y es a propósito: es una
                etiqueta pegada a su fila, no un texto que se lee solo. */}
            <span className="lbl" style={{
              fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase',
              color: 'var(--nota)',
            }}>birra</span>
            <span style={{ fontSize: 'var(--t-2)', color: 'var(--muted)' }}>{c.barName}</span>
          </span>
        </button>
        <span className="num" style={{
          fontSize: 'var(--t-1)', color: 'var(--faint)', flexShrink: 0,
        }}>{shortAge(c.ageDays)}</span>
        <Borrar onClick={onRemove} />
      </div>
      <p style={{
        fontSize: 'var(--t-3)', lineHeight: 1.5, color: 'var(--cream-soft)',
        margin: 'var(--s-2) 0 0',
      }}>{c.body}</p>
    </div>
  )
}

/** El tacho, igual en las dos filas: una sola pieza, un solo relleno coral. */
const Borrar = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} aria-label="Borrar" className="icon-btn" style={{
    color: 'var(--danger)', background: 'var(--favorito-soft)',
  }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 7h12l-1 13H7L6 7Zm3-3h6l1 2H8l1-2Z" />
    </svg>
  </button>
)
