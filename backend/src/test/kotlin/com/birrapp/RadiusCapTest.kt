package com.birrapp

import com.birrapp.bars.BarRepo
import com.birrapp.bars.BarSort
import com.birrapp.core.MAX_BARES_POR_PEDIDO
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Un bar dentro del radio no puede desaparecer por tener muchos más cerca.
 *
 * Esto es el test del bug que tenía el mapa: los pines vuelven ordenados por
 * distancia y el techo de filas estaba en 200, así que el recorte se comía los
 * de afuera. Con el radio en 7,2 km desde Palermo hay 526 bares en rango y se
 * veían los 200 más cercanos; un bar a 4,7 km, con 377 más cerca que él, no
 * aparecía. Desde afuera eso no se lee como un tope: se lee como que el bar no
 * está cargado, o como que el control del radio no hace nada.
 *
 * Los casos de acá reproducen esa forma —muchos amontonados y uno lejos pero
 * adentro— con números chicos, para que la propiedad quede fijada sin depender
 * de cuántos bares tenga la base de verdad.
 */
class RadiusCapTest {

    private val bars by lazy { BarRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    /** Obelisco, que es desde donde se mide en el resto de los tests. */
    private val lat = -34.6037
    private val lng = -58.3816

    /**
     * Mete [n] bares casi encima del centro.
     *
     * Separados por milésimas de grado —unos 100 m— para que todos entren
     * cómodos dentro de cualquier radio de prueba y queden, todos, más cerca
     * que el bar lejano.
     */
    private fun amontonar(n: Int) {
        repeat(n) { i -> TestDb.insertBar("cerca-$i", lat + i * 0.0002, lng) }
    }

    @Test
    fun `el bar lejano del radio aparece aunque haya muchos mas cerca`() {
        amontonar(250)
        // ~4,5 km al norte: dentro de un radio de 7 km, pero detrás de los 250.
        TestDb.insertBar("el lejano", lat + 0.04, lng)

        val r = bars.nearby(lat, lng, 7_000, BarSort.distance, MAX_BARES_POR_PEDIDO)

        assertTrue(
            r.any { it.name == "el lejano" },
            "está dentro del radio pedido: el tope de filas no puede ser lo que lo saca",
        )
        assertEquals(251, r.size, "todos los del radio, no una parte")
    }

    @Test
    fun `el radio sigue siendo el que recorta`() {
        amontonar(5)
        // ~11 km: afuera de los 7 km.
        TestDb.insertBar("afuera", lat + 0.1, lng)

        val r = bars.nearby(lat, lng, 7_000, BarSort.distance, MAX_BARES_POR_PEDIDO)

        assertTrue(r.none { it.name == "afuera" }, "el radio sí tiene que recortar")
        assertEquals(5, r.size)
    }

    @Test
    fun `el techo de filas sigue existiendo y es el compartido`() {
        amontonar(30)
        // Pedir de más no puede devolver de más: el techo lo pone el servidor,
        // no quien llama. Es lo que sostiene la caché del cliente, que anota
        // como cubierto lo que pidió.
        val r = bars.nearby(lat, lng, 7_000, BarSort.distance, MAX_BARES_POR_PEDIDO * 10)
        assertEquals(30, r.size)

        val recortado = bars.nearby(lat, lng, 7_000, BarSort.distance, 10)
        assertEquals(10, recortado.size, "un tope explícito más bajo se respeta")
    }

    @Test
    fun `vienen ordenados por distancia, que es lo que hace del tope un recorte por afuera`() {
        amontonar(4)
        TestDb.insertBar("el lejano", lat + 0.04, lng)

        val r = bars.nearby(lat, lng, 7_000, BarSort.distance, MAX_BARES_POR_PEDIDO)

        assertEquals("el lejano", r.last().name,
            "si el orden cambiara, el cálculo de cobertura del cliente dejaría de valer")
        val distancias = r.mapNotNull { it.distanceMeters }
        assertEquals(distancias.sorted(), distancias)
    }
}
