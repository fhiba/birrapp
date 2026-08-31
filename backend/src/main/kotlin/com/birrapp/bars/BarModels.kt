package com.birrapp.bars

import kotlinx.serialization.Serializable

@Serializable
data class StylePriceDto(
    val styleSlug: String,
    val styleName: String,
    val price: Double,
    val sizeMl: Int,
    val ageDays: Int,
    /** fresh <14d · aging 14-45d · stale >45d */
    val freshness: String,
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
)

enum class BarSort { distance, cheapest }
