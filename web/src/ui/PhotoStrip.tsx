import { useRef, useState } from 'react'
import type { Photo } from '../data/types'
import { compressImage } from '../data/image'

/**
 * Carrusel de fotos de una birra, con el botón de agregar al final.
 *
 * Scroll horizontal con `scroll-snap`, no un carrusel con flechas: en un
 * teléfono el gesto natural es arrastrar, y en escritorio la barra alcanza.
 *
 * El botón dispara un único `input file` y nada más. Había un menú propio con
 * "sacar una foto" y "elegir de la galería", pero el selector del sistema ya
 * ofrece exactamente esas dos opciones: eran dos pasos para llegar al mismo
 * lugar. Sin `capture`, que forzaría la cámara y sacaría la galería del menú
 * nativo.
 */
export function PhotoStrip({
  photos, canAdd, canVote, onAdd, onOpen, onVote,
}: {
  photos: Photo[]
  canAdd: boolean
  /** Con sesión el pulgar se toca; sin ella es sólo el número. */
  canVote: boolean
  onAdd: (file: Blob) => Promise<void>
  /** Índice dentro de `photos`: el visor necesita la lista para swipear. */
  onOpen: (index: number) => void
  onVote: (p: Photo) => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const take = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Se limpia el input o elegir la misma foto dos veces no dispara `change`.
    e.target.value = ''
    if (!file) return
    setError(null); setBusy(true)
    try { await onAdd(await compressImage(file)) }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  if (photos.length === 0 && !canAdd) return null

  return (
    <div style={{ marginTop: 14 }}>
      <div data-tour="bar-photos" style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
        scrollSnapType: 'x mandatory',
      }}>
        {photos.map((p, i) => (
          // El pulgar no puede ir adentro del botón que abre la foto: un
          // botón dentro de otro no es HTML válido y el toque se lo come el
          // de afuera. Por eso el contenedor, con los dos como hermanos.
          <div key={p.id} style={{
            position: 'relative', flex: '0 0 auto', scrollSnapAlign: 'start',
          }}>
            <button onClick={() => onOpen(i)} style={{
              display: 'block', padding: 0,
              width: 108, height: 108, borderRadius: 14, overflow: 'hidden',
              background: 'var(--elevated)',
              // La del mes se marca con el borde y no con un cartel encima:
              // el cartel taparía justo la foto que se está premiando.
              outline: p.topOfMonth ? '2px solid var(--amber)' : 'none',
              outlineOffset: -2,
            }}>
              <img
                src={p.url} alt={`Foto de ${p.styleSlug}`} loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </button>

            {p.topOfMonth && (
              <span className="lbl" style={{
                position: 'absolute', top: 5, left: 5, padding: '2px 7px',
                borderRadius: 999, fontSize: 9.5, letterSpacing: '.06em',
                background: 'var(--amber)', color: 'var(--base)',
              }}>DEL MES</span>
            )}

            <VoteChip photo={p} canVote={canVote} onVote={onVote} />
          </div>
        ))}

        {canAdd && (
          <button
            onClick={() => picker.current?.click()} disabled={busy}
            aria-label="Agregar una foto"
            style={{
              flex: '0 0 auto', width: 108, height: 108, borderRadius: 14,
              border: '1px dashed rgba(255,255,255,.22)', color: 'var(--muted)',
              display: 'grid', placeItems: 'center', gap: 4,
            }}
          >
            {busy ? <div className="spinner" /> : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                </svg>
                <span style={{ fontSize: 11 }}>Agregar</span>
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--danger)' }}>{error}</p>
      )}

      <input ref={picker} type="file" accept="image/*"
        onChange={take} className="sr" tabIndex={-1} />
    </div>
  )
}

/**
 * El pulgar de una foto (BIR-10).
 *
 * Sin votos y sin sesión no se dibuja: un cero pegado a cada foto es ruido, y
 * el número recién dice algo cuando hay alguien del otro lado. Con sesión
 * aparece siempre, porque si el botón no está no hay forma de descubrir que
 * se puede votar.
 */
function VoteChip({ photo, canVote, onVote }: {
  photo: Photo; canVote: boolean; onVote: (p: Photo) => void
}) {
  if (!canVote && photo.votes === 0) return null

  const on = photo.votedByMe
  const style = {
    position: 'absolute' as const, right: 5, bottom: 5,
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', borderRadius: 999, fontSize: 11.5,
    // Fondo oscuro propio: el pulgar cae encima de la foto, y sobre una foto
    // clara un ícono claro directamente no se ve.
    background: on ? 'var(--amber)' : 'rgba(0,0,0,.55)',
    color: on ? 'var(--base)' : 'var(--cream)',
  }

  const inside = <><Thumb filled={on} />{photo.votes > 0 && photo.votes}</>

  if (!canVote) return <span style={style}>{inside}</span>

  return (
    <button
      onClick={() => onVote(photo)}
      aria-pressed={on}
      aria-label={on ? 'Sacar mi pulgar' : 'Me gusta esta foto'}
      className="num"
      style={style}
    >{inside}</button>
  )
}

const Thumb = ({ filled }: { filled: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth={filled ? 0 : 1.8} strokeLinejoin="round">
    <path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3Zm2 0 4.2-7.2a1 1 0 0 1 1.8.5V9h4.3a1.6 1.6 0 0 1 1.6 2l-1.7 8a1.6 1.6 0 0 1-1.6 1.3H9V10Z" />
  </svg>
)
