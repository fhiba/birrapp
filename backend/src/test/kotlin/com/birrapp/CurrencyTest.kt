package com.birrapp

import com.birrapp.auth.UpdateMeRequest
import com.birrapp.auth.UserRepo
import com.birrapp.bars.BarRepo
import com.birrapp.bars.NewBarRequest
import com.birrapp.core.ApiException
import com.birrapp.prices.NewPriceRequest
import com.birrapp.prices.PriceRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Bares fuera de Argentina y su moneda.
 *
 * La app nació asumiendo pesos en todos lados. Lo que se prueba acá es que al
 * abrirla al mundo no empiece a comparar peras con manzanas: ni promediar
 * pesos con libras, ni mandar a moderación un precio de Londres por no
 * parecerse a la mediana de Buenos Aires.
 */
class CurrencyTest {

    private val obelisco = -34.6037 to -58.3816
    private val londres = 51.5074 to -0.1278

    private val bars by lazy { BarRepo(TestDb.db) }
    private val prices by lazy { PriceRepo(TestDb.db) }
    private val users by lazy { UserRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    /** Crea un bar aprobado (con place_id entra aprobado) en un punto y país. */
    private fun crearBar(
        nombre: String, punto: Pair<Double, Double>, pais: String?,
        moneda: String? = null, quien: Long, monedaDeQuien: String? = null,
    ): Long = bars.create(
        NewBarRequest(
            name = nombre, lat = punto.first, lng = punto.second,
            googlePlaceId = "place-${nombre.replace(" ", "")}",
            countryCode = pais, currency = moneda,
        ),
        quien, creatorCurrency = monedaDeQuien,
    )

    @Test
    fun `el pais define la moneda del bar`() {
        val u = TestDb.insertUser()
        val uk = crearBar("The Pub", londres, "GB", quien = u)
        val ar = crearBar("El Bar", obelisco, "AR", quien = u)

        assertEquals("GBP", bars.detail(uk, null, null)!!.currency)
        assertEquals("ARS", bars.detail(ar, null, null)!!.currency)
    }

    @Test
    fun `sin país conocido cae en la moneda de quien lo carga`() {
        val u = TestDb.insertUser()
        // País que no está en la tabla: no se inventa nada, se usa la de la
        // persona, que es la que más chance tiene de ser la del lugar donde
        // está parada.
        val bar = crearBar("Raro", londres, "ZZ", quien = u, monedaDeQuien = "UYU")
        assertEquals("UYU", bars.detail(bar, null, null)!!.currency)
    }

    @Test
    fun `la moneda elegida a mano le gana al país`() {
        val u = TestDb.insertUser()
        // Pasa de verdad: bares que cobran en dólares en países que no los usan.
        val bar = crearBar("Dolarizado", obelisco, "AR", moneda = "USD", quien = u)
        assertEquals("USD", bars.detail(bar, null, null)!!.currency)
    }

    @Test
    fun `el precio se guarda en la moneda del bar, no en la de quien reporta`() {
        val dueño = TestDb.insertUser("dueño")
        val turista = TestDb.insertUser("turista")
        val uk = crearBar("The Pub", londres, "GB", quien = dueño)

        prices.report(NewPriceRequest(uk, "ipa", 6.0), turista)

        val precio = bars.detail(uk, null, null)!!.prices.single()
        assertEquals(6.0, precio.price)
        assertEquals("GBP", bars.detail(uk, null, null)!!.currency)
    }

    @Test
    fun `un precio de Londres no es un outlier por no parecerse a los de Buenos Aires`() {
        val u = TestDb.insertUser()
        // Cinco precios argentinos: suficientes para que la mediana del estilo
        // cuente (OUTLIER_MIN_SAMPLES).
        repeat(5) { i ->
            val bar = TestDb.insertBar("Porteño $i", obelisco.first + i * 0.001, obelisco.second)
            TestDb.insertPrice(bar, "ipa", 8000.0, daysAgo = 1, userId = u)
        }

        val uk = crearBar("The Pub", londres, "GB", quien = u)
        val ok = prices.report(NewPriceRequest(uk, "ipa", 6.0), u)

        // Sin filtrar por moneda, 6 contra una mediana de 8.000 es 1300 veces
        // más barato y se iba derecho a la cola de moderación.
        assertFalse(ok.heldForReview, "el precio en libras no se compara contra pesos")
    }

    @Test
    fun `dentro de la misma moneda el outlier se sigue detectando`() {
        val u = TestDb.insertUser()
        repeat(5) { i ->
            val bar = TestDb.insertBar("Porteño $i", obelisco.first + i * 0.001, obelisco.second)
            TestDb.insertPrice(bar, "ipa", 8000.0, daysAgo = 1, userId = u)
        }
        val otro = TestDb.insertBar("Carísimo", obelisco.first, obelisco.second + 0.001)
        val caro = prices.report(NewPriceRequest(otro, "ipa", 90_000.0), u)

        assertTrue(caro.heldForReview, "sigue siendo un precio absurdo en pesos")
    }

    @Test
    fun `las stats de la zona son de una sola moneda y dicen cuántas dejaron afuera`() {
        val u = TestDb.insertUser()
        // Tres en pesos y uno en dólares, todos en el mismo radio.
        repeat(3) { i ->
            val bar = TestDb.insertBar("Peso $i", obelisco.first + i * 0.0005, obelisco.second)
            TestDb.insertPrice(bar, "rubia", 5000.0 + i * 100, daysAgo = 1, userId = u)
        }
        val dolar = crearBar("Dolarizado", obelisco, "AR", moneda = "USD", quien = u)
        prices.report(NewPriceRequest(dolar, "rubia", 7.0), u)

        val stats = prices.areaStats(obelisco.first, obelisco.second, 2000)
        assertEquals("ARS", stats.currency, "gana la moneda con más precios")
        assertEquals(3, stats.samples)
        assertEquals(1, stats.otherCurrencies, "el de dólares se cuenta, pero afuera")
        // 5.100 es la mediana de los tres en pesos. Con el de dólares adentro,
        // el promedio caería a la mitad y no sería el precio de nada.
        assertEquals(5100.0, stats.medianPint!!, 1.0)
    }

    @Test
    fun `la configuración de la persona se valida`() {
        val u = TestDb.insertUser()

        val ok = users.updateMe(u, UpdateMeRequest(currency = "gbp", defaultSizeMl = 568))
        assertEquals("GBP", ok.currency, "se normaliza a mayúsculas")
        assertEquals(568, ok.defaultSizeMl)

        assertFailsWith<ApiException> { users.updateMe(u, UpdateMeRequest(currency = "XYZ")) }
        assertFailsWith<ApiException> { users.updateMe(u, UpdateMeRequest(defaultSizeMl = 5)) }
        assertFailsWith<ApiException> { users.updateMe(u, UpdateMeRequest(defaultRadiusM = 99)) }
        assertFailsWith<ApiException> { users.updateMe(u, UpdateMeRequest(displayName = "a")) }
    }

    @Test
    fun `cambiar el nombre no toca el resto`() {
        val u = TestDb.insertUser()
        users.updateMe(u, UpdateMeRequest(currency = "EUR"))
        val despues = users.updateMe(u, UpdateMeRequest(displayName = "Felipe"))

        assertEquals("Felipe", despues.displayName)
        assertEquals("EUR", despues.currency, "lo que no viene en el pedido no se pisa")
    }
}
