package com.birrapp

import com.birrapp.beers.BeerRepo
import com.birrapp.beers.NewBeerLogRequest
import com.birrapp.core.ApiException
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * El contador de birras (BIR-34).
 *
 * Lo que se prueba acá no es "guarda una fila": es que el calendario y las
 * rachas se armen con el día de Buenos Aires y no con el de UTC. Una birra de
 * las once y media de la noche que aparece al día siguiente rompe la racha de
 * quien la anotó, y el bug sería invisible hasta las nueve de la noche.
 */
class BeerLogTest {

    private val repo by lazy { BeerRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    /** Instante de hace [days] días, en ISO. */
    private fun daysAgo(days: Long): String =
        Instant.now().minus(days, ChronoUnit.DAYS).toString()

    @Test
    fun `anotar sin nada suma una birra de hoy`() {
        val u = TestDb.insertUser()
        val log = repo.log(NewBeerLogRequest(), u)

        assertEquals(1, log.qty)
        assertNull(log.barId, "anotar sin bar tiene que poder")

        val s = repo.summary(u, null)
        assertEquals(1, s.total)
        assertEquals(1, s.monthTotal)
        assertEquals(1, s.currentStreak)
    }

    @Test
    fun `la birra de las 23_30 en Buenos Aires cuenta en su dia, no en el siguiente`() {
        val u = TestDb.insertUser()
        // Las 23:30 de un día de Buenos Aires son las 02:30 UTC del siguiente.
        // La fecha es relativa a hoy a propósito: una fija convierte el test
        // en una bomba de tiempo que explota cuando pasa el año del tope de
        // antigüedad.
        val dia = java.time.LocalDate.now(java.time.ZoneId.of("America/Argentina/Buenos_Aires"))
            .minusDays(40)
        val enUtc = dia.plusDays(1).atTime(2, 30).toInstant(java.time.ZoneOffset.UTC)

        val log = repo.log(NewBeerLogRequest(drankAt = enUtc.toString()), u)
        assertEquals(dia.toString(), log.day, "el día es el local, no el de UTC")

        val suMes = repo.summary(u, dia.toString().take(7))
        assertEquals(1, suMes.monthTotal, "tiene que caer en el mes del día local")
        assertEquals(listOf(dia.toString()), suMes.days.map { it.day })

        val mesSiguiente = repo.summary(u, dia.plusMonths(1).toString().take(7))
        assertEquals(0, mesSiguiente.monthTotal)
    }

    @Test
    fun `la racha cuenta dias seguidos y se corta con un hueco`() {
        val u = TestDb.insertUser()
        // Hoy, ayer y anteayer: racha de tres. Y una suelta hace diez días,
        // que no la toca.
        listOf(0L, 1L, 2L, 10L).forEach { repo.log(NewBeerLogRequest(drankAt = daysAgo(it)), u) }

        val s = repo.summary(u, null)
        assertEquals(3, s.currentStreak)
        assertEquals(3, s.bestStreak)
        assertEquals(4, s.total)
    }

    @Test
    fun `dos birras el mismo dia son un dia de racha, no dos`() {
        val u = TestDb.insertUser()
        repo.log(NewBeerLogRequest(qty = 2), u)
        repo.log(NewBeerLogRequest(), u)

        val s = repo.summary(u, null)
        assertEquals(3, s.total, "las cantidades se suman")
        assertEquals(1, s.currentStreak, "pero el día es uno solo")
    }

    @Test
    fun `la racha sobrevive a la mañana siguiente`() {
        val u = TestDb.insertUser()
        // Sólo ayer: a las nueve de la mañana la racha todavía vale, si no
        // abrir la app temprano mostraría cero todos los días.
        repo.log(NewBeerLogRequest(drankAt = daysAgo(1)), u)
        assertEquals(1, repo.summary(u, null).currentStreak)

        val viejo = TestDb.insertUser("viejo")
        repo.log(NewBeerLogRequest(drankAt = daysAgo(3)), viejo)
        assertEquals(0, repo.summary(viejo, null).currentStreak, "hace tres días ya no es racha")
        assertEquals(1, repo.summary(viejo, null).bestStreak)
    }

    @Test
    fun `cuenta birras por bar y arma el top`() {
        val u = TestDb.insertUser()
        val bar1 = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        val bar2 = TestDb.insertBar("El Otro", -34.6040, -58.3820)
        repo.log(NewBeerLogRequest(barId = bar1, qty = 3), u)
        repo.log(NewBeerLogRequest(barId = bar2), u)

        val s = repo.summary(u, null)
        assertEquals(listOf("El Bar" to 3, "El Otro" to 1), s.topBars.map { it.barName to it.qty })
        assertEquals(2, s.distinctBars)
    }

    @Test
    fun `los emblemas salen de los datos`() {
        val u = TestDb.insertUser()
        repeat(10) { repo.log(NewBeerLogRequest(qty = 1, drankAt = daysAgo(it.toLong())), u) }

        val badges = repo.summary(u, null).badges.associateBy { it.id }
        assertEquals(1, badges.getValue("primera").progress)
        assertEquals(10, badges.getValue("diez").progress)
        assertEquals(10, badges.getValue("cincuenta").progress, "el progreso no se pasa del objetivo")
        assertTrue(badges.getValue("racha-7").progress >= 7, "diez días seguidos ganan la semana")
        assertEquals(0, badges.getValue("cinco-bares").progress)
    }

    @Test
    fun `solo se borra lo propio`() {
        val u = TestDb.insertUser("dueño")
        val otro = TestDb.insertUser("otro")
        val log = repo.log(NewBeerLogRequest(), u)

        assertFalse(repo.remove(log.id, otro), "no es de esa persona")
        assertEquals(1, repo.summary(u, null).total)

        assertTrue(repo.remove(log.id, u))
        assertEquals(0, repo.summary(u, null).total)
    }

    @Test
    fun `rechaza el futuro, las cantidades absurdas y los bares que no existen`() {
        val u = TestDb.insertUser()
        assertFailsWith<ApiException> {
            repo.log(NewBeerLogRequest(drankAt = Instant.now().plus(2, ChronoUnit.DAYS).toString()), u)
        }
        assertFailsWith<ApiException> { repo.log(NewBeerLogRequest(qty = 0), u) }
        assertFailsWith<ApiException> { repo.log(NewBeerLogRequest(qty = 99), u) }
        assertFailsWith<ApiException> { repo.log(NewBeerLogRequest(barId = 999_999), u) }
        assertFailsWith<ApiException> { repo.log(NewBeerLogRequest(styleSlug = "no-existe"), u) }
    }

    @Test
    fun `un bar pendiente no sirve para anotar`() {
        val u = TestDb.insertUser()
        val pendiente = TestDb.insertBar("Sin aprobar", -34.6, -58.4, status = "pending")
        assertFailsWith<ApiException> { repo.log(NewBeerLogRequest(barId = pendiente), u) }
    }
}
