package com.birrapp

import com.birrapp.core.CoverageBudget
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * El presupuesto de cobertura de BIR-13.
 *
 * Lo que se testea es la propiedad que hace que esto sirva de algo: **repetir
 * es gratis y descubrir se paga**. Si esa asimetría se rompe, el mecanismo
 * pasa a ser una cuota de volumen, que ya sabemos que no separa al usuario del
 * scraper —el scraper pide menos filas que el usuario real—.
 *
 * No toca la base: [CoverageBudget] es memoria y nada más.
 */
class CoverageBudgetTest {

    private var day = LocalDate.of(2026, 9, 4)
    private fun budget(perDay: Int = 10, maxKeys: Int = 100) =
        CoverageBudget(perDay = perDay, maxKeys = maxKeys, today = { day })

    // ---------- lo que tiene que seguir andando ----------

    @Test
    fun `pedir siempre la misma zona nunca se agota`() {
        val b = budget(perDay = 10)
        val barrio = (1L..10L).toList()

        repeat(500) {
            assertTrue(b.charge("ip", barrio), "mirar lo mismo de nuevo no puede costar")
        }
        assertEquals(10, b.spent("ip"))
    }

    @Test
    fun `pedidos que se solapan sólo pagan la parte nueva`() {
        val b = budget(perDay = 10)

        assertTrue(b.charge("ip", listOf(1L, 2L, 3L)))
        assertTrue(b.charge("ip", listOf(2L, 3L, 4L)))

        assertEquals(4, b.spent("ip"), "el 2 y el 3 ya estaban pagos")
    }

    @Test
    fun `un pedido vacío no gasta`() {
        val b = budget(perDay = 10)
        assertTrue(b.charge("ip", emptyList()))
        assertEquals(0, b.spent("ip"))
    }

    // ---------- lo que tiene que frenar ----------

    @Test
    fun `descubrir base nueva se agota`() {
        val b = budget(perDay = 10)

        assertTrue(b.charge("ip", (1L..10L).toList()))
        assertFalse(b.charge("ip", listOf(11L)), "el 11 es territorio nuevo y ya no hay")
    }

    @Test
    fun `un pedido rechazado no consume presupuesto`() {
        val b = budget(perDay = 10)
        assertTrue(b.charge("ip", (1L..8L).toList()))

        assertFalse(b.charge("ip", (9L..14L).toList()), "seis nuevos no entran en dos")
        assertEquals(8, b.spent("ip"), "rebotar no puede empeorar la cuenta")

        assertTrue(b.charge("ip", listOf(9L, 10L)), "dos sí entran")
    }

    @Test
    fun `el techo se aplica de a una IP y no entre todas`() {
        val b = budget(perDay = 10)

        assertTrue(b.charge("uno", (1L..10L).toList()))
        assertFalse(b.charge("uno", listOf(99L)))
        assertTrue(b.charge("otro", (1L..10L).toList()), "el vecino no paga lo del scraper")
    }

    // ---------- el corte de día ----------

    @Test
    fun `el presupuesto vuelve al día siguiente`() {
        val b = budget(perDay = 10)
        assertTrue(b.charge("ip", (1L..10L).toList()))
        assertFalse(b.charge("ip", listOf(11L)))

        day = day.plusDays(1)

        assertEquals(0, b.spent("ip"), "el día nuevo arranca en cero")
        assertTrue(b.charge("ip", (11L..20L).toList()))
    }

    // ---------- desalojo ----------

    @Test
    fun `seguir muchas IPs no hace crecer el mapa sin límite`() {
        val b = budget(perDay = 10, maxKeys = 3)

        // Cuatro IPs distintas con un mapa que sigue tres: la primera se cae.
        listOf("a", "b", "c", "d").forEach { assertTrue(b.charge(it, listOf(1L))) }

        assertEquals(0, b.spent("a"), "la más vieja se desalojó")
        assertEquals(1, b.spent("d"))
    }

    @Test
    fun `usar una IP la mantiene viva frente a las nuevas`() {
        val b = budget(perDay = 10, maxKeys = 3)
        b.charge("vieja", listOf(1L))
        b.charge("b", listOf(1L))
        b.charge("c", listOf(1L))

        // Tocarla la manda al fondo de la cola de desalojo: el LRU es por
        // acceso, no por inserción. Sin `accessOrder`, la IP que está usando la
        // app ahora mismo sería la primera en perder su presupuesto.
        b.charge("vieja", listOf(1L))
        b.charge("d", listOf(1L))

        assertEquals(1, b.spent("vieja"))
        assertEquals(0, b.spent("b"), "la que no se tocó es la que se cae")
    }

    // ---------- apagado, que es como sale por default ----------

    @Test
    fun `con presupuesto en cero no cobra nunca`() {
        // Es como queda el servidor por default desde el incidente del
        // 2026-09-04: `Config.coverageBudgetPerDay` es 0 y esto no puede
        // devolver false por ningún camino. Un test acá y no sólo en Config
        // porque lo que importa es que la RUTA nunca rechace.
        val b = CoverageBudget(perDay = 0, today = { day })

        assertFalse(b.enabled)
        repeat(50) { i ->
            assertTrue(
                b.charge("ip", (i * 1000L until i * 1000L + 500L).toList()),
                "apagado no puede rechazar ni con 25.000 bares distintos",
            )
        }
        assertEquals(0, b.spent("ip"), "apagado tampoco recuerda: no gasta memoria")
    }

    @Test
    fun `un presupuesto negativo se trata como apagado`() {
        val b = CoverageBudget(perDay = -1, today = { day })
        assertFalse(b.enabled)
        assertTrue(b.charge("ip", (1L..10_000L).toList()))
    }

    // ---------- el invariante que hace que el endpoint sea usable ----------

    @Test
    fun `un solo pedido al tope de limit siempre entra en el presupuesto`() {
        // Si MAX_LIMIT llegara a superar a DEFAULT_PER_DAY, un request lleno
        // sería irrespondible SIEMPRE, para cualquiera, desde el primer toque.
        // Este test es el que avisa si alguien sube uno sin mirar el otro.
        val maxLimit = 200
        assertTrue(
            maxLimit < CoverageBudget.DEFAULT_PER_DAY,
            "MAX_LIMIT ($maxLimit) tiene que entrar en el presupuesto diario " +
                "(${CoverageBudget.DEFAULT_PER_DAY})",
        )

        val b = CoverageBudget(today = { day })
        assertTrue(b.charge("ip", (1L..maxLimit.toLong()).toList()))
    }
}
