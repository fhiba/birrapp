package com.birrapp.auth

import io.ktor.http.HttpStatusCode
import io.ktor.server.auth.authenticate
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable
import com.birrapp.core.Config
import com.birrapp.core.forbidden
import com.birrapp.core.unauthorized

@Serializable data class GoogleLoginRequest(val idToken: String)
@Serializable data class RefreshRequest(val refreshToken: String)
@Serializable data class SessionResponse(
    val accessToken: String,
    val refreshToken: String,
    val expiresInSeconds: Long,
    val user: UserDto,
)

fun Route.authRoutes(
    cfg: Config,
    verifier: GoogleTokenVerifier,
    users: UserRepo,
    refreshTokens: RefreshTokenRepo,
    jwt: JwtService,
) = route("/auth") {

    /** Canje: ID token de Google -> sesión propia de birrapp. */
    post("/google") {
        // Sin client ID configurado no hay forma de validar nada: mejor decirlo
        // explícito que fallar más adentro con un error incomprensible.
        if (cfg.googleWebClientId.isBlank()) {
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

    authenticate("jwt") {
        get("/me") {
            val caller = call.caller()
            val user = users.findById(caller.userId) ?: unauthorized("usuario inexistente")
            call.respond(user.toDto())
        }

        post("/logout") {
            val caller = call.caller()
            refreshTokens.revokeAllFor(caller.userId)
            call.respond(HttpStatusCode.NoContent)
        }
    }
}
