import { useEffect, useRef, useState } from 'react'

/**
 * Un número que viaja hasta su valor nuevo en vez de saltar.
 *
 * Existe para un momento puntual: escaneás el ticket y el saldo pasa de 0 a
 * 120. Es el instante de mayor carga emocional del programa de puntos —lo que
 * la persona vino a buscar— y saltando de golpe se pierde: el ojo no registra
 * un cambio que ya terminó.
 *
 * **Sólo anima cuando ya había un número.** La primera carga de la pantalla
 * pinta el valor directo: contar desde cero al entrar sería animar un dato que
 * la persona no cambió, y eso ya no es respuesta a una acción sino decoración.
 *
 * Respeta "reducir movimiento" saltando al valor final, y arranca desde el
 * valor anterior y no desde cero, así que restar también se ve bajar.
 */
export function useContador(valor: number | undefined, ms = 420): number | undefined {
  const [mostrado, setMostrado] = useState(valor)
  const anterior = useRef(valor)

  useEffect(() => {
    if (valor == null) { setMostrado(valor); anterior.current = valor; return }

    const desde = anterior.current
    anterior.current = valor

    // Primera vez, sin cambio, o con movimiento reducido: directo.
    const reduce = typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    if (desde == null || desde === valor || reduce) { setMostrado(valor); return }

    const t0 = performance.now()
    let vivo = true
    const paso = (t: number) => {
      if (!vivo) return
      const p = Math.min(1, (t - t0) / ms)
      // Desaceleración: rápido al principio y frenando, que es como se lee un
      // número que "llega" en vez de uno que se arrastra.
      const e = 1 - (1 - p) ** 3
      setMostrado(Math.round(desde + (valor - desde) * e))
      if (p < 1) requestAnimationFrame(paso)
    }
    requestAnimationFrame(paso)
    return () => { vivo = false }
  }, [valor, ms])

  return mostrado
}
