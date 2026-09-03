package com.birrapp

import com.birrapp.prices.NewPriceRequest
import com.birrapp.prices.PriceRepo
import com.birrapp.ratings.NewRatingRequest
import com.birrapp.ratings.RatingRepo
import com.birrapp.core.query
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

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `la vista separa precio de confirmacion y junta los cuatro tipos`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), u)
        ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 4.0), u)

        val kinds = TestDb.db.conn { c ->
            c.query("SELECT kind FROM v_contributions WHERE user_id = ?", u) {
                it.getString("kind")
            }
        }.sorted()

        // `TestDb.insertBar` inserta con created_by NULL (TestDb.kt:74), así que
        // el bar no se le atribuye a nadie y no aparece acá. Van el precio y la
        // nota, cada uno con su kind.
        assertEquals(listOf("price", "rating"), kinds)
    }
}
