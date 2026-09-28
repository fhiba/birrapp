package com.birrapp.loyalty

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant

/**
 * Las reglas económicas del programa de puntos, en un solo lugar.
 *
 * ## Por qué están acá y no repartidas
 *
 * Son los números que van a cambiar más veces que cualquier otra cosa del
 * programa: cuánto vale un punto, cuánto dura y cuánto se puede sumar por día.
 * Repartidos por los repositorios, cambiarlos sería una cacería; acá es una
 * línea, y además se pueden mover por entorno sin volver a desplegar — staging
 * puede tener puntos que vencen en dos días para poder probar el vencimiento
 * sin esperar dos meses.
 *
 * ## Lo que NO hace
 *
 * No toca los puntos ya acreditados. El vencimiento de cada acreditación se
 * escribe en el ledger (`points_ledger.expires_at`) en el momento de acreditar,
 * así que bajar [diasDeVigencia] mañana no le adelanta el vencimiento a nadie.
 * Es deliberado: un punto prometido con una fecha es una promesa, y cambiarla
 * hacia atrás es lo que hace que la gente deje de creerle a un programa de
 * fidelización.
 *
 * Lo mismo con la conversión: [puntosPor] se aplica una sola vez, al acreditar.
 */
data class LoyaltyProgram(
    /**
     * Cuántos pesos hacen un punto.
     *
     * Con 100, un consumo de $12.000 da 120 puntos. El número real lo define el
     * negocio y todavía no está cerrado; éste es un valor de trabajo.
     */
    val pesosPorPunto: BigDecimal,

    /**
     * Cuánto dura un punto desde que se acredita.
     *
     * Vencen a propósito y relativamente rápido: un punto que no vence es deuda
     * para siempre, y la paga el bar que se queda en el programa. Entre 45 y 60
     * días la presión por canjear es real sin dejar afuera a quien sale una vez
     * por mes.
     */
    val diasDeVigencia: Long,

    /**
     * Techo de puntos que una persona puede sumar en un día.
     *
     * Es la mitad del antifraude que no depende de ARCA. La otra mitad es que
     * el comprobante es único. Esto acota el daño de quien junta tickets ajenos
     * de una mesa, que es el agujero que deja el QR estando a la vista.
     */
    val puntosMaximosPorDia: Int,

    /**
     * Cuánto vive un código de canje.
     *
     * Corto porque el código es al portador: quien lo ve, lo puede usar. Cinco
     * minutos es lo que tarda un mozo en venir a la mesa.
     */
    val vigenciaDelCodigo: Duration,
) {
    /**
     * Cuántos puntos da un importe.
     *
     * Redondeo **hacia abajo**. No es tacañería: hacia arriba, veinte tickets
     * de importe mínimo fabrican puntos de la nada. Un importe menor a un punto
     * da cero, y está bien.
     */
    fun puntosPor(importe: BigDecimal): Int =
        importe.divide(pesosPorPunto, 0, RoundingMode.DOWN).toInt().coerceAtLeast(0)

    /** Cuándo vence lo que se acredita ahora. */
    fun venceEl(ahora: Instant = Instant.now()): Instant =
        ahora.plus(Duration.ofDays(diasDeVigencia))

    companion object {
        /**
         * Los valores de la prueba de concepto.
         *
         * Se leen del entorno para poder moverlos en staging sin tocar el
         * código, con estos defaults cuando no están puestos.
         */
        fun fromEnv(raw: (String) -> String?): LoyaltyProgram = LoyaltyProgram(
            pesosPorPunto = raw("LOYALTY_PESOS_POR_PUNTO")?.toBigDecimalOrNull()
                ?: BigDecimal("100"),
            diasDeVigencia = raw("LOYALTY_DIAS_VIGENCIA")?.toLongOrNull() ?: 60L,
            puntosMaximosPorDia = raw("LOYALTY_PUNTOS_MAX_DIA")?.toIntOrNull() ?: 500,
            vigenciaDelCodigo = Duration.ofSeconds(
                raw("LOYALTY_SEGUNDOS_CODIGO")?.toLongOrNull() ?: 300L,
            ),
        )
    }
}
