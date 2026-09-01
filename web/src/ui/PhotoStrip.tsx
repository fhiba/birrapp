import { useRef, useState } from 'react'
import type { Photo } from '../data/types'
import { compressImage } from '../data/image'

/**
 * Carrusel de fotos de una birra, con el botón de agregar al final.
 *
 * Scroll horizontal con `scroll-snap`, no un carrusel con flechas: en un
 * teléfono el gesto natural es arrastrar, y en escritorio la barra alcanza.
 *
 * El botón abre dos caminos porque en un teléfono son gestos distintos: sacar
 * la foto ahí mismo (`capture`) o elegir una de la galería. En escritorio el
 * primero cae solo al selector de archivos.
 */
export function PhotoStrip({
  photos, canAdd, onAdd, onOpen,
}: {
  photos: Photo[]
  canAdd: boolean
  onAdd: (file: Blob) => Promise<void>
  onOpen: (p: Photo) => void
}) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const take = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Se limpia el input o elegir la misma foto dos veces no dispara `change`.
    e.target.value = ''
    if (!file) return
    setMenu(false); setError(null); setBusy(true)
    try { await onAdd(await compressImage(file)) }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  if (photos.length === 0 && !canAdd) return null

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
        scrollSnapType: 'x mandatory',
      }}>
        {photos.map(p => (
          <button key={p.id} onClick={() => onOpen(p)} style={{
            flex: '0 0 auto', padding: 0, scrollSnapAlign: 'start',
            width: 108, height: 108, borderRadius: 14, overflow: 'hidden',
            background: 'var(--elevated)',
          }}>
            <img
              src={p.url} alt={`Foto de ${p.styleSlug}`} loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </button>
        ))}

        {canAdd && (
          <button
            onClick={() => setMenu(m => !m)} disabled={busy}
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

      {menu && (
        <>
          <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div style={{
            position: 'relative', zIndex: 61, marginTop: 8, padding: 6,
            background: 'var(--elevated)', borderRadius: 12, maxWidth: 240,
            border: '.8px solid rgba(255,255,255,.12)',
          }}>
            <MenuButton onClick={() => camera.current?.click()}>Sacar una foto</MenuButton>
            <MenuButton onClick={() => gallery.current?.click()}>Elegir de la galería</MenuButton>
          </div>
        </>
      )}

      {error && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--danger)' }}>{error}</p>
      )}

      {/* `capture` sólo lo respetan los móviles; en escritorio cae al selector. */}
      <input ref={camera} type="file" accept="image/*" capture="environment"
        onChange={take} className="sr" tabIndex={-1} />
      <input ref={gallery} type="file" accept="image/*"
        onChange={take} className="sr" tabIndex={-1} />
    </div>
  )
}

function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="lbl row-hover" style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '10px 12px', borderRadius: 9, fontSize: 13.5,
    }}>{children}</button>
  )
}
