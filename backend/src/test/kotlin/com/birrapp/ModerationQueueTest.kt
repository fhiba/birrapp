package com.birrapp

import com.birrapp.core.update
import com.birrapp.moderation.ModerationRepo
import com.birrapp.moderation.NewFlagRequest
import com.birrapp.prices.NewBrandRequest
import com.birrapp.prices.NewPriceRequest
import com.birrapp.prices.NewStyleRequest
import com.birrapp.prices.PriceRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * La cola de moderación tiene que llegar con contexto.
 *
 * Lo que se prueba acá es que cada fila traiga las dos cosas con las que se
 * decide: quién hizo el aporte y qué se está queriendo hacer. Son joins, y un
 * join mal escrito no rompe nada —devuelve null y la pantalla dibuja "sin
 * autor"—, así que sin test se descubre en producción moderando a ciegas.
 */
class ModerationQueueTest {

    private val mod by lazy { ModerationRepo(TestDb.db) }
    private val prices by lazy { PriceRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `un bar pendiente llega con la ubicacion entera y su autor`() {
        val u = TestDb.insertUser("cargador")
        val bar = TestDb.insertBar("Bar Nuevo", -34.6037, -58.3816, "pending", u)
        TestDb.db.conn {
            it.update(
                "UPDATE bars SET address = ?, neighbourhood = ? WHERE id = ?",
                "Serrano 1590", "Palermo", bar,
            )
        }

        val fila = mod.pendingBars().single { it.id == bar }
        assertEquals("Serrano 1590", fila.address)
        assertEquals("Palermo", fila.neighbourhood)
        assertEquals(-34.6037, fila.lat, 1e-6)
        assertEquals(u, fila.author?.id)
        assertEquals("cargador", fila.author?.name)
    }

    @Test
    fun `una denuncia llega con quien cargo lo denunciado y que se quiso cargar`() {
        val autor = TestDb.insertUser("autor")
        val denunciante = TestDb.insertUser("denunciante")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        val precio = TestDb.insertPrice(bar, "ipa", 9000.0, daysAgo = 0, userId = autor)

        mod.flag(NewFlagRequest("price", precio, "carísima"), denunciante)

        val f = mod.openFlags().single()
        // El autor es quien cargó el precio; el reporter, quien lo denunció.
        assertEquals("autor", f.author?.name)
        assertEquals("denunciante", f.reporterName)
        val c = assertNotNull(f.contrib)
        assertEquals("El Bar", c.barName)
        assertEquals(bar, c.barId)
        assertEquals("IPA", c.styleName)
        assertEquals(9000.0, c.price)
        assertEquals(473, c.sizeMl)
    }

    @Test
    fun `una marca nueva llega con el precio desde el que se creo`() {
        val u = TestDb.insertUser("marquero")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        prices.createBrand(NewBrandRequest("Birra Trucha"), u)
        prices.report(NewPriceRequest(bar, "ipa", 7000.0, brandSlug = "birra-trucha"), u)

        val m = prices.pendingBrands().single { it.slug == "birra-trucha" }
        assertEquals("marquero", m.author?.name)
        val c = assertNotNull(m.contrib)
        assertEquals("El Bar", c.barName)
        assertEquals("IPA", c.styleName)
        assertEquals(7000.0, c.price)
    }

    @Test
    fun `un estilo propuesto llega con el precio desde el que se propuso`() {
        val u = TestDb.insertUser("estilista")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        prices.createStyle(NewStyleRequest("Gose salada"), u)
        prices.report(
            NewPriceRequest(bar, "gose-salada", 7500.0, brandSlug = "antares"), u,
        )

        val e = prices.pendingStyles().single { it.slug == "gose-salada" }
        assertEquals("estilista", e.author?.name)
        val c = assertNotNull(e.contrib)
        assertEquals("El Bar", c.barName)
        assertEquals("Antares", c.brandName)
        assertEquals(7500.0, c.price)
    }
}
