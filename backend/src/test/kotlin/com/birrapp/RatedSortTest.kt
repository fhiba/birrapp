package com.birrapp

import com.birrapp.bars.BarRepo
import com.birrapp.bars.BarSort
import com.birrapp.ratings.NewRatingRequest
import com.birrapp.ratings.RatingRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Orden "mejor puntuada" (BIR-30).
 *
 * Las dos formas en que un ranking por nota miente: dejar que un solo voto de
 * 5 encabece la lista, y mostrar un número distinto del que ordenó.
 */
class RatedSortTest {

    private val lat = -34.6037
    private val lng = -58.3816

    private val bars by lazy { BarRepo(TestDb.db) }
    private val ratings by lazy { RatingRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    /** Vota la misma birra con [n] personas distintas. */
    private fun votar(barId: Long, style: String, nota: Double, n: Int) {
        repeat(n) { i ->
            ratings.upsert(
                NewRatingRequest(barId, style, rating = nota),
                TestDb.insertUser("v-$barId-$style-$i"),
            )
        }
    }

    @Test
    fun `un voto de 5 no le gana a un 4,5 con cuarenta`() {
        val u = TestDb.insertUser()
        val unVoto = TestDb.insertBar("Un Voto", lat, lng)
        val muchos = TestDb.insertBar("Muchos Votos", lat + 0.001, lng)
        TestDb.insertPrice(unVoto, "rubia", 5000.0, daysAgo = 1, userId = u)
        TestDb.insertPrice(muchos, "rubia", 5000.0, daysAgo = 1, userId = u)

        votar(unVoto, "rubia", 5.0, 1)
        votar(muchos, "rubia", 4.5, 40)

        val orden = bars.nearby(lat, lng, 2000, BarSort.rated, 10).map { it.name }
        assertEquals(listOf("Muchos Votos", "Un Voto"), orden)
    }

    @Test
    fun `la nota que viaja es la real, no la que ordena`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Solo", lat, lng)
        TestDb.insertPrice(bar, "rubia", 5000.0, daysAgo = 1, userId = u)
        votar(bar, "rubia", 5.0, 1)

        val pin = bars.nearby(lat, lng, 2000, BarSort.rated, 10).single()
        // Con shrinkage esto daría 3,75: mostrarle eso a quien acaba de poner
        // cinco estrellas hace que el número parezca roto, y con razón.
        assertEquals(5.0, pin.rating)
        assertEquals(1, pin.ratingCount)
    }

    @Test
    fun `la nota del bar pondera por votos entre sus birras`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Mixto", lat, lng)
        TestDb.insertPrice(bar, "rubia", 5000.0, daysAgo = 1, userId = u)
        TestDb.insertPrice(bar, "ipa", 7000.0, daysAgo = 1, userId = u)
        votar(bar, "rubia", 5.0, 3)
        votar(bar, "ipa", 3.0, 1)

        // (5*3 + 3*1) / 4 = 4,5. Sin ponderar daría 4,0.
        val pin = bars.nearby(lat, lng, 2000, BarSort.rated, 10).single()
        assertEquals(4.5, pin.rating)
        assertEquals(4, pin.ratingCount)
    }

    @Test
    fun `un bar sin votos va al final, no al principio`() {
        val u = TestDb.insertUser()
        // El sin votos está MÁS CERCA: si el orden lo pusiera primero, sería
        // el desempate por distancia tapando que no hay nota.
        val sinVotos = TestDb.insertBar("Sin Votos", lat, lng)
        val conVotos = TestDb.insertBar("Con Votos", lat + 0.002, lng)
        TestDb.insertPrice(sinVotos, "rubia", 5000.0, daysAgo = 1, userId = u)
        TestDb.insertPrice(conVotos, "rubia", 5000.0, daysAgo = 1, userId = u)
        votar(conVotos, "rubia", 3.0, 2)

        val orden = bars.nearby(lat, lng, 2000, BarSort.rated, 10)
        assertEquals(listOf("Con Votos", "Sin Votos"), orden.map { it.name })
        assertNull(orden.last().rating, "sin votos es sin nota, no nota cero")
        assertEquals(0, orden.last().ratingCount)
    }

    @Test
    fun `la nota viaja también buscando y en favoritos`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Buscable", lat, lng)
        TestDb.insertPrice(bar, "rubia", 5000.0, daysAgo = 1, userId = u)
        votar(bar, "rubia", 4.0, 2)

        assertEquals(4.0, bars.search("Buscable", lat, lng).single().rating)

        bars.setFavorite(u, bar, on = true)
        val fav = bars.favorites(u, lat, lng).single()
        assertEquals(4.0, fav.rating)
        assertEquals(2, fav.ratingCount)
    }

    @Test
    fun `los otros dos órdenes siguen andando`() {
        val u = TestDb.insertUser()
        val caro = TestDb.insertBar("Caro", lat, lng)
        val barato = TestDb.insertBar("Barato", lat + 0.002, lng)
        TestDb.insertPrice(caro, "rubia", 9000.0, daysAgo = 1, userId = u)
        TestDb.insertPrice(barato, "rubia", 3000.0, daysAgo = 1, userId = u)
        votar(caro, "rubia", 5.0, 5)

        assertEquals("Caro", bars.nearby(lat, lng, 2000, BarSort.distance, 10).first().name)
        assertEquals("Barato", bars.nearby(lat, lng, 2000, BarSort.cheapest, 10).first().name)
        assertTrue(bars.nearby(lat, lng, 2000, BarSort.rated, 10).first().name == "Caro")
    }
}
