package com.birrapp

import com.birrapp.auth.UpdateMeRequest
import com.birrapp.auth.UserRepo
import com.birrapp.beers.BeerRepo
import com.birrapp.beers.CODIGO_LIMITE_DIARIO
import com.birrapp.beers.MAX_BIRRAS_POR_DIA
import com.birrapp.beers.NewBeerLogRequest
import com.birrapp.core.ApiException
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * La tabla de birras por zona y el tope diario que la hace creíble.
 *
 * Sin tope, el ranking lo gana quien tenga más paciencia tocando un botón, no
 * quien más tomó — y eso vale para cualquier tabla pública: el número tiene que
 * costar algo del mundo real o no dice nada.
 */
class BeerLeaderboardTest {

    private val repo by lazy { BeerRepo(TestDb.db) }
    private val users by lazy { UserRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    private val lat = -34.6037
    private val lng = -58.3816

    /** Con alias, porque sin alias no se figura (V20). */
    private fun conAlias(nombre: String): Long {
        val id = TestDb.insertUser(nombre)
        users.updateMe(id, UpdateMeRequest(alias = nombre))
        return id
    }

    private fun anotar(user: Long, bar: Long?, qty: Int, diasAtras: Long = 0) =
        repo.log(
            NewBeerLogRequest(
                barId = bar, qty = qty,
                drankAt = Instant.now().minus(diasAtras, ChronoUnit.DAYS).toString(),
            ),
            user,
        )

    // ---------- el tope diario ----------

    @Test
    fun `no se pueden anotar mas de quince en el mismo dia`() {
        val u = conAlias("ana")
        val bar = TestDb.insertBar("El Bar", lat, lng)

        anotar(u, bar, MAX_BIRRAS_POR_DIA)

        val e = assertFailsWith<ApiException> { anotar(u, bar, 1) }
        assertEquals(CODIGO_LIMITE_DIARIO, e.code,
            "la app abre el aviso por el código, no por el texto")
    }

    @Test
    fun `el tope cuenta la suma del dia y no las filas`() {
        val u = conAlias("ana")
        val bar = TestDb.insertBar("El Bar", lat, lng)

        // Tres filas que suman catorce: ninguna sola llega al tope.
        anotar(u, bar, 5); anotar(u, bar, 5); anotar(u, bar, 4)
        // La que entra sumaría dieciséis.
        assertFailsWith<ApiException> { anotar(u, bar, 2) }
        // Una más sí: catorce más una son quince justas.
        anotar(u, bar, 1)
    }

    @Test
    fun `dos noches seguidas de ocho entran las dos`() {
        // El caso que hace que el tope sea por día de calendario y no por 24
        // horas móviles: una ventana móvil junta las dos salidas y rebota la
        // segunda por algo que no pasó.
        val u = conAlias("ana")
        val bar = TestDb.insertBar("El Bar", lat, lng)

        anotar(u, bar, 8, diasAtras = 1)
        anotar(u, bar, 8, diasAtras = 0)

        assertEquals(16, repo.leaderboard(lat, lng, 2_000).single().beers)
    }

    @Test
    fun `el tope es por persona`() {
        val ana = conAlias("ana")
        val beto = conAlias("beto")
        val bar = TestDb.insertBar("El Bar", lat, lng)

        anotar(ana, bar, MAX_BIRRAS_POR_DIA)
        // A Beto no lo afecta lo que anotó Ana.
        anotar(beto, bar, MAX_BIRRAS_POR_DIA)
    }

    // ---------- la tabla ----------

    @Test
    fun `una birra sin bar no entra en la tabla`() {
        val u = conAlias("ana")
        val bar = TestDb.insertBar("El Bar", lat, lng)

        anotar(u, bar, 2)
        anotar(u, null, 9)   // sin bar: no se puede ubicar

        assertEquals(2, repo.leaderboard(lat, lng, 2_000).single().beers,
            "sin bar no hay dónde contarla, y un ranking por cercanía no la puede inventar")
    }

    @Test
    fun `los bares fuera del radio no cuentan`() {
        val u = conAlias("ana")
        val cerca = TestDb.insertBar("Cerca", lat, lng)
        val lejos = TestDb.insertBar("Lejos", lat + 0.5, lng)   // ~55 km

        anotar(u, cerca, 3)
        anotar(u, lejos, 7)

        assertEquals(3, repo.leaderboard(lat, lng, 2_000).single().beers)
    }

    @Test
    fun `sin alias no se figura`() {
        val anon = TestDb.insertUser("anon")
        val bar = TestDb.insertBar("El Bar", lat, lng)
        anotar(anon, bar, 5)

        assertTrue(repo.leaderboard(lat, lng, 2_000).isEmpty(),
            "el nombre de Google no se publica: la misma regla que la tabla de colaboradores")
    }

    @Test
    fun `ordena de mas a menos`() {
        val ana = conAlias("ana")
        val beto = conAlias("beto")
        val bar = TestDb.insertBar("El Bar", lat, lng)

        anotar(ana, bar, 3)
        anotar(beto, bar, 9)

        val tabla = repo.leaderboard(lat, lng, 2_000)
        assertEquals(listOf("beto", "ana"), tabla.map { it.alias })
        assertEquals(9, tabla[0].beers)
    }

    @Test
    fun `lo viejo se cae de la tabla`() {
        val u = conAlias("ana")
        val bar = TestDb.insertBar("El Bar", lat, lng)

        anotar(u, bar, 4, diasAtras = 40)   // fuera de los 30 días
        anotar(u, bar, 1, diasAtras = 2)

        assertEquals(1, repo.leaderboard(lat, lng, 2_000).single().beers)
    }

    @Test
    fun `la tabla recorta los dias que se pasaron antes del tope`() {
        // Filas anteriores a la regla: nunca pasaron por el control de
        // escritura, así que la consulta tiene que recortarlas igual. Si
        // confiara en el dato, el ranking quedaría decidido por lo que se
        // cargó antes de que el tope existiera.
        val u = conAlias("ana")
        val bar = TestDb.insertBar("El Bar", lat, lng)
        TestDb.insertBeerLogRaw(u, bar, qty = 20, diasAtras = 3)

        assertEquals(MAX_BIRRAS_POR_DIA, repo.leaderboard(lat, lng, 2_000).single().beers,
            "veinte en un día se cuentan como quince")
    }
}
