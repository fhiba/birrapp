package com.birrapp

import com.birrapp.bars.BarRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * El precio por consenso (BIR-8).
 *
 * Lo que se prueba acá no es "la mediana funciona" sino que el modelo aguante
 * el ataque para el que existe: alguien que carga un número falso, solo o
 * repetido, no puede convertirlo en *el* precio del bar.
 */
class ConsensusTest {

    private val bars by lazy { BarRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    private fun ipa(barId: Long) =
        bars.detail(barId, null, null)!!.prices.single { it.styleSlug == "ipa" }

    @Test
    fun `con menos de tres votantes manda el ultimo reporte, como antes`() {
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)

        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 3, userId = a)
        assertEquals(5000.0, ipa(bar).price)
        assertEquals(1, ipa(bar).voters)
        assertNull(ipa(bar).priceLow, "con un solo voto no hay desacuerdo que mostrar")

        TestDb.insertPrice(bar, "ipa", 9000.0, daysAgo = 1, userId = b)
        assertEquals(9000.0, ipa(bar).price, "dos votantes todavía no es consenso")
        assertEquals(2, ipa(bar).voters)
    }

    @Test
    fun `con tres o mas votantes manda la mediana y no el ultimo`() {
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        listOf(5000.0, 5200.0, 5100.0).forEachIndexed { i, precio ->
            TestDb.insertPrice(bar, "ipa", precio, daysAgo = 5 - i, userId = TestDb.insertUser("u$i"))
        }

        assertEquals(3, ipa(bar).voters)
        assertEquals(5100.0, ipa(bar).price, "la mediana, no el 5100 por ser el último")
        assertEquals(5000.0, ipa(bar).priceLow)
        assertEquals(5200.0, ipa(bar).priceHigh)
    }

    @Test
    fun `un valor absurdo no se lleva puesto el precio`() {
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        listOf(5000.0, 5100.0, 5200.0, 4900.0).forEachIndexed { i, precio ->
            TestDb.insertPrice(bar, "ipa", precio, daysAgo = 6 - i, userId = TestDb.insertUser("u$i"))
        }
        // Y ahora el troll, último y por lejos el más caro.
        TestDb.insertPrice(bar, "ipa", 99_000.0, daysAgo = 0, userId = TestDb.insertUser("troll"))

        val p = ipa(bar)
        assertEquals(5100.0, p.price, "la mediana ni se entera")
        assertEquals(5, p.voters)
        // El desacuerdo sí lo cuenta: es información, no ruido.
        assertEquals(99_000.0, p.priceHigh)
    }

    @Test
    fun `reportar diez veces no es ser diez personas`() {
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        val honestos = listOf(5000.0, 5100.0, 5200.0)
        honestos.forEachIndexed { i, precio ->
            TestDb.insertPrice(bar, "ipa", precio, daysAgo = 10 - i, userId = TestDb.insertUser("u$i"))
        }

        // El mismo usuario carga diez veces el mismo disparate. Sin deduplicar
        // por persona, este es el consenso y el modelo queda peor que antes.
        val troll = TestDb.insertUser("troll")
        repeat(10) { TestDb.insertPrice(bar, "ipa", 99_000.0, daysAgo = 5 - it % 5, userId = troll) }

        val p = ipa(bar)
        assertEquals(4, p.voters, "diez reportes de una persona son un voto")
        assertTrue(p.price!! < 10_000, "y no alcanzan para mover la mediana: ${p.price}")
    }

    @Test
    fun `de cada persona vale su reporte mas reciente`() {
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        val a = TestDb.insertUser("a")
        val b = TestDb.insertUser("b")
        val c = TestDb.insertUser("c")

        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 10, userId = a)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 10, userId = b)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 10, userId = c)
        // A se corrige: el bar aumentó. Su voto viejo no puede seguir contando.
        TestDb.insertPrice(bar, "ipa", 8000.0, daysAgo = 1, userId = a)
        TestDb.insertPrice(bar, "ipa", 8000.0, daysAgo = 1, userId = b)

        val p = ipa(bar)
        assertEquals(3, p.voters)
        assertEquals(8000.0, p.price, "dos corregidos a 8000 contra uno viejo en 5000")
    }

    @Test
    fun `fuera de la ventana de 21 dias no se vota`() {
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        // Tres reportes viejos, del nivel de precios de hace dos meses.
        repeat(3) { TestDb.insertPrice(bar, "ipa", 3000.0, daysAgo = 40, userId = TestDb.insertUser("viejo$it")) }
        // Y uno de ayer, del nivel de hoy.
        TestDb.insertPrice(bar, "ipa", 9000.0, daysAgo = 1, userId = TestDb.insertUser("nuevo"))

        val p = ipa(bar)
        assertEquals(1, p.voters, "los de 40 días no votan")
        assertEquals(9000.0, p.price, "mezclar dos niveles de precio da un número que no existió")
    }

    /**
     * Los dos lados de la ponderación por antigüedad, que son un solo
     * compromiso: el voto de hoy pesa más, pero no tanto como para que uno
     * solo dé vuelta un consenso reciente.
     */
    @Test
    fun `uno de hoy le gana a tres de hace veinte dias`() {
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        // Tres coinciden, pero son de hace veinte días: el bar pudo aumentar
        // en el medio y ninguno de los tres volvió a mirar.
        repeat(3) {
            TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 20, userId = TestDb.insertUser("viejo$it"))
        }
        TestDb.insertPrice(bar, "ipa", 9000.0, daysAgo = 0, userId = TestDb.insertUser("hoy"))

        val p = ipa(bar)
        assertEquals(4, p.voters, "los cuatro votan: están todos adentro de la ventana")
        assertEquals(9000.0, p.price, "pero el de hoy pesa cuatro veces más que los de hace 20")
    }

    @Test
    fun `uno de hoy NO da vuelta un consenso reciente`() {
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        // Mismos tres, pero de hace cinco días: siguen siendo buena información.
        repeat(3) {
            TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 5, userId = TestDb.insertUser("fresco$it"))
        }
        TestDb.insertPrice(bar, "ipa", 99_000.0, daysAgo = 0, userId = TestDb.insertUser("troll"))

        val p = ipa(bar)
        assertEquals(5000.0, p.price,
            "si no, alcanzaría con reportar último para mandar, que es lo que se vino a arreglar")
    }

    @Test
    fun `el numero que se muestra es uno que alguien reporto`() {
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        // Cuatro votantes: con mediana clásica el resultado sería el promedio
        // de los dos del medio, un precio que nadie cargó nunca.
        listOf(5000.0, 5100.0, 5200.0, 5300.0).forEachIndexed { i, precio ->
            TestDb.insertPrice(bar, "ipa", precio, daysAgo = 4 - i, userId = TestDb.insertUser("u$i"))
        }

        val p = ipa(bar)
        assertTrue(
            p.price in listOf(5000.0, 5100.0, 5200.0, 5300.0),
            "la mediana ponderada devuelve un precio real de la tabla, no un promedio: ${p.price}",
        )
    }

    @Test
    fun `una pinta y un litro no se promedian entre si`() {
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        // Tres de medio litro, y el último reporte también de medio litro.
        repeat(3) {
            TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 5 - it, userId = TestDb.insertUser("p$it"),
                sizeMl = 473)
        }
        // Un litro, mucho más caro, cargado después.
        TestDb.insertPrice(bar, "ipa", 11_000.0, daysAgo = 4, userId = TestDb.insertUser("litro"),
            sizeMl = 1000)

        val p = ipa(bar)
        assertEquals(473, p.sizeMl)
        assertEquals(5000.0, p.price, "el litro no entra en la mediana de la pinta")
        assertEquals(3, p.voters)
    }

    @Test
    fun `la edad sigue siendo la del reporte mas reciente`() {
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        repeat(3) { TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 20, userId = TestDb.insertUser("u$it")) }
        // Alguien confirma hoy: el precio es el mismo, pero la birra está fresca.
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 0, userId = TestDb.insertUser("hoy"),
            isConfirmation = true)

        val p = ipa(bar)
        assertEquals(0, p.ageDays, "el consenso decide qué número, no de cuándo es")
        assertEquals("fresh", p.freshness)
    }

    @Test
    fun `confirmar es votar por el numero que ya estaba`() {
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 8, userId = TestDb.insertUser("a"))
        TestDb.insertPrice(bar, "ipa", 9000.0, daysAgo = 7, userId = TestDb.insertUser("troll"))
        assertEquals(9000.0, ipa(bar).price, "dos votantes: gana el último, como antes")

        // Dos personas tocan "Sigue igual" sobre los 5000. Cada confirmación
        // inserta una fila con el valor vigente, así que son votos.
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 2, userId = TestDb.insertUser("b"),
            isConfirmation = true)
        TestDb.insertPrice(bar, "ipa", 5000.0, daysAgo = 1, userId = TestDb.insertUser("c"),
            isConfirmation = true)

        val p = ipa(bar)
        assertEquals(4, p.voters)
        assertEquals(5000.0, p.price, "tres en 5000 contra uno en 9000")
    }
}
