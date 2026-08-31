package news.inkan.birrapp

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
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.routing.routing
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.Json
import news.inkan.birrapp.auth.*
import news.inkan.birrapp.bars.BarRepo
import news.inkan.birrapp.core.*
import news.inkan.birrapp.moderation.ModerationRepo
import news.inkan.birrapp.prices.PriceRepo
import news.inkan.birrapp.reviews.ReviewRepo
import org.slf4j.LoggerFactory

fun main() {
    val log = LoggerFactory.getLogger("birrapp")
    val cfg = Config.load()

    val db = Db.connect(cfg.dbUrl, cfg.dbUser, cfg.dbPassword)
    db.migrate()
    log.info("base migrada: {}", cfg.dbUrl)

    embeddedServer(Netty, port = cfg.port) { module(cfg, db) }
        .start(wait = true)
}

fun Application.module(cfg: Config, db: Db) {
    val users = UserRepo(db)
    val refreshTokens = RefreshTokenRepo(db)
    val jwt = JwtService(cfg)
    val verifier = GoogleTokenVerifier(cfg.googleWebClientId)
    val bars = BarRepo(db)
    val prices = PriceRepo(db)
    val reviews = ReviewRepo(db)
    val moderation = ModerationRepo(db)

    install(DefaultHeaders)
    install(CallLogging)

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
    routing { authRoutes(cfg, verifier, users, refreshTokens, jwt) }
}
