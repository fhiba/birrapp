import { useEffect, useRef, useState } from 'react'
import type { BarPin } from '../data/types'
import { ageColor, formatDistance, formatPrice, shortAge } from '../data/format'

/**
 * Preview del bar, sin salir del mapa.
 *
 * Tocar un pin abría la ficha completa y el mapa desaparecía: para comparar
 * dos bares había que entrar, volver, entrar de nuevo, y en cada vuelta la
 * cámara se rearmaba desde cero. Comparar precios en el barrio es *el* gesto
 * de esta app, y era el que más caro salía.
 *
 * Así que el pin abre esto: nombre, distancia y el precio con su antigüedad
 * al lado, que es lo que se necesita para decidir si vale la pena entrar. La
 * ficha completa sigue estando, a un tap o a un arrastre hacia arriba.
 *
 * No hace ninguna llamada a la API: todo lo que muestra ya vino en el `BarPin`
 * del mapa. Por eso aparece en el mismo frame del toque — si tuviera que
 * esperar una respuesta sería un esqueleto, y un esqueleto no es una preview.
 *
 * Se le pasa el bar entero y no su id porque la lista de bares se recarga sola
 * al moverse la cámara: guardando el id, un refresco que no devolviera ese bar
 * vaciaba la tarjeta abierta.
 *
 * Es de vidrio, y es de los pocos lugares donde el vidrio se queda: heritage
 * lo reserva para lo que flota sobre el mapa. Era una tarjeta opaca pegada
 * encima, que es lo que hace que el mapa parezca tapado en vez de atrás.
 */
export function BarPreview({
  bar, onClose, onOpen, isFavorite, onToggleFavorite,
}: {
  bar: BarPin
  onClose: () => void
  /** Abrir la ficha completa. */
  onOpen: () => void
  isFavorite: boolean
  /** null sin sesión: el corazón lleva a Perfil en vez de no hacer nada. */
  onToggleFavorite: () => void
}) {
  // Entrada desde abajo. Se monta afuera de pantalla y se sube en el frame
  // siguiente: con el estado inicial ya en 0 no hay transición que animar.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const f = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(f)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Arrastre: abajo cierra, arriba abre la ficha. Es el gesto que la forma de
  // la tarjeta promete; sin él el manijón de arriba sería un adorno.
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const from = useRef<number | null>(null)

  // El id en la dependencia y no el objeto: cada recarga de bares trae
  // instancias nuevas, y con el objeto esto correría en cada refresco.
  useEffect(() => { setDrag(0); setDragging(false) }, [bar.id])

  const onDown = (e: React.PointerEvent) => {
    // Un toque sobre un botón no es el principio de un arrastre. Y sin esta
    // guarda era peor que eso: `setPointerCapture` sobre el contenedor le
    // roba el `click` al botón de cerrar, así que la X dejaba de cerrar.
    if ((e.target as HTMLElement).closest('button, a')) return
    from.current = e.clientY
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (from.current == null) return
    const dy = e.clientY - from.current
    // Hacia arriba se resiste: el recorrido útil son ~60px, y sin el freno
    // la tarjeta se despega del borde inferior y deja ver el mapa por atrás.
    setDrag(dy > 0 ? dy : dy / 3)
  }
  const onUp = () => {
    if (from.current == null) return
    from.current = null
    setDragging(false)
    if (drag > 70) onClose()
    else if (drag < -22) onOpen()
    else setDrag(0)
  }

  const price = bar.fromPrice
  const age = bar.freshestAgeDays
  const distance = formatDistance(bar.distanceMeters)

  return (
    <div
      role="dialog"
      aria-label={`Vista rápida de ${bar.name}`}
      style={{
        position: 'absolute', left: 0, right: 0,
        bottom: `calc(60px + var(--nav-gap))`,
        zIndex: 45, padding: '0 10px',
        // La tarjeta flota sobre el mapa, así que el aire de los costados
        // tiene que dejar pasar el paneo. Sólo la tarjeta recibe toques.
        pointerEvents: 'none',
        transform: `translateY(${shown ? Math.max(drag, -60) : 400}px)`,
        transition: dragging ? 'none' : 'transform .22s cubic-bezier(.2,.8,.3,1)',
      }}
    >
      {/* El fondo, el borde y la sombra los pone `.glass`: repetirlos acá era
          lo que la dejaba opaca. */}
      <div
        className="desk-narrow glass"
        style={{
          pointerEvents: 'auto',
          borderRadius: 'var(--r-4)',
          padding: '8px 16px 16px',
        }}
      >
        {/* Zona de agarre: el manijón y el nombre. Los botones quedan afuera
            para que un tap sobre ellos no se lea como el principio de un
            arrastre. */}
        <div
          onPointerDown={onDown} onPointerMove={onMove}
          onPointerUp={onUp} onPointerCancel={onUp}
          style={{ touchAction: 'none', cursor: 'grab' }}
        >
          <div aria-hidden style={{
            width: 38, height: 4, borderRadius: 2, margin: '0 auto 10px',
            background: 'var(--film-3)',
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
            <h2 className="ttl" style={{
              flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--t-5)', lineHeight: 1.25,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{bar.name}</h2>

            {/* Favoritear sin entrar a la ficha.
                Es el gesto de "este me sirve, seguí mirando": obligarte a
                abrir el bar, marcarlo y volver al mapa para seguir buscando
                rompe justo el recorrido en el que estás.

                Sin marcar va en `--sobre-vidrio` y no en `--muted`: adentro
                del vidrio, con una cápsula de precio pasando por detrás,
                `--muted` se cae a 2,5:1. */}
            <button
              onClick={onToggleFavorite}
              aria-label={isFavorite ? 'Sacar de favoritos' : 'Guardar en favoritos'}
              aria-pressed={isFavorite}
              className="icon-btn"
              style={{
                background: isFavorite ? 'var(--favorito-soft)' : 'var(--film-2)',
                color: isFavorite ? 'var(--favorito)' : 'var(--sobre-vidrio)',
              }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden
                fill={isFavorite ? 'currentColor' : 'none'}
                stroke="currentColor" strokeWidth={isFavorite ? 0 : 1.9}>
                <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z" />
              </svg>
            </button>

            {/* Era de 30px: por debajo del piso de 44 que la app ya dice
                cumplir, y encima es el botón que se aprieta con el pulgar
                mientras se camina. */}
            <button
              onClick={onClose} aria-label="Cerrar" className="icon-btn"
              style={{ color: 'var(--sobre-vidrio)', background: 'var(--film-2)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                <path d="M5 5l14 14M19 5L5 19" stroke="currentColor"
                  strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* La distancia a la izquierda y el precio a la derecha, en el mismo
            renglón: son las dos cosas que se comparan entre un bar y el
            siguiente, y una arriba de la otra obligaba a leer en zigzag.

            La regla de la casa: el precio nunca va solo, la antigüedad va
            debajo y en su color. Un pin sin precio no tiene ninguno vigente
            —o los que hay son stale—, y eso también se dice. */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 'var(--s-3)',
          margin: '10px 0 0', minHeight: 44,
        }}>
          <span style={{
            flex: 1, minWidth: 0, fontSize: 'var(--t-2)', color: 'var(--sobre-vidrio)',
          }}>{distance}</span>

          {price != null ? (
            <span style={{ flexShrink: 0, textAlign: 'right' }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-1)' }}>
                <span style={{ fontSize: 'var(--t-2)', color: 'var(--sobre-vidrio)' }}>desde</span>
                <span className="num" style={{
                  fontSize: 'var(--t-7)', lineHeight: 1.05, color: 'var(--cream)',
                }}>{formatPrice(price, bar.currency)}</span>
              </span>
              <span style={{
                display: 'block', marginTop: 'var(--s-1)', fontSize: 'var(--t-1)',
                fontVariantNumeric: 'tabular-nums', color: ageColor(age),
              }}>
                {age != null ? shortAge(age) : 'sin fecha'}
              </span>
            </span>
          ) : (
            <span style={{ fontSize: 'var(--t-3)', color: 'var(--sobre-vidrio)' }}>
              Sin precio vigente
            </span>
          )}
        </div>

        {/* Los dos pasos que siguen, del mismo tamaño y uno al lado del otro:
            entrar al bar o ir hasta él. "Cómo llegar" era un ícono de 44px sin
            etiqueta — el mismo pin que usa el mapa, que ahí significa "un bar"
            y acá significaba "abrí Google Maps". Con el texto se deja de
            adivinar, y el par queda como el primario hueso y el secundario
            informativo que pide la dirección. */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 'var(--s-2)', marginTop: 'var(--s-3)',
        }}>
          <button
            onClick={onOpen}
            className="lbl"
            style={{
              height: 46, borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
              background: 'var(--acento)', color: 'var(--base)', fontWeight: 600,
            }}
          >
            {price != null ? 'Ver bar' : 'Cargar el primer precio'}
          </button>

          <a
            href={`https://www.google.com/maps/search/?api=1&query=${bar.lat},${bar.lng}`}
            target="_blank" rel="noreferrer"
            className="lbl"
            style={{
              height: 46, borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
              display: 'grid', placeItems: 'center', fontWeight: 600,
              background: 'var(--info-soft)', border: '1px solid var(--info-border)',
              color: 'var(--info-bright)', textDecoration: 'none',
            }}
          >
            Cómo llegar
          </a>
        </div>
      </div>
    </div>
  )
}
