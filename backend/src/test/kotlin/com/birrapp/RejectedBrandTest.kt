package com.birrapp

import com.birrapp.bars.BarRepo
import com.birrapp.core.ApiException
import com.birrapp.prices.NewBrandRequest
import com.birrapp.prices.NewPriceRequest
import com.birrapp.prices.PriceRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Una marca rechazada tiene que desaparecer, no sólo salir de la lista.
 *
 * El bug que esto cubre: rechazar escribía `status = 'rejected'` y nada más, y
 * como ninguna consulta de lectura mira el status de la marca, el nombre seguía
 * apareciendo en la ficha del bar, en los aportes y en las fotos. Por el otro
 * lado, `createBrand` devolvía la marca rechazada a quien volviera a escribir
 * el nombre, así que además volvía a entrar sola.
 */
class RejectedBrandTest {
    private val lat = -34.6037
    private val lng = -58.3816
    private val repo by lazy { PriceRepo(TestDb.db) }
    private val bars by lazy { BarRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `rechazar una marca saca del mapa los precios que la usaban`() {
        val mod = TestDb.insertUser("mod", role = "moderator")
        val u = TestDb.insertUser("carga")
        val bar = TestDb.insertBar("Prueba", lat, lng)
        repo.createBrand(NewBrandRequest("Birra Trucha"), u)
        repo.report(NewPriceRequest(bar, "rubia", 4500.0, brandSlug = "birra-trucha"), u)

        assertTrue(
            bars.detail(bar, null, null)!!.prices.any { it.brandSlug == "birra-trucha" },
            "antes del rechazo el precio está visible",
        )

        assertTrue(repo.setBrandStatus("birra-trucha", "rejected", mod))

        assertTrue(
            bars.detail(bar, null, null)!!.prices.none { it.brandSlug == "birra-trucha" },
            "una marca rechazada no puede seguir apareciendo en la ficha del bar",
        )
    }

    @Test
    fun `una marca rechazada no se puede volver a crear ni usar`() {
        val mod = TestDb.insertUser("mod", role = "moderator")
        val u = TestDb.insertUser("carga")
        val bar = TestDb.insertBar("Prueba", lat, lng)
        repo.createBrand(NewBrandRequest("Birra Trucha"), u)
        repo.setBrandStatus("birra-trucha", "rejected", mod)

        val otro = TestDb.insertUser("otro")
        assertEquals(
            400,
            assertFailsWith<ApiException> {
                repo.createBrand(NewBrandRequest("birra trucha"), otro)
            }.status.value,
            "volver a escribir el mismo nombre no puede devolver la rechazada",
        )
        assertEquals(
            404,
            assertFailsWith<ApiException> {
                repo.report(NewPriceRequest(bar, "rubia", 4500.0, brandSlug = "birra-trucha"), otro)
            }.status.value,
            "mandando el slug a mano tampoco",
        )
        assertFalse(repo.brands().any { it.slug == "birra-trucha" })
        assertFalse(repo.pendingBrands().any { it.slug == "birra-trucha" })
    }

    @Test
    fun `aprobar una marca no baja nada`() {
        val mod = TestDb.insertUser("mod", role = "moderator")
        val u = TestDb.insertUser("carga")
        val bar = TestDb.insertBar("Prueba", lat, lng)
        repo.createBrand(NewBrandRequest("Birra Buena"), u)
        repo.report(NewPriceRequest(bar, "rubia", 4500.0, brandSlug = "birra-buena"), u)

        assertTrue(repo.setBrandStatus("birra-buena", "approved", mod))

        assertTrue(bars.detail(bar, null, null)!!.prices.any { it.brandSlug == "birra-buena" })
        assertTrue(repo.brands().any { it.slug == "birra-buena" })
    }
}
