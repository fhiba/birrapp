package com.birrapp

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.request.path
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
import com.birrapp.moderation.AnalyticsRepo
import com.birrapp.moderation.ModerationRepo
import com.birrapp.prices.PriceRepo
import com.birrapp.reviews.ReviewRepo
import com.birrapp.traffic.TrafficRepo
import io.ktor.client.request.delete
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
    val ratings = com.birrapp.ratings.RatingRepo(db)
    val r2 = com.birrapp.photos.R2(
        accountId = cfg.r2AccountId,
        bucket = cfg.r2Bucket,
        accessKeyId = cfg.r2AccessKeyId,
        secretAccessKey = cfg.r2SecretAccessKey,
        publicBase = cfg.r2PublicBase,
    )
    val photos = com.birrapp.photos.PhotoRepo(db, r2)
    val contributions = com.birrapp.auth.ContributionRepo(db, r2)

    // Una sola definición del borrado en el bucket, compartida por la
    // moderación y por el borrado propio: son la misma operación.
    val deletePhotoObject: suspend (String) -> Unit = { key ->
        if (r2.isConfigured) {
            runCatching { oauthHttp.delete(r2.presignDelete(key)) }
                .onFailure { log.warn("no se pudo borrar {} del bucket", key, it) }
        }
    }
    val moderation = ModerationRepo(db)
    val analytics = AnalyticsRepo(db)
    val traffic = TrafficRepo(db)

    // CORS sólo si el frontend está en otro dominio. Con el frontend servido
    // desde acá no hace falta y no se instala: una política CORS de más es
    // superficie de ataque sin beneficio.
    if (cfg.allowedOrigins.isNotEmpty()) {
        install(io.ktor.server.plugins.cors.routing.CORS) {
            cfg.allowedOrigins.forEach { origin ->
                val withoutScheme = origin.substringAfter("://")
                val scheme = origin.substringBefore("://", "https")
                allowHost(withoutScheme, schemes = listOf(scheme))
            }
            allowHeader(io.ktor.http.HttpHeaders.Authorization)
            allowHeader(io.ktor.http.HttpHeaders.ContentType)
            allowMethod(io.ktor.http.HttpMethod.Delete)
            // Sin credenciales: la sesión viaja en el header Authorization,
            // no en cookies, así que no hace falta y evita el requisito de
            // origen exacto.
        }
    }

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
        // El beacon de visita: escritura sin sesión y con un UUID nuevo por
        // request. El límite global sólo cuida al servidor; a 120/min una sola
        // IP mete 170 mil filas por día y deja sin valor a `visitors30` y al
        // escalón cero del embudo, que es lo único que la tabla mide. Un cliente
        // legítimo manda un beacon por carga, así que 5/min sobra.
        register(RateLimitName("traffic")) {
            rateLimiter(limit = 5, refillPeriod = 1.minutes)
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
        // Un cliente que corta la descarga a mitad de camino no es un error del
        // servidor. Pasaba seguido con el APK —23 MB por el Funnel— y caía en
        // el handler genérico de abajo: quedaba logueado como 500 con stack
        // trace completo, cuando la respuesta ya había salido y no había a
        // quién contestarle. Eso escondía los errores de verdad justo en el
        // endpoint que había que diagnosticar.
        exception<java.io.IOException> { call, cause ->
            if (call.response.isCommitted) {
                call.application.log.info(
                    "el cliente cortó ${call.request.path()}: ${cause.message}",
                )
            } else {
                call.application.log.error("error de E/S", cause)
                call.respond(
                    HttpStatusCode.InternalServerError,
                    ApiError("internal_error", "algo se rompió de nuestro lado"),
                )
            }
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

    routing {
        apiRoutes(
            bars, prices, reviews, ratings, photos, moderation, analytics, users, traffic,
            // Vive tanto como el proceso y no se persiste: la clave es la IP.
            // Apagado salvo que COVERAGE_BUDGET_PER_DAY diga otra cosa — ver
            // el KDoc de CoverageBudget para por qué.
            budget = com.birrapp.core.CoverageBudget(perDay = cfg.coverageBudgetPerDay),
            // El borrado del objeto se hace acá y no en el repo: el repo habla
            // SQL, y esto es una llamada HTTP firmada contra Cloudflare.
            deletePhotoObject = deletePhotoObject,
        )
    }
    routing { downloadRoutes(java.io.File(cfg.apkDir)) }
    routing { webAppRoutes(java.io.File(cfg.webDir)) }
    routing {
        authRoutes(
            cfg, verifier, users, refreshTokens, jwt, browserOAuth, handoffs,
            contributions, deletePhotoObject, r2,
        )
    }
}
