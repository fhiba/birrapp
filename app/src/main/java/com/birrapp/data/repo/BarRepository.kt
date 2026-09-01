package com.birrapp.data.repo

import com.birrapp.data.api.ApiClient
import com.birrapp.data.db.BarSnapshot
import com.birrapp.data.db.BarStore
import com.birrapp.data.model.BarPin
import com.birrapp.data.model.BeerStyle
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Bares, con caché de región.
 *
 * El problema del diseño anterior: cada vez que el mapa se quedaba quieto se
 * pedía a la API de nuevo, y al abrir la app el mapa arrancaba vacío
 * esperando la respuesta. Panear tres cuadras costaba una request.
 *
 * Ahora:
 *  1. Se trae una región **más grande que la pantalla** (2,5x) de una sola vez.
 *  2. Mientras el usuario se mueva dentro de esa región, todo sale de memoria
 *     sin tocar la red. La distancia se recalcula en el cliente, así que el
 *     orden por cercanía sigue siendo correcto desde cualquier punto.
 *  3. La última región se guarda en disco, así que al abrir la app los pines
 *     aparecen al instante y la actualización llega después.
 *
 * Los precios siguen viniendo del servidor en cada refresh: lo que se cachea
 * es *dónde están los bares*, que casi no cambia, no *cuánto salen*, que sí.
 */
class BarRepository(
    private val api: ApiClient,
    private val store: BarStore,
) {
    private val known = LinkedHashMap<Long, BarPin>()

    private var coveredLat: Double? = null
    private var coveredLng: Double? = null
    private var coveredRadius = 0
    private var fetchedAtMillis = 0L

    private var styleCache: List<BeerStyle>? = null

    /** Cuánto más grande que la pantalla se pide, para poder panear sin red. */
    private val overFetch = 2.5

    /** Pasado esto la región se considera vieja y se vuelve a pedir. */
    private val maxAgeMillis = 5 * 60_000L

    var servingFromCache: Boolean = false
        private set

    /** Instantánea de disco, para pintar el mapa antes de la primera request. */
    suspend fun primeFromDisk(): Boolean {
        if (known.isNotEmpty()) return true
        val snapshot = store.load() ?: return false
        snapshot.bars.forEach { known[it.id] = it }
        coveredLat = snapshot.centerLat
        coveredLng = snapshot.centerLng
        coveredRadius = snapshot.radiusMeters
        fetchedAtMillis = snapshot.savedAtMillis
        servingFromCache = true
        return known.isNotEmpty()
    }

    /**
     * Lo que hay en caché para esta ubicación, sin tocar la red.
     * `null` = la región guardada no cubre este punto y hay que pedir.
     */
    fun peek(
        lat: Double,
        lng: Double,
        radiusMeters: Int = 2000,
        sort: String = "distance",
        style: String? = null,
    ): List<BarPin>? =
        if (covers(lat, lng, radiusMeters)) project(lat, lng, radiusMeters, sort, style)
        else null

    /** ¿Tenemos algo guardado, aunque sea de otra zona? */
    fun hasAnything(): Boolean = known.isNotEmpty()

    suspend fun nearby(
        lat: Double,
        lng: Double,
        radiusMeters: Int = 2000,
        sort: String = "distance",
        style: String? = null,
        force: Boolean = false,
    ): List<BarPin> {
        if (force || !covers(lat, lng, radiusMeters)) {
            fetch(lat, lng, radiusMeters)
        }
        return project(lat, lng, radiusMeters, sort, style)
    }

    /**
     * ¿La región traída alcanza para este viewport?
     *
     * Se compara contra el radio pedido más la distancia al centro cacheado:
     * si el borde del viewport se sale de lo traído, faltan bares y hay que
     * volver a pedir.
     */
    private fun covers(lat: Double, lng: Double, radiusMeters: Int): Boolean {
        val cLat = coveredLat ?: return false
        val cLng = coveredLng ?: return false
        if (System.currentTimeMillis() - fetchedAtMillis > maxAgeMillis) return false
        return haversine(cLat, cLng, lat, lng) + radiusMeters <= coveredRadius
    }

    private suspend fun fetch(lat: Double, lng: Double, radiusMeters: Int) {
        val bigRadius = (radiusMeters * overFetch).toInt().coerceIn(1000, 50_000)
        // Sin filtro de estilo ni orden: se guarda la región cruda y el
        // filtrado se hace en memoria. Así un cambio de filtro no pega a la red.
        val fresh = api.nearbyBars(lat, lng, bigRadius, sort = "distance", style = null, limit = 500)
        // Reemplazo, no merge: si un precio dejó de estar vigente en el
        // servidor, quedarse con el viejo mostraría un dato que ya no existe.
        known.clear()
        fresh.forEach { known[it.id] = it }
        coveredLat = lat
        coveredLng = lng
        coveredRadius = bigRadius
        fetchedAtMillis = System.currentTimeMillis()
        servingFromCache = false
        store.save(
            BarSnapshot(fetchedAtMillis, lat, lng, bigRadius, fresh.take(500))
        )
    }

    /** Recorta, recalcula distancias y ordena, todo en memoria. */
    private fun project(
        lat: Double,
        lng: Double,
        radiusMeters: Int,
        sort: String,
        style: String?,
    ): List<BarPin> {
        val withDistance = known.values.asSequence()
            .map { it.copy(distanceMeters = haversine(lat, lng, it.lat, it.lng)) }
            .filter { it.distanceMeters!! <= radiusMeters }
            // El filtro por estilo necesita el detalle del bar, que el pin no
            // trae. Por ahora se filtra por "tiene precio", que es lo que el
            // pin sí sabe; el filtro fino queda para el servidor.
            .filter { style == null || it.fromPrice != null }

        return when (sort) {
            // NULLS LAST, igual que el servidor: un bar sin precio fresco no
            // puede encabezar el ranking de más barata.
            "cheapest" -> withDistance.sortedWith(
                compareBy(nullsLast()) { it.fromPrice }
            )
            else -> withDistance.sortedBy { it.distanceMeters }
        }.take(400).toList()
    }

    suspend fun styles(): List<BeerStyle> =
        styleCache ?: api.styles().also { styleCache = it }

    fun invalidate() {
        coveredLat = null
        coveredLng = null
        coveredRadius = 0
        fetchedAtMillis = 0
    }

    private fun haversine(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val r = 6_371_000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLng / 2) * sin(dLng / 2)
        return 2 * r * asin(min(1.0, sqrt(a)))
    }
}
