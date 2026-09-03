package com.birrapp

import com.birrapp.prices.NewPriceRequest
import com.birrapp.prices.PriceRepo
import com.birrapp.ratings.NewRatingRequest
import com.birrapp.ratings.RatingRepo
import com.birrapp.core.query
import com.birrapp.moderation.AnalyticsRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Las analíticas del dashboard.
 *
 * Lo que se testea es el SQL, que es donde vive todo. Un error acá no rompe
 * nada: muestra números equivocados, que es peor, porque se le cree.
 */
class AnalyticsTest {
    private val lat = -34.6037
    private val lng = -58.3816
    private val prices by lazy { PriceRepo(TestDb.db) }
    private val ratings by lazy { RatingRepo(TestDb.db) }
    private val analytics by lazy { AnalyticsRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `la vista separa precio de confirmacion y junta los cinco tipos`() {
        val u1 = TestDb.insertUser("user1")
        val u2 = TestDb.insertUser("user2")
        val bar = TestDb.insertBar("Prueba", lat, lng, createdBy = u2)

        // Precio: lo reporta u1
        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), u1)

        // Confirmación: u2 confirma el precio (u1 no puede porque cooldown)
        prices.confirm(bar, "ipa", "antares", u2)

        // Bar: lo creó u2
        // (ya está creado arriba)

        // Foto: u1 la sube
        TestDb.insertPhoto(bar, "ipa", u1)

        // Nota: u1 la da
        ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 4.0), u1)

        // u1 debe tener: price, photo, rating (3 aportes)
        val u1Kinds = TestDb.db.conn { c ->
            c.query("SELECT kind FROM v_contributions WHERE user_id = ?", u1) {
                it.getString("kind")
            }
        }.sorted()
        assertEquals(
            listOf("photo", "price", "rating"),
            u1Kinds,
            "user1 debe tener exactamente: price (reportado), photo (subida), rating (dada)"
        )

        // u2 debe tener: bar, confirmation (2 aportes)
        val u2Kinds = TestDb.db.conn { c ->
            c.query("SELECT kind FROM v_contributions WHERE user_id = ?", u2) {
                it.getString("kind")
            }
        }.sorted()
        assertEquals(
            listOf("bar", "confirmation"),
            u2Kinds,
            "user2 debe tener exactamente: bar (creado), confirmation (confirmada)"
        )
    }

    @Test
    fun `fotos con user_id NULL no aparecen en la vista`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        // Inserta una foto y luego la nulifica el user_id (como si se borrara el usuario)
        TestDb.insertPhoto(bar, "ipa", u)
        TestDb.db.conn { c ->
            c.prepareStatement("UPDATE bar_photos SET user_id = NULL")
                .use { it.execute() }
        }

        // La vista no debe tener ninguna fila para esa foto
        val rows = TestDb.db.conn { c ->
            c.query("SELECT * FROM v_contributions WHERE kind = 'photo'") {
                it.getLong(1)
            }
        }

        assertEquals(emptyList(), rows, "fotos sin usuario no deben aparecer en v_contributions")
    }

    @Test
    fun `el pulso trae una fila por dia aunque no haya pasado nada`() {
        assertEquals(30, analytics.pulse(30).size,
            "un hueco sin fila obligaría al front a interpolar, que es mentir")
    }

    @Test
    fun `el pulso de hoy separa precio de confirmacion`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)
        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), u)

        val hoy = analytics.pulse(30).last()
        assertEquals(1, hoy.prices)
        assertEquals(0, hoy.confirmations)
    }

    @Test
    fun `los aportantes de la semana son personas distintas y no aportes`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        // Tres aportes de la misma persona en la misma semana.
        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), u)
        ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 4.0), u)
        ratings.upsert(NewRatingRequest(bar, "ipa", "berlina", 3.0), u)

        val semana = analytics.weekly(12).last()
        assertEquals(1, semana.contributors,
            "una persona muy activa no puede parecer tres personas")
        assertEquals(1, semana.signups)
    }

    @Test
    fun `la serie semanal trae una fila por semana aunque esten vacias`() {
        assertEquals(12, analytics.weekly(12).size)
    }

    @Test
    fun `un precio viejo cuenta para su epoca pero no para hoy`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)
        TestDb.insertPrice(bar, "ipa", 8000.0, daysAgo = 60, userId = u)

        val cobertura = analytics.coverage(90)
        assertEquals(90, cobertura.size,
            "la serie debe tener exactamente 90 días para que el índice [89 - 50] sea confiable")

        val serie = cobertura.associateBy { it.day }
        val hoy = serie.keys.max()
        val haceCincuenta = serie.keys.sorted()[89 - 50]

        assertEquals(1, serie[haceCincuenta]!!.covered,
            "hace 50 días ese precio tenía 10 días: estaba vigente")
        assertEquals(0, serie[hoy]!!.covered,
            "hoy tiene 60 días: venció a los 45")
    }

    @Test
    fun `el denominador son los bares que existian a esa fecha`() {
        TestDb.insertBar("Nuevo", lat, lng)

        val serie = analytics.coverage(90)
        assertEquals(0, serie.first().bars,
            "un bar creado hoy no puede bajar la cobertura de hace tres meses")
        assertEquals(1, serie.last().bars)
    }

    @Test
    fun `el top ordena por score y no por cantidad de aportes`() {
        val calidad = TestDb.insertUser("calidad")
        val cantidad = TestDb.insertUser("cantidad")
        val bar = TestDb.insertBar("Prueba", lat, lng)

        // Dos notas: 2 + 2 = 4 puntos en 2 aportes.
        ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 4.0), calidad)
        ratings.upsert(NewRatingRequest(bar, "ipa", "berlina", 3.0), calidad)
        // Tres confirmaciones: 1 + 1 + 1 = 3 puntos en 3 aportes.
        repeat(3) { i ->
            TestDb.insertPrice(
                bar, "ipa", 8000.0, daysAgo = i, userId = cantidad, isConfirmation = true,
            )
        }

        val top = analytics.topContributors(10)
        // Por cantidad ganaría "cantidad", que hizo tres cosas contra dos.
        assertEquals("calidad", top.first().displayName, "ordena por peso, no por volumen")
        assertEquals(4, top.first().score)
        assertEquals(2, top.first().ratings)
        assertEquals(3, top[1].score)
        assertEquals(3, top[1].confirmations)
    }

    @Test
    fun `la concentracion es la porcion del score que se lleva el top cinco`() {
        val bar = TestDb.insertBar("Prueba", lat, lng)
        // Seis personas con una nota cada una: 2 puntos cada una, 12 en total.
        // El top 5 se lleva 10 de 12.
        listOf("a", "b", "c", "d", "e", "f").forEach { name ->
            val u = TestDb.insertUser(name)
            ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 4.0), u)
        }

        assertEquals(10.0 / 12.0, analytics.top5Share(), 0.001)
    }

    @Test
    fun `el embudo no cuenta como constante al que aporto cuatro veces`() {
        val u = TestDb.insertUser("cuatro")
        val bar = TestDb.insertBar("Prueba", lat, lng)
        repeat(4) { i ->
            TestDb.insertPrice(bar, "ipa", 8000.0 + i, daysAgo = i, userId = u)
        }

        val f = analytics.funnel()
        assertEquals(1, f.accounts)
        assertEquals(1, f.everContributed)
        assertEquals(0, f.fiveOrMore, "cuatro no llega al escalón de cinco")
        assertEquals(1, f.activeMonth)
    }
}
