package com.birrapp

import com.birrapp.moderation.ModerationRepo
import com.birrapp.prices.NewPriceRequest
import com.birrapp.prices.PriceRepo
import com.birrapp.ratings.NewRatingRequest
import com.birrapp.ratings.RatingRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * El dashboard de moderación.
 *
 * Lo que se testea acá es el SQL, que es donde vive todo: son agregados por
 * usuario con cuatro CTE y un GREATEST sobre columnas que pueden ser NULL. Un
 * error ahí no rompe nada — muestra números equivocados, que es peor.
 */
class DashboardTest {
    private val lat = -34.6037
    private val lng = -58.3816
    private val repo by lazy { ModerationRepo(TestDb.db) }
    private val prices by lazy { PriceRepo(TestDb.db) }
    private val ratings by lazy { RatingRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `cada usuario trae sus aportes desglosados`() {
        val activo = TestDb.insertUser("activo")
        val mirón = TestDb.insertUser("miron")
        val bar = TestDb.insertBar("Prueba", lat, lng)

        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), activo)
        prices.report(NewPriceRequest(bar, "rubia", 5000.0), activo)
        ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 4), activo)

        val rows = repo.recentUsers().associateBy { it.displayName }

        val a = rows.getValue("activo")
        assertEquals(2, a.prices)
        assertEquals(0, a.confirmations, "cargar no es confirmar: se cuentan aparte")
        assertEquals(1, a.ratings)
        assertEquals(0, a.lastActiveDays)

        // Quien no aportó nada tiene que aparecer igual, en cero: la pregunta
        // del dashboard es justamente cuántos de los que se anotan vuelven.
        val m = rows.getValue("miron")
        assertEquals(0, m.prices)
        assertEquals(0, m.ratings)
        assertNull(m.lastActiveDays, "nunca aportó: no tiene última actividad")
        assertEquals(2, rows.size)
    }

    @Test
    fun `confirmar cuenta separado de cargar`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("Prueba", lat, lng)

        prices.report(NewPriceRequest(bar, "rubia", 5000.0), a)
        prices.confirm(bar, "rubia", null, b)

        val rows = repo.recentUsers().associateBy { it.displayName }
        assertEquals(1, rows.getValue("a").prices)
        assertEquals(0, rows.getValue("a").confirmations)
        assertEquals(0, rows.getValue("b").prices)
        assertEquals(1, rows.getValue("b").confirmations)
    }

    @Test
    fun `el resumen cuenta personas y no aportes`() {
        val a = TestDb.insertUser("a")
        TestDb.insertUser("b")
        val bar = TestDb.insertBar("Prueba", lat, lng)

        // Una sola persona con tres aportes no puede parecer tres personas.
        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), a)
        prices.report(NewPriceRequest(bar, "rubia", 5000.0), a)
        ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 4), a)

        val s = repo.dashboardSummary()
        assertEquals(2, s.users)
        assertEquals(2, s.usersWeek)
        assertEquals(1, s.contributorsMonth, "aportó una sola persona, aunque tres veces")
        assertEquals(2, s.pricesWeek)
    }

    @Test
    fun `la cobertura no cuenta bares con precio vencido`() {
        val u = TestDb.insertUser()
        val fresco = TestDb.insertBar("Fresco", lat, lng)
        val viejo = TestDb.insertBar("Viejo", lat, lng + 0.01)

        prices.report(NewPriceRequest(fresco, "rubia", 5000.0), u)
        TestDb.insertPrice(viejo, "rubia", 4000.0, daysAgo = 90, userId = u)

        val s = repo.dashboardSummary()
        assertEquals(2, s.bars)
        assertEquals(
            1, s.barsWithFreshPrice,
            "un bar con un precio de hace 90 días está en el mapa pero no contesta nada",
        )
        assertTrue(s.barsWithFreshPrice <= s.bars)
    }
}
