/**
 * Los puntos que da cada aporte, y si se muestran.
 *
 * ## Por qué hoy no se muestran
 *
 * `KARMA_VISIBLE` está en `false` **a propósito y a la espera**: el sistema de
 * karma no existe todavía. Los números de acá abajo son reales —salen de
 * `CONTRIBUTION_WEIGHT`, en `backend/.../moderation/AnalyticsRepo.kt`, y son
 * los que ordenan la tabla de Colaboradores— pero lo que no existe es lo que
 * un "+3 pts" arriba de un botón promete: un saldo que se mira, niveles, algo
 * que los puntos hagan. Prometer una recompensa que no llega es peor que no
 * prometer nada, y encima gasta el gesto una sola vez.
 *
 * Cuando el sistema esté, esto se prende acá y vuelve a aparecer en los cuatro
 * lugares que ya lo dibujan. Por eso es una constante y no código borrado.
 *
 * ## Por qué los números viven acá
 *
 * Estaban copiados en tres archivos (`BarDetail`, `PhotoStrip`,
 * `Contributors`), que es exactamente lo que el comentario del backend avisa
 * que se desincroniza. Una copia sola sigue siendo una copia —la verdad es del
 * servidor— pero una copia se arregla en un lugar.
 */
export const KARMA_VISIBLE = false

export const KARMA = {
  precio: 3,
  bar: 3,
  foto: 2,
  nota: 2,
  confirmar: 1,
} as const
