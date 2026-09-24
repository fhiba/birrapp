import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../i18n'

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
  /** Recorte redondo. Para señalar una zona del mapa, que no es un botón. */
  round?: boolean
  /**
   * Deja pasar los toques a la app de abajo.
   *
   * Para los pasos que piden probar un gesto: si el overlay los come, el
   * cartel dice "mantené apretado" y no pasa nada, que es peor que no
   * explicarlo. Se pierde el avance tocando el fondo, pero en estos pasos
   * tocar el fondo es justamente lo que se está enseñando.
   */
  interactive?: boolean
  title: string
  body: string
}

const STEPS: Record<TourView, Step[]> = {
  map: [
    {
      title: t('Tour.map.bienvenida.titulo'),
      body: t('Tour.map.bienvenida.texto'),
    },
    {
      anchor: 'map-longpress',
      round: true,
      interactive: true,
      title: t('Tour.map.mantenerApretado.titulo'),
      body: t('Tour.map.mantenerApretado.texto'),
    },
    {
      anchor: 'map-longpress',
      round: true,
      interactive: true,
      title: t('Tour.map.sacarMarca.titulo'),
      body: t('Tour.map.sacarMarca.texto'),
    },
    {
      anchor: 'map-radius',
      title: t('Tour.map.radio.titulo'),
      body: t('Tour.map.radio.texto'),
    },
    {
      anchor: 'map-style',
      title: t('Tour.map.estilo.titulo'),
      body: t('Tour.map.estilo.texto'),
    },
  ],
  list: [
    {
      anchor: 'list-search',
      title: t('Tour.list.buscar.titulo'),
      body: t('Tour.list.buscar.texto'),
    },
    {
      anchor: 'list-sort',
      title: t('Tour.list.orden.titulo'),
      body: t('Tour.list.orden.texto'),
    },
  ],
  bar: [
    {
      anchor: 'bar-tabs',
      title: t('Tour.bar.pestanas.titulo'),
      body: t('Tour.bar.pestanas.texto'),
    },
    {
      anchor: 'bar-confirm',
      title: t('Tour.bar.confirmar.titulo'),
      body: t('Tour.bar.confirmar.texto'),
    },
    {
      anchor: 'bar-rating',
      title: t('Tour.bar.puntuar.titulo'),
      // El texto hablaba de un casillero para escribir el medio punto y de un
      // voto "en ámbar": las dos cosas dejaron de existir —ahora se arrastra el
      // dedo, y la nota tiene su propio tono— y un tutorial que describe una
      // pantalla que no está es peor que no tenerlo.
      body: t('Tour.bar.puntuar.texto'),
    },
    {
      anchor: 'bar-photos',
      title: t('Tour.bar.foto.titulo'),
      body: t('Tour.bar.foto.texto'),
    },
  ],
  profile: [
    {
      anchor: 'profile-stats',
      title: t('Tour.profile.resumen.titulo'),
      body: t('Tour.profile.resumen.texto'),
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

/**
 * Id con el que se guarda el avance de quien no inició sesión.
 *
 * El tutorial no arranca solo sin cuenta —habla de aportar, y nada de eso se
 * puede hacer sin una— pero sí se puede pedir desde el "?". Y si alguien lo
 * pidió y lo terminó, no hay por qué volver a ofrecérselo: eso necesita una
 * clave donde anotarlo.
 */
export const TOUR_ANON = 0

export function Tour({ view, userId, autoStart, openToken = 0 }: {
  view: TourView
  /** Real con sesión, [TOUR_ANON] sin ella: es dónde se guarda el avance. */
  userId: number
  /** Arrancar solo al entrar. Sin sesión va en false; ver el comentario. */
  autoStart: boolean
  /** Cambia cuando alguien toca el "?": abre el tutorial de esta pantalla. */
  openToken?: number
}) {
  const [step, setStep] = useState(0)
  const [active, setActive] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)

  /**
   * Abrir el tutorial de esta pantalla **y anotarla como vista**.
   *
   * Se anota al mostrarlo y no al terminarlo. Terminarlo era lo único que lo
   * marcaba, así que irse a la mitad —tocar uno de los cuadrados que el propio
   * paso está señalando— dejaba la pantalla sin marcar, y el tutorial volvía a
   * aparecer cada vez que se entraba: desde "Mis precios", desde "Cerca",
   * siempre. Un cartel que reaparece después de haberlo leído no se lee como
   * ayuda, se lee como que la app no se entera de nada.
   *
   * Lo que queda a mitad no se repite solo; para verlo entero está "Ver el
   * tutorial de nuevo" en Perfil.
   */
  const abrir = useCallback(() => {
    setStep(0)
    setActive(true)
    const s = read(userId)
    write(userId, { ...s, done: [...new Set([...s.done, view])] })
  }, [userId, view])

  // Arranca al entrar a una pantalla que todavía no se explicó. El retraso es
  // para que la pantalla haya terminado de dibujarse: sin eso el ancla puede
  // no existir todavía y el paso se saltearía por nada.
  useEffect(() => {
    if (!autoStart) { setActive(false); return }
    const s = read(userId)
    if (s.skipped || s.done.includes(view)) { setActive(false); return }
    const t = setTimeout(abrir, 550)
    return () => clearTimeout(t)
  }, [view, userId, autoStart, abrir])

  /**
   * Pedido a mano, desde el "?". Va sin el retraso de arriba: la pantalla ya
   * está dibujada —se está mirando— y esperar medio segundo después de tocar
   * un botón se siente como que el botón no anduvo.
   *
   * Se compara contra el último token visto y no contra cero. El token vive en
   * `Shell`, que no se desmonta al navegar: una vez tocado el "?" quedaba en 1
   * para siempre, así que **este efecto abría el tutorial en cada montaje** —y
   * el componente se monta de nuevo cada vez que se entra a una pantalla con
   * tutorial viniendo de una sin él. Ése era el tutorial que no se iba más.
   */
  const ultimoPedido = useRef(openToken)
  useEffect(() => {
    if (openToken === ultimoPedido.current) return
    ultimoPedido.current = openToken
    abrir()
  }, [openToken, abrir])

  const steps = STEPS[view]
  const current = steps[step]

  // Cerrar. Lo visto ya quedó anotado al abrir; acá sólo se guarda el
  // "no me lo muestres más", que apaga el tutorial de todas las pantallas.
  const finish = useCallback((skipAll: boolean) => {
    setActive(false)
    if (skipAll) write(userId, { ...read(userId), skipped: true })
  }, [userId])

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
    // se siente trabado, y el reflejo de todo el mundo es tocar afuera. Salvo
    // en los pasos que enseñan un gesto: ahí el toque tiene que llegar a la
    // app, así que el overlay se vuelve puro dibujo y sólo avanza el botón.
    <div
      onClick={current.interactive ? undefined : next}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        pointerEvents: current.interactive ? 'none' : 'auto',
      }}
    >
      {/* El recorte de luz: un rectángulo transparente con una sombra enorme
          alrededor. Es la forma barata de agujerear un fondo oscuro sin SVG
          ni cuatro divs que hay que mantener alineados. */}
      {rect && (
        <div style={{
          position: 'absolute',
          top: rect.top - pad, left: rect.left - pad,
          width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: current.round ? '50%' : 14, pointerEvents: 'none',
          boxShadow: '0 0 0 9999px rgba(0,0,0,.74)',
          outline: '2px solid var(--acento)',
        }} />
      )}
      {!rect && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.74)' }} />
      )}

      {/*
        El globo es vidrio, con la receta única de `.glass`.

        Es lo que corresponde por la regla de la dirección: hay vidrio donde
        algo flota y no en las pantallas de contenido, y esto flota por encima
        de la app entera, agujereada por el recorte de luz. Tenía su propia
        mezcla —fondo `--elevated` opaco y una sombra a mano— o sea una tarjeta
        pegada encima; con el vidrio se ve qué hay debajo, que es justo lo que
        el tutorial está señalando.

        La sombra ya no va inline: `.glass` trae la suya con los dos cantos, y
        un `box-shadow` en el `style` la pisaba entera por especificidad.

        Adentro del vidrio el color deja de llevar jerarquía —lo de atrás puede
        ser cualquier cosa— y la llevan el tamaño y el peso: título en `--cream`
        y todo lo secundario en `--sobre-vidrio`.
      */}
      <div className="desk-narrow glass" onClick={e => e.stopPropagation()} style={{
        position: 'absolute', ...cardStyle, pointerEvents: 'auto',
        borderRadius: 'var(--r-3)', padding: 'var(--s-4)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', marginBottom: 'var(--s-2)',
        }}>
          <h3 className="ttl" style={{ margin: 0, fontSize: 'var(--t-5)', flex: 1 }}>{current.title}</h3>
          <span className="num" style={{ fontSize: 'var(--t-1)', color: 'var(--sobre-vidrio)' }}>
            {step + 1}/{steps.length}
          </span>
        </div>
        <p style={{
          margin: 0, fontSize: 'var(--t-3)', lineHeight: 1.5, color: 'var(--sobre-vidrio)',
        }}>
          {current.body}
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--s-3)', marginTop: 'var(--s-4)',
        }}>
          <button onClick={() => finish(true)} className="lbl" style={{
            fontSize: 'var(--t-2)', color: 'var(--sobre-vidrio)',
            // 44px de alto real: es la salida del tutorial y hay que poder
            // acertarle con el pulgar, aunque el texto sea chico.
            minHeight: 44, padding: 0,
          }}>{t('Tour.noMostrarMas')}</button>
          <button onClick={next} className="lbl" style={{
            marginLeft: 'auto', padding: '0 var(--s-5)', borderRadius: 'var(--r-2)',
            fontSize: 'var(--t-3)', minHeight: 46,
            background: 'var(--acento)', color: 'var(--base)',
          }}>{step + 1 >= steps.length ? t('comun.listo') : t('Tour.dale')}</button>
        </div>
      </div>
    </div>
  )
}
