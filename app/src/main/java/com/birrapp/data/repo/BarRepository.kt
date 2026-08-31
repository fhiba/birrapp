package com.birrapp.data.repo

import com.birrapp.data.api.ApiClient
import com.birrapp.data.model.BarPin
import com.birrapp.data.model.BeerStyle

/**
 * Repositorio con un caché en memoria muy chico.
 *
 * No hay base local: el caché sólo evita que girar el teléfono o volver
 * de una pantalla dispare otra request. Los precios cambian seguido, así
 * que un caché persistente y largo sería contraproducente — mostraría
 * precios viejos sin que el usuario lo sepa, que es justo lo que la app
 * intenta no hacer.
 */
class BarRepository(private val api: ApiClient) {

    private data class CacheKey(
        val lat: Int, val lng: Int, val radius: Int, val sort: String, val style: String?,
    )

    private var lastKey: CacheKey? = null
    private var lastResult: List<BarPin> = emptyList()
    private var lastAt = 0L

    private var styleCache: List<BeerStyle>? = null

    private val ttlMillis = 60_000L

    suspend fun nearby(
        lat: Double, lng: Double, radiusMeters: Int = 2000,
        sort: String = "distance", style: String? = null, force: Boolean = false,
    ): List<BarPin> {
        // Redondeo a ~100 m: mover el mapa un metro no debería re-consultar.
        val key = CacheKey(
            (lat * 1000).toInt(), (lng * 1000).toInt(), radiusMeters, sort, style,
        )
        val fresh = System.currentTimeMillis() - lastAt < ttlMillis
        if (!force && key == lastKey && fresh && lastResult.isNotEmpty()) return lastResult

        val result = api.nearbyBars(lat, lng, radiusMeters, sort, style)
        lastKey = key
        lastResult = result
        lastAt = System.currentTimeMillis()
        return result
    }

    /** El vocabulario de estilos casi no cambia: se cachea toda la sesión. */
    suspend fun styles(): List<BeerStyle> =
        styleCache ?: api.styles().also { styleCache = it }

    fun invalidate() {
        lastKey = null
        lastResult = emptyList()
    }
}
