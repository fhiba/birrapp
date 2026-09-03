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

/**
 * Una birra de un bar. La birra es (estilo, marca), no el estilo solo: una IPA
 * de Antares y una de Juguetes Perdidos tienen precio, nota y fotos propias.
 *
 * Casi todo es nullable y no por prolijidad. `id` y `price` faltan cuando la
 * birra no tiene precio vigente —pasa si un moderador bajó el reporte— y la
 * birra sigue existiendo con sus notas y sus fotos. `brandSlug` null es "sin
 * marca", que es una birra concreta y no un dato faltante.
 */
@Serializable
data class StylePrice(
    val id: Long? = null,
    val styleSlug: String,
    val styleName: String,
    val brandSlug: String? = null,
    val brandName: String? = null,
    val brandCraft: Boolean? = null,
    val price: Double? = null,
    val sizeMl: Int? = null,
    val ageDays: Int? = null,
    val freshness: String? = null,
    /** Promedio real de la nota. Es el que se muestra. */
    val ratingRaw: Double? = null,
    /** Con shrinkage bayesiano: sirve para ordenar, nunca para mostrar. */
    val ratingAvg: Double? = null,
    val ratingCount: Int = 0,
    val ratingAgeDays: Int? = null,
) {
    val fresh: Freshness get() = Freshness.from(freshness)

    /**
     * Cómo se nombra esta birra en pantalla.
     *
     * El estilo solo dejó de alcanzar: decirle "IPA" a las dos IPA de un bar
     * hace que alguien confirme un borrado sobre una cerveza distinta de la
     * que está mirando.
     */
    val beerName: String
        get() = brandName?.let { "$styleName · $it" } ?: styleName

    /** Clave estable, para saber cuál fila está ocupada. */
    val key: String get() = "$styleSlug|${brandSlug ?: ""}"
}

@Serializable data class Brand(val slug: String, val name: String, val craft: Boolean)

@Serializable data class NewBrandRequest(val name: String, val craft: Boolean = true)

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
    val photos: Int = 0,
)

@Serializable data class Review(
    val id: Long, val authorName: String, val rating: Int,
    val body: String? = null, val createdAt: String,
)

/** Una foto de una birra concreta. `mine` viene del servidor con la sesión. */
@Serializable data class Photo(
    val id: Long,
    val styleSlug: String,
    val brandSlug: String? = null,
    val url: String,
    val authorName: String? = null,
    val ageDays: Int,
    val mine: Boolean = false,
)

/**
 * Un comentario. `rating` es la nota de quien escribió sobre ESA birra, y
 * puede faltar: comentar y puntuar son dos acciones separadas.
 */
@Serializable data class RatingComment(
    val id: Long,
    val authorName: String,
    val body: String? = null,
    val ageDays: Int,
    val mine: Boolean = false,
    /** De 0 a 5, con un decimal: alguien pudo cargar un 3,8 desde la web. */
    val rating: Double? = null,
)

/** Lo que votó el usuario en un bar, por birra. */
@Serializable data class MyRating(
    val styleSlug: String,
    val brandSlug: String? = null,
    /** De 0 a 5, con un decimal. */
    val rating: Double,
)

@Serializable data class NewRatingRequest(
    val barId: Long, val styleSlug: String, val brandSlug: String? = null, val rating: Int,
)

@Serializable data class NewCommentRequest(
    val barId: Long, val styleSlug: String, val brandSlug: String? = null, val body: String,
)

@Serializable data class UploadUrlRequest(
    val barId: Long, val styleSlug: String, val brandSlug: String? = null,
)

@Serializable data class UploadUrlResponse(val uploadUrl: String, val key: String)

@Serializable data class ConfirmPhotoRequest(
    val barId: Long, val styleSlug: String, val brandSlug: String? = null, val key: String,
)

@Serializable data class AvatarUploadUrl(val uploadUrl: String, val key: String)
@Serializable data class AvatarConfirm(val key: String)

@Serializable data class MyBar(
    val id: Long, val name: String, val status: String, val ageDays: Int,
)

@Serializable data class MyPrice(
    val id: Long, val barId: Long, val barName: String, val styleName: String,
    val brandName: String? = null,
    val price: Double, val sizeMl: Int, val ageDays: Int,
    val isConfirmation: Boolean,
    /** Es el precio que la app muestra hoy para esa birra. */
    val isCurrent: Boolean,
)

@Serializable data class MyPhoto(
    val id: Long, val barId: Long, val barName: String, val styleName: String,
    val brandName: String? = null, val url: String, val ageDays: Int,
)

@Serializable data class MyComment(
    val id: Long, val barId: Long, val barName: String, val styleName: String,
    val brandName: String? = null, val body: String, val ageDays: Int,
)

@Serializable data class MyContributions(
    val bars: List<MyBar> = emptyList(),
    val prices: List<MyPrice> = emptyList(),
    val photos: List<MyPhoto> = emptyList(),
    val comments: List<MyComment> = emptyList(),
)

@Serializable data class NewPriceRequest(
    val barId: Long, val styleSlug: String, val price: Double, val sizeMl: Int = 473,
    /** Opcional: no siempre se sabe, y obligarla frenaría la carga. */
    val brandSlug: String? = null,
)

@Serializable data class ConfirmPriceRequest(
    val styleSlug: String, val brandSlug: String? = null,
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
