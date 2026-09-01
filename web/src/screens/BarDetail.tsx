import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as api from '../data/api'
import type { BarDetail as Bar, BeerStyle, Review, StylePrice, User } from '../data/types'
import { isModerator } from '../data/types'
import { ageLabel, formatDistance, formatPrice, freshnessColor } from '../data/format'
import { Confirm, Toast } from '../ui/Chrome'
import { ReportPrice } from './ReportPrice'

export function BarDetailScreen({
  user, center, styles, onChanged,
}: {
  user: User | null
  center: google.maps.LatLngLiteral | null
  styles: BeerStyle[]
  onChanged: () => void
}) {
  const { id } = useParams()
  const barId = Number(id)
  const nav = useNavigate()

  const [bar, setBar] = useState<Bar | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reporting, setReporting] = useState<{ style?: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    try {
      setBar(await api.barDetail(barId, center?.lat, center?.lng))
      setReviews(await api.reviews(barId).catch(() => []))
    } catch (e) { setError((e as Error).message) }
  }, [barId, center])

  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>, slug?: string) => {
    setBusy(slug ?? '·')
    try { const r = await fn() as { message?: string }; setToast(r?.message ?? 'Listo'); await load() }
    catch (e) { setToast((e as Error).message) }
    finally { setBusy(null) }
  }

  if (error) return (
    <Centered>
      <p style={{ color: 'var(--muted)' }}>{error}</p>
      <button onClick={load} className="lbl" style={{
        marginTop: 12, padding: '10px 18px', borderRadius: 12,
        background: 'var(--amber)', color: 'var(--base)',
      }}>Reintentar</button>
    </Centered>
  )
  if (!bar) return <Centered><div className="spinner" /></Centered>

  const meta = [formatDistance(bar.distanceMeters), bar.neighbourhood, bar.address]
    .filter(Boolean).join(' · ')

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      paddingTop: `calc(10px + var(--safe-top))`, paddingBottom: 40,
    }}>
      <div style={{ padding: '0 18px' }}>
        <button onClick={() => nav(-1)} style={{
          width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,.07)',
        }} aria-label="Volver">←</button>

        <h1 className="ttl" style={{ fontSize: 28, margin: '20px 0 6px' }}>{bar.name}</h1>
        {meta && <p style={{ color: 'var(--faint)', fontSize: 13, margin: 0 }}>{meta}</p>}
        {bar.reviewCount > 0 && bar.avgRating != null && (
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 0' }}>
            ★ {bar.avgRating.toFixed(1)} · {bar.reviewCount} reseñas
          </p>
        )}

        <a
          href={`https://www.google.com/maps/search/?api=1&query=${bar.lat},${bar.lng}`
            + (bar.googlePlaceId ? `&query_place_id=${bar.googlePlaceId}` : '')}
          target="_blank" rel="noreferrer" className="lbl"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16,
            padding: '11px 16px', borderRadius: 12, background: 'var(--elevated)',
            color: 'var(--cream)', textDecoration: 'none', fontSize: 13,
          }}
        >
          <span style={{ color: 'var(--amber)' }}>◈</span> Cómo llegar
        </a>
      </div>

      {bar.prices.length === 0 ? (
        <div style={{ padding: 18 }}>
          <p style={{ color: 'var(--muted)' }}>Todavía nadie cargó precios acá. ¿Los sabés?</p>
          <PrimaryAction
            label="Cargar el primer precio"
            onClick={() => user ? setReporting({}) : nav('/perfil')}
          />
        </div>
      ) : (
        <>
          {bar.prices.map(p => (
            <PriceRow
              key={p.styleSlug} price={p} busy={busy === p.styleSlug}
              isModerator={isModerator(user)}
              onConfirm={() => user
                ? act(() => api.confirmPrice(barId, p.styleSlug), p.styleSlug)
                : nav('/perfil')}
              onUpdate={() => user ? setReporting({ style: p.styleSlug }) : nav('/perfil')}
              onRemove={() => act(() => api.removePrice(p.id), p.styleSlug)}
            />
          ))}
          <div style={{ padding: 18 }}>
            <PrimaryAction label="+  Cargar precio"
              onClick={() => user ? setReporting({}) : nav('/perfil')} />
          </div>
        </>
      )}

      {reviews.length > 0 && (
        <section style={{ padding: '10px 18px' }}>
          <h2 className="lbl" style={{
            fontSize: 11, letterSpacing: '.1em', color: 'var(--faint)', margin: '18px 0 10px',
          }}>RESEÑAS</h2>
          {reviews.map(r => (
            <div key={r.id} style={{ padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--amber)' }}>{'★'.repeat(r.rating)}</span>
                <span style={{ color: 'var(--muted)' }}>{r.authorName}</span>
              </div>
              {r.body && <p style={{ margin: '4px 0 0', fontSize: 14 }}>{r.body}</p>}
            </div>
          ))}
        </section>
      )}

      {isModerator(user) && (
        <section style={{ padding: '28px 18px 0' }}>
          <h2 className="lbl" style={{
            fontSize: 10, letterSpacing: '.12em', color: 'var(--faint)', margin: '0 0 10px',
          }}>MODERACIÓN</h2>
          <button onClick={() => setConfirmDelete(true)} style={{
            display: 'flex', gap: 10, width: '100%', padding: 14, borderRadius: 12,
            background: 'rgba(255,122,102,.12)', textAlign: 'left',
          }}>
            <span style={{ color: 'var(--danger)' }}>🗑</span>
            <span>
              <span className="lbl" style={{ display: 'block', color: 'var(--danger)' }}>
                Eliminar este bar
              </span>
              <span style={{ fontSize: 11, color: 'var(--faint)' }}>
                Se borran también sus precios
              </span>
            </span>
          </button>
        </section>
      )}

      {reporting && (
        <ReportPrice
          styles={styles} preselected={reporting.style} barName={bar.name}
          onCancel={() => setReporting(null)}
          onSubmit={(slug, price, sizeMl) => {
            setReporting(null)
            act(() => api.reportPrice({ barId, styleSlug: slug, price, sizeMl }), slug)
          }}
        />
      )}

      {confirmDelete && (
        <Confirm
          title={`¿Eliminar ${bar.name}?`}
          body={<>
            Se borran el bar y todos sus precios. No se puede deshacer.
            <br /><br />
            Si el bar existe pero está mal cargado, conviene corregirlo en vez de
            borrarlo: los precios son reportes de gente que estuvo ahí.
          </>}
          confirmLabel="Eliminar" danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false)
            try { await api.deleteBar(barId); onChanged(); nav('/') }
            catch (e) { setToast((e as Error).message) }
          }}
        />
      )}

      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

/**
 * Fila de precio. El número es lo más grande y la edad va pegada: nunca uno
 * sin la otra. "Sigue igual" es el botón sólido y "Actualizar" el fantasma —
 * confirmar tiene que costar menos que corregir, o el dataset envejece.
 */
function PriceRow({
  price, busy, isModerator, onConfirm, onUpdate, onRemove,
}: {
  price: StylePrice; busy: boolean; isModerator: boolean
  onConfirm: () => void; onUpdate: () => void; onRemove: () => void
}) {
  const color = freshnessColor(price.freshness)
  const dim = price.freshness === 'stale'
  return (
    <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div className="lbl" style={{
            fontSize: 11, letterSpacing: '.1em', color: 'var(--faint)',
          }}>{price.styleName.toUpperCase()}</div>
          <div className="num" style={{
            fontSize: 30, marginTop: 6, color: dim ? 'var(--faint)' : 'var(--cream)',
          }}>{formatPrice(price.price)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            {ageLabel(price.ageDays, price.freshness)}
          </div>
          {price.sizeMl !== 473 && (
            <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 3 }}>{price.sizeMl} ml</div>
          )}
        </div>
      </div>

      {dim && (
        <p style={{
          margin: '10px 0 0', padding: 10, borderRadius: 10, fontSize: 11,
          background: 'rgba(255,122,102,.1)', color: 'var(--muted)',
        }}>
          Este precio tiene más de 45 días. Con la inflación, tomalo como referencia nomás.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button disabled={busy} onClick={onConfirm} className="lbl" style={{
          flex: 1, padding: 11, borderRadius: 12,
          background: busy ? 'var(--amber-deep)' : 'var(--amber)', color: 'var(--base)',
        }}>{busy ? '…' : 'Sigue igual'}</button>
        <button disabled={busy} onClick={onUpdate} className="lbl" style={{
          padding: '11px 20px', borderRadius: 12, background: 'rgba(255,255,255,.07)',
        }}>Actualizar</button>
        {isModerator && (
          <button disabled={busy} onClick={onRemove} aria-label="Eliminar precio" style={{
            padding: '11px 14px', borderRadius: 12,
            background: 'rgba(255,122,102,.14)', color: 'var(--danger)',
          }}>🗑</button>
        )}
      </div>
    </div>
  )
}

function PrimaryAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="lbl" style={{
      width: '100%', padding: 14, borderRadius: 14, marginTop: 14,
      background: 'var(--amber)', color: 'var(--base)',
    }}>{label}</button>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
      textAlign: 'center', padding: 28,
    }}>{children}</div>
  )
}
