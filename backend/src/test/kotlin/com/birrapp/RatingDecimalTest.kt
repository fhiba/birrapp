package com.birrapp

import com.birrapp.core.ApiException
import com.birrapp.ratings.NewRatingRequest
import com.birrapp.ratings.RatingRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * La nota se puede cargar con un decimal: un 3,8 es un 3,8, no un 4.
 *
 * El promedio de la comunidad ya se mostraba con decimales; lo que faltaba era
 * poder *ingresar* uno. El piso baja a 0: con input numérico "estuvo pésima"
 * es un valor legítimo, distinto de "no voté" (que es la ausencia de fila).
 */
class RatingDecimalTest {
    private val lat = -34.6037
    private val lng = -58.3816
    private val repo by lazy { RatingRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `un puntaje con un decimal se guarda tal cual`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        repo.upsert(NewRatingRequest(bar, "ipa", "antares", 3.8), u)

        assertEquals(listOf(3.8), repo.mine(bar, u).map { it.rating })
    }

    @Test
    fun `un puntaje con mas precision se redondea a un decimal`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        repo.upsert(NewRatingRequest(bar, "ipa", "antares", 2.06), u)

        assertEquals(listOf(2.1), repo.mine(bar, u).map { it.rating })
    }

    @Test
    fun `cero es un puntaje valido`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        repo.upsert(NewRatingRequest(bar, "ipa", "antares", 0.0), u)

        assertEquals(listOf(0.0), repo.mine(bar, u).map { it.rating })
    }

    @Test
    fun `no se acepta un puntaje por encima de cinco`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        assertFailsWith<ApiException> {
            repo.upsert(NewRatingRequest(bar, "ipa", "antares", 5.1), u)
        }
    }

    @Test
    fun `no se acepta un puntaje negativo`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        assertFailsWith<ApiException> {
            repo.upsert(NewRatingRequest(bar, "ipa", "antares", -0.1), u)
        }
    }
}
