package com.birrapp

import com.birrapp.bars.BarRepo
import com.birrapp.bars.BarSort
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

    // ---------- filtro y orden con el botón de favoritos puesto ----------
    // Estaban de adorno: la lista ignoraba la píldora de estilo y el orden, y
    // ordenaba siempre por cuándo lo habías marcado.

    /** Tres favoritos a distancias y precios distintos, marcados en un orden. */
    private fun tresFavoritos(u: Long): Triple<Long, Long, Long> {
        // Obelisco, y dos cada vez más lejos hacia el norte.
        val cerca = TestDb.insertBar("Cerca", -34.6037, -58.3816)
        val medio = TestDb.insertBar("Medio", -34.5900, -58.3816)
        val lejos = TestDb.insertBar("Lejos", -34.5600, -58.3816)
        // El más lejano es el más barato, para que distancia y precio no den
        // el mismo orden y el test distinga de verdad.
        TestDb.insertPrice(cerca, "ipa", 9000.0, daysAgo = 1, userId = u)
        TestDb.insertPrice(medio, "rubia", 7000.0, daysAgo = 1, userId = u)
        TestDb.insertPrice(lejos, "ipa", 3000.0, daysAgo = 1, userId = u)
        // Se marcan al revés de la distancia: si el orden no cambiara, saldría
        // lejos, medio, cerca.
        repo.setFavorite(u, lejos, on = true)
        repo.setFavorite(u, medio, on = true)
        repo.setFavorite(u, cerca, on = true)
        return Triple(cerca, medio, lejos)
    }

    @Test
    fun `ordena por distancia desde el punto que se le pasa`() {
        val u = TestDb.insertUser()
        tresFavoritos(u)

        val desdeElObelisco = repo.favorites(u, -34.6037, -58.3816, sort = BarSort.distance)
        assertEquals(listOf("Cerca", "Medio", "Lejos"), desdeElObelisco.map { it.name })

        // Y desde el punto secundario, al revés: es el caso de mantener
        // apretado el mapa para mirar otra zona. La distancia ya se calculaba
        // bien desde ahí; lo que no cambiaba era el orden, así que se veía "a
        // 200 m" debajo de "a 4 km".
        val desdeElNorte = repo.favorites(u, -34.5600, -58.3816, sort = BarSort.distance)
        assertEquals(listOf("Lejos", "Medio", "Cerca"), desdeElNorte.map { it.name })
    }

    @Test
    fun `ordena por precio cuando se lo piden`() {
        val u = TestDb.insertUser()
        tresFavoritos(u)

        val baratos = repo.favorites(u, -34.6037, -58.3816, sort = BarSort.cheapest)
        assertEquals(listOf("Lejos", "Medio", "Cerca"), baratos.map { it.name })
    }

    @Test
    fun `el filtro de estilo acota, y el precio es el de ese estilo`() {
        val u = TestDb.insertUser()
        tresFavoritos(u)

        val ipas = repo.favorites(u, -34.6037, -58.3816, styleSlug = "ipa")
        assertEquals(listOf("Cerca", "Lejos"), ipas.map { it.name },
            "el de rubia no es una IPA, por más favorito que sea")
        assertEquals(9000.0, ipas.first { it.name == "Cerca" }.fromPrice,
            "y el precio que se muestra es el de la IPA")
    }

    @Test
    fun `sin ubicación cae al orden de siempre, el último marcado primero`() {
        val u = TestDb.insertUser()
        tresFavoritos(u)

        // Sin punto no hay distancia: ordenar por ella dejaría todo empatado
        // en NULL y el orden sería el que quisiera Postgres.
        assertEquals(
            listOf("Cerca", "Medio", "Lejos"),
            repo.favorites(u, null, null, sort = BarSort.distance).map { it.name },
        )
    }

    @Test
    fun `no se puede favoritear un bar que no existe o no está aprobado`() {
        val u = TestDb.insertUser()
        val pendiente = TestDb.insertBar("Sin aprobar", -34.6, -58.4, status = "pending")

        assertFailsWith<ApiException> { repo.setFavorite(u, 999_999, on = true) }
        assertFailsWith<ApiException> { repo.setFavorite(u, pendiente, on = true) }
    }
}
