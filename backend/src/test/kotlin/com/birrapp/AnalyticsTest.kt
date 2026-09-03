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
}
