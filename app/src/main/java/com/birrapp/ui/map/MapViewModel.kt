package com.birrapp.ui.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.birrapp.data.model.BarPin
import com.birrapp.data.model.BeerStyle
import com.birrapp.data.repo.BarRepository
import com.birrapp.location.BUENOS_AIRES_CENTER
import com.birrapp.location.LocationProvider

enum class SortMode(val apiValue: String) { DISTANCE("distance"), CHEAPEST("cheapest") }

data class MapUiState(
    val bars: List<BarPin> = emptyList(),
    val styles: List<BeerStyle> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    val sort: SortMode = SortMode.DISTANCE,
    val styleFilter: String? = null,
    val center: Pair<Double, Double> = BUENOS_AIRES_CENTER,
    val hasLocationPermission: Boolean = false,
    val radiusMeters: Int = 2000,
    /**
     * Se incrementa cuando el usuario pide centrarse. La pantalla observa el
     * cambio y anima la cámara. Un booleano no sirve: dos toques seguidos en
     * el mismo lugar no producirían cambio de estado y el segundo se perdería.
     */
    val recenterToken: Int = 0,
    /** false = salto instantáneo (primer arranque); true = animación. */
    val recenterAnimated: Boolean = true,
    /** true mientras se muestran datos guardados y todavía no llegó lo fresco. */
    val fromCache: Boolean = false,
    /**
     * Punto simulado: el usuario mantuvo apretado el mapa para ver qué hay
     * cerca de OTRO lugar. Mientras existe, manda sobre su ubicación real.
     */
    val simulated: Pair<Double, Double>? = null,
    /** false hasta resolver la ubicación: evita mostrar un lugar equivocado. */
    val locationResolved: Boolean = false,
    /** Muy lejos, no se consulta: la consulta sería enorme y sin utilidad. */
    val tooZoomedOut: Boolean = false,
) {
    /** Desde dónde se busca: el punto simulado si hay, si no la ubicación. */
    val queryPoint: Pair<Double, Double> get() = simulated ?: center
}

class MapViewModel(
    private val bars: BarRepository,
    private val location: LocationProvider,
) : ViewModel() {

    private val _state = MutableStateFlow(MapUiState())
    val state: StateFlow<MapUiState> = _state.asStateFlow()

    init {
        // Orden deliberado: ubicación → caché → red.
        //
        // Antes se pintaba el caché usando el centro por defecto (el Obelisco)
        // antes de saber dónde estaba el usuario, así que alguien en zona norte
        // veía por un instante bares del centro. Ahora se resuelve la ubicación
        // primero, y recién con ese punto se decide qué mostrar y si hace falta
        // pedir algo.
        viewModelScope.launch {
            val granted = location.hasPermission()
            val here = location.current()
            // Mover la cámara ya: antes el estado se actualizaba pero la
            // cámara se quedaba donde había arrancado (el Obelisco), así que
            // el usuario veía el centro aunque estuviera en zona norte.
            // Salto instantáneo, no animación: volar desde el Obelisco hasta
            // San Isidro al abrir la app es un viaje que nadie pidió.
            _state.update {
                it.copy(
                    center = here,
                    hasLocationPermission = granted,
                    locationResolved = true,
                    recenterToken = it.recenterToken + 1,
                    recenterAnimated = false,
                )
            }

            // Lo guardado en disco, si cubre donde está parado: aparece al
            // instante, sin esperar a la red.
            bars.primeFromDisk()
            val cached = bars.peek(
                here.first, here.second, _state.value.radiusMeters, _state.value.sort.apiValue,
            )
            if (!cached.isNullOrEmpty()) {
                _state.update { it.copy(bars = cached, loading = false, fromCache = true) }
            }

            // Y ahora sí la red. `nearby` decide sola: si la región guardada ya
            // alcanza, no sale ninguna request.
            load(immediate = true)
        }

        viewModelScope.launch {
            runCatching { bars.styles() }.onSuccess { s ->
                _state.update { it.copy(styles = s) }
            }
        }
    }

    /** [recenter] = además de recargar, mover la cámara a la ubicación. */
    fun refreshLocationThenLoad(recenter: Boolean = false) {
        viewModelScope.launch {
            val granted = location.hasPermission()
            val center = location.current()
            _state.update {
                it.copy(
                    center = center,
                    hasLocationPermission = granted,
                    locationResolved = true,
                    recenterToken = if (recenter) it.recenterToken + 1 else it.recenterToken,
                    recenterAnimated = true,
                )
            }
            load()
        }
    }

    private var loadJob: Job? = null

    fun load(force: Boolean = false, immediate: Boolean = false) {
        // Cancelar la carga anterior: paneando, cada movimiento disparaba una
        // corrutina y llegaban respuestas fuera de orden.
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            // Pequeña espera para no consultar en cada micro-movimiento del
            // mapa. Si llega otro movimiento antes, este job se cancela.
            if (!force && !immediate) delay(280)
            _state.update { it.copy(loading = true, error = null) }
            val s = _state.value
            if (s.tooZoomedOut) {
                _state.update { it.copy(loading = false) }
                return@launch
            }
            val point = s.queryPoint
            runCatching {
                bars.nearby(
                    lat = point.first, lng = point.second,
                    radiusMeters = s.radiusMeters, sort = s.sort.apiValue,
                    style = s.styleFilter, force = force,
                )
            }.onSuccess { result ->
                _state.update {
                    it.copy(bars = result, loading = false, fromCache = bars.servingFromCache)
                }
            }.onFailure { e ->
                // Con datos en pantalla no se muestra el error: sigue siendo
                // usable, sólo que sin refrescar. Molestar con un cartel
                // cuando la app funciona es ruido.
                _state.update { current ->
                    if (current.bars.isNotEmpty()) {
                        current.copy(loading = false, fromCache = true)
                    } else {
                        current.copy(loading = false, error = e.message)
                    }
                }
            }
        }
    }

    fun setSort(mode: SortMode) {
        if (_state.value.sort == mode) return
        _state.update { it.copy(sort = mode) }
        load(force = true)
    }

    fun setStyleFilter(slug: String?) {
        _state.update { it.copy(styleFilter = slug) }
        load(force = true)
    }

    /**
     * Al mover el mapa: recentrar y volver a consultar.
     *
     * Con un punto simulado activo NO se recentra la consulta: el usuario
     * está mirando alrededor de ese punto y mover el mapa no debería
     * cambiarlo.
     */
    fun onMapMoved(lat: Double, lng: Double, zoom: Float) {
        // Muy alejado, el radio necesario sería de decenas de kilómetros y la
        // consulta devolvería miles de bares que no se pueden ni dibujar.
        val tooFar = zoom < MIN_QUERY_ZOOM
        _state.update {
            it.copy(
                center = if (it.simulated == null) lat to lng else it.center,
                tooZoomedOut = tooFar,
            )
        }
        if (!tooFar) load()
    }

    fun setRadius(meters: Int) {
        _state.update { it.copy(radiusMeters = meters) }
        load(force = true)
    }

    /** Mantener apretado el mapa: buscar alrededor de ese punto. */
    fun setSimulated(lat: Double, lng: Double) {
        _state.update { it.copy(simulated = lat to lng) }
        load(force = true)
    }

    /** Un toque en cualquier otro lado lo saca, como en Google Maps. */
    fun clearSimulated() {
        if (_state.value.simulated == null) return
        _state.update { it.copy(simulated = null) }
        load(force = true)
    }

    private companion object {
        /** Debajo de este zoom no se consulta. */
        const val MIN_QUERY_ZOOM = 12f
    }
}
