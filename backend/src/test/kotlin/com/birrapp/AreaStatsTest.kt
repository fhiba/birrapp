package com.birrapp

import com.birrapp.prices.PriceRepo
import com.birrapp.ratings.NewRatingRequest
import com.birrapp.ratings.RatingRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Stats de precios de una zona (BIR-33).
 *
 * Las dos cosas que este endpoint puede hacer mal son mentir por mezclar
 * tamaños de vaso y mentir por promediar precios viejos. Las dos están
 * testeadas acá.
 */
class AreaStatsTest {

    private val lat = -34.6037
    private val lng = -58.3816

    private val repo by lazy { PriceRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `promedia normalizando a pinta, no mezclando tamaños`() {
        val u = TestDb.insertUser()
        val bar1 = TestDb.insertBar("Uno", lat, lng)
        val bar2 = TestDb.insertBar("Dos", lat + 0.001, lng)
        // La misma birra al mismo precio por litro, en dos vasos distintos.
        TestDb.insertPrice(bar1, "rubia", 4730.0, daysAgo = 1, userId = u, sizeMl = 473)
        TestDb.insertPrice(bar2, "rubia", 3300.0, daysAgo = 1, userId = u, sizeMl = 330)

        val s = repo.areaStats(lat, lng, 2000)
        assertEquals(2, s.samples)
        assertEquals(2, s.bars)
        // Sin normalizar, el promedio daría 4015 — un número que no es el
        // precio de nada.
        assertEquals(4730.0, s.avgPint!!, 1.0)
        assertEquals(4730.0, s.medianPint!!, 1.0)
    }

    @Test
    fun `los precios stale no entran en el promedio`() {
        val u = TestDb.insertUser()
        val fresco = TestDb.insertBar("Fresco", lat, lng)
        val viejo = TestDb.insertBar("Viejo", lat + 0.001, lng)
        TestDb.insertPrice(fresco, "rubia", 6000.0, daysAgo = 2, userId = u)
        TestDb.insertPrice(viejo, "rubia", 1000.0, daysAgo = 90, userId = u)

        val s = repo.areaStats(lat, lng, 2000)
        assertEquals(1, s.samples, "el de hace tres meses no cuenta")
        assertEquals(6000.0, s.avgPint!!, 1.0)
        assertEquals("Fresco", s.cheapest!!.barName)
    }

    @Test
    fun `el radio y el filtro por estilo recortan`() {
        val u = TestDb.insertUser()
        val cerca = TestDb.insertBar("Cerca", lat, lng)
        val lejos = TestDb.insertBar("Lejos", lat + 0.5, lng)
        TestDb.insertPrice(cerca, "rubia", 5000.0, daysAgo = 1, userId = u)
        TestDb.insertPrice(cerca, "ipa", 9000.0, daysAgo = 1, userId = u)
        TestDb.insertPrice(lejos, "rubia", 100.0, daysAgo = 1, userId = u)

        assertEquals(2, repo.areaStats(lat, lng, 2000).samples)
        val soloIpa = repo.areaStats(lat, lng, 2000, styleSlugs = listOf("ipa"))
        assertEquals(1, soloIpa.samples)
        assertEquals(9000.0, soloIpa.avgPint!!, 1.0)
    }

    @Test
    fun `el mejor de la zona es nota sobre precio, no la nota más alta`() {
        val u = TestDb.insertUser()
        val ratings = RatingRepo(TestDb.db)
        val caro = TestDb.insertBar("Caro", lat, lng)
        val barato = TestDb.insertBar("Barato", lat + 0.001, lng)
        TestDb.insertPrice(caro, "rubia", 12000.0, daysAgo = 1, userId = u)
        TestDb.insertPrice(barato, "rubia", 5000.0, daysAgo = 1, userId = u)

        // Cinco votos cada uno: con uno solo, el shrinkage los deja a los dos
        // pegados a la media global y el test no probaría nada.
        repeat(5) { i ->
            val votante = TestDb.insertUser("v$i")
            ratings.upsert(NewRatingRequest(caro, "rubia", rating = 5.0), votante)
            ratings.upsert(NewRatingRequest(barato, "rubia", rating = 4.0), votante)
        }

        val best = repo.areaStats(lat, lng, 2000).bestValue!!
        assertEquals("Barato", best.barName, "4 estrellas a 5000 rinde más que 5 a 12000")
        assertNotNull(best.ratingRaw)
        assertEquals(1, best.ageDays.coerceAtMost(1), "la edad del precio viaja siempre")
    }

    @Test
    fun `sin votos no hay mejor de la zona, pero sí más barata`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Uno", lat, lng)
        TestDb.insertPrice(bar, "rubia", 5000.0, daysAgo = 1, userId = u)

        val s = repo.areaStats(lat, lng, 2000)
        assertNull(s.bestValue, "no se puede decir cuál es la mejor si nadie votó")
        assertEquals("Uno", s.cheapest!!.barName)
    }

    @Test
    fun `una zona vacía no rompe nada`() {
        val s = repo.areaStats(lat, lng, 2000)
        assertEquals(0, s.samples)
        assertNull(s.avgPint)
        assertNull(s.cheapest)
        assertTrue(s.bars == 0)
    }
}
