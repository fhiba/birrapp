package com.birrapp.auth

import io.ktor.http.HttpStatusCode
import io.ktor.server.auth.authenticate
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.response.respondRedirect
import com.birrapp.core.ApiException
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.delete
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.plugins.ratelimit.RateLimitName
import io.ktor.server.plugins.ratelimit.rateLimit
import kotlinx.serialization.Serializable
import com.birrapp.core.Config
import com.birrapp.core.forbidden
import com.birrapp.core.notFound
import com.birrapp.core.unauthorized

private val authLog = org.slf4j.LoggerFactory.getLogger("birrapp.auth")

@Serializable data class GoogleLoginRequest(val idToken: String)
@Serializable data class RefreshRequest(val refreshToken: String)
@Serializable data class SessionResponse(
    val accessToken: String,
    val refreshToken: String,
    val expiresInSeconds: Long,
    val user: UserDto,
)

@Serializable data class BrowserStartResponse(val authorizeUrl: String)
@Serializable data class HandoffRequest(val code: String)

fun Route.authRoutes(
    cfg: Config,
    verifier: GoogleTokenVerifier,
    users: UserRepo,
    refreshTokens: RefreshTokenRepo,
    jwt: JwtService,
    browserOAuth: BrowserOAuth,
    handoffs: HandoffStore,
) = route("/auth") {

    // ---------- login por navegador ----------
    // Alternativa a Credential Manager, que sólo ofrece cuentas ya cargadas
    // en el teléfono. Este camino sirve para cualquier cuenta de Google.

    post("/browser/start") {
        if (!browserOAuth.isConfigured || cfg.publicBaseUrl.isBlank()) {
            throw ApiException(
                HttpStatusCode.ServiceUnavailable,
                "El inicio de sesión por navegador no está disponible por ahora.",
                "not_configured",
            )
        }
        val (url, _) = browserOAuth.startAuthorization()
        call.respond(BrowserStartResponse(url))
    }

    /** Google vuelve acá. No lo llama la app: lo llama el navegador. */
    get("/callback") {
        val params = call.request.queryParameters
        val error = params["error"]
        val code = params["code"]
        val state = params["state"]

        suspend fun fail(reason: String) {
            authLog.warn("login por navegador falló: {}", reason)
            call.respondRedirect("${cfg.appRedirectScheme}://auth?error=1")
        }

        if (error != null) return@get fail("google devolvió $error")
        if (code == null || state == null) return@get fail("faltan code o state")

        val idToken = runCatching { browserOAuth.exchange(code, state) }
            .getOrElse { e -> return@get fail("el canje falló: ${e.message}") }
            ?: return@get fail("state inválido o vencido")

        val identity = runCatching { verifier.verify(idToken) }
            .getOrElse { e -> return@get fail("token inválido: ${e.message}") }

        val user = users.upsert(identity, cfg.bootstrapAdminEmails)
        if (user.isBanned) return@get fail("cuenta suspendida")

        // Los tokens NO viajan por la URL: quedarían en el historial del
        // navegador. Va un código de un solo uso que la app canjea por HTTPS.
        val handoff = handoffs.issue(user.id)
        call.respondRedirect("${cfg.appRedirectScheme}://auth?handoff=$handoff")
    }

    post("/handoff") {
        val body = call.receive<HandoffRequest>()
        val userId = handoffs.consume(body.code)
            ?: unauthorized("ese código ya se usó o venció")
        val user = users.findById(userId) ?: unauthorized("usuario inexistente")
        if (user.isBanned) forbidden("esta cuenta está suspendida")
        call.respond(
            SessionResponse(
                accessToken = jwt.accessToken(user),
                refreshToken = refreshTokens.issue(user.id, cfg.refreshDays),
                expiresInSeconds = cfg.accessMinutes * 60,
                user = user.toDto(),
            )
        )
    }

    // Los dos endpoints sin autenticar del sistema: acá es donde pega
    // cualquiera que quiera hacer fuerza bruta o quemarte la cuota de Google.
    rateLimit(RateLimitName("auth")) {

        /** Canje: ID token de Google -> sesión propia de birrapp. */
        post("/google") {
            // Sin client ID configurado no hay forma de validar nada: mejor decirlo
            // explícito que fallar más adentro con un error incomprensible.
            if (cfg.googleWebClientId.isBlank()) {
            authLog.error(
                "rechazado /auth/google: falta GOOGLE_WEB_CLIENT_ID en la config del servidor",
            )
                throw com.birrapp.core.ApiException(
                    io.ktor.http.HttpStatusCode.ServiceUnavailable,
                    "El login no está configurado en este servidor: falta " +
                        "GOOGLE_WEB_CLIENT_ID. Ver docs/SETUP.md paso 4b.",
                    "not_configured",
                )
            }
            val body = call.receive<GoogleLoginRequest>()
            val identity = try {
                verifier.verify(body.idToken)
            } catch (e: InvalidGoogleToken) {
                unauthorized(e.message ?: "ID token inválido")
            }

            val user = users.upsert(identity, cfg.bootstrapAdminEmails)
            if (user.isBanned) forbidden("esta cuenta está suspendida")

            call.respond(
                SessionResponse(
                    accessToken = jwt.accessToken(user),
                    refreshToken = refreshTokens.issue(user.id, cfg.refreshDays),
                    expiresInSeconds = cfg.accessMinutes * 60,
                    user = user.toDto(),
                )
            )
        }

        post("/refresh") {
            val body = call.receive<RefreshRequest>()
            val (userId, nextToken) = refreshTokens.rotate(body.refreshToken, cfg.refreshDays)
                ?: unauthorized("refresh token inválido o vencido")
            val user = users.findById(userId) ?: unauthorized("usuario inexistente")
            if (user.isBanned) forbidden("esta cuenta está suspendida")

            call.respond(
                SessionResponse(
                    accessToken = jwt.accessToken(user),
                    refreshToken = nextToken,
                    expiresInSeconds = cfg.accessMinutes * 60,
                    user = user.toDto(),
                )
            )
        }

    } // fin del rate limit de auth

    authenticate("jwt") {
        get("/me") {
            val caller = call.caller()
            val user = users.findById(caller.userId) ?: unauthorized("usuario inexistente")
            call.respond(user.toDto())
        }

        get("/me/stats") {
            val caller = call.caller()
            call.respond(users.stats(caller.userId))
        }

        /**
         * Borrado de cuenta. Exigido por Apple y por Google Play.
         *
         * Se revocan los refresh tokens primero: si el borrado fallara a
         * mitad, la sesión ya no sirve y nadie queda con acceso a una cuenta
         * a medio borrar.
         */
        delete("/me") {
            val caller = call.caller()
            refreshTokens.revokeAllFor(caller.userId)
            if (!users.deleteAccount(caller.userId)) notFound("no existe esa cuenta")
            call.respond(HttpStatusCode.NoContent)
        }

        post("/logout") {
            val caller = call.caller()
            refreshTokens.revokeAllFor(caller.userId)
            call.respond(HttpStatusCode.NoContent)
        }
    }
}
