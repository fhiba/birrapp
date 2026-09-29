package com.birrapp

import com.birrapp.loyalty.LoyaltyProgram
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * La conversión de plata a puntos.
 *
 * No toca la base: son las reglas económicas del programa y nada más. Lo que
 * se fija acá es el redondeo, que es el único lugar de toda la cuenta donde se
 * pueden fabricar puntos sin que nadie consuma nada.
 */
class LoyaltyProgramTest {

    private val programa = LoyaltyProgram(
        pesosPorPunto = BigDecimal("100"),
        diasDeVigencia = 60,
        puntosMaximosPorDia = 500,
        vigenciaDelCodigo = Duration.ofMinutes(5),
    )

    @Test
    fun `convierte el importe a puntos`() {
        assertEquals(120, programa.puntosPor(BigDecimal("12000")))
        assertEquals(1, programa.puntosPor(BigDecimal("100")))
    }

    @Test
    fun `redondea hacia abajo, siempre`() {
        // Hacia arriba, veinte tickets de importe mínimo fabrican veinte puntos
        // sin que nadie haya consumido nada. El redondeo es antifraude, no
        // prolijidad.
        assertEquals(0, programa.puntosPor(BigDecimal("99.99")))
        assertEquals(120, programa.puntosPor(BigDecimal("12099.99")))
        assertEquals(0, programa.puntosPor(BigDecimal("0.01")))
    }

    @Test
    fun `cambiar la regla no mueve lo ya acreditado`() {
        // La conversión se aplica al acreditar y el vencimiento se escribe en
        // el ledger, así que esta clase no tiene forma de tocar el pasado. El
        // test fija la propiedad: dos programas distintos no comparten estado.
        val barato = programa.copy(pesosPorPunto = BigDecimal("50"))
        assertEquals(120, programa.puntosPor(BigDecimal("12000")))
        assertEquals(240, barato.puntosPor(BigDecimal("12000")))
    }

    @Test
    fun `el vencimiento sale de la fecha de acreditacion`() {
        val ahora = Instant.parse("2026-01-01T00:00:00Z")
        assertEquals(Instant.parse("2026-03-02T00:00:00Z"), programa.venceEl(ahora))
    }

    @Test
    fun `los valores por defecto son los de la prueba de concepto`() {
        val p = LoyaltyProgram.fromEnv { null }
        assertEquals(BigDecimal("100"), p.pesosPorPunto)
        assertTrue(p.diasDeVigencia in 45..60, "se acordó entre 45 y 60 días")
        assertEquals(Duration.ofMinutes(5), p.vigenciaDelCodigo)
    }

    @Test
    fun `el entorno manda sobre el default`() {
        // Es lo que permite que staging tenga puntos que vencen en dos días y
        // se pueda probar el vencimiento sin esperar dos meses.
        val p = LoyaltyProgram.fromEnv {
            mapOf(
                "LOYALTY_PESOS_POR_PUNTO" to "250",
                "LOYALTY_DIAS_VIGENCIA" to "2",
                "LOYALTY_SEGUNDOS_CODIGO" to "30",
            )[it]
        }
        assertEquals(48, p.puntosPor(BigDecimal("12000")))
        assertEquals(2, p.diasDeVigencia)
        assertEquals(Duration.ofSeconds(30), p.vigenciaDelCodigo)
        assertEquals(500, p.puntosMaximosPorDia, "lo que no se pisa queda en el default")
    }
}
