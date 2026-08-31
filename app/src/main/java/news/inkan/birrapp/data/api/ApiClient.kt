package news.inkan.birrapp.data.api

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
import news.inkan.birrapp.BuildConfig
import news.inkan.birrapp.auth.SessionStore
import news.inkan.birrapp.data.model.*

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
            val res: SessionResponse = http.post("auth/refresh") {
                setBody(RefreshRequest(refresh))
            }.let {
                if (!it.status.isSuccess()) return@withLock false.also { _ -> session.clear() }
                it.body()
            }
            session.save(res)
            true
        } catch (e: Exception) {
            Log.w("ApiClient", "no se pudo refrescar la sesión", e)
            session.clear()
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

    suspend fun reviews(barId: Long): List<Review> = request(HttpMethod.Get, "bars/$barId/reviews")

    // ---------- aportes ----------

    suspend fun reportPrice(req: NewPriceRequest): PriceAccepted =
        request(HttpMethod.Post, "prices", body = req, auth = true)

    suspend fun confirmPrice(barId: Long, styleSlug: String): PriceAccepted =
        request(HttpMethod.Post, "bars/$barId/confirm/$styleSlug", auth = true)

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

    suspend fun resolveFlag(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/flags/$id/resolve", auth = true)

    suspend fun approvePrice(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/prices/$id/approve", auth = true)

    suspend fun removePrice(id: Long): Map<String, Boolean> =
        request(HttpMethod.Post, "moderation/prices/$id/remove", auth = true)
}
