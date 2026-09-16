package com.birrapp

import com.birrapp.auth.UpdateMeRequest
import com.birrapp.auth.UserRepo
import com.birrapp.core.ApiException
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Las birras favoritas de cada uno (V21). */
class PreferencesTest {

    private val users by lazy { UserRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `se guardan y vuelven en el orden en que se eligieron`() {
        val u = TestDb.insertUser()
        assertTrue(users.findById(u)!!.favoriteStyles.isEmpty(), "de entrada, ninguna")

        val r = users.updateMe(u, UpdateMeRequest(
            favoriteStyles = listOf("ipa", "stout", "rubia"),
            favoriteBrands = listOf("antares"),
        ))
        // El orden importa: es el orden en que las va a ver en la ficha.
        assertEquals(listOf("ipa", "stout", "rubia"), r.favoriteStyles)
        assertEquals(listOf("antares"), r.favoriteBrands)
    }

    @Test
    fun `un slug que no existe se descarta en vez de guardarse`() {
        val u = TestDb.insertUser()
        val r = users.updateMe(u, UpdateMeRequest(
            favoriteStyles = listOf("ipa", "birra-inventada", "stout"),
        ))
        assertEquals(listOf("ipa", "stout"), r.favoriteStyles,
            "guardarlo no rompe nada, pero después no coincide con ningún estilo")
    }

    @Test
    fun `no se repiten`() {
        val u = TestDb.insertUser()
        val r = users.updateMe(u, UpdateMeRequest(favoriteStyles = listOf("ipa", "ipa", "ipa")))
        assertEquals(listOf("ipa"), r.favoriteStyles)
    }

    @Test
    fun `la lista vacia las saca, y ausente no las toca`() {
        val u = TestDb.insertUser()
        users.updateMe(u, UpdateMeRequest(favoriteStyles = listOf("ipa")))

        // Ausente: se está cambiando otra cosa y las favoritas no se tocan.
        assertEquals(listOf("ipa"), users.updateMe(u, UpdateMeRequest(displayName = "otro")).favoriteStyles)
        // Vacía: sacarlas tiene que costar lo mismo que ponerlas.
        assertTrue(users.updateMe(u, UpdateMeRequest(favoriteStyles = emptyList())).favoriteStyles.isEmpty())
    }

    @Test
    fun `hay un techo`() {
        val u = TestDb.insertUser()
        val muchas = (1..11).map { "estilo-$it" }
        assertFailsWith<ApiException> { users.updateMe(u, UpdateMeRequest(favoriteStyles = muchas)) }
    }

    @Test
    fun `las favoritas sobreviven a cambiar otra preferencia`() {
        val u = TestDb.insertUser()
        users.updateMe(u, UpdateMeRequest(
            favoriteStyles = listOf("ipa"), favoriteBrands = listOf("berlina"),
        ))
        val r = users.updateMe(u, UpdateMeRequest(currency = "EUR", defaultSizeMl = 500))
        assertEquals(listOf("ipa"), r.favoriteStyles)
        assertEquals(listOf("berlina"), r.favoriteBrands)
        assertEquals("EUR", r.currency)
    }
}
