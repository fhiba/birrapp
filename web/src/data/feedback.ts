/**
 * Que la app conteste cuando tocás algo.
 *
 * Hasta acá, confirmar un precio, votar una foto o marcar un favorito no
 * producían nada hasta que volvía el servidor. En una app que se usa parado en
 * un bar, con una mano y mirando la pantalla de reojo, esa espera se siente
 * como que el toque no entró — y la respuesta natural es tocar de nuevo.
 *
 * ## Dos canales, y por qué los dos
 *
 * - **Vibración.** Es la que más sirve acá: llega aunque no estés mirando y no
 *   molesta a nadie más. `navigator.vibrate` existe en Android y **no** en
 *   Safari de iOS, así que no se puede depender sólo de esto.
 * - **Sonido.** Cubre iOS, donde no hay vibración desde la web. Son tonos
 *   sintetizados y no archivos: tres notas cortas no justifican bajar assets,
 *   y así no hay nada que cachear ni que se rompa con el service worker.
 *
 * Los dos se pueden apagar por separado desde Configuración. El sonido viene
 * prendido porque se pidió así, pero es el primero que alguien va a querer
 * apagar: una app que suena en un bar con gente es más molesta que útil. Si
 * conviene que arranque apagado, es cambiar `true` por `false` en [SONIDO].
 *
 * ## Lo que NO hace
 *
 * No hay feedback en cada toque. Sólo en los que **cambian algo**: un voto, un
 * precio, un favorito, una birra anotada, y los errores. Vibrar al abrir una
 * pantalla es ruido, y un canal que avisa de todo deja de avisar de nada.
 */

const SONIDO = 'birrapp:sonido'
const VIBRAR = 'birrapp:vibrar'

function prendido(clave: string): boolean {
  try { return localStorage.getItem(clave) !== '0' }
  catch { return true }
}

export const sonidoPrendido = () => prendido(SONIDO)
export const vibrarPrendido = () => prendido(VIBRAR)

export function setSonido(on: boolean) {
  try { localStorage.setItem(SONIDO, on ? '1' : '0') } catch { /* modo privado */ }
}

export function setVibrar(on: boolean) {
  try { localStorage.setItem(VIBRAR, on ? '1' : '0') } catch { /* modo privado */ }
}

/**
 * El contexto de audio, creado tarde y una sola vez.
 *
 * Los navegadores no dejan sonar hasta que hubo un gesto de la persona, así
 * que crearlo al cargar la app lo deja en `suspended` para siempre. Se crea en
 * el primer sonido, que por definición sale de un toque.
 */
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    // En iOS vuelve a 'suspended' cada vez que la app pasa a segundo plano.
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

/**
 * Un tono corto.
 *
 * Onda triangular y no cuadrada: la cuadrada tiene armónicos que en el
 * parlante de un teléfono suenan a alarma. La envolvente sube y baja en
 * milisegundos porque un tono que arranca de golpe hace "click".
 */
function tono(hz: number, ms: number, volumen = 0.05) {
  const a = audio()
  if (!a) return
  try {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'triangle'
    osc.frequency.value = hz
    const t = a.currentTime
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(volumen, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000)
    osc.connect(gain).connect(a.destination)
    osc.start(t)
    osc.stop(t + ms / 1000 + 0.02)
  } catch { /* sin audio: la vibración ya avisó */ }
}

function vibrar(patron: number | number[]) {
  if (!vibrarPrendido()) return
  try { navigator.vibrate?.(patron) } catch { /* no todos lo tienen */ }
}

/** Un toque que hizo algo: marcar un favorito, votar una foto, puntuar. */
export function tap() {
  vibrar(12)
  if (sonidoPrendido()) tono(880, 45)
}

/** Algo quedó guardado: un precio, una confirmación, una birra anotada. */
export function exito() {
  vibrar([14, 40, 22])
  if (!sonidoPrendido()) return
  // Dos notas que suben: es la forma más corta de que algo suene a "listo" y
  // no a "atención".
  tono(660, 70)
  setTimeout(() => tono(990, 90), 70)
}

/** Algo salió mal. Más largo y más grave: tiene que distinguirse sin mirar. */
export function error() {
  vibrar([40, 60, 40])
  if (sonidoPrendido()) tono(220, 160, 0.06)
}
