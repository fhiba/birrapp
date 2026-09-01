package com.birrapp.data.places

import android.content.Context
import android.util.Log
import com.google.android.libraries.places.api.Places
import com.google.android.libraries.places.api.model.AutocompleteSessionToken
import com.google.android.libraries.places.api.model.Place
import com.google.android.libraries.places.api.net.FetchPlaceRequest
import com.google.android.libraries.places.api.net.FindAutocompletePredictionsRequest
import com.birrapp.BuildConfig
import com.google.android.libraries.places.api.net.PlacesClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

data class PlaceSuggestion(
    val placeId: String,
    val primary: String,
    val secondary: String,
)

data class ResolvedPlace(
    val placeId: String,
    val name: String,
    val address: String?,
    val lat: Double,
    val lng: Double,
)

/**
 * Buscador de lugares de Google, para cargar bares que no están en OSM y
 * para validar que el lugar existe de verdad.
 *
 * **Qué se guarda y qué no.** Los términos de Places prohíben guardar
 * contenido de lugares (nombre, dirección, coordenadas) más de 30 días, con
 * una excepción explícita: el `place_id`. Así que el ID es lo único que
 * persiste de Google. El nombre y la ubicación se le muestran al usuario para
 * que confirme, y lo que termina en nuestra base es lo que él confirmó — dato
 * nuestro, no un espejo de la base de Google.
 *
 * Eso también es lo que hace fiable la deduplicación: dos personas que cargan
 * el mismo bar traen el mismo ID, sin depender de que escriban igual el nombre.
 */
class PlaceSearch(private val context: Context) {

    val isAvailable: Boolean
        get() = BuildConfig.MAPS_API_KEY_PRESENT

    /**
     * Inicialización perezosa, pero SIEMPRE fuera del hilo principal.
     *
     * `Places.createClient` y la primera llamada hacen trabajo real —
     * handshake, carga de config— y en el hilo principal congelan la UI
     * entera: la pantalla queda con el spinner girando y ni siquiera se
     * dibujan los resultados que ya tenemos de nuestra propia base.
     */
    private val clientMutex = Mutex()
    private var cachedClient: PlacesClient? = null

    private suspend fun client(): PlacesClient = clientMutex.withLock {
        cachedClient ?: withContext(Dispatchers.IO) {
            if (!Places.isInitialized()) {
                Places.initializeWithNewPlacesApiEnabled(context, BuildConfig.MAPS_API_KEY)
            }
            Places.createClient(context)
        }.also { cachedClient = it }
    }

    /** Un token por sesión de búsqueda: Google factura por sesión, no por tecla. */
    private var sessionToken: AutocompleteSessionToken? = null

    fun startSession() {
        sessionToken = AutocompleteSessionToken.newInstance()
    }

    suspend fun suggest(
        query: String,
        biasLat: Double? = null,
        biasLng: Double? = null,
    ): List<PlaceSuggestion> {
        if (!isAvailable || query.length < 3) return emptyList()
        val token = sessionToken ?: AutocompleteSessionToken.newInstance().also { sessionToken = it }
        return try {
            val request = FindAutocompletePredictionsRequest.builder()
                .setQuery(query)
                .setSessionToken(token)
                // Sesga hacia donde está mirando el usuario: sin esto un
                // "Bar Rodney" devuelve resultados de cualquier parte del mundo.
                .apply {
                    if (biasLat != null && biasLng != null) {
                        setOrigin(com.google.android.gms.maps.model.LatLng(biasLat, biasLng))
                    }
                }
                .setCountries("AR")
                .build()
            // Timeout propio: si Google no responde, la búsqueda de Google se
            // pierde pero la de nuestra base ya está en pantalla.
            withTimeout(6_000) {
                client().findAutocompletePredictions(request).await()
            }.autocompletePredictions
                .take(6)
                .map {
                    PlaceSuggestion(
                        placeId = it.placeId,
                        primary = it.getPrimaryText(null).toString(),
                        secondary = it.getSecondaryText(null).toString(),
                    )
                }
        } catch (e: Exception) {
            Log.w("PlaceSearch", "búsqueda falló", e)
            emptyList()
        }
    }

    /** Trae las coordenadas del lugar elegido y cierra la sesión de facturación. */
    suspend fun resolve(placeId: String): ResolvedPlace? {
        if (!isAvailable) return null
        return try {
            val fields = listOf(Place.Field.ID, Place.Field.DISPLAY_NAME,
                Place.Field.FORMATTED_ADDRESS, Place.Field.LOCATION)
            val request = FetchPlaceRequest.builder(placeId, fields)
                .setSessionToken(sessionToken)
                .build()
            val place = withTimeout(8_000) { client().fetchPlace(request).await() }.place
            sessionToken = null   // la sesión termina con el fetch
            val loc = place.location ?: return null
            ResolvedPlace(
                placeId = placeId,
                name = place.displayName ?: return null,
                address = place.formattedAddress,
                lat = loc.latitude,
                lng = loc.longitude,
            )
        } catch (e: Exception) {
            Log.w("PlaceSearch", "no se pudo resolver el lugar", e)
            null
        }
    }
}
