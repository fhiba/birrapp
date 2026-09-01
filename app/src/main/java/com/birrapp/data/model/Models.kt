package com.birrapp.data.model

import kotlinx.serialization.Serializable

/**
 * Frescura del precio. Es el concepto central de la app: en pesos, un precio
 * sin edad visible es peor que no tener precio.
 */
enum class Freshness { fresh, aging, stale;
    companion object {
        fun from(s: String?) = runCatching { valueOf(s ?: "") }.getOrDefault(stale)
    }
}

@Serializable
data class StylePrice(
    val id: Long,
    val styleSlug: String,
    val styleName: String,
    val price: Double,
    val sizeMl: Int,
    val ageDays: Int,
    val freshness: String,
) {
    val fresh: Freshness get() = Freshness.from(freshness)
    /** Precio por litro: la única forma honesta de comparar tamaños distintos. */
    val perLitre: Double get() = price / sizeMl * 1000
}

@Serializable
data class BarPin(
    val id: Long,
    val name: String,
    val lat: Double,
    val lng: Double,
    val fromPrice: Double? = null,
    val freshestAgeDays: Int? = null,
    val distanceMeters: Double? = null,
)

@Serializable
data class BarDetail(
    val id: Long,
    val name: String,
    val address: String? = null,
    val neighbourhood: String? = null,
    val lat: Double,
    val lng: Double,
    val status: String,
    val googlePlaceId: String? = null,
    val distanceMeters: Double? = null,
    val prices: List<StylePrice> = emptyList(),
    val avgRating: Double? = null,
    val reviewCount: Int = 0,
)

@Serializable data class BeerStyle(val slug: String, val name: String)

@Serializable data class PricePoint(val price: Double, val sizeMl: Int, val at: String)

@Serializable data class UserStats(
    val prices: Int, val confirmations: Int, val bars: Int, val reviews: Int,
)

@Serializable data class Review(
    val id: Long, val authorName: String, val rating: Int,
    val body: String? = null, val createdAt: String,
)

@Serializable data class NewPriceRequest(
    val barId: Long, val styleSlug: String, val price: Double, val sizeMl: Int = 473,
)

@Serializable data class PriceAccepted(
    val id: Long, val heldForReview: Boolean, val message: String,
)

@Serializable data class NewBarRequest(
    val name: String, val lat: Double, val lng: Double,
    val address: String? = null, val neighbourhood: String? = null,
    /** Lo único de Google Places que se puede guardar de forma permanente. */
    val googlePlaceId: String? = null,
)

@Serializable data class NewReviewRequest(
    val barId: Long, val rating: Int, val body: String? = null,
)

@Serializable data class NewFlagRequest(
    val targetType: String, val targetId: Long, val reason: String,
)

@Serializable data class Flag(
    val id: Long, val targetType: String, val targetId: Long, val reason: String,
    val createdAt: String, val reporterName: String? = null, val targetSummary: String? = null,
)

@Serializable data class UserDto(
    val id: Long, val email: String, val displayName: String,
    val avatarUrl: String? = null, val role: String,
) {
    val isModerator: Boolean get() = role == "moderator" || role == "admin"
    val isAdmin: Boolean get() = role == "admin"
}

@Serializable data class SessionResponse(
    val accessToken: String, val refreshToken: String,
    val expiresInSeconds: Long, val user: UserDto,
)

@Serializable data class GoogleLoginRequest(val idToken: String)
@Serializable data class RefreshRequest(val refreshToken: String)
@Serializable data class BrowserStartResponse(val authorizeUrl: String)
@Serializable data class HandoffRequest(val code: String)
@Serializable data class ApiError(val code: String, val message: String)
