import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { MyContributions, MyPhoto, MyPrice } from '../data/types'
import { formatPrice } from '../data/format'
import { Confirm, Toast } from '../ui/Chrome'

/**
 * Todo lo que cargó una persona, en un solo lugar.
 *
 * Hasta ahora, para encontrar algo propio mal cargado había que acordarse en
 * qué bar fue y navegar hasta ahí. Con veinte aportes eso deja de funcionar.
 *
 * Los bares no se pueden borrar desde acá a propósito: un bar que creaste
 * puede tener precios y fotos de otra gente, así que borrarlo no es deshacer
 * tu aporte sino borrar el de terceros. Para eso está la denuncia, que la
 * revisa un moderador.
 */
export function MyContributionsScreen() {
  const nav = useNavigate()
  const [data, setData] = useState<MyContributions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [killPrice, setKillPrice] = useState<MyPrice | null>(null)
  const [killPhoto, setKillPhoto] = useState<MyPhoto | null>(null)

  const load = useCallback(async () => {
    try { setData(await api.myContributions()) }
    catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 0 60px`,
    }}>
      <div className="desk-narrow">
        <div style={{ padding: '0 18px' }}>
          <button onClick={() => nav(-1)} style={{
            width: 38, height: 38, borderRadius: '50%', background: 'var(--elevated)',
          }} aria-label="Volver">←</button>
          <h1 className="ttl" style={{ fontSize: 26, margin: '18px 0 0' }}>Mis aportes</h1>
          {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        </div>

        {!data && !error && <div className="spinner" style={{ margin: '30px auto' }} />}

        {data && data.prices.length === 0 && data.bars.length === 0
          && data.photos.length === 0 && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>
            Todavía no cargaste nada.
          </p>
        )}

        {data && data.prices.length > 0 && <H>Precios · {data.prices.length}</H>}
        {data?.prices.map(p => (
          <Item
            key={p.id}
            onOpen={() => nav(`/bar/${p.barId}`)}
            onRemove={() => setKillPrice(p)}
            title={`${formatPrice(p.price)} · ${p.styleName}`
              + (p.brandName ? ` · ${p.brandName}` : '')}
            sub={`${p.barName}${p.sizeMl !== 473 ? ` · ${p.sizeMl} ml` : ''}`}
            age={p.ageDays}
            tag={p.isConfirmation ? 'confirmación' : undefined}
            highlight={p.isCurrent}
          />
        ))}

        {data && data.photos.length > 0 && <H>Fotos · {data.photos.length}</H>}
        {data?.photos.map(f => (
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

        {data && data.bars.length > 0 && <H>Bares · {data.bars.length}</H>}
        {data?.bars.map(b => (
          <Item
            key={b.id}
            onOpen={() => nav(`/bar/${b.id}`)}
            title={b.name}
            sub={b.status === 'pending' ? 'Esperando aprobación'
              : b.status === 'rejected' ? 'Rechazado' : 'Publicado'}
            age={b.ageDays}
          />
        ))}

        {data && data.bars.length > 0 && (
          <p style={{
            color: 'var(--faint)', fontSize: 11.5, lineHeight: 1.5, padding: '14px 18px 0',
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
            try { await api.removeMyPrice(p.id); await load(); setToast('Precio borrado') }
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

      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="lbl" style={{
    fontSize: 11, letterSpacing: '.1em', color: 'var(--faint)',
    margin: '26px 0 8px', padding: '0 18px',
  }}>{children}</h2>
)

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
      padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.06)',
    }}>
      {thumb && (
        <img src={thumb} alt="" loading="lazy" style={{
          width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0,
        }} />
      )}
      <button onClick={onOpen} style={{
        flex: 1, textAlign: 'left', minWidth: 0, padding: 0,
      }}>
        <div className="lbl" style={{
          fontSize: 15, color: highlight ? 'var(--cream)' : 'var(--muted)',
        }}>
          {title}
          {highlight && (
            <span style={{
              marginLeft: 8, padding: '2px 7px', borderRadius: 999, fontSize: 10,
              background: 'var(--amber-soft)', color: 'var(--amber)',
            }}>vigente</span>
          )}
          {tag && (
            <span style={{ marginLeft: 8, fontSize: 10.5, color: 'var(--faint)' }}>{tag}</span>
          )}
        </div>
        <div style={{
          fontSize: 12, color: 'var(--faint)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {sub} · {age <= 0 ? 'hoy' : age === 1 ? 'ayer' : `hace ${age} d`}
        </div>
      </button>
      {onRemove && (
        <button onClick={onRemove} aria-label="Borrar" style={{
          flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
          display: 'grid', placeItems: 'center', color: 'var(--danger)',
          background: 'rgba(255,122,102,.1)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 7h12l-1 13H7L6 7Zm3-3h6l1 2H8l1-2Z" />
          </svg>
        </button>
      )}
    </div>
  )
}
