import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

/**
 * Tutorial progresivo, por pantalla.
 *
 * No es un carrusel de bienvenida: cada pantalla enseña lo suyo la primera vez
 * que se abre. Contar el mapa mientras alguien mira el perfil no sirve — para
 * cuando llega al mapa ya se olvidó.
 *
 * Cada paso apunta a un control real, marcado con `data-tour`. Un cartel
 * centrado que dice "el botón de arriba a la izquierda" obliga a traducir
 * palabras a píxeles, que es justo el trabajo que el tutorial tendría que
 * ahorrar. Los pasos que explican un gesto y no un botón —mantener apretado el
 * mapa— van sin ancla y se muestran centrados.
 *
 * Si el ancla no está en pantalla el paso se saltea solo. Un bar sin precios no
 * tiene botón de "Sigue igual", y hablar de un botón que no está sería peor que
 * callarse.
 */

export type TourView = 'map' | 'list' | 'bar' | 'profile'

interface Step {
  /** Valor de `data-tour` del control que explica. Sin esto, cartel centrado. */
  anchor?: string
  title: string
  body: string
}

const STEPS: Record<TourView, Step[]> = {
  map: [
    {
      title: 'Mantené apretado el mapa',
      body: 'Te deja un punto y busca desde ahí en vez de desde donde estás. '
        + 'Buenísimo para chusmear un barrio al que estás por caer.',
    },
    {
      anchor: 'map-radius',
      title: '¿Hasta dónde buscamos?',
      body: 'De 300 metros a 15 kilómetros. Cuanto más chico, más sirve '
        + 'comparar: dos bares a diez cuadras compiten, a diez kilómetros no.',
    },
    {
      anchor: 'map-color',
      title: 'Qué te dice el color',
      body: 'En Frescura, verde es un precio de esta semana y gris uno que ya '
        + 'tiene más de 45 días. En Precio, verde es lo barato y rojo lo caro '
        + 'de lo que estás viendo en pantalla.',
    },
    {
      anchor: 'map-style',
      title: 'Una birra a la vez',
      body: 'Filtrá por estilo y comparás IPA contra IPA. Sin filtro, cada pin '
        + 'te muestra la más barata del bar, que capaz es otra cosa.',
    },
  ],
  list: [
    {
      anchor: 'list-search',
      title: 'Buscá por nombre',
      body: 'Busca en todos los bares cargados, no sólo en los que entran en '
        + 'el radio. Escribilo sin tildes si querés, lo encuentra igual.',
    },
    {
      anchor: 'list-sort',
      title: 'Más cerca o más barata',
      body: '"Más barata" saltea los precios de más de 45 días. Uno viejo y '
        + 'bajo no te puede encabezar el ranking.',
    },
  ],
  bar: [
    {
      anchor: 'bar-tabs',
      title: 'Una pestaña por birra',
      body: 'Cada una tiene su precio, su nota y sus fotos. El "+" del final '
        + 'es para sumar una que el bar tenga y todavía no esté cargada.',
    },
    {
      anchor: 'bar-confirm',
      title: 'Esto es lo que más ayuda',
      body: 'Si el precio sigue igual, tocá acá y queda al día. Es un toque, y '
        + 'es lo que evita que la app se llene de precios que ya no existen.',
    },
    {
      anchor: 'bar-rating',
      title: 'Puntuá la birra',
      body: 'Tocá las estrellas. En ámbar va tu voto y en gris el promedio del '
        + 'resto. El iconito de al lado abre los comentarios.',
    },
    {
      anchor: 'bar-photos',
      title: 'Subí una foto',
      body: 'Se achica en tu teléfono antes de subirla, así no te come datos.',
    },
  ],
  profile: [
    {
      anchor: 'profile-stats',
      title: 'Todo lo que cargaste',
      body: 'Tocá cualquiera de los tres y ves tus precios, tus fotos y tus '
        + 'bares juntos. Si algo te salió mal, lo borrás desde ahí.',
    },
  ],
}

// ---------- persistencia ----------
//
// En localStorage y no en la base: un tutorial visto no es dato del negocio.
// Va por usuario para que dos cuentas en el mismo teléfono no se pisen.

const key = (userId: number) => `birrapp.tour.${userId}`

interface Saved { done: TourView[]; skipped: boolean }

function read(userId: number): Saved {
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return { done: [], skipped: false }
    const v = JSON.parse(raw) as Saved
    return { done: v.done ?? [], skipped: v.skipped ?? false }
  } catch {
    // Modo privado, almacenamiento lleno o JSON corrupto: se muestra el
    // tutorial de nuevo, que es molesto pero inofensivo.
    return { done: [], skipped: false }
  }
}

function write(userId: number, v: Saved) {
  try { localStorage.setItem(key(userId), JSON.stringify(v)) } catch { /* sin lugar */ }
}

/** Lo vuelve a habilitar entero, desde Perfil. */
export function resetTour(userId: number) {
  write(userId, { done: [], skipped: false })
}

export function tourPending(userId: number): boolean {
  const s = read(userId)
  return !s.skipped && s.done.length < Object.keys(STEPS).length
}

// ---------- componente ----------

export function Tour({ view, userId }: { view: TourView; userId: number | null }) {
  const [step, setStep] = useState(0)
  const [active, setActive] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)

  // Arranca al entrar a una pantalla que todavía no se explicó. El retraso es
  // para que la pantalla haya terminado de dibujarse: sin eso el ancla puede
  // no existir todavía y el paso se saltearía por nada.
  useEffect(() => {
    if (userId == null) { setActive(false); return }
    const s = read(userId)
    if (s.skipped || s.done.includes(view)) { setActive(false); return }
    const t = setTimeout(() => { setStep(0); setActive(true) }, 550)
    return () => clearTimeout(t)
  }, [view, userId])

  const steps = STEPS[view]
  const current = steps[step]

  const finish = useCallback((skipAll: boolean) => {
    setActive(false)
    if (userId == null) return
    const s = read(userId)
    write(userId, skipAll
      ? { ...s, skipped: true }
      : { ...s, done: [...new Set([...s.done, view])] })
  }, [userId, view])

  const next = useCallback(() => {
    if (step + 1 >= steps.length) finish(false)
    else setStep(step + 1)
  }, [step, steps.length, finish])

  // Medición del ancla. `useLayoutEffect` para no mostrar el recorte un cuadro
  // en la posición anterior.
  useLayoutEffect(() => {
    if (!active || !current) return
    if (!current.anchor) { setRect(null); return }

    let raf = 0
    const measure = () => {
      const el = document.querySelector(`[data-tour="${current.anchor}"]`)
      setRect(el ? el.getBoundingClientRect() : null)
    }

    // Si el control está más abajo del pliegue hay que traerlo: sin esto el
    // recorte de luz queda fuera de pantalla y el cartel señala la nada. El
    // scroll suave se sigue midiendo solo por el listener de abajo.
    document.querySelector(`[data-tour="${current.anchor}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    measure()
    // El mapa y las listas se mueven; sin esto el recorte queda flotando.
    const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure) }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [active, current])

  // Un paso cuyo ancla no está en pantalla se saltea solo, sin pintar nada.
  useEffect(() => {
    if (!active || !current?.anchor) return
    const t = setTimeout(() => {
      if (!document.querySelector(`[data-tour="${current.anchor}"]`)) next()
    }, 220)
    return () => clearTimeout(t)
  }, [active, current, next])

  if (!active || !current) return null
  if (current.anchor && !rect) return null

  const pad = 8
  const below = rect == null || rect.top < window.innerHeight * 0.45
  const cardStyle: React.CSSProperties = rect
    ? below
      ? { top: rect.bottom + pad + 10, left: 12, right: 12 }
      : { bottom: window.innerHeight - rect.top + pad + 10, left: 12, right: 12 }
    : { top: '50%', left: 12, right: 12, transform: 'translateY(-50%)' }

  return (
    // Tocar el fondo avanza. Un tutorial que sólo responde a un botón chiquito
    // se siente trabado, y el reflejo de todo el mundo es tocar afuera.
    <div onClick={next} style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      {/* El recorte de luz: un rectángulo transparente con una sombra enorme
          alrededor. Es la forma barata de agujerear un fondo oscuro sin SVG
          ni cuatro divs que hay que mantener alineados. */}
      {rect && (
        <div style={{
          position: 'absolute',
          top: rect.top - pad, left: rect.left - pad,
          width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: 14, pointerEvents: 'none',
          boxShadow: '0 0 0 9999px rgba(0,0,0,.74)',
          outline: '2px solid var(--amber)',
        }} />
      )}
      {!rect && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.74)' }} />
      )}

      <div className="desk-narrow" onClick={e => e.stopPropagation()} style={{
        position: 'absolute', ...cardStyle,
        background: 'var(--elevated)', borderRadius: 16, padding: '16px 18px',
        boxShadow: '0 12px 40px rgba(0,0,0,.5)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6,
        }}>
          <h3 className="ttl" style={{ margin: 0, fontSize: 17, flex: 1 }}>{current.title}</h3>
          <span className="num" style={{ fontSize: 11, color: 'var(--faint)' }}>
            {step + 1}/{steps.length}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--muted)' }}>
          {current.body}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <button onClick={() => finish(true)} className="lbl" style={{
            fontSize: 12.5, color: 'var(--faint)',
          }}>No me lo muestres más</button>
          <button onClick={next} className="lbl" style={{
            marginLeft: 'auto', padding: '9px 20px', borderRadius: 11, fontSize: 13,
            background: 'var(--amber)', color: 'var(--base)',
          }}>{step + 1 >= steps.length ? 'Listo' : 'Dale'}</button>
        </div>
      </div>
    </div>
  )
}
