package com.birrapp.data.api

import android.util.Log
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.HttpResponseValidator
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.*
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import com.birrapp.BuildConfig
import com.birrapp.auth.SessionStore
import com.birrapp.data.model.*

/** Error de la API con el mensaje que mandó el backend, ya legible. */
class ApiException(val status: Int, override val message: String) : Exception(message)

/**
 * Cliente HTTP.
 *
 * El refresh de token se maneja a mano en vez de con el plugin Auth de Ktor:
 * el flujo es rotativo (cada refresh invalida el anterior) y hace falta un
 * mutex para que varias requests en paralelo que reciben 401 no gasten cada
 * una un refresh token distinto y se pisen entre ellas.
 */
class ApiClient(private val session: SessionStore) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val refreshMutex = Mutex()

    private val http = HttpClient(Android) {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
        defaultRequest {
            url(BuildConfig.API_BASE_URL.trimEnd('/') + "/")
            contentType(ContentType.Application.Json)
        }
        HttpResponseValidator {
            handleResponseExceptionWithRequest { cause, _ ->
                Log.w("ApiClient", "fallo de red", cause)
            }
        }
    }

    // ---------- núcleo ----------

    /**
     * Manda la request y, si vuelve 401 con sesión activa, refresca y
     * reintenta una sola vez.
     *
     * Separado de [request] a propósito: acá no hace falta el tipo genérico,
     * y una función local dentro de una `inline fun` no compila en Kotlin.
     */
    @PublishedApi
    internal suspend fun send(
        method: HttpMethod,
        path: String,
        body: Any?,
        auth: Boolean,
        params: Map<String, String>,
    ): HttpResponse {
        suspend fun once(token: String?) = http.request(path) {
            this.method = method
            params.forEach { (k, v) -> parameter(k, v) }
            token?.let { header(HttpHeaders.Authorization, "Bearer $it") }
            if (body != null) setBody(body)
        }

        val first = once(if (auth) session.accessToken() else null)
        if (first.status == HttpStatusCode.Unauthorized && auth && refreshAccessToken()) {
            return once(session.accessToken())
        }
        return first
    }

    private suspend inline fun <reified T> request(
        method: HttpMethod,
        path: String,
        body: Any? = null,
        auth: Boolean = false,
        params: Map<String, String> = emptyMap(),
    ): T {
        val response = send(method, path, body, auth, params)
        if (!response.status.isSuccess()) {
            val message = runCatching { response.body<ApiError>().message }
                .getOrElse { response.bodyAsText().ifBlank { "error ${response.status.value}" } }
            throw ApiException(response.status.value, message)
        }
        return response.body()
    }

    private suspend fun refreshAccessToken(): Boolean = refreshMutex.withLock {
        val refresh = session.refreshToken() ?: return false
        return try {
            val response = http.post("auth/refresh") { setBody(RefreshRequest(refresh)) }
            if (!response.status.isSuccess()) {
                // Sólo un rechazo explícito invalida la sesión. Un 500 o un
                // backend reiniciando no significan que haya que salir.
                if (response.status == HttpStatusCode.Unauthorized ||
                    response.status == HttpStatusCode.Forbidden
                ) {
                    session.clear()
                }
                return@withLock false
            }
            val res: SessionResponse = response.body()
            session.save(res)
            true
        } catch (e: Exception) {
            // Fallo de red: la sesión sigue siendo válida, sólo que ahora no
            // se puede confirmar. Se reintenta en la próxima llamada.
            Log.w("ApiClient", "no se pudo refrescar la sesión", e)
            false
        }
    }

    // ---------- lectura pública ----------

    suspend fun nearbyBars(
        lat: Double, lng: Double, radiusMeters: Int = 2000,
        sort: String = "distance", style: String? = null, limit: Int = 200,
    ): List<BarPin> = request(
        HttpMethod.Get, "bars",
        params = buildMap {
            put("lat", lat.toString()); put("lng", lng.toString())
            put("radius", radiusMeters.toString()); put("sort", sort)
            put("limit", limit.toString())
            style?.let { put("style", it) }
        },
    )

    suspend fun barDetail(id: Long, lat: Double? = null, lng: Double? = null): BarDetail =
        request(
            HttpMethod.Get, "bars/$id",
            params = buildMap {
                lat?.let { put("lat", it.toString()) }
                lng?.let { put("lng", it.toString()) }
            },
        )

    suspend fun styles(): List<BeerStyle> = request(HttpMethod.Get, "styles")

    /**
     * Marcas aprobadas. Vocabulario abierto, a diferencia de los estilos: cada
     * cervecería chica es una marca, así que la lista crece con moderación.
     */
    suspend fun brands(): List<Brand> = request(HttpMethod.Get, "brands")

    /** Alta de marca por un usuario. Queda pendiente hasta que la aprueben. */
    suspend fun createBrand(name: String, craft: Boolean): Brand =
        request(HttpMethod.Post, "brands", body = NewBrandRequest(name, craft), auth = true)

    /**
     * Histórico de una birra. Sale gratis del modelo append-only.
     *
     * Va por marca: mezclar las dos IPA de un bar da una serie que sube y baja
     * porque son dos cervezas, no porque el precio se haya movido.
     */
    suspend fun priceHistory(barId: Long, style: String, brand: String?): List<PricePoint> =
        request(
            HttpMethod.Get, "bars/$barId/history",
            params = buildMap {
                put("style", style)
                brand?.let { put("brand", it) }
            },
        )

    /** Busca entre los bares ya cargados, para no crear duplicados. */
    suspend fun searchBars(query: String, lat: Double?, lng: Double?): List<BarPin> =
        request(
            HttpMethod.Get, "bars/search",
            params = buildMap {
                put("q", query)
                lat?.let { put("lat", it.toString()) }
                lng?.let { put("lng", it.toString()) }
            },
        )

    suspend fun reviews(barId: Long): List<Review> = request(HttpMethod.Get, "bars/$barId/reviews")

    // ---------- notas, comentarios y fotos por birra ----------
    // `auth = true` con sesión opcional del lado del servidor: sin cuenta se
    // leen igual, y con token vienen marcados los propios.

    suspend fun barPhotos(barId: Long): List<Photo> =
        request(HttpMethod.Get, "bars/$barId/photos", auth = true)

    suspend fun beerComments(
        barId: Long, styleSlug: String, brandSlug: String?,
    ): List<RatingComment> = request(
        HttpMethod.Get, "bars/$barId/ratings/$styleSlug/comments",
        auth = true,
        params = buildMap { brandSlug?.let { put("brand", it) } },
    )

    suspend fun myRatings(barId: Long): List<MyRating> =
        request(HttpMethod.Get, "bars/$barId/my-ratings", auth = true)

    /** La nota: una sola por persona y por birra. Volver a llamar la pisa. */
    suspend fun rateBeer(req: NewRatingRequest): Map<String, Boolean> =
        request(HttpMethod.Post, "ratings", body = req, auth = true)

    /** Un comentario más. Se pueden dejar varios sobre la misma birra. */
    suspend fun addComment(req: NewCommentRequest): Map<String, Long> =
        request(HttpMethod.Post, "comments", body = req, auth = true)

    /** Borra un comentario propio. No toca la nota. */
    suspend fun removeMyComment(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "comments/$id/remove", auth = true)

    /** Moderación: baja el comentario de cualquiera. */
    suspend fun removeComment(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/comments/$id/remove", auth = true)

    suspend fun removeRating(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/ratings/$id/remove", auth = true)

    /**
     * Sube una foto en tres pasos: pedir permiso, subir al bucket, confirmar.
     *
     * Los bytes van del teléfono a Cloudflare sin pasar por el backend. El PUT
     * va con el cliente pelado y sin el header de Authorization: la URL ya está
     * firmada y agregarle ese header rompería la firma.
     *
     * La fila se escribe recién al final: si se escribiera antes, una subida
     * abandonada dejaría una foto rota en la galería.
     */
    suspend fun uploadPhoto(
        barId: Long, styleSlug: String, brandSlug: String?, bytes: ByteArray,
    ): Photo {
        val permit: UploadUrlResponse = request(
            HttpMethod.Post, "photos/upload-url",
            body = UploadUrlRequest(barId, styleSlug, brandSlug), auth = true,
        )
        putToBucket(permit.uploadUrl, bytes)
        return request(
            HttpMethod.Post, "photos",
            body = ConfirmPhotoRequest(barId, styleSlug, brandSlug, permit.key), auth = true,
        )
    }

    /** Moderación: baja la foto Y borra el objeto del bucket. Irreversible. */
    suspend fun removePhoto(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/photos/$id/remove", auth = true)

    /** Borra una foto propia. Cualquiera puede sacar la suya. */
    suspend fun removeMyPhoto(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "auth/me/photos/$id/remove", auth = true)

    // ---------- foto de perfil ----------

    suspend fun uploadAvatar(bytes: ByteArray): UserDto {
        val permit: AvatarUploadUrl =
            request(HttpMethod.Post, "auth/me/avatar/upload-url", auth = true)
        putToBucket(permit.uploadUrl, bytes)
        return request(
            HttpMethod.Post, "auth/me/avatar", body = AvatarConfirm(permit.key), auth = true,
        )
    }

    /** Saca la foto propia. Vuelve la de Google, si la cuenta tenía. */
    suspend fun removeAvatar(): UserDto =
        request(HttpMethod.Delete, "auth/me/avatar", auth = true)

    /** PUT firmado contra el bucket. Sin token: la firma ya autoriza. */
    private suspend fun putToBucket(url: String, bytes: ByteArray) {
        val response = http.put(url) {
            contentType(ContentType("image", "webp"))
            setBody(bytes)
        }
        if (!response.status.isSuccess()) {
            throw ApiException(response.status.value, "No se pudo subir la foto")
        }
    }

    // ---------- aportes propios ----------

    suspend fun myContributions(): MyContributions =
        request(HttpMethod.Get, "auth/me/contributions", auth = true)

    suspend fun removeMyPrice(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "auth/me/prices/$id/remove", auth = true)

    // ---------- aportes ----------

    suspend fun reportPrice(req: NewPriceRequest): PriceAccepted =
        request(HttpMethod.Post, "prices", body = req, auth = true)

    /**
     * "Sigue igual".
     *
     * Va con cuerpo y no con la marca en la URL: los slugs llevan acentos y
     * guiones, y un `penon-del-aguila` en el path es una fuente de errores de
     * encoding que no aporta nada.
     */
    suspend fun confirmPrice(barId: Long, styleSlug: String, brandSlug: String?): PriceAccepted =
        request(
            HttpMethod.Post, "bars/$barId/confirm",
            body = ConfirmPriceRequest(styleSlug, brandSlug), auth = true,
        )

    suspend fun addBar(req: NewBarRequest): Map<String, Long> =
        request(HttpMethod.Post, "bars", body = req, auth = true)

    suspend fun addReview(req: NewReviewRequest): Map<String, Boolean> =
        request(HttpMethod.Post, "reviews", body = req, auth = true)

    suspend fun flag(req: NewFlagRequest): Map<String, Boolean> =
        request(HttpMethod.Post, "flags", body = req, auth = true)

    // ---------- sesión ----------

    suspend fun loginWithGoogle(idToken: String): SessionResponse =
        request(HttpMethod.Post, "auth/google", body = GoogleLoginRequest(idToken))

    suspend fun me(): UserDto = request(HttpMethod.Get, "auth/me", auth = true)

    /** Pide la URL de autorización de Google para abrir en el navegador. */
    suspend fun startBrowserLogin(): BrowserStartResponse =
        request(HttpMethod.Post, "auth/browser/start")

    /** Canjea el código de un solo uso que llega por el deep link. */
    suspend fun redeemHandoff(code: String): SessionResponse =
        request(HttpMethod.Post, "auth/handoff", body = HandoffRequest(code))

    suspend fun logout() {
        runCatching { request<Unit>(HttpMethod.Post, "auth/logout", auth = true) }
        session.clear()
    }

    // ---------- moderación ----------

    suspend fun pendingBars(): List<BarPin> =
        request(HttpMethod.Get, "moderation/bars/pending", auth = true)

    suspend fun openFlags(): List<Flag> =
        request(HttpMethod.Get, "moderation/flags", auth = true)

    suspend fun approveBar(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/bars/$id/approve", auth = true)

    suspend fun rejectBar(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/bars/$id/reject", auth = true)

    suspend fun pendingBrands(): List<Brand> =
        request(HttpMethod.Get, "moderation/brands/pending", auth = true)

    suspend fun approveBrand(slug: String): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/brands/$slug/approve", auth = true)

    suspend fun rejectBrand(slug: String): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/brands/$slug/reject", auth = true)

    suspend fun resolveFlag(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/flags/$id/resolve", auth = true)

    suspend fun approvePrice(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/prices/$id/approve", auth = true)

    suspend fun removePrice(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/prices/$id/remove", auth = true)

    suspend fun deleteBar(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/bars/$id/delete", auth = true)

    suspend fun myStats(): UserStats = request(HttpMethod.Get, "auth/me/stats", auth = true)

    suspend fun deleteAccount() {
        request<Unit>(HttpMethod.Delete, "auth/me", auth = true)
        session.clear()
    }
}
