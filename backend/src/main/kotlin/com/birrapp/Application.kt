package com.birrapp

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.defaultheaders.DefaultHeaders
import io.ktor.server.plugins.forwardedheaders.XForwardedHeaders
import io.ktor.server.plugins.origin
import io.ktor.server.plugins.ratelimit.RateLimit
import io.ktor.server.plugins.ratelimit.RateLimitName
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.routing.routing
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.Json
import com.birrapp.auth.*
import com.birrapp.bars.BarRepo
import com.birrapp.core.*
import com.birrapp.moderation.ModerationRepo
import com.birrapp.prices.PriceRepo
import com.birrapp.reviews.ReviewRepo
import org.slf4j.LoggerFactory
import kotlin.time.Duration.Companion.minutes

fun main() {
    val log = LoggerFactory.getLogger("birrapp")
    val cfg = Config.load()

    val db = Db.connect(cfg.dbUrl, cfg.dbUser, cfg.dbPassword)
    db.migrate()
    log.info("base migrada: {}", cfg.dbUrl)

    log.info("escuchando en {}:{}", cfg.bindHost, cfg.port)
    embeddedServer(Netty, port = cfg.port, host = cfg.bindHost) { module(cfg, db) }
        .start(wait = true)
}

fun Application.module(cfg: Config, db: Db) {
    val users = UserRepo(db)
    val refreshTokens = RefreshTokenRepo(db)
    val jwt = JwtService(cfg)
    val verifier = GoogleTokenVerifier(cfg.googleWebClientId)
    val oauthHttp = io.ktor.client.HttpClient(io.ktor.client.engine.cio.CIO) {
        install(io.ktor.client.plugins.contentnegotiation.ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
    }
    val browserOAuth = BrowserOAuth(
        clientId = cfg.googleWebClientId,
        clientSecret = cfg.googleClientSecret,
        redirectUri = "${cfg.publicBaseUrl}/auth/callback",
        http = oauthHttp,
    )
    val handoffs = HandoffStore()
    val bars = BarRepo(db)
    val prices = PriceRepo(db)
    val reviews = ReviewRepo(db)
    val moderation = ModerationRepo(db)

    install(DefaultHeaders)
    install(CallLogging)

    // Detrás de Tailscale Funnel / Cloudflare todo llega desde localhost. Sin
    // esto `origin.remoteHost` sería siempre 127.0.0.1 y el rate limit de abajo
    // metería a todo el mundo en el mismo balde: un auto-DoS en cuanto entren
    // dos personas a la vez. OJO: confiar en X-Forwarded-For sólo es seguro si
    // el puerto no es alcanzable de forma directa — ver BIND_HOST en .env.
    install(XForwardedHeaders)

    install(RateLimit) {
        // Límite general por IP. Generoso: el mapa hace varias llamadas por
        // pantalla y no queremos romperle la app a un usuario normal.
        global {
            rateLimiter(limit = 120, refillPeriod = 1.minutes)
            requestKey { call -> call.request.origin.remoteHost }
        }
        // Login aparte y mucho más estricto: es el único endpoint sin
        // autenticar que además dispara una llamada saliente a Google por
        // request, así que es el más barato de abusar y el que puede quemarte
        // la cuota de la cuenta.
        register(RateLimitName("auth")) {
            rateLimiter(limit = 10, refillPeriod = 1.minutes)
            requestKey { call -> call.request.origin.remoteHost }
        }
    }

    install(ContentNegotiation) {
        json(Json { ignoreUnknownKeys = true; encodeDefaults = true })
    }

    install(Authentication) {
        jwt("jwt") {
            realm = "birrapp"
            verifier(
                JWT.require(Algorithm.HMAC256(cfg.jwtSecret))
                    .withIssuer(cfg.jwtIssuer)
                    .withAudience(cfg.jwtAudience)
                    .build()
            )
            validate { credential ->
                if (credential.payload.subject != null) JWTPrincipal(credential.payload) else null
            }
            challenge { _, _ ->
                call.respond(
                    HttpStatusCode.Unauthorized,
                    ApiError("unauthorized", "hace falta iniciar sesión"),
                )
            }
        }
    }

    install(StatusPages) {
        exception<ApiException> { call, cause ->
            call.respond(cause.status, ApiError(cause.code, cause.message))
        }
        exception<kotlinx.serialization.SerializationException> { call, cause ->
            call.respond(
                HttpStatusCode.BadRequest,
                ApiError("bad_request", "JSON inválido: ${cause.message}"),
            )
        }
        exception<Throwable> { call, cause ->
            // Nunca devolver el stack trace al cliente: filtra estructura interna.
            call.application.log.error("error no manejado", cause)
            call.respond(
                HttpStatusCode.InternalServerError,
                ApiError("internal_error", "algo se rompió de nuestro lado"),
            )
        }
    }

    routing { apiRoutes(bars, prices, reviews, moderation, users) }
    routing { downloadRoutes(java.io.File(cfg.apkDir)) }
    routing { webAppRoutes(java.io.File(cfg.webDir)) }
    routing { authRoutes(cfg, verifier, users, refreshTokens, jwt, browserOAuth, handoffs) }
}
