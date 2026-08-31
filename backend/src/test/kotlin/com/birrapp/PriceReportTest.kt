package com.birrapp

import com.birrapp.core.ApiException
import com.birrapp.prices.NewPriceRequest
import com.birrapp.prices.PriceRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PriceReportTest {
    private val lat = -34.6037
    private val lng = -58.3816
    private val repo by lazy { PriceRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `reportar dos veces el mismo bar y estilo dentro del cooldown falla`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        repo.report(NewPriceRequest(bar, "rubia", 4500.0), u)
        val e = assertFailsWith<ApiException> {
            repo.report(NewPriceRequest(bar, "rubia", 4600.0), u)
        }
        assertEquals(429, e.status.value)
    }

    @Test
    fun `usuarios distintos si pueden reportar el mismo bar y estilo`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("Prueba", lat, lng)

        repo.report(NewPriceRequest(bar, "rubia", 4500.0), a)
        val second = repo.report(NewPriceRequest(bar, "rubia", 4600.0), b)
        assertFalse(second.heldForReview)
    }

    @Test
    fun `un precio atipico queda retenido y no se publica`() {
        val bar = TestDb.insertBar("Prueba", lat, lng)
        // Base de mercado: cinco bares con precios normales.
        repeat(5) { i ->
            val u = TestDb.insertUser("normal$i")
            val b = TestDb.insertBar("Normal$i", lat + i * 0.001, lng)
            TestDb.insertPrice(b, "rubia", 4500.0, daysAgo = 1, userId = u)
        }

        val troll = TestDb.insertUser("troll")
        val result = repo.report(NewPriceRequest(bar, "rubia", 100_000.0), troll)

        assertTrue(result.heldForReview, "un precio 20x la mediana tiene que ir a revisión")

        // Retenido = no aparece en el detalle del bar.
        val detail = com.birrapp.bars.BarRepo(TestDb.db).detail(bar, null, null)!!
        assertTrue(detail.prices.isEmpty(), "un precio retenido no puede estar visible")

        // Y quedó una denuncia automática para el moderador.
        val flags = com.birrapp.moderation.ModerationRepo(TestDb.db).openFlags()
        assertEquals(1, flags.size)
        assertEquals("price", flags.single().targetType)
    }

    @Test
    fun `la deteccion de outliers normaliza por tamano`() {
        repeat(5) { i ->
            val u = TestDb.insertUser("normal$i")
            val b = TestDb.insertBar("Normal$i", lat + i * 0.001, lng)
            TestDb.insertPrice(b, "rubia", 4730.0, daysAgo = 1, userId = u, sizeMl = 473)
        }
        // Un schop de 330 ml a $3300 es el MISMO precio por litro. Si la
        // detección no normalizara por tamaño, esto daría falso positivo.
        val u = TestDb.insertUser("schop")
        val bar = TestDb.insertBar("Schopería", lat, lng)
        val result = repo.report(NewPriceRequest(bar, "rubia", 3300.0, sizeMl = 330), u)
        assertFalse(result.heldForReview, "mismo $/litro no puede ser un outlier")
    }

    @Test
    fun `sin datos suficientes no se retiene nada`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Primero", lat, lng)
        // Sin mercado con el que comparar, no se puede decidir si es atípico.
        val result = repo.report(NewPriceRequest(bar, "rubia", 999_999.0), u)
        assertFalse(result.heldForReview)
    }

    @Test
    fun `sigue igual reinserta el precio vigente con fecha de hoy`() {
        val autor = TestDb.insertUser("autor")
        val bar = TestDb.insertBar("Prueba", lat, lng)
        TestDb.insertPrice(bar, "rubia", 4500.0, daysAgo = 40, userId = autor)

        val antes = com.birrapp.bars.BarRepo(TestDb.db).detail(bar, null, null)!!
        assertEquals("aging", antes.prices.single().freshness)

        val otro = TestDb.insertUser("confirmador")
        repo.confirm(bar, "rubia", otro)

        val despues = com.birrapp.bars.BarRepo(TestDb.db).detail(bar, null, null)!!
        assertEquals("fresh", despues.prices.single().freshness)
        assertEquals(4500.0, despues.prices.single().price, "confirmar no cambia el precio")
        assertEquals(0, despues.prices.single().ageDays)
    }

    @Test
    fun `el historico conserva todos los reportes`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("Prueba", lat, lng)
        TestDb.insertPrice(bar, "rubia", 3000.0, daysAgo = 60, userId = a)
        TestDb.insertPrice(bar, "rubia", 4000.0, daysAgo = 30, userId = b)
        repo.report(NewPriceRequest(bar, "rubia", 5000.0), a)

        val history = repo.history(bar, "rubia")
        assertEquals(3, history.size, "los precios son append-only: nada se pisa")
        assertEquals(listOf(5000.0, 4000.0, 3000.0), history.map { it.price })
    }

    @Test
    fun `rechaza precios invalidos`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)
        assertFailsWith<ApiException> { repo.report(NewPriceRequest(bar, "rubia", -5.0), u) }
        assertFailsWith<ApiException> { repo.report(NewPriceRequest(bar, "rubia", 100.0, sizeMl = 5), u) }
        assertFailsWith<ApiException> { repo.report(NewPriceRequest(bar, "no-existe", 100.0), u) }
    }
}
