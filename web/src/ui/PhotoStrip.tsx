import { useEffect, useRef, useState } from 'react'
import type { Photo } from '../data/types'
import { compressImage } from '../data/image'
import { shortAge } from '../data/format'

/**
 * Lo que suma subir una foto, para mostrarlo dentro del botón.
 *
 * No es un número inventado para adornar: es el peso que le da el servidor a
 * una foto en el ranking de colaboradores (`CONTRIBUTION_WEIGHT` en
 * `AnalyticsRepo.kt`: precio 3, bar 3, foto 2, nota 2, confirmación 1). Vive
 * acá copiado y no pedido a la API porque es una constante de producto, no un
 * dato de la sesión; si el peso cambia allá, hay que cambiarlo acá.
 */
const PTS_FOTO = 2

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
 *
 * ## El pulgar volvió a la tira, y por qué
 *
 * Estuvo acá, se sacó, y vuelve — pero en otro lado. Lo que estaba mal no era
 * votar desde la tira: era que el pulgar fuera una pastilla de 24px metida
 * *adentro* del botón que abre la foto, pegada a su borde. Dos blancos
 * superpuestos, uno de ellos por debajo del mínimo que se puede tocar con el
 * dedo: la mitad de los toques caían en el que no era.
 *
 * Ahora la tarjeta son dos piezas separadas y apiladas —la foto arriba, el
 * pulgar abajo— y el pulgar es el `.like` de verdad, con sus 44px de alto. No
 * se pisan, y se puede marcar una foto sin abrirla, que es lo que uno quiere
 * hacer pasando la tira. El visor sigue teniendo el suyo: son el mismo botón
 * en los dos lugares donde se mira una foto.
 */
export function PhotoStrip({
  photos, canAdd, onAdd, onOpen, onVote,
}: {
  photos: Photo[]
  canAdd: boolean
  onAdd: (file: Blob) => Promise<void>
  /** Índice dentro de `photos`: el visor necesita la lista para swipear. */
  onOpen: (index: number) => void
  /** Sin esto el pulgar es sólo el número: es lo que pasa sin sesión. */
  onVote?: (p: Photo) => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * Qué foto acaba de recibir un toque tuyo, para el golpe del pulgar.
   *
   * Va por id y no por booleano suelto: en una tira son varios botones y el
   * golpe es la respuesta a *tu* toque sobre *esa* foto. Se apaga solo.
   */
  const [pop, setPop] = useState<number | null>(null)
  useEffect(() => {
    if (pop == null) return
    const t = setTimeout(() => setPop(null), 300)
    return () => clearTimeout(t)
  }, [pop])

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
    <div>
      {/* Rótulo de sección, igual que en los comentarios de abajo: con las dos
          cosas una arriba de la otra y sin nada que las separe, la tira de
          fotos parecía parte de la fila de puntaje. */}
      <h3 className="section-label">
        {photos.length > 0 ? `FOTOS · ${photos.length}` : 'FOTOS'}
      </h3>

      <div data-tour="bar-photos" style={{
        display: 'flex', gap: 'var(--s-3)', overflowX: 'auto', paddingBottom: 'var(--s-1)',
        scrollSnapType: 'x mandatory',
      }}>
        {photos.map((p, i) => (
          <div key={p.id} style={{
            width: 150, flex: '0 0 auto', scrollSnapAlign: 'start',
          }}>
            <button
              onClick={() => onOpen(i)}
              aria-label={`Ver la foto${p.topOfMonth ? ' del mes' : ''}`}
              style={{
                position: 'relative', display: 'block', padding: 0,
                width: '100%', height: 112, borderRadius: 'var(--r-1)', overflow: 'hidden',
                background: 'var(--elevated)',
              }}
            >
              <img
                src={p.url} alt="" loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />

              {/* La del mes se marca con una banderita cuadrada apoyada en la
                  esquina y no con una píldora flotando encima: la píldora
                  redonda es lo que se toca en esta app, y esto es un rótulo.
                  Va arriba a la izquierda, que es donde no está la birra. */}
              {p.topOfMonth && (
                <span className="lbl" style={{
                  position: 'absolute', left: 0, top: 0,
                  padding: '4px 7px',
                  fontSize: 'var(--t-1)', letterSpacing: '.1em', lineHeight: 1,
                  background: 'var(--acento)', color: 'var(--base)',
                }} aria-hidden>DEL MES</span>
              )}
            </button>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginTop: 'var(--s-1)',
            }}>
              {onVote ? (
                <button
                  onClick={() => { if (!p.votedByMe) setPop(p.id); onVote(p) }}
                  aria-pressed={p.votedByMe}
                  aria-label={p.votedByMe ? 'Sacar tu me gusta' : 'Me gusta esta foto'}
                  data-pop={pop === p.id ? '1' : undefined}
                  className="like lbl"
                  // Sin la etiqueta de texto, que acá no entra en 150px: el
                  // pulgar relleno ya dice el estado y se distingue con la
                  // pantalla en blanco y negro.
                  style={{ padding: 'var(--s-2) var(--s-3)', fontSize: 'var(--t-2)' }}
                >
                  <Thumb filled={p.votedByMe} size={15} />
                  {p.votes > 0 && <span className="like-n num">{p.votes}</span>}
                </button>
              ) : p.votes > 0 && (
                // Sin sesión no hay nada que tocar: queda el número, que es dato.
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)',
                  fontSize: 'var(--t-2)', color: 'var(--muted)',
                }} aria-label={`${p.votes} me gusta`}>
                  <Thumb filled size={13} />
                  <span className="num">{p.votes}</span>
                </span>
              )}

              {/* De quién es y de cuándo, igual que al pie de un comentario:
                  una foto de hace dos años de una canilla que ya cambió dice
                  menos de lo que parece. */}
              <span style={{
                minWidth: 0, flex: 1, fontSize: 'var(--t-1)', color: 'var(--faint)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {[p.mine ? 'tuya' : p.authorName, shortAge(p.ageDays)]
                  .filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
        ))}

        {canAdd && (
          <button
            onClick={() => picker.current?.click()} disabled={busy}
            aria-label={`Agregar una foto, suma ${PTS_FOTO} puntos`}
            style={{
              flex: '0 0 auto', width: 112, height: 112, borderRadius: 'var(--r-1)',
              // Punteado y en la familia de `--info`: es un hueco a llenar, no
              // una foto. El hueso lo dejaría pesando lo mismo que el botón que
              // manda en la pantalla, que es "Sigue igual".
              border: '1px dashed var(--info-border)', color: 'var(--info)',
              display: 'grid', placeItems: 'center', gap: 'var(--s-1)',
            }}
          >
            {busy ? <div className="spinner" /> : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                </svg>
                {/* Los puntos van adentro del botón y al lado del verbo, como
                    en "Sigue igual": lo que se gana es parte de la acción, no
                    un renglón aparte. */}
                <span className="num" style={{ fontSize: 'var(--t-1)' }}>+{PTS_FOTO} pts</span>
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <p style={{
          margin: 'var(--s-2) 0 0', fontSize: 'var(--t-2)', color: 'var(--danger)',
        }}>{error}</p>
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
