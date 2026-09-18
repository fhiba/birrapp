/**
 * El nivel del perfil, según las birras anotadas en los últimos 45 días.
 *
 * **Se cuenta una ventana móvil, no el total histórico.** El nivel se mantiene
 * tomando: quien dejó de anotar hace dos meses baja. Eso es lo que lo hace
 * decir algo sobre cómo venís, y no sobre cuánto acumulaste alguna vez — que
 * es un número que sólo sube y por lo tanto no es una noticia.
 *
 * Los 45 días son el mismo corte que `VIEJO_DIAS` en `format.ts`, cuándo un
 * precio deja de ser referencia. La ventana la calcula el servidor
 * (`UserStats.beersRecent`): acá no se decide ningún umbral de tiempo.
 *
 * `desde` es el piso de cada nivel, o sea cuántas birras hay que tener para
 * estar ahí. El último no tiene techo.
 */
export const NIVELES: { nombre: string; desde: number }[] = [
  { nombre: 'Pichi',                  desde: 0 },
  { nombre: 'Primeras pintas',        desde: 5 },
  { nombre: 'Aprendiz de la birra',   desde: 15 },
  { nombre: 'Semi alcohólico',        desde: 30 },
  { nombre: 'Birrero',                desde: 50 },
  { nombre: 'Maestro birrero',        desde: 75 },
  { nombre: 'Super maestro birrero',  desde: 100 },
  { nombre: 'Super saiyajin birrero', desde: 150 },
]

export interface Nivel {
  /** 1 a NIVELES.length. Es lo que va en el emblema. */
  numero: number
  nombre: string
  /** Cuántas birras hacen falta para el que sigue. `null` en el último. */
  proximo: number | null
  /** Cuánto falta para el que sigue. `0` en el último. */
  faltan: number
  /** De 0 a 1, para la barra. En el último, siempre 1. */
  progreso: number
}

export function nivelDe(birras: number): Nivel {
  // El último cuyo piso ya se alcanzó. La tabla está ordenada de menor a
  // mayor y el primer piso es 0, así que contar los que entran nunca da 0.
  const i = NIVELES.filter(n => birras >= n.desde).length - 1
  const actual = NIVELES[i]
  const siguiente = NIVELES[i + 1]

  if (!siguiente) {
    return {
      numero: i + 1, nombre: actual.nombre,
      proximo: null, faltan: 0, progreso: 1,
    }
  }

  const tramo = siguiente.desde - actual.desde
  return {
    numero: i + 1,
    nombre: actual.nombre,
    proximo: siguiente.desde,
    faltan: siguiente.desde - birras,
    progreso: (birras - actual.desde) / tramo,
  }
}
