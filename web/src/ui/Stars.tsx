import { useRef, useState } from 'react'

/** Los pasos son de medio punto: 0, 0,5, 1… hasta 5. */
const STEP = 0.5

/**
 * Cinco estrellas. En modo lectura muestran el promedio; en modo edición se
 * arrastran.
 *
 * **Se arrastra, no se teclea.** Antes esto eran cinco botones que daban sólo
 * enteros, y al lado un campo de texto permanente para escribir el decimal. El
 * campo estaba siempre a la vista aunque no lo estuvieras usando, el número
 * salía descentrado contra las estrellas, y pedirle a alguien que *escriba*
 * "3,5" para puntuar una birra es pedirle que abra el teclado del teléfono
 * para algo que el dedo ya sabe hacer. Ahora se apoya el dedo y se corre: la
 * nota sigue al dedo y se engancha de a medio punto.
 *
 * Por eso las estrellas de edición son grandes (`size` 34 contra los 18 de
 * lectura). Con estrellas chicas, medio punto son cuatro píxeles de recorrido
 * y no hay pulgar que lo acierte; el tamaño acá no es estética, es la
 * resolución del control.
 *
 * El valor se manda recién al soltar. Mientras se arrastra se pinta lo que se
 * va eligiendo, pero mandar en cada movimiento serían treinta escrituras para
 * una nota.
 */
export function Stars({
  value, mine, size = 18, onRate,
}: {
  /** Promedio de la comunidad, o tu voto si `mine` es true. */
  value: number | null
  mine: boolean
  size?: number
  onRate?: (n: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  /** Lo que está eligiendo el dedo ahora mismo; null si no se está arrastrando. */
  const [dragging, setDragging] = useState<number | null>(null)

  const shown = dragging ?? value ?? 0
  // Tu voto en ámbar pleno, el de la comunidad apagado: la diferencia sigue
  // siendo de quién es el voto, pero ahora la nota tiene su propio tono en vez
  // de compartir el hueso con el nombre del bar y con cada pastilla.
  const color = mine || dragging != null ? 'var(--nota)' : 'var(--muted)'

  /** De la posición del dedo a una nota, enganchada al medio punto. */
  const valueAt = (clientX: number): number => {
    const r = box.current?.getBoundingClientRect()
    if (!r || r.width === 0) return 0
    const pct = (clientX - r.left) / r.width
    return Math.min(5, Math.max(0, Math.round(pct * 5 / STEP) * STEP))
  }

  if (!onRate) {
    return (
      <div ref={box} style={{ display: 'flex', gap: 2 }}
        aria-label={value == null ? 'Sin votos' : `${value.toFixed(1)} de 5`}>
        {[1, 2, 3, 4, 5].map(n => <Star key={n} n={n} filled={shown} size={size} color={color} />)}
      </div>
    )
  }

  const commit = (n: number) => { if (n !== value) onRate(n) }

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label="Tu puntaje"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={shown}
      aria-valuetext={`${shown.toFixed(1)} de 5`}
      // El teclado hace lo mismo que el dedo. Un control que sólo responde a
      // un gesto no lo puede usar quien navega con teclado, y acá no cuesta
      // nada: son dos teclas.
      onKeyDown={e => {
        const paso = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? STEP
          : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -STEP : 0
        if (paso === 0) return
        e.preventDefault()
        commit(Math.min(5, Math.max(0, (value ?? 0) + paso)))
      }}
      onPointerDown={e => {
        // La captura es lo que hace que el gesto siga vivo aunque el dedo se
        // salga de las estrellas. Sin esto, arrastrar un poco de más suelta el
        // control a mitad de camino y la nota queda donde estaba el borde.
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(valueAt(e.clientX))
      }}
      onPointerMove={e => { if (dragging != null) setDragging(valueAt(e.clientX)) }}
      onPointerUp={() => {
        if (dragging != null) commit(dragging)
        setDragging(null)
      }}
      onPointerCancel={() => setDragging(null)}
      style={{
        display: 'flex', gap: 3, cursor: 'pointer',
        // Sin esto el navegador se queda el gesto para scrollear la página y
        // el arrastre horizontal nunca llega hasta acá.
        touchAction: 'none',
        // El control entero es el área tocable, no cada estrella por separado.
        padding: 'var(--s-1) 0',
      }}
    >
      {[1, 2, 3, 4, 5].map(n => <Star key={n} n={n} filled={shown} size={size} color={color} />)}
    </div>
  )
}

/**
 * Una estrella con relleno parcial.
 *
 * El relleno va por gradiente y no redondeando a la entera más cercana: con
 * pasos de medio punto, media estrella es justamente lo que hay que poder
 * dibujar.
 */
function Star({ n, filled, size, color }: {
  n: number; filled: number; size: number; color: string
}) {
  const pct = Math.max(0, Math.min(1, filled - (n - 1))) * 100
  // El id tiene que ser único por combinación: dos gradientes con el mismo id
  // en la página hacen que la segunda estrella use el relleno de la primera.
  const id = `star-${n}-${Math.round(pct)}-${color.replace(/[^a-z]/gi, '')}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden
      style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={id}>
          <stop offset={`${pct}%`} stopColor={color} />
          <stop offset={`${pct}%`} stopColor="var(--hairline)" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z"
      />
    </svg>
  )
}
