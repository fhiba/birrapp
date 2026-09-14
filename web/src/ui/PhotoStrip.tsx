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
    <div style={{ marginTop: 16 }}>
      {/* Rótulo de sección, igual que en los comentarios de abajo: con las dos
          cosas una arriba de la otra y sin nada que las separe, la tira de
          fotos parecía parte de la fila de puntaje. */}
      <h3 className="lbl" style={{
        fontSize: 'var(--t-1)', letterSpacing: '.12em', color: 'var(--faint)', margin: '0 0 12px',
      }}>
        {photos.length > 0 ? `FOTOS · ${photos.length}` : 'FOTOS'}
      </h3>

      <div data-tour="bar-photos" style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
        scrollSnapType: 'x mandatory',
      }}>
        {photos.map((p, i) => (
          /*
           * La miniatura tiene UNA acción: abrir la foto.
           *
           * Antes tenía dos, y la segunda era un pulgar de 24px metido en la
           * esquina de un cuadrado de 108. Un blanco de 24px está por debajo
           * del mínimo que se puede tocar con el dedo, y encima estaba pegado
           * al borde del botón que abre la foto: la mitad de los toques caían
           * en el que no era. Uno de los dos tenía que irse, y el que se va
           * es el que no se decide acá — nadie sabe si una foto le gusta
           * mirándola de 108px. El pulgar vive adentro del visor, que es
           * donde la estás mirando de verdad.
           *
           * Lo que queda es el número: no es un control, es parte de lo que
           * la foto dice de sí misma, como la antigüedad al lado del precio.
           */
          <button
            key={p.id}
            onClick={() => onOpen(i)}
            aria-label={`Ver la foto${p.topOfMonth ? ' del mes' : ''}${
              p.votes > 0 ? `, ${p.votes} me gusta` : ''}`}
            style={{
              position: 'relative', flex: '0 0 auto', scrollSnapAlign: 'start',
              display: 'block', padding: 0,
              width: 108, height: 108, borderRadius: 'var(--r-3)', overflow: 'hidden',
              background: 'var(--elevated)',
              // La del mes se marca con el borde y no con un cartel encima:
              // el cartel taparía justo la foto que se está premiando.
              outline: p.topOfMonth ? '2px solid var(--acento)' : 'none',
              outlineOffset: -2,
            }}
          >
            <img
              src={p.url} alt="" loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />

            {/* El velo va siempre que haya algo escrito encima, y no sólo a
                veces: sobre una foto clara, texto claro sin velo no se lee. */}
            {(p.topOfMonth || p.votes > 0) && <span className="foto-velo" aria-hidden />}

            {p.topOfMonth && (
              <span className="lbl" style={{
                position: 'absolute', top: 'var(--s-1)', left: 'var(--s-1)',
                padding: '2px var(--s-2)', borderRadius: 999,
                fontSize: 'var(--t-1)', letterSpacing: '.06em',
                background: 'var(--acento)', color: 'var(--base)',
              }} aria-hidden>DEL MES</span>
            )}

            {p.votes > 0 && (
              <span style={{
                position: 'absolute', left: 'var(--s-2)', bottom: 'var(--s-2)',
                display: 'flex', alignItems: 'center', gap: 'var(--s-1)',
                fontSize: 'var(--t-2)',
                // Relleno = la votaste vos. De un barrido por la tira se ve
                // cuáles ya marcaste sin tener que abrir ninguna.
                color: p.votedByMe ? 'var(--acento)' : 'var(--cream)',
              }} aria-hidden>
                <Thumb filled={p.votedByMe} size={12} />
                <span className="num">{p.votes}</span>
              </span>
            )}
          </button>
        ))}

        {canAdd && (
          <button
            onClick={() => picker.current?.click()} disabled={busy}
            aria-label="Agregar una foto"
            style={{
              flex: '0 0 auto', width: 108, height: 108, borderRadius: 'var(--r-3)',
              border: '1px dashed var(--film-3)', color: 'var(--muted)',
              display: 'grid', placeItems: 'center', gap: 4,
            }}
          >
            {busy ? <div className="spinner" /> : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                </svg>
                <span style={{ fontSize: 'var(--t-1)' }}>Agregar</span>
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--t-2)', color: 'var(--danger)' }}>{error}</p>
      )}

      <input ref={picker} type="file" accept="image/*"
        onChange={take} className="sr" tabIndex={-1} />
    </div>
  )
}

/**
 * El pulgar.
 *
 * Relleno = está prendido. La diferencia entre contorno y relleno se ve con la
 * pantalla en blanco y negro, que es el piso: si el estado sólo se distingue
 * por el color, no se distingue.
 */
export const Thumb = ({ filled, size = 16 }: { filled: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden
    className="like-ico"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth={filled ? 0 : 1.8} strokeLinejoin="round">
    <path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3Zm2 0 4.2-7.2a1 1 0 0 1 1.8.5V9h4.3a1.6 1.6 0 0 1 1.6 2l-1.7 8a1.6 1.6 0 0 1-1.6 1.3H9V10Z" />
  </svg>
)
