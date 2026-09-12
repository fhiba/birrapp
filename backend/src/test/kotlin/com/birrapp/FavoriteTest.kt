package com.birrapp

import com.birrapp.bars.BarRepo
import com.birrapp.core.ApiException
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Favoritos sincronizados con la cuenta (BIR-37 / BIR-5). */
class FavoriteTest {

    private val repo by lazy { BarRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `favoritear y desfavoritear, las veces que haga falta`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)

        repo.setFavorite(u, bar, on = true)
        repo.setFavorite(u, bar, on = true)  // el botón es un toggle: dos toques no rompen
        assertEquals(listOf("El Bar"), repo.favorites(u, null, null).map { it.name })

        repo.setFavorite(u, bar, on = false)
        repo.setFavorite(u, bar, on = false)
        assertTrue(repo.favorites(u, null, null).isEmpty())
    }

    @Test
    fun `los favoritos son de cada uno`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)

        repo.setFavorite(a, bar, on = true)
        assertEquals(1, repo.favorites(a, null, null).size)
        assertEquals(0, repo.favorites(b, null, null).size)
    }

    @Test
    fun `el favorito trae el precio y su antiguedad, como cualquier pin`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        TestDb.insertPrice(bar, "rubia", 5000.0, daysAgo = 3, userId = u)
        repo.setFavorite(u, bar, on = true)

        val fav = repo.favorites(u, -34.6037, -58.3816).single()
        assertEquals(5000.0, fav.fromPrice)
        assertEquals(3, fav.freshestAgeDays, "ningún precio se muestra sin su edad")
        assertTrue((fav.distanceMeters ?: 99.0) < 5.0, "con punto, viaja la distancia")
    }

    @Test
    fun `no se puede favoritear un bar que no existe o no está aprobado`() {
        val u = TestDb.insertUser()
        val pendiente = TestDb.insertBar("Sin aprobar", -34.6, -58.4, status = "pending")

        assertFailsWith<ApiException> { repo.setFavorite(u, 999_999, on = true) }
        assertFailsWith<ApiException> { repo.setFavorite(u, pendiente, on = true) }
    }
}
