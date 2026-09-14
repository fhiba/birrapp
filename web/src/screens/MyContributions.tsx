import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as api from '../data/api'
import type { MyComment, MyContributions, MyPhoto, MyPrice } from '../data/types'
import { formatPrice } from '../data/format'
import { Confirm, Toast } from '../ui/Chrome'
import { Empty } from '../ui/Empty'

/** Las cuatro listas, cada una con su pantalla. La ruta es `/mis-aportes/:tipo`. */
type Kind = 'precios' | 'fotos' | 'comentarios' | 'bares'

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

  const load = useCallback(async () => {
    try { setData(await api.myContributions()) }
    catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => { load() }, [load])

  const list = data && data[
    kind === 'precios' ? 'prices' : kind === 'fotos' ? 'photos'
      : kind === 'comentarios' ? 'comments' : 'bars'
  ]
  const count = list?.length ?? null

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 0 60px`,
    }}>
      <div className="desk-narrow">
        <div style={{ padding: '0 18px' }}>
          <button onClick={() => nav(-1)} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: '16px 0 0' }}>
            {TITLE[kind]}
            {count != null && count > 0 && (
              <span className="num" style={{ color: 'var(--faint)', fontSize: 'var(--t-5)' }}>
                {' '}· {count}
              </span>
            )}
          </h1>
          {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>}
        </div>

        {!data && !error && <div className="spinner" style={{ margin: '30px auto' }} />}

        {count === 0 && (
          <Empty
            title={EMPTY[kind].title}
            hint={EMPTY[kind].hint}
            action={EMPTY[kind].action}
            onAction={() => nav(kind === 'bares' ? '/agregar' : '/')}
          />
        )}

        {kind === 'precios' && data?.prices.map(p => (
          <Item
            key={p.id}
            onOpen={() => nav(`/bar/${p.barId}`)}
            onRemove={() => setKillPrice(p)}
            title={`${formatPrice(p.price, p.currency)} · ${p.styleName}`
              + (p.brandName ? ` · ${p.brandName}` : '')}
            sub={`${p.barName}${p.sizeMl !== 473 ? ` · ${p.sizeMl} ml` : ''}`}
            age={p.ageDays}
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
          <Item
            key={c.id}
            onOpen={() => nav(`/bar/${c.barId}`)}
            onRemove={() => setKillComment(c)}
            title={c.brandName ? `${c.styleName} · ${c.brandName}` : c.styleName}
            sub={`${c.barName} — ${c.body}`}
            age={c.ageDays}
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
            color: 'var(--faint)', fontSize: 'var(--t-2)', lineHeight: 1.5, padding: '14px 18px 0',
          }}>
            Los bares no se borran desde acá: pueden tener precios y fotos de otra
            gente, así que borrarlos no deshace tu aporte, borra el de terceros. Si
            uno está mal cargado, reportalo desde el bar.
          </p>
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

function Item({
  title, sub, age, tag, thumb, highlight, onOpen, onRemove,
}: {
  title: string; sub: string; age: number
  tag?: string; thumb?: string; highlight?: boolean
  onOpen: () => void; onRemove?: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderBottom: '1px solid var(--film-2)',
    }}>
      {thumb && (
        <img src={thumb} alt="" loading="lazy" style={{
          width: 44, height: 44, borderRadius: 'var(--r-1)', objectFit: 'cover', flexShrink: 0,
        }} />
      )}
      <button onClick={onOpen} style={{
        flex: 1, textAlign: 'left', minWidth: 0, padding: 0,
      }}>
        <div className="lbl" style={{
          fontSize: 'var(--t-4)', color: highlight ? 'var(--cream)' : 'var(--muted)',
        }}>
          {title}
          {highlight && (
            <span style={{
              marginLeft: 8, padding: '2px 8px', borderRadius: 999, fontSize: 'var(--t-1)',
              background: 'var(--acento-soft)', color: 'var(--acento)',
            }}>vigente</span>
          )}
          {tag && (
            <span style={{ marginLeft: 8, fontSize: 'var(--t-1)', color: 'var(--faint)' }}>{tag}</span>
          )}
        </div>
        <div style={{
          fontSize: 'var(--t-2)', color: 'var(--faint)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {sub} · {age <= 0 ? 'hoy' : age === 1 ? 'ayer' : `hace ${age} d`}
        </div>
      </button>
      {onRemove && (
        <button onClick={onRemove} aria-label="Borrar" className="icon-btn" style={{
          color: 'var(--danger)', background: 'rgba(255,122,102,.1)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 7h12l-1 13H7L6 7Zm3-3h6l1 2H8l1-2Z" />
          </svg>
        </button>
      )}
    </div>
  )
}
