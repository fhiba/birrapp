package com.birrapp.ui.bar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.birrapp.data.api.ApiClient
import com.birrapp.data.model.*

data class HistoryState(val styleName: String, val points: List<PricePoint>?)

data class BarDetailUiState(
    val bar: BarDetail? = null,
    val reviews: List<Review> = emptyList(),
    val styles: List<BeerStyle> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    val toast: String? = null,
    val busyStyle: String? = null,
    val history: HistoryState? = null,
)

class BarDetailViewModel(
    private val api: ApiClient,
    private val barId: Long,
    private val fromLat: Double?,
    private val fromLng: Double?,
) : ViewModel() {

    private val _state = MutableStateFlow(BarDetailUiState())
    val state: StateFlow<BarDetailUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching {
                val bar = api.barDetail(barId, fromLat, fromLng)
                val reviews = runCatching { api.reviews(barId) }.getOrDefault(emptyList())
                val styles = runCatching { api.styles() }.getOrDefault(emptyList())
                Triple(bar, reviews, styles)
            }.onSuccess { (bar, reviews, styles) ->
                _state.update {
                    it.copy(bar = bar, reviews = reviews, styles = styles, loading = false)
                }
            }.onFailure { e ->
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    /**
     * "Sigue igual" — la operación que mantiene vivo el mapa.
     *
     * Optimista a propósito: la fila se marca ocupada y se recarga al
     * terminar. Si confirmar se siente lento, la gente deja de hacerlo y
     * todo el dataset envejece.
     */
    fun confirmPrice(styleSlug: String) {
        viewModelScope.launch {
            _state.update { it.copy(busyStyle = styleSlug) }
            runCatching { api.confirmPrice(barId, styleSlug) }
                .onSuccess { result ->
                    _state.update { it.copy(busyStyle = null, toast = result.message) }
                    load()
                }
                .onFailure { e ->
                    _state.update { it.copy(busyStyle = null, toast = e.message) }
                }
        }
    }

    fun reportPrice(styleSlug: String, price: Double, sizeMl: Int) {
        viewModelScope.launch {
            _state.update { it.copy(busyStyle = styleSlug) }
            runCatching {
                api.reportPrice(NewPriceRequest(barId, styleSlug, price, sizeMl))
            }.onSuccess { result ->
                _state.update { it.copy(busyStyle = null, toast = result.message) }
                load()
            }.onFailure { e ->
                _state.update { it.copy(busyStyle = null, toast = e.message) }
            }
        }
    }

    fun addReview(rating: Int, body: String?) {
        viewModelScope.launch {
            runCatching { api.addReview(NewReviewRequest(barId, rating, body)) }
                .onSuccess { _state.update { it.copy(toast = "¡Gracias!") }; load() }
                .onFailure { e -> _state.update { it.copy(toast = e.message) } }
        }
    }

    fun flag(targetType: String, targetId: Long, reason: String) {
        viewModelScope.launch {
            runCatching { api.flag(NewFlagRequest(targetType, targetId, reason)) }
                .onSuccess { _state.update { it.copy(toast = "Reportado. Gracias.") } }
                .onFailure { e -> _state.update { it.copy(toast = e.message) } }
        }
    }

    /** Moderación: saca un precio del mapa sin borrar el histórico. */
    fun removePrice(priceId: Long) {
        viewModelScope.launch {
            runCatching { api.removePrice(priceId) }
                .onSuccess { _state.update { it.copy(toast = "Precio eliminado") }; load() }
                .onFailure { e -> _state.update { it.copy(toast = e.message) } }
        }
    }

    /** Moderación: borra el bar entero. Para lugares inventados. */
    fun deleteBar(onDeleted: () -> Unit) {
        viewModelScope.launch {
            runCatching { api.deleteBar(barId) }
                .onSuccess { onDeleted() }
                .onFailure { e -> _state.update { it.copy(toast = e.message) } }
        }
    }

    fun openHistory(styleSlug: String, styleName: String) {
        _state.update { it.copy(history = HistoryState(styleName, null)) }
        viewModelScope.launch {
            val pts = runCatching { api.priceHistory(barId, styleSlug) }.getOrDefault(emptyList())
            _state.update { it.copy(history = HistoryState(styleName, pts)) }
        }
    }

    fun closeHistory() = _state.update { it.copy(history = null) }

    /** Reportar un precio mal cargado. Disponible para cualquiera, no sólo
     *  moderadores: quien ve el precio mal es el que está en el bar. */
    fun reportBadPrice(priceId: Long, description: String) {
        viewModelScope.launch {
            runCatching {
                api.flag(NewFlagRequest("price", priceId, "precio incorrecto: $description"))
            }
                .onSuccess {
                    _state.update {
                        it.copy(toast = "Reportado. Gracias, lo revisa un moderador.")
                    }
                }
                .onFailure { e -> _state.update { it.copy(toast = e.message) } }
        }
    }

    fun clearToast() = _state.update { it.copy(toast = null) }
}
