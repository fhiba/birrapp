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

/** El título lleva estilo y marca: la serie es de una birra, no de un estilo. */
data class HistoryState(val title: String, val points: List<PricePoint>?)

data class BarDetailUiState(
    val bar: BarDetail? = null,
    val reviews: List<Review> = emptyList(),
    val styles: List<BeerStyle> = emptyList(),
    val brands: List<Brand> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    val toast: String? = null,
    /** Clave (estilo, marca) de la birra ocupada, no sólo su estilo. */
    val busyBeer: String? = null,
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
                // Las marcas ya cargadas se conservan: la que acaba de crear
                // el usuario está pendiente de moderación y no vuelve en esta
                // lista, pero tiene que poder seguir usándola.
                val brands = runCatching { api.brands() }
                    .getOrDefault(_state.value.brands)
                BarLoad(bar, reviews, styles, brands)
            }.onSuccess { loaded ->
                _state.update {
                    it.copy(
                        bar = loaded.bar, reviews = loaded.reviews,
                        styles = loaded.styles,
                        brands = mergeBrands(loaded.brands, it.brands),
                        loading = false,
                    )
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
    fun confirmPrice(beer: StylePrice) {
        viewModelScope.launch {
            _state.update { it.copy(busyBeer = beer.key) }
            runCatching { api.confirmPrice(barId, beer.styleSlug, beer.brandSlug) }
                .onSuccess { result ->
                    _state.update { it.copy(busyBeer = null, toast = result.message) }
                    load()
                }
                .onFailure { e ->
                    _state.update { it.copy(busyBeer = null, toast = e.message) }
                }
        }
    }

    fun reportPrice(styleSlug: String, brandSlug: String?, price: Double, sizeMl: Int) {
        viewModelScope.launch {
            _state.update { it.copy(busyBeer = "$styleSlug|${brandSlug ?: ""}") }
            runCatching {
                api.reportPrice(NewPriceRequest(barId, styleSlug, price, sizeMl, brandSlug))
            }.onSuccess { result ->
                _state.update { it.copy(busyBeer = null, toast = result.message) }
                load()
            }.onFailure { e ->
                _state.update { it.copy(busyBeer = null, toast = e.message) }
            }
        }
    }

    /** Alta de marca. Devuelve la marca para poder seleccionarla en el acto. */
    suspend fun createBrand(name: String): Brand = api.createBrand(name, craft = true)

    /**
     * Suma una marca recién creada a la lista local.
     *
     * Queda pendiente de moderación, así que no viene en `GET /brands`. Sin
     * esto, cargar el precio de una marca nueva serían dos viajes a la app:
     * uno para crearla y otro, cuando la aprueben, para cargar el precio.
     */
    fun addBrand(brand: Brand) = _state.update {
        it.copy(brands = mergeBrands(it.brands, listOf(brand)))
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

    fun openHistory(beer: StylePrice) {
        _state.update { it.copy(history = HistoryState(beer.beerName, null)) }
        viewModelScope.launch {
            val pts = runCatching { api.priceHistory(barId, beer.styleSlug, beer.brandSlug) }
                .getOrDefault(emptyList())
            _state.update { it.copy(history = HistoryState(beer.beerName, pts)) }
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

private data class BarLoad(
    val bar: BarDetail,
    val reviews: List<Review>,
    val styles: List<BeerStyle>,
    val brands: List<Brand>,
)

/** Une dos listas de marcas sin repetir slugs, conservando el orden del server. */
private fun mergeBrands(base: List<Brand>, extra: List<Brand>): List<Brand> {
    val known = base.mapTo(mutableSetOf()) { it.slug }
    return base + extra.filter { known.add(it.slug) }
}
