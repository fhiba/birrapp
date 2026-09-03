package com.birrapp

import com.birrapp.bars.BarRepo
import com.birrapp.prices.NewPriceRequest
import com.birrapp.prices.PriceRepo
import com.birrapp.ratings.NewRatingRequest
import com.birrapp.ratings.RatingRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * La pantalla del bar muestra una birra por vez, y la birra es (estilo, marca).
 *
 * Estos tests existen porque al meter la marca las tres fuentes de una birra
 * —precio, nota, foto— se cruzaban sólo por estilo. Con una marca por estilo
 * eso da el resultado correcto por casualidad; con dos, producto cartesiano.
 */
class BarDetailTest {
    private val lat = -34.6037
    private val lng = -58.3816
    private val prices by lazy { PriceRepo(TestDb.db) }
    private val ratings by lazy { RatingRepo(TestDb.db) }
    private val bars by lazy { BarRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `dos marcas votadas del mismo estilo dan dos filas, no cuatro`() {
        val u = TestDb.insertUser("a")
        val otro = TestDb.insertUser("b")
        val bar = TestDb.insertBar("Prueba", lat, lng)

        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), u)
        prices.report(NewPriceRequest(bar, "ipa", 12000.0, brandSlug = "juguetes-perdidos"), u)
        ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 5.0), u)
        ratings.upsert(NewRatingRequest(bar, "ipa", "juguetes-perdidos", 2.0), otro)

        val detail = bars.detail(bar, null, null)!!
        assertEquals(2, detail.prices.size, "una fila por birra, no el cruce de las dos")

        val porMarca = detail.prices.associateBy { it.brandSlug }
        // Cada nota tiene que quedar colgada de su propia marca: el bug daba
        // cuatro filas y la nota de una aparecía sobre el precio de la otra.
        assertEquals(5.0, porMarca["antares"]!!.ratingRaw)
        assertEquals(8000.0, porMarca["antares"]!!.price)
        assertEquals(2.0, porMarca["juguetes-perdidos"]!!.ratingRaw)
        assertEquals(12000.0, porMarca["juguetes-perdidos"]!!.price)
    }

    @Test
    fun `una birra votada sin precio sigue apareciendo`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), u)
        // Sin precio: sólo una nota. La birra tiene que seguir siendo
        // alcanzable o su nota queda enterrada en la base.
        ratings.upsert(NewRatingRequest(bar, "negra", "berlina", 4.0), u)

        val detail = bars.detail(bar, null, null)!!
        assertEquals(2, detail.prices.size)
        val negra = detail.prices.single { it.styleSlug == "negra" }
        assertNull(negra.price)
        assertEquals("berlina", negra.brandSlug)
        assertEquals(4.0, negra.ratingRaw)
    }

    @Test
    fun `sin marca es una birra propia y no un comodin`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        prices.report(NewPriceRequest(bar, "ipa", 7000.0), u)
        prices.report(NewPriceRequest(bar, "ipa", 9000.0, brandSlug = "antares"), u)
        ratings.upsert(NewRatingRequest(bar, "ipa", null, 3.0), u)

        val detail = bars.detail(bar, null, null)!!
        assertEquals(2, detail.prices.size)

        val sinMarca = detail.prices.single { it.brandSlug == null }
        assertEquals(7000.0, sinMarca.price)
        assertEquals(3.0, sinMarca.ratingRaw, "el voto sin marca es de la birra sin marca")

        val antares = detail.prices.single { it.brandSlug == "antares" }
        assertNull(antares.ratingRaw, "y no se le pega a la de Antares")
    }

    @Test
    fun `el historial no mezcla marcas`() {
        val u = TestDb.insertUser("a")
        val otro = TestDb.insertUser("b")
        val bar = TestDb.insertBar("Prueba", lat, lng)

        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), u)
        prices.report(NewPriceRequest(bar, "ipa", 8500.0, brandSlug = "antares"), otro)
        prices.report(NewPriceRequest(bar, "ipa", 20000.0, brandSlug = "berlina"), u)

        assertEquals(
            listOf(8500.0, 8000.0),
            prices.history(bar, "ipa", "antares").map { it.price },
            "mezclar marcas dibuja un zigzag que no es una variación de precio",
        )
        assertEquals(listOf(20000.0), prices.history(bar, "ipa", "berlina").map { it.price })
        assertEquals(
            emptyList(),
            prices.history(bar, "ipa").map { it.price },
            "sin marca es la serie de la birra sin marca, no la del estilo entero",
        )
    }
}
