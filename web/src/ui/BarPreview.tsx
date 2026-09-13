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
 */
export function BarPreview({
  bar, onClose, onOpen,
}: {
  bar: BarPin
  onClose: () => void
  /** Abrir la ficha completa. */
  onOpen: () => void
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
      <div
        className="desk-narrow"
        style={{
          pointerEvents: 'auto',
          background: 'var(--raised)', borderRadius: 'var(--r-4)',
          border: '.8px solid var(--film-3)',
          boxShadow: '0 -6px 34px rgba(0,0,0,.5)',
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
            background: 'var(--film-4)',
          }} />

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="ttl" style={{
                margin: 0, fontSize: 'var(--t-5)', lineHeight: 1.25,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{bar.name}</h2>
              {distance && (
                <p style={{ margin: '3px 0 0', fontSize: 'var(--t-2)', color: 'var(--faint)' }}>
                  {distance}
                </p>
              )}
            </div>

            {/* Era de 30px: por debajo del piso de 44 que la app ya dice
                cumplir, y encima es el botón que se aprieta con el pulgar
                mientras se camina. */}
            <button
              onClick={onClose} aria-label="Cerrar" className="icon-btn"
              style={{ color: 'var(--muted)', background: 'var(--film-2)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                <path d="M5 5l14 14M19 5L5 19" stroke="currentColor"
                  strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* La regla de la casa: el precio nunca va solo, la antigüedad va al
            lado. Un pin sin precio no tiene ninguno vigente —o los que hay
            son stale—, y eso también se dice. */}
        <div style={{ margin: '12px 0 2px', minHeight: 48 }}>
          {price != null ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 'var(--t-2)', color: 'var(--faint)' }}>desde</span>
                <span className="num" style={{
                  fontSize: 'var(--t-8)', lineHeight: 1.05, color: 'var(--cream)',
                }}>{formatPrice(price, bar.currency)}</span>
              </div>

              {/* La antigüedad, debajo del monto y no al costado — misma forma
                  que en la ficha del bar. Al costado y alineada al otro
                  extremo se leía como un dato aparte; es parte del precio. */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--s-1)',
                marginTop: 'var(--s-1)', fontSize: 'var(--t-2)', color: ageColor(age),
              }}>
                <span aria-hidden style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: ageColor(age), flexShrink: 0,
                }} />
                {shortAge(age)}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 'var(--t-3)', color: 'var(--muted)' }}>
              Sin precio vigente
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={onOpen}
            className="lbl"
            style={{
              flex: 1, height: 44, borderRadius: 'var(--r-3)', fontSize: 'var(--t-4)',
              background: 'var(--amber)', color: 'var(--base)', fontWeight: 600,
            }}
          >
            {price != null ? 'Ver el bar' : 'Cargar el primer precio'}
          </button>

          <a
            href={`https://www.google.com/maps/search/?api=1&query=${bar.lat},${bar.lng}`}
            target="_blank" rel="noreferrer" aria-label="Cómo llegar"
            style={{
              flexShrink: 0, width: 44, height: 44, borderRadius: 'var(--r-3)',
              display: 'grid', placeItems: 'center',
              background: 'var(--elevated)', color: 'var(--amber)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  )
}
