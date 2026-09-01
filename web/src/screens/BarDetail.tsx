import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as api from '../data/api'
import type {
  BarDetail as Bar, BeerStyle, MyRating, Photo, Review, StylePrice, User,
} from '../data/types'
import { isModerator } from '../data/types'
import { ageLabel, formatDistance, formatPrice, freshnessColor } from '../data/format'
import { Confirm, Toast } from '../ui/Chrome'
import { ReportPrice } from './ReportPrice'
import { PriceHistory } from '../ui/PriceHistory'
import { Stars } from '../ui/Stars'
import { PhotoStrip } from '../ui/PhotoStrip'
import { BeerComments } from '../ui/BeerComments'

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
  const [history, setHistory] = useState<{ slug: string; name: string } | null>(null)
  const [reportingBad, setReportingBad] = useState<StylePrice | null>(null)
  const [modMode, setModMode] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [mine, setMine] = useState<MyRating[]>([])
  const [tab, setTab] = useState<string | null>(null)
  const [comments, setComments] = useState<StylePrice | null>(null)

  const load = useCallback(async () => {
    try {
      setBar(await api.barDetail(barId, center?.lat, center?.lng))
      setReviews(await api.reviews(barId).catch(() => []))
      setPhotos(await api.barPhotos(barId).catch(() => []))
      // Sin sesión no hay votos propios que pintar, y el endpoint pide auth.
      setMine(api.currentUser() ? await api.myRatings(barId).catch(() => []) : [])
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

  // El promedio del bar no se guarda: sale de sus birras, ponderado por
  // cuántos votó cada una. Guardarlo aparte daría dos números que se pueden
  // contradecir, y con el tiempo se contradicen.
  const voted = bar.prices.filter(p => p.ratingAvg != null && p.ratingCount > 0)
  const votes = voted.reduce((n, p) => n + p.ratingCount, 0)
  const barAvg = votes > 0
    ? voted.reduce((n, p) => n + p.ratingAvg! * p.ratingCount, 0) / votes
    : null

  const myRatingOf = (slug: string) =>
    mine.find(m => m.styleSlug === slug)?.rating ?? null

  // La pestaña elegida, o la primera. Se resuelve al vuelo y no en un efecto:
  // si el precio se actualiza y la lista se reordena, un índice guardado
  // apuntaría a otra birra.
  const active = bar.prices.find(p => p.styleSlug === tab) ?? bar.prices[0] ?? null

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      paddingTop: `calc(10px + var(--safe-top))`, paddingBottom: 40,
    }}>
      <div className="desk-narrow">
      <div style={{ padding: '0 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={() => nav(-1)} style={{
            width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,.07)',
          }} aria-label="Volver">←</button>
          <span style={{ flex: 1 }} />
          {isModerator(user) && (
            // Modo moderador: un interruptor, no un menú. Prendido, aparecen
            // todas las herramientas destructivas juntas; apagado, un
            // moderador ve exactamente lo mismo que cualquiera. Así no hay
            // botones de borrar acechando en la vista de todos los días.
            <button
              onClick={() => setModMode(m => !m)}
              aria-label={modMode ? 'Salir del modo moderador' : 'Modo moderador'}
              aria-pressed={modMode}
              style={{
                width: 38, height: 38, borderRadius: '50%',
                display: 'grid', placeItems: 'center',
                background: modMode ? 'var(--amber)' : 'rgba(255,255,255,.07)',
                color: modMode ? 'var(--base)' : 'var(--muted)',
              }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                {modMode ? (
                  <path d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7Zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9Zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                ) : (
                  <path d="M2.4 3.8 3.8 2.4l17.8 17.8-1.4 1.4-3.1-3.1c-1.6.6-3.3 1-5.1 1-5 0-9.3-3.1-11-7a12.4 12.4 0 0 1 4.2-5L2.4 3.8Zm7.1 7.1a2.5 2.5 0 0 0 3.6 3.6l-3.6-3.6ZM12 5c5 0 9.3 3.1 11 7a12.6 12.6 0 0 1-2.9 4l-3-3a4.5 4.5 0 0 0-6.1-6.1L8.6 5.5C9.7 5.2 10.8 5 12 5Z" />
                )}
              </svg>
            </button>
          )}
        </div>

        {modMode && (
          <div style={{
            marginTop: 14, padding: '9px 13px', borderRadius: 11, fontSize: 12,
            background: 'var(--amber-soft)', color: 'var(--amber)',
          }}>
            Modo moderador — las acciones de esta vista no se pueden deshacer
          </div>
        )}

        <h1 className="ttl" style={{ fontSize: 28, margin: '20px 0 6px' }}>{bar.name}</h1>
        {meta && <p style={{ color: 'var(--faint)', fontSize: 13, margin: 0 }}>{meta}</p>}
        {barAvg != null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 0',
          }}>
            <Stars value={barAvg} mine={false} size={16} />
            <span className="num" style={{ fontSize: 15, color: 'var(--cream)' }}>
              {barAvg.toFixed(1)}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>
              {votes === 1 ? '1 voto' : `${votes} votos`}
            </span>
          </div>
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
          {/* Una pestaña por birra en vez de apilarlas todas. Con cinco
              estilos, precio + nota + fotos de cada uno era una pantalla que
              no terminaba nunca; así se ve una birra a la vez y el largo no
              depende de cuántas tenga el bar. */}
          {bar.prices.length > 1 && (
            <div style={{
              display: 'flex', gap: 6, padding: '4px 18px 0',
              overflowX: 'auto', scrollSnapType: 'x proximity',
            }}>
              {bar.prices.map(p => {
                const on = p.styleSlug === active?.styleSlug
                return (
                  <button
                    key={p.styleSlug} onClick={() => setTab(p.styleSlug)}
                    className="lbl" aria-pressed={on}
                    style={{
                      flex: '0 0 auto', scrollSnapAlign: 'start',
                      padding: '9px 14px', borderRadius: 999, fontSize: 13,
                      whiteSpace: 'nowrap',
                      background: on ? 'var(--amber)' : 'rgba(255,255,255,.07)',
                      color: on ? 'var(--base)' : 'var(--muted)',
                    }}
                  >{p.styleName}</button>
                )
              })}
            </div>
          )}

          {active && (
            <>
              <PriceRow
                key={active.styleSlug} price={active} busy={busy === active.styleSlug}
                modMode={modMode}
                onConfirm={() => user
                  ? act(() => api.confirmPrice(barId, active.styleSlug), active.styleSlug)
                  : nav('/perfil')}
                onUpdate={() => user ? setReporting({ style: active.styleSlug }) : nav('/perfil')}
                onRemove={() => act(() => api.removePrice(active.id), active.styleSlug)}
                onHistory={() => setHistory({ slug: active.styleSlug, name: active.styleName })}
                onFlag={() => user ? setReportingBad(active) : nav('/perfil')}
              />

              <div style={{ padding: '14px 18px 4px' }}>
                <BeerRating
                  price={active}
                  myRating={myRatingOf(active.styleSlug)}
                  onOpen={() => setComments(active)}
                />

                <PhotoStrip
                  photos={photos.filter(f => f.styleSlug === active.styleSlug)}
                  canAdd={user != null}
                  onAdd={async file => {
                    await api.uploadPhoto(barId, active.styleSlug, file)
                    setPhotos(await api.barPhotos(barId))
                  }}
                  onOpen={p => window.open(p.url, '_blank', 'noopener')}
                />
              </div>
            </>
          )}

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

      {modMode && (
        <div style={{ padding: '22px 18px 0' }}>
          <button onClick={() => setConfirmDelete(true)} className="lbl" style={{
            width: '100%', padding: 13, borderRadius: 12, fontSize: 13.5,
            background: 'rgba(255,122,102,.12)', color: 'var(--danger)',
          }}>Eliminar este bar y sus precios</button>
        </div>
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

      </div>
      {history && (
        <PriceHistory
          barId={barId} styleSlug={history.slug} styleName={history.name}
          onClose={() => setHistory(null)}
        />
      )}

      {reportingBad && (
        <Confirm
          title="¿Reportar este precio?"
          body={<>
            Vas a avisar que el precio de <strong>{reportingBad.styleName}</strong> está
            mal cargado. Un moderador lo revisa.
            <br /><br />
            Si sólo cambió, es mejor usar <strong>Actualizar</strong>: reportar es
            para precios que nunca fueron ciertos.
          </>}
          confirmLabel="Reportar"
          onCancel={() => setReportingBad(null)}
          onConfirm={async () => {
            const p = reportingBad
            setReportingBad(null)
            try {
              await api.flag({
                targetType: 'price', targetId: p.id,
                reason: `precio incorrecto: ${p.styleName} a ${formatPrice(p.price)}`,
              })
              setToast('Reportado. Gracias, lo revisa un moderador.')
            } catch (e) { setToast((e as Error).message) }
          }}
        />
      )}

      {comments && (
        <BeerComments
          barId={barId}
          styleSlug={comments.styleSlug}
          styleName={comments.styleName}
          canWrite={user != null}
          myRating={myRatingOf(comments.styleSlug)}
          onClose={() => setComments(null)}
          onWrote={load}
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
  price, busy, modMode, onConfirm, onUpdate, onRemove, onHistory, onFlag,
}: {
  price: StylePrice; busy: boolean; modMode: boolean
  onConfirm: () => void; onUpdate: () => void; onRemove: () => void
  onHistory: () => void; onFlag: () => void
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
      </div>

      {/* Acciones secundarias en su propia línea, alineadas a la izquierda.
          Antes iban apretadas contra el borde derecho, debajo de la fecha,
          y competían visualmente con ella. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginTop: 12,
        fontSize: 12, color: 'var(--faint)',
      }}>
        <button onClick={onHistory} style={{ fontSize: 12, color: 'var(--muted)' }}>
          Ver historial
        </button>
        <span>·</span>
        {/* Reportar lo puede usar cualquiera, no sólo moderadores: quien ve
            el precio mal es el que está parado en el bar. */}
        <button onClick={onFlag} style={{ fontSize: 12, color: 'var(--muted)' }}>
          Reportar precio
        </button>
        {modMode && (
          <>
            <span style={{ marginLeft: 'auto' }} />
            <button disabled={busy} onClick={onRemove} style={{
              fontSize: 12, color: 'var(--danger)',
            }}>Eliminar</button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Nota de una birra: estrellas, cuántos votaron y el ícono de comentarios.
 *
 * Las estrellas van en ámbar si ya votaste y en gris si no — de un vistazo se
 * ve dónde falta tu voto. La edad del último voto se muestra por lo mismo que
 * la del precio: una nota vieja sobre una canilla que ya cambió dice menos de
 * lo que aparenta.
 */
function BeerRating({
  price, myRating, onOpen,
}: {
  price: StylePrice; myRating: number | null; onOpen: () => void
}) {
  const mine = myRating != null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Stars value={mine ? myRating : price.ratingAvg} mine={mine} size={19} />

      {price.ratingCount > 0 ? (
        <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>
          {price.ratingAvg!.toFixed(1)} · {price.ratingCount === 1
            ? '1 voto' : `${price.ratingCount} votos`}
          {price.ratingAgeDays != null && price.ratingAgeDays > 45 && ' · sin votos nuevos'}
        </span>
      ) : (
        <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>Sin votos</span>
      )}

      <button onClick={onOpen} aria-label="Ver comentarios" style={{
        marginLeft: 'auto', display: 'grid', placeItems: 'center',
        width: 38, height: 38, borderRadius: '50%',
        background: 'rgba(255,255,255,.07)', color: 'var(--muted)',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        </svg>
      </button>
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
