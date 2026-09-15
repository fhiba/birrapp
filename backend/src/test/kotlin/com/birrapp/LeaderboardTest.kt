package com.birrapp

import com.birrapp.auth.UpdateMeRequest
import com.birrapp.auth.UserRepo
import com.birrapp.community.LeaderboardRepo
import com.birrapp.core.ApiException
import com.birrapp.core.update
import com.birrapp.photos.R2
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** La página de colaboradores (BIR-9). */
class LeaderboardTest {

    private val r2 = R2("cuenta", "balde", "llave", "secreto", "https://fotos.test")
    private val repo by lazy { LeaderboardRepo(TestDb.db, r2) }
    private val users by lazy { UserRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    private fun conAlias(nombre: String): Long =
        TestDb.insertUser(nombre).also { users.updateMe(it, UpdateMeRequest(alias = nombre)) }

    // ---------- privacidad: aparecer se elige ----------

    @Test
    fun `sin alias no se aparece, por mas que se aporte`() {
        val anonimo = TestDb.insertUser("anonimo")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 1, userId = anonimo)

        val tabla = repo.ofMonth(null)
        assertTrue(tabla.contributors.isEmpty(), "el nombre de Google no se publica solo")
        assertEquals(1, tabla.hidden, "pero se cuenta, o la página miente sobre cuánta gente aporta")
    }

    @Test
    fun `con alias se aparece, y sacarlo te saca`() {
        val u = conAlias("cervecero")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 1, userId = u)

        assertEquals(listOf("cervecero"), repo.ofMonth(null).contributors.map { it.alias })

        // Sacarse tiene que costar lo mismo que entrar.
        users.updateMe(u, UpdateMeRequest(alias = ""))
        val tabla = repo.ofMonth(null)
        assertTrue(tabla.contributors.isEmpty())
        assertEquals(1, tabla.hidden)
    }

    @Test
    fun `el alias es unico y tiene forma`() {
        conAlias("tomas")
        val otro = TestDb.insertUser("otro")

        assertFailsWith<ApiException> { users.updateMe(otro, UpdateMeRequest(alias = "tomas")) }
        assertFailsWith<ApiException> { users.updateMe(otro, UpdateMeRequest(alias = "TOMAS")) }
        assertFailsWith<ApiException> { users.updateMe(otro, UpdateMeRequest(alias = "ab")) }
        assertFailsWith<ApiException> { users.updateMe(otro, UpdateMeRequest(alias = "a".repeat(21)) ) }
        assertFailsWith<ApiException> { users.updateMe(otro, UpdateMeRequest(alias = "🍺🍺🍺")) }
        // Arrancar con un signo, o meter un salto de línea en el medio: la
        // tabla pública es justo donde eso se usa para hacerse notar.
        assertFailsWith<ApiException> { users.updateMe(otro, UpdateMeRequest(alias = "-arranca")) }
        assertFailsWith<ApiException> { users.updateMe(otro, UpdateMeRequest(alias = "hola\nmundo")) }

        // El espacio de los costados no es un error, se limpia y listo.
        assertEquals("con espacios", users.updateMe(otro, UpdateMeRequest(alias = "  con espacios  ")).alias)

        // Y lo que sí vale.
        assertEquals("Peña_del-Lúpulo 1", users.updateMe(otro, UpdateMeRequest(alias = "Peña_del-Lúpulo 1")).alias)
    }

    @Test
    fun `una cuenta suspendida no gana el mes`() {
        val u = conAlias("baneado")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 1, userId = u)
        users.setBanned(u, true)

        assertTrue(repo.ofMonth(null).contributors.isEmpty())
    }

    // ---------- el tope, que es el punto del ranking ----------

    @Test
    fun `veinte precios en el mismo bar el mismo dia valen como uno`() {
        val spam = conAlias("spam")
        val honesto = conAlias("honesto")
        val unBar = TestDb.insertBar("Un Bar", -34.6037, -58.3816)

        repeat(20) { TestDb.insertPrice(unBar, "ipa", 5000.0, daysAgo = 1, userId = spam) }
        // El honesto toca dos bares distintos, una vez cada uno.
        TestDb.insertPrice(unBar, "ipa", 5000.0, daysAgo = 1, userId = honesto)
        TestDb.insertPrice(
            TestDb.insertBar("Otro Bar", -34.60, -58.38), "ipa", 5200.0, daysAgo = 1, userId = honesto,
        )

        val tabla = repo.ofMonth(null).contributors.associateBy { it.alias }
        assertEquals(3, tabla.getValue("spam").score, "veinte precios en un bar y un día: un precio")
        assertEquals(6, tabla.getValue("honesto").score, "dos bares distintos: el doble")
        assertEquals("honesto", repo.ofMonth(null).contributors.first().alias)
    }

    @Test
    fun `el mismo bar en dias distintos si suma`() {
        val u = conAlias("constante")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        // Volver a mirar el precio del mismo bar otro día es un aporte real.
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 1, userId = u)
        TestDb.insertPrice(bar, "ipa", 5100.0, daysAgo = 2, userId = u)
        TestDb.insertPrice(bar, "ipa", 5200.0, daysAgo = 3, userId = u)

        assertEquals(9, repo.ofMonth(null).contributors.single().score)
    }

    @Test
    fun `una confirmacion pesa menos que un precio`() {
        val carga = conAlias("carga")
        val confirma = conAlias("confirma")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)

        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 1, userId = carga)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 1, userId = confirma, isConfirmation = true)

        val tabla = repo.ofMonth(null).contributors.associateBy { it.alias }
        assertEquals(3, tabla.getValue("carga").score)
        assertEquals(1, tabla.getValue("confirma").score, "mantener fresco vale, pero menos que relevar")
    }

    // ---------- el mes corre ----------

    @Test
    fun `el mes pasado no cuenta para este`() {
        val u = conAlias("viejo")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 60, userId = u)

        assertTrue(
            repo.ofMonth(null).contributors.isEmpty(),
            "la carrera se reinicia, si no la gana siempre el mismo y el que llega nuevo no empieza",
        )
    }

    @Test
    fun `un mes ilegible es el mes corriente, no un error`() {
        val u = conAlias("alguien")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 1, userId = u)

        val esperado = repo.ofMonth(null).month
        for (basura in listOf("", "  ", "no-es-un-mes", "2026-13", "13-2026")) {
            assertEquals(esperado, repo.ofMonth(basura).month, "mes «$basura»")
        }
    }

    // ---------- la foto del mes (BIR-10) ----------

    @Test
    fun `la foto del mes es la mas votada, y firma con el alias`() {
        val autor = conAlias("fotografo")
        val votante = TestDb.insertUser("votante")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)

        val floja = TestDb.insertPhoto(bar, "ipa", autor)
        val buena = TestDb.insertPhoto(bar, "ipa", autor)
        TestDb.db.conn {
            it.update("INSERT INTO photo_votes (photo_id, user_id) VALUES (?, ?)", floja, autor)
            it.update("INSERT INTO photo_votes (photo_id, user_id) VALUES (?, ?)", buena, autor)
            it.update("INSERT INTO photo_votes (photo_id, user_id) VALUES (?, ?)", buena, votante)
        }

        val foto = repo.ofMonth(null).photo!!
        assertEquals(buena, foto.id)
        assertEquals(2, foto.votes)
        assertEquals("fotografo", foto.authorAlias)
        assertEquals("El Bar", foto.barName)
        assertEquals("IPA", foto.beerName)
    }

    @Test
    fun `sin un solo pulgar no hay foto del mes`() {
        val u = conAlias("alguien")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        TestDb.insertPhoto(bar, "ipa", u)

        assertNull(repo.ofMonth(null).photo, "destacar una foto que nadie votó no dice nada")
    }
}
