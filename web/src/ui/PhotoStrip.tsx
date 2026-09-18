import { useEffect, useRef, useState } from 'react'
import type { Photo } from '../data/types'
import { compressImage } from '../data/image'
import { KARMA, KARMA_VISIBLE } from '../data/karma'
import { SumarEnRotulo } from './Kit'

/**
 * Lo que suma subir una foto, para mostrarlo dentro del botón.
 *
 * El número y el interruptor viven en `data/karma.ts`: hoy no se dibuja porque
 * el sistema de karma todavía no existe.
 */
const PTS_FOTO = KARMA.foto

/**
 * Carrusel de fotos de una birra, con el "+" al lado del título.
 *
 * Scroll horizontal con `scroll-snap`, no un carrusel con flechas: en un
 * teléfono el gesto natural es arrastrar, y en escritorio la barra alcanza.
 *
 * El "+" dispara un único `input file` y nada más. Había un menú propio con
 * "sacar una foto" y "elegir de la galería", pero el selector del sistema ya
 * ofrece exactamente esas dos opciones: eran dos pasos para llegar al mismo
 * lugar. Sin `capture`, que forzaría la cámara y sacaría la galería del menú
 * nativo.
 *
 * ## Qué muestra cada tarjeta: la foto, y el pulgar
 *
 * Nada más. Debajo de cada miniatura iba un renglón con el pulgar, el autor y
 * la antigüedad: tres datos en 150 píxeles, así que la tira se leía como una
 * lista de fichas en vez de como fotos y el nombre se cortaba con puntos
 * suspensivos casi siempre. Todo eso vive en el visor, que es donde alguien de
 * verdad está mirando la foto y donde hay lugar para leerlo.
 *
 * El pulgar se queda, chico y sobre la esquina de arriba a la derecha: marcar
 * una foto pasando la tira sí es algo que se quiere hacer sin abrirla. Va como
 * **hermano** del botón que abre la foto y no adentro — un botón adentro de
 * otro no es HTML válido y hace que la mitad de los toques caigan en el que no
 * era, que es por lo que el pulgar se había sacado de acá una vez.
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
      {/*
        El rótulo y, pegado a él, el "+".

        El botón de agregar estaba al final de la tira, o sea después de
        arrastrar seis fotos hacia la izquierda. Escondía la acción justo
        detrás del contenido: quien quería sumar una foto tenía que descubrir
        que la fila se corre y llegar hasta el fondo. Al lado del título está
        siempre a la vista y siempre en el mismo lugar, tenga el bar una foto o
        veinte.

        Y es un "+" chico, no un cuadro del tamaño de una foto: agregar es una
        acción sobre la sección, no una tarjeta más de la tira.
      */}
      {/* El "+" contra el borde derecho —`flex: 1` en el rótulo, que lo empuja
          hasta el fondo— y no pegado al título: ahí se leía como parte del
          texto "FOTOS", no como un botón.

          Y en ámbar punteado, la forma que tiene "agregar algo" en el resto de
          la app. En azul se confundía con lo estructural, que es el color de
          "esto se despliega" y "esto lleva a otra pantalla": acá no se navega,
          se suma. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
        margin: 'var(--s-5) 0 var(--s-3)',
      }}>
        <h3 className="section-label" style={{ margin: 0, flex: 1, minWidth: 0 }}>
          {photos.length > 0 ? `FOTOS · ${photos.length}` : 'FOTOS'}
        </h3>
        {canAdd && (
          <SumarEnRotulo
            busy={busy}
            aria={KARMA_VISIBLE
              ? `Agregar una foto, suma ${PTS_FOTO} puntos`
              : 'Agregar una foto'}
            onClick={() => picker.current?.click()}
          />
        )}
      </div>

      {/* El aire entre el rótulo y la tira lo pone el `margin` de arriba: sin
          él las fotos quedaban pegadas a la palabra FOTOS y se leía como si el
          rótulo fuera el pie de la foto anterior. */}
      <div data-tour="bar-photos" style={{
        display: 'flex', gap: 'var(--s-3)', overflowX: 'auto', paddingBottom: 'var(--s-1)',
        scrollSnapType: 'x mandatory',
      }}>
        {photos.map((p, i) => (
          /*
           * La tarjeta es la foto, y nada más.
           *
           * Abajo llevaba un renglón con el pulgar, el autor y la antigüedad.
           * Eran tres datos en 150 píxeles, debajo de cada miniatura: la tira
           * se leía como una lista de fichas y no como fotos, y el nombre se
           * cortaba con puntos suspensivos casi siempre. Todo eso ya está en el
           * visor, que es donde alguien de verdad está mirando la foto — y es
           * donde tiene lugar para leerse.
           *
           * Queda sólo el pulgar, encima de la foto y en la esquina de arriba
           * a la derecha, porque marcar una foto pasando la tira sí es algo que
           * se quiere hacer sin abrirla.
           *
           * **Va como hermano del botón de abrir, no adentro.** Un botón
           * adentro de otro botón no es HTML válido y además hace que la mitad
           * de los toques caigan en el que no era — que es exactamente por lo
           * que el pulgar se había sacado de acá la vez anterior.
           */
          <div key={p.id} style={{
            position: 'relative', width: 184, flex: '0 0 auto', scrollSnapAlign: 'start',
          }}>
            <button
              onClick={() => onOpen(i)}
              aria-label={`Ver la foto${p.topOfMonth ? ' del mes' : ''}`}
              style={{
                position: 'relative', display: 'block', padding: 0,
                width: '100%', height: 138, borderRadius: 'var(--r-1)', overflow: 'hidden',
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
                  Va arriba a la izquierda, o sea del lado opuesto al pulgar. */}
              {p.topOfMonth && (
                <span className="lbl" style={{
                  position: 'absolute', left: 0, top: 0,
                  padding: '4px 7px',
                  fontSize: 'var(--t-1)', letterSpacing: '.1em', lineHeight: 1,
                  background: 'var(--acento)', color: 'var(--base)',
                }} aria-hidden>DEL MES</span>
              )}
            </button>

            {/* El fondo oscuro no es decoración: el pulgar se apoya sobre una
                foto cualquiera, y sin él desaparece contra un cielo blanco o
                una pared clara. */}
            {onVote ? (
              <button
                onClick={() => { if (!p.votedByMe) setPop(p.id); onVote(p) }}
                aria-pressed={p.votedByMe}
                aria-label={p.votedByMe ? 'Sacar tu me gusta' : 'Me gusta esta foto'}
                data-pop={pop === p.id ? '1' : undefined}
                className="like lbl"
                style={{
                  position: 'absolute', top: 6, right: 6,
                  // `minHeight` inline y no sólo `height`: `.like` declara
                  // `min-height: 44px` para cuando el pulgar es el botón
                  // principal —el del visor— y un `height` más chico no le
                  // gana. Acá el botón se apoya sobre la foto y 44 la tapaba.
                  minWidth: 34, height: 34, minHeight: 34,
                  padding: '0 9px', borderRadius: 999,
                  // El anillo de `.like` sobra sobre una foto: el velo oscuro
                  // ya lo despega del fondo.
                  boxShadow: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 'var(--s-1)', fontSize: 'var(--t-1)',
                  background: p.votedByMe ? 'var(--acento)' : 'rgba(0,0,0,.5)',
                  color: p.votedByMe ? 'var(--base)' : 'var(--cream)',
                  backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                  border: 'none',
                }}
              >
                <Thumb filled={p.votedByMe} size={14} />
                {p.votes > 0 && <span className="like-n num">{p.votes}</span>}
              </button>
            ) : p.votes > 0 && (
              // Sin sesión no hay nada que tocar: queda el número, que es dato.
              <span style={{
                position: 'absolute', top: 6, right: 6,
                display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)',
                height: 26, padding: '0 8px', borderRadius: 999,
                fontSize: 'var(--t-1)', color: 'var(--cream)',
                background: 'rgba(0,0,0,.5)',
                backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
              }} aria-label={`${p.votes} me gusta`}>
                <Thumb filled size={12} />
                <span className="num">{p.votes}</span>
              </span>
            )}
          </div>
        ))}
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
