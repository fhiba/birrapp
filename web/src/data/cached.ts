import { useEffect, useRef, useState } from 'react'

/**
 * Lo último que se supo, mientras se vuelve a preguntar (BIR-43).
 *
 * El problema era Perfil: cada vez que se entraba, la grilla de números
 * arrancaba en cuatro guiones y se quedaba así hasta que contestaba el
 * servidor. No es que la consulta fuera lenta — es que no había nada que
 * mostrar mientras tanto, y son cinco enteros que la persona ya vio.
 *
 * La estrategia es *stale-while-revalidate*, y se eligió sobre las otras dos
 * candidatas por lo que hace cada una cuando el dato cambió:
 *
 *  - **Caché con vencimiento** (guardar 5 minutos y no preguntar): el número
 *    queda viejo justo en el caso que importa. Cargás un precio, volvés a
 *    Perfil y el contador dice lo de antes. Peor que tardar.
 *  - **Nada** (lo de hoy): correcto siempre, pero la pantalla parpadea en cada
 *    entrada aunque no haya cambiado nada.
 *  - **Esto**: se pinta lo guardado al instante y se pregunta igual, siempre,
 *    en segundo plano. Si cambió, se actualiza sin que la pantalla se vacíe.
 *    Nunca se muestra menos información que antes.
 *
 * Va en `localStorage` y no en memoria porque el caso es justamente volver a
 * entrar, y en una PWA eso muchas veces es una carga nueva de la app.
 *
 * Sólo para datos chicos, propios y que se pueden mostrar un segundo viejos.
 * Nada de un precio suelto: un precio viejo pintado como fresco es exactamente
 * lo que esta app existe para no hacer.
 *
 * El promedio de la zona (`AreaStats`) sí pasa, y la diferencia es que ese
 * número **dice su alcance al lado** —"N precios, de menos de 45 días"— así
 * que no se puede leer como el precio de hoy de ningún bar. Además se
 * reemplaza en cuanto llega el fresco, que es el mismo round-trip que hoy se
 * espera mirando el vacío.
 *
 * `delayMs` es para las claves que cambian arrastrando un slider: sin él, el
 * radio pediría una vez por píxel. El rebote corre por cada clave nueva, así
 * que la última gana y las intermedias no llegan a salir.
 */
export function useCached<T>(
  key: string | null, fetcher: () => Promise<T>, delayMs = 0,
) {
  const [data, setData] = useState<T | null>(() => read<T>(key))
  const [error, setError] = useState<string | null>(null)

  // El fetcher se pasa por ref y no como dependencia: es una función nueva en
  // cada render, y como dependencia del efecto pediría en bucle.
  const fetch = useRef(fetcher)
  fetch.current = fetcher

  useEffect(() => {
    if (!key) { setData(null); return }
    // Al cambiar de clave —otra cuenta— se pinta lo de esa clave, no lo que
    // había en pantalla. Si no, se le muestran a alguien los números de otro.
    setData(read<T>(key))

    let alive = true
    const t = setTimeout(() => {
      fetch.current()
        .then(fresh => {
          if (!alive) return
          write(key, fresh)
          setData(fresh)
          setError(null)
        })
        .catch((e: unknown) => {
          // Con algo guardado, un fallo de red no borra la pantalla: lo que se
          // ve sigue siendo verdad, sólo que de hace un rato.
          if (alive && read(key) == null) setError((e as Error).message)
        })
    }, delayMs)
    return () => { alive = false; clearTimeout(t) }
  }, [key, delayMs])

  return { data, error }
}

/**
 * Deja una clave cargada antes de que alguien entre a la pantalla que la usa.
 *
 * El caso es cambiar de pestaña: el mapa ya sabe qué zona estás mirando, pero
 * "Cerca" no pide el promedio de esa zona hasta que la abrís, así que la
 * pantalla arranca vacía y se queda un viaje entero así. Calentando la clave
 * desde el mapa, al entrar ya hay algo escrito y `useCached` lo pinta en el
 * primer render.
 *
 * **Sólo pide si la clave está fría.** Si ya hay algo guardado, `useCached`
 * lo va a mostrar al instante y revalidar por su cuenta; volver a pedirlo acá
 * sería una consulta de más por cada paneo del mapa para adelantar trabajo que
 * ya está hecho. Lo que se está comprando es que no haya pantalla en blanco,
 * no que el número sea de hace un segundo en vez de hace un minuto.
 *
 * Un fallo no se reporta a ningún lado: esto es trabajo especulativo para una
 * pantalla en la que quizá nadie entre. Si sale mal, la pantalla pide el dato
 * como pedía antes.
 */
export async function prefetchCached<T>(key: string, fetcher: () => Promise<T>) {
  if (read(key) != null) return
  try { write(key, await fetcher()) }
  catch { /* especulativo: la pantalla lo vuelve a pedir si hace falta */ }
}

/** Se descarta lo guardado al cerrar sesión: son datos de una persona. */
export function clearCached(prefix = PREFIX) {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(prefix)) localStorage.removeItem(k)
    }
  } catch { /* modo privado, o sin permiso: no hay nada que limpiar */ }
}

const PREFIX = 'birrapp:cache:'

function read<T>(key: string | null): T | null {
  if (!key) return null
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? null : JSON.parse(raw) as T
  } catch {
    // JSON roto de una versión anterior, o localStorage bloqueado. Se trata
    // como "no hay nada guardado", que es el caso que ya sabe manejar.
    return null
  }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)) }
  catch { /* sin espacio o en modo privado: se sigue sin caché */ }
}
