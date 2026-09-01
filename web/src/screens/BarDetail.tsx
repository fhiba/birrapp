import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [comments, setComments] = useState<{ price: StylePrice; initial?: number } | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [confirmPhoto, setConfirmPhoto] = useState<Photo | null>(null)
  const [confirmPrice, setConfirmPrice] = useState<StylePrice | null>(null)

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

  // El promedio del bar no se guarda: sale de sus birras. Guardarlo aparte
  // daría dos números que se pueden contradecir, y con el tiempo se
  // contradicen.
  //
  // Dos cosas que lo definen:
  //
  // 1. Sólo entran las birras votadas. Una birra sin nota NO es un cero: es
  //    ausencia de dato, y meterla como cero hundiría el promedio de un bar
  //    por tener una birra que nadie probó todavía.
  //
  // 2. Va `ratingRaw`, el promedio real, y no `ratingAvg`. El segundo lleva
  //    shrinkage hacia un prior de 3,5 y sirve para ordenar; usado acá hacía
  //    que un único voto de 5 mostrara 3,8 —el 5 promediado contra el prior,
  //    no contra un cero—. Es el mismo error que ya se había corregido en la
  //    nota de cada birra y que acá quedó sin corregir.
  //
  // La ponderación por cantidad de votos sí se queda: una birra con treinta
  // votos tiene que pesar más que una con uno.
  const voted = bar.prices.filter(p => p.ratingRaw != null && p.ratingCount > 0)
  const votes = voted.reduce((n, p) => n + p.ratingCount, 0)
  const barAvg = votes > 0
    ? voted.reduce((n, p) => n + p.ratingRaw! * p.ratingCount, 0) / votes
    : null

  const myRatingOf = (slug: string) =>
    mine.find(m => m.styleSlug === slug)?.rating ?? null

  // La pestaña elegida, o la primera. Se resuelve al vuelo y no en un efecto:
  // si el precio se actualiza y la lista se reordena, un índice guardado
  // apuntaría a otra birra.
  const active = bar.prices.find(p => p.styleSlug === tab) ?? bar.prices[0] ?? null
  const stylePhotos = photos.filter(f => f.styleSlug === active?.styleSlug)

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

        {/* El enlace va acá y no abajo: pegado a las pestañas quedaba
            separando el nombre del bar de sus birras, que es lo que se viene
            a mirar. Al lado del nombre es donde se lo busca. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '20px 0 6px' }}>
          <h1 className="ttl" style={{ fontSize: 28, margin: 0, flex: 1, minWidth: 0 }}>
            {bar.name}
          </h1>

          {/* La nota del bar, a la altura del nombre.
              Va con una sola estrella y no con las cinco: acá compite por
              ancho con el nombre y con el enlace al mapa, y cinco estrellas
              de 16px se comen media línea. El desglose de cinco estrellas
              vive en cada birra, que es donde se puntúa. */}
          {barAvg != null && (
            <div style={{ flexShrink: 0, textAlign: 'right', marginTop: 4 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end',
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24"
                  fill="var(--amber)" aria-hidden>
                  <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z" />
                </svg>
                <span className="num" style={{ fontSize: 17, color: 'var(--cream)' }}>
                  {barAvg.toFixed(1)}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 1 }}>
                {votes === 1 ? '1 voto' : `${votes} votos`}
              </div>
            </div>
          )}

          <a
            href={`https://www.google.com/maps/search/?api=1&query=${bar.lat},${bar.lng}`
              + (bar.googlePlaceId ? `&query_place_id=${bar.googlePlaceId}` : '')}
            target="_blank" rel="noreferrer" aria-label="Cómo llegar"
            style={{
              flexShrink: 0, width: 42, height: 42, borderRadius: '50%',
              display: 'grid', placeItems: 'center', marginTop: 2,
              background: 'var(--elevated)', color: 'var(--amber)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
            </svg>
          </a>
        </div>
        {meta && <p style={{ color: 'var(--faint)', fontSize: 13, margin: 0 }}>{meta}</p>}

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
          {/* La fila se muestra incluso con una sola birra: es donde vive el
              "+", y un control que aparece y desaparece según cuántas haya es
              un control que no se encuentra cuando se lo necesita. */}
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

            {/* Última posición de la lista: es donde se agrega otra, como las
                solapas de un navegador. Antes esto era un botón ancho abajo
                que decía "Cargar precio", y con precios ya cargados eso
                describía mal lo que hace: no carga *el* precio, agrega otra
                birra. */}
            <button
              onClick={() => user ? setReporting({}) : nav('/perfil')}
              className="lbl" aria-label="Cargar otra birra"
              style={{
                flex: '0 0 auto', scrollSnapAlign: 'start',
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 999, fontSize: 13,
                whiteSpace: 'nowrap', color: 'var(--amber)',
                border: '1px dashed rgba(255,182,39,.45)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 5v14M5 12h14" stroke="currentColor"
                  strokeWidth="2.6" strokeLinecap="round" />
              </svg>
              Otra birra
            </button>
          </div>

          {active && (
            <>
              <PriceRow
                key={active.styleSlug} price={active} busy={busy === active.styleSlug}
                modMode={modMode}
                onConfirm={() => user
                  ? act(() => api.confirmPrice(barId, active.styleSlug), active.styleSlug)
                  : nav('/perfil')}
                onUpdate={() => user ? setReporting({ style: active.styleSlug }) : nav('/perfil')}
                onRemove={() => setConfirmPrice(active)}
                onHistory={() => setHistory({ slug: active.styleSlug, name: active.styleName })}
                onFlag={() => user ? setReportingBad(active) : nav('/perfil')}
              />

              <div style={{ padding: '14px 18px 4px' }}>
                <BeerRating
                  price={active}
                  myRating={myRatingOf(active.styleSlug)}
                  onOpen={n => setComments({ price: active, initial: n })}
                />

                <PhotoStrip
                  photos={stylePhotos}
                  canAdd={user != null}
                  onAdd={async file => {
                    await api.uploadPhoto(barId, active.styleSlug, file)
                    setPhotos(await api.barPhotos(barId))
                  }}
                  onOpen={setViewing}
                />
              </div>
            </>
          )}

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
              // Reportar sólo se ofrece desde la fila con precio, así que
              // acá no puede ser null.
              await api.flag({
                targetType: 'price', targetId: p.id!,
                reason: `precio incorrecto: ${p.styleName} a ${formatPrice(p.price!)}`,
              })
              setToast('Reportado. Gracias, lo revisa un moderador.')
            } catch (e) { setToast((e as Error).message) }
          }}
        />
      )}

      {comments && (
        <BeerComments
          barId={barId}
          styleSlug={comments.price.styleSlug}
          styleName={comments.price.styleName}
          canWrite={user != null}
          modMode={modMode}
          myRating={myRatingOf(comments.price.styleSlug)}
          initialRating={comments.initial}
          onClose={() => setComments(null)}
          onWrote={load}
        />
      )}

      {viewing != null && (
        <PhotoViewer
          photos={stylePhotos} start={viewing} modMode={modMode}
          onClose={() => setViewing(null)}
          onRemove={p => { setViewing(null); setConfirmPhoto(p) }}
        />
      )}

      {confirmPhoto && (
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
          onCancel={() => setConfirmPhoto(null)}
          onConfirm={async () => {
            const p = confirmPhoto
            setConfirmPhoto(null)
            try {
              await api.removePhoto(p.id)
              setPhotos(await api.barPhotos(barId))
              setToast('Foto eliminada')
            } catch (e) { setToast((e as Error).message) }
          }}
        />
      )}

      {confirmPrice && (
        <Confirm
          title={`¿Eliminar el precio de ${confirmPrice.styleName}?`}
          body={<>
            Se baja el reporte vigente de <strong>{confirmPrice.styleName}</strong> a{' '}
            {formatPrice(confirmPrice.price!)}. No se puede deshacer.
            <br /><br />
            Las notas y las fotos de esta birra no se tocan: la birra sigue en la
            lista, sin precio, hasta que alguien cargue uno nuevo.
          </>}
          confirmLabel="Eliminar" danger
          onCancel={() => setConfirmPrice(null)}
          onConfirm={() => {
            const p = confirmPrice
            setConfirmPrice(null)
            act(() => api.removePrice(p.id!), p.styleSlug)
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
  price, busy, modMode, onConfirm, onUpdate, onRemove, onHistory, onFlag,
}: {
  price: StylePrice; busy: boolean; modMode: boolean
  onConfirm: () => void; onUpdate: () => void; onRemove: () => void
  onHistory: () => void; onFlag: () => void
}) {
  // Una birra puede tener notas y fotos sin precio vigente: pasa cuando se
  // borra el reporte. Antes esa birra directamente desaparecía.
  if (price.price == null) {
    return (
      <div style={{
        padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)',
      }}>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
          Esta birra no tiene precio cargado.
        </p>
        <button onClick={onUpdate} className="lbl" style={{
          width: '100%', marginTop: 12, padding: 12, borderRadius: 12, fontSize: 13.5,
          background: 'var(--amber)', color: 'var(--base)',
        }}>Cargar su precio</button>
      </div>
    )
  }

  const color = freshnessColor(price.freshness!)
  const dim = price.freshness === 'stale'
  return (
    <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          {/* El nombre del estilo ya está en la pestaña de arriba: repetirlo
              acá lo decía dos veces en la misma pantalla. */}
          <div className="num" style={{
            fontSize: 30, color: dim ? 'var(--faint)' : 'var(--cream)',
          }}>{formatPrice(price.price!)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            {ageLabel(price.ageDays!, price.freshness!)}
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
 * Foto ampliada.
 *
 * Antes esto abría la URL del bucket en otra pestaña: se salía de la app, se
 * veía la barra de direcciones con un dominio `r2.dev` que no dice nada, y
 * volver era el botón de atrás del navegador. Un modal se cierra tocando al
 * lado y no rompe la navegación.
 */
function PhotoViewer({
  photos, start, modMode, onClose, onRemove,
}: {
  photos: Photo[]
  start: number
  modMode: boolean
  onClose: () => void
  onRemove: (p: Photo) => void
}) {
  const [i, setI] = useState(start)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const go = useCallback((d: number) => {
    setI(n => Math.min(photos.length - 1, Math.max(0, n + d)))
  }, [photos.length])

  // Teclado para escritorio: el swipe no existe con mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  const photo = photos[i]
  if (!photo) return null

  return (
    <div
      onClick={onClose}
      onTouchStart={e => {
        const t = e.touches[0]
        touch.current = { x: t.clientX, y: t.clientY }
      }}
      onTouchEnd={e => {
        const s = touch.current
        touch.current = null
        if (!s) return
        const t = e.changedTouches[0]
        const dx = t.clientX - s.x
        const dy = t.clientY - s.y
        // Se compara con el desplazamiento vertical: sin eso, un arrastre
        // diagonal para cerrar cambia de foto sin querer.
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1)
      }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.92)',
        display: 'grid', placeItems: 'center', padding: 16,
        touchAction: 'pan-y',
      }}
    >
      <img
        key={photo.id}
        src={photo.url} alt="Foto de la birra"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain',
          borderRadius: 12, display: 'block',
        }}
      />

      {/* Las flechas sólo aparecen con puntero: en un teléfono el gesto es el
          swipe y dos botones encima de la foto son dos botones de más. */}
      {photos.length > 1 && (
        <div className="only-hover">
          <ViewerArrow side="left" disabled={i === 0} onClick={() => go(-1)} />
          <ViewerArrow side="right" disabled={i === photos.length - 1} onClick={() => go(1)} />
        </div>
      )}

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', left: 0, right: 0,
          bottom: `calc(22px + var(--safe-bottom))`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          color: 'var(--muted)', fontSize: 12.5,
        }}
      >
        <span>
          {photo.authorName && <>{photo.mine ? 'Tu foto' : photo.authorName} · </>}
          {photo.ageDays <= 0 ? 'hoy' : photo.ageDays === 1 ? 'ayer' : `hace ${photo.ageDays} d`}
          {photos.length > 1 && <> · {i + 1}/{photos.length}</>}
        </span>
        {modMode && (
          <button onClick={() => onRemove(photo)} className="lbl" style={{
            padding: '8px 16px', borderRadius: 999, fontSize: 12.5,
            background: 'rgba(255,122,102,.16)', color: 'var(--danger)',
          }}>Eliminar esta foto</button>
        )}
      </div>

      <button onClick={onClose} aria-label="Cerrar" style={{
        position: 'absolute', top: `calc(14px + var(--safe-top))`, right: 14,
        width: 40, height: 40, borderRadius: '50%',
        background: 'rgba(255,255,255,.12)', color: 'var(--cream)', fontSize: 20,
      }}>×</button>
    </div>
  )
}

function ViewerArrow({
  side, disabled, onClick,
}: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      disabled={disabled}
      aria-label={side === 'left' ? 'Anterior' : 'Siguiente'}
      style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        [side]: 14, width: 44, height: 44, borderRadius: '50%',
        display: 'grid', placeItems: 'center',
        background: 'rgba(255,255,255,.12)', color: 'var(--cream)',
        opacity: disabled ? 0.25 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path
          d={side === 'left' ? 'M15 4 7 12l8 8' : 'M9 4l8 8-8 8'}
          fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </button>
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
  price: StylePrice; myRating: number | null; onOpen: (n?: number) => void
}) {
  const mine = myRating != null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Tocar una estrella abre el modal con ese valor ya elegido. Antes
          eran decorativas y puntuar obligaba a encontrar el ícono de
          comentarios, que es lo último donde alguien lo busca. */}
      <Stars
        value={mine ? myRating : price.ratingRaw} mine={mine} size={19}
        onRate={n => onOpen(n)}
      />

      {price.ratingCount > 0 ? (
        <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>
          {/* `ratingRaw` y no `ratingAvg`: el segundo lleva shrinkage y sirve
              para ordenar, pero mostrarle 3,8 a alguien que acaba de poner
              cinco estrellas hace que el número parezca roto. El conteo al
              lado es lo que comunica cuánta confianza tiene. */}
          {price.ratingRaw!.toFixed(1)} · {price.ratingCount === 1
            ? '1 voto' : `${price.ratingCount} votos`}
          {price.ratingAgeDays != null && price.ratingAgeDays > 45 && ' · sin votos nuevos'}
        </span>
      ) : (
        <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>Sin votos</span>
      )}

      <button onClick={() => onOpen()} aria-label="Ver comentarios" style={{
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
