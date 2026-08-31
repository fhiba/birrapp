package news.inkan.birrapp

import news.inkan.birrapp.bars.BarRepo
import news.inkan.birrapp.bars.BarSort
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * La regla central del producto: un precio viejo no puede ganarle a uno
 * fresco. Si estos tests se rompen, la app está mintiendo.
 */
class FreshnessTest {

    private val obeliscoLat = -34.6037
    private val obeliscoLng = -58.3816

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `clasifica fresh, aging y stale segun la edad`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", obeliscoLat, obeliscoLng)
        TestDb.insertPrice(bar, "rubia", 4000.0, daysAgo = 5, userId = u)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 30, userId = u)
        TestDb.insertPrice(bar, "stout", 6000.0, daysAgo = 60, userId = u)

        val detail = BarRepo(TestDb.db).detail(bar, null, null)!!
        val byStyle = detail.prices.associateBy { it.styleSlug }

        assertEquals("fresh", byStyle.getValue("rubia").freshness)
        assertEquals("aging", byStyle.getValue("ipa").freshness)
        assertEquals("stale", byStyle.getValue("stout").freshness)
    }

    @Test
    fun `el precio vigente es el ultimo reporte, no el mas barato`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", obeliscoLat, obeliscoLng)
        TestDb.insertPrice(bar, "rubia", 3000.0, daysAgo = 20, userId = u)
        TestDb.insertPrice(bar, "rubia", 5000.0, daysAgo = 1, userId = u)  // aumentó

        val detail = BarRepo(TestDb.db).detail(bar, null, null)!!
        assertEquals(1, detail.prices.size, "sólo debe haber un precio vigente por estilo")
        assertEquals(5000.0, detail.prices.single().price)
    }

    @Test
    fun `un precio stale barato no le gana a uno fresco caro en el ranking`() {
        val u = TestDb.insertUser()
        // El barato está viejo: no debería encabezar "más barata".
        val viejoBarato = TestDb.insertBar("Viejo Barato", obeliscoLat, obeliscoLng)
        TestDb.insertPrice(viejoBarato, "rubia", 1000.0, daysAgo = 90, userId = u)

        val frescoCaro = TestDb.insertBar("Fresco Caro", obeliscoLat + 0.001, obeliscoLng)
        TestDb.insertPrice(frescoCaro, "rubia", 8000.0, daysAgo = 2, userId = u)

        val results = BarRepo(TestDb.db)
            .nearby(obeliscoLat, obeliscoLng, 2000, BarSort.cheapest, 10)

        assertEquals("Fresco Caro", results.first().name,
            "un precio de hace 90 días no puede encabezar el ranking de más barata")

        val viejo = results.single { it.name == "Viejo Barato" }
        assertNull(viejo.fromPrice, "un bar sólo con precios stale no debe tener headline")
    }

    @Test
    fun `el orden por distancia respeta la geografia`() {
        val u = TestDb.insertUser()
        TestDb.insertBar("Lejos", obeliscoLat + 0.01, obeliscoLng).also {
            TestDb.insertPrice(it, "rubia", 1000.0, 1, u)
        }
        TestDb.insertBar("Cerca", obeliscoLat + 0.0005, obeliscoLng).also {
            TestDb.insertPrice(it, "rubia", 9000.0, 1, u)
        }

        val results = BarRepo(TestDb.db)
            .nearby(obeliscoLat, obeliscoLng, 5000, BarSort.distance, 10)
        assertEquals("Cerca", results.first().name)
        assertTrue(results.first().distanceMeters!! < results.last().distanceMeters!!)
    }

    @Test
    fun `el radio excluye lo que queda afuera`() {
        val u = TestDb.insertUser()
        // ~1.1 km al norte
        TestDb.insertBar("Afuera", obeliscoLat + 0.01, obeliscoLng).also {
            TestDb.insertPrice(it, "rubia", 1000.0, 1, u)
        }
        val results = BarRepo(TestDb.db)
            .nearby(obeliscoLat, obeliscoLng, 500, BarSort.distance, 10)
        assertTrue(results.none { it.name == "Afuera" })
    }

    @Test
    fun `los bares pendientes no aparecen en el mapa`() {
        val u = TestDb.insertUser()
        TestDb.insertBar("Sin aprobar", obeliscoLat, obeliscoLng, status = "pending").also {
            TestDb.insertPrice(it, "rubia", 1000.0, 1, u)
        }
        val results = BarRepo(TestDb.db)
            .nearby(obeliscoLat, obeliscoLng, 2000, BarSort.distance, 10)
        assertTrue(results.none { it.name == "Sin aprobar" })
    }
}
