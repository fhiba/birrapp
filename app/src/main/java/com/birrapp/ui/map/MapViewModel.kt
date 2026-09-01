package com.birrapp.ui.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
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
)

class MapViewModel(
    private val bars: BarRepository,
    private val location: LocationProvider,
) : ViewModel() {

    private val _state = MutableStateFlow(MapUiState())
    val state: StateFlow<MapUiState> = _state.asStateFlow()

    init {
        refreshLocationThenLoad()
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
                    recenterToken = if (recenter) it.recenterToken + 1 else it.recenterToken,
                )
            }
            load()
        }
    }

    fun load(force: Boolean = false) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            val s = _state.value
            runCatching {
                bars.nearby(
                    lat = s.center.first, lng = s.center.second,
                    radiusMeters = s.radiusMeters, sort = s.sort.apiValue,
                    style = s.styleFilter, force = force,
                )
            }.onSuccess { result ->
                _state.update { it.copy(bars = result, loading = false) }
            }.onFailure { e ->
                _state.update { it.copy(loading = false, error = e.message) }
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

    /** Al mover el mapa: recentrar y volver a consultar esa zona. */
    fun onMapMoved(lat: Double, lng: Double) {
        _state.update { it.copy(center = lat to lng) }
        load()
    }

    fun setRadius(meters: Int) {
        _state.update { it.copy(radiusMeters = meters) }
        load(force = true)
    }
}
