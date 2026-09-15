package com.birrapp

import com.birrapp.auth.ContributionKind
import com.birrapp.auth.ContributionRepo
import com.birrapp.auth.UserRepo
import com.birrapp.photos.R2
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Paginación de los aportes propios (BIR-44) y el total de birras (BIR-43). */
class PaginationTest {

    private val r2 = R2("cuenta", "balde", "llave", "secreto", "https://fotos.test")
    private val repo by lazy { ContributionRepo(TestDb.db, r2) }
    private val users by lazy { UserRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    /** Diez precios del mismo usuario, del más viejo al más nuevo. */
    private fun diezPrecios(user: Long, bar: Long) =
        (1..10).map { TestDb.insertPrice(bar, "ipa", 1000.0 * it, daysAgo = 11 - it, userId = user) }

    @Test
    fun `trae una sola clase de aporte cuando se pide una`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816, createdBy = u)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 1, userId = u)
        TestDb.insertPhoto(bar, "ipa", u)

        val precios = repo.forUser(u, ContributionKind.prices)
        assertEquals(1, precios.prices.size)
        assertTrue(precios.photos.isEmpty(), "pedir precios no baja las fotos")
        assertTrue(precios.bars.isEmpty())
        assertTrue(precios.comments.isEmpty())

        // Sin tipo siguen viniendo las cuatro: es lo que pide Android.
        val todo = repo.forUser(u)
        assertEquals(1, todo.prices.size)
        assertEquals(1, todo.photos.size)
        assertEquals(1, todo.bars.size)
    }

    @Test
    fun `el cursor recorre la lista entera sin repetir ni saltear`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        diezPrecios(u, bar)

        val vistos = mutableListOf<Long>()
        var cursor: String? = null
        var vueltas = 0
        do {
            val page = repo.forUser(u, ContributionKind.prices, limit = 3, before = cursor)
            vistos += page.prices.map { it.id }
            cursor = page.nextCursor
            vueltas++
        } while (cursor != null && vueltas < 10)

        assertEquals(10, vistos.size, "no falta ninguno")
        assertEquals(vistos.toSet().size, vistos.size, "y ninguno viene dos veces")
        // Del más nuevo al más viejo, que es el orden de la pantalla.
        assertEquals(vistos.sortedDescending(), vistos)
    }

    @Test
    fun `la última página no ofrece una siguiente`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        diezPrecios(u, bar)

        assertNotNull(repo.forUser(u, ContributionKind.prices, limit = 9).nextCursor)
        assertNull(
            repo.forUser(u, ContributionKind.prices, limit = 10).nextCursor,
            "con todo en una página no hay nada más que pedir",
        )
        assertNull(repo.forUser(u, ContributionKind.prices, limit = 50).nextCursor)
    }

    @Test
    fun `dos aportes del mismo instante no se saltean entre páginas`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        // Misma antigüedad = mismo segundo. Con un cursor de sólo fecha, el
        // segundo de cada par se perdía al pasar de página.
        val ids = (1..6).map {
            TestDb.insertPrice(bar, "ipa", 1000.0 * it, daysAgo = 3, userId = u)
        }

        val vistos = mutableListOf<Long>()
        var cursor: String? = null
        var vueltas = 0
        do {
            val page = repo.forUser(u, ContributionKind.prices, limit = 2, before = cursor)
            vistos += page.prices.map { it.id }
            cursor = page.nextCursor
            vueltas++
        } while (cursor != null && vueltas < 10)

        assertEquals(ids.toSet(), vistos.toSet(), "los seis, aunque compartan el segundo")
    }

    @Test
    fun `el limite tiene techo, aunque lo pidan enorme`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        diezPrecios(u, bar)

        // No se puede verificar el techo con diez filas, pero sí que un límite
        // absurdo no explota ni devuelve de más de lo que hay.
        assertEquals(10, repo.forUser(u, ContributionKind.prices, limit = 100_000).prices.size)
        assertEquals(1, repo.forUser(u, ContributionKind.prices, limit = 0).prices.size,
            "un límite de cero se corrige a uno en vez de devolver nada")
    }

    @Test
    fun `un cursor ilegible se trata como si no hubiera`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        diezPrecios(u, bar)

        val primera = repo.forUser(u, ContributionKind.prices, limit = 5).prices.map { it.id }
        for (basura in listOf("", "   ", "no-es-un-cursor", "|", "|7", "2026-01-01|no")) {
            assertEquals(
                primera,
                repo.forUser(u, ContributionKind.prices, limit = 5, before = basura).prices
                    .map { it.id },
                "cursor «$basura» tendría que empezar de cero, no romper",
            )
        }
    }

    @Test
    fun `el total de birras viaja con el resto de los contadores`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 1, userId = u)

        assertEquals(0, users.stats(u).beers, "sin birras anotadas, cero y no null")

        TestDb.db.conn { c ->
            c.prepareStatement(
                "INSERT INTO beer_logs (user_id, bar_id, qty) VALUES (?, ?, ?), (?, ?, ?)",
            ).use { st ->
                st.setLong(1, u); st.setLong(2, bar); st.setInt(3, 2)
                st.setLong(4, u); st.setLong(5, bar); st.setInt(6, 3)
                st.executeUpdate()
            }
        }

        val s = users.stats(u)
        assertEquals(5, s.beers, "suma cantidades, no filas")
        assertEquals(1, s.prices, "y no se lleva puesto el resto de la consulta")
    }
}
