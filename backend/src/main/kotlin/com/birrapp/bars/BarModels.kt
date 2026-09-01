package com.birrapp.bars

import kotlinx.serialization.Serializable

@Serializable
data class StylePriceDto(
    /** Id del reporte vigente. Lo necesita la moderación para borrarlo. */
    val id: Long,
    val styleSlug: String,
    val styleName: String,
    val price: Double,
    val sizeMl: Int,
    val ageDays: Int,
    /** fresh <14d · aging 14-45d · stale >45d */
    val freshness: String,
    /**
     * Nota de esta birra en este bar, con shrinkage bayesiano — ver
     * `v_style_ratings`. Null mientras nadie votó.
     */
    //  Sin valor por defecto a propósito: kotlinx no serializa un campo que
    //  vale su default, y el frontend recibiría `undefined` donde el tipo
    //  promete `number | null`. Con el campo siempre presente, las dos puntas
    //  dicen lo mismo.
    val ratingAvg: Double?,
    val ratingCount: Int,
    /** Días desde el último voto. La nota tampoco se muestra sin su edad. */
    val ratingAgeDays: Int?,
)

/** Lo mínimo que necesita un pin del mapa. Se manda esto y nada más. */
@Serializable
data class BarPinDto(
    val id: Long,
    val name: String,
    val lat: Double,
    val lng: Double,
    /** null = el bar no tiene ningún precio no-stale. */
    val fromPrice: Double?,
    val freshestAgeDays: Int?,
    val distanceMeters: Double?,
)

@Serializable
data class BarDetailDto(
    val id: Long,
    val name: String,
    val address: String?,
    val neighbourhood: String?,
    val lat: Double,
    val lng: Double,
    val status: String,
    val googlePlaceId: String? = null,
    val distanceMeters: Double?,
    val prices: List<StylePriceDto>,
    val avgRating: Double?,
    val reviewCount: Int,
)

@Serializable
data class NewBarRequest(
    val name: String,
    val lat: Double,
    val lng: Double,
    val address: String? = null,
    val neighbourhood: String? = null,
    /**
     * Place ID de Google Maps, si el usuario eligió el bar del buscador.
     * Es lo único de Places que se puede guardar de forma permanente.
     */
    val googlePlaceId: String? = null,
)

enum class BarSort { distance, cheapest }
