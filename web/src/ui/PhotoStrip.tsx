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
  photos, canAdd, onAdd, onOpen,
}: {
  photos: Photo[]
  canAdd: boolean
  onAdd: (file: Blob) => Promise<void>
  /** Índice dentro de `photos`: el visor necesita la lista para swipear. */
  onOpen: (index: number) => void
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
          <button key={p.id} onClick={() => onOpen(i)} style={{
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
