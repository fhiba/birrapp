package com.birrapp

import io.ktor.http.HttpStatusCode
import io.ktor.server.auth.authenticate
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import com.birrapp.auth.*
import com.birrapp.bars.*
import com.birrapp.core.badRequest
import com.birrapp.core.notFound
import com.birrapp.moderation.*
import com.birrapp.prices.*
import com.birrapp.reviews.*

@Serializable data class RoleChangeRequest(val role: String)
@Serializable data class OkResponse(val ok: Boolean = true)

fun Route.apiRoutes(
    bars: BarRepo,
    prices: PriceRepo,
    reviews: ReviewRepo,
    moderation: ModerationRepo,
    users: UserRepo,
) {
    get("/health") { call.respond(OkResponse()) }

    get("/styles") { call.respond(prices.styles()) }

    // ---------- lectura pública ----------
    // El mapa se puede mirar sin cuenta. Pedir login para ver precios mataría
    // la adopción; el login sólo hace falta para aportar.

    get("/bars") {
        val q = call.request.queryParameters
        val lat = q["lat"]?.toDoubleOrNull() ?: badRequest("falta lat")
        val lng = q["lng"]?.toDoubleOrNull() ?: badRequest("falta lng")
        if (lat !in -90.0..90.0 || lng !in -180.0..180.0) badRequest("coordenadas fuera de rango")

        val radius = (q["radius"]?.toIntOrNull() ?: 2000).coerceIn(100, 50_000)
        val limit = (q["limit"]?.toIntOrNull() ?: 200).coerceIn(1, 500)
        val sort = when (q["sort"]) {
            null, "distance" -> BarSort.distance
            "cheapest" -> BarSort.cheapest
            else -> badRequest("sort inválido: usar distance o cheapest")
        }
        call.respond(bars.nearby(lat, lng, radius, sort, limit, q["style"]))
    }

    /** Búsqueda por nombre entre los bares ya cargados. */
    get("/bars/search") {
        val q = call.request.queryParameters["q"] ?: badRequest("falta q")
        val lat = call.request.queryParameters["lat"]?.toDoubleOrNull()
        val lng = call.request.queryParameters["lng"]?.toDoubleOrNull()
        call.respond(bars.search(q, lat, lng))
    }

    get("/bars/{id}") {
        val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
        val lat = call.request.queryParameters["lat"]?.toDoubleOrNull()
        val lng = call.request.queryParameters["lng"]?.toDoubleOrNull()
        call.respond(bars.detail(id, lat, lng) ?: notFound("no existe ese bar"))
    }

    get("/bars/{id}/reviews") {
        val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
        call.respond(reviews.forBar(id))
    }

    get("/bars/{id}/history") {
        val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
        val style = call.request.queryParameters["style"] ?: badRequest("falta style")
        call.respond(prices.history(id, style))
    }

    // ---------- aportes (requiere sesión) ----------
    authenticate("jwt") {

        post("/prices") {
            val caller = call.caller()
            call.respond(prices.report(call.receive<NewPriceRequest>(), caller.userId))
        }

        /** "Sigue igual" — un solo tap, sin body. */
        post("/bars/{id}/confirm/{style}") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            val style = call.parameters["style"] ?: badRequest("falta style")
            call.respond(prices.confirm(id, style, caller.userId))
        }

        post("/bars") {
            val caller = call.caller()
            val id = bars.create(call.receive<NewBarRequest>(), caller.userId)
            call.respond(HttpStatusCode.Created, mapOf("id" to id))
        }

        post("/reviews") {
            val caller = call.caller()
            reviews.upsert(call.receive<NewReviewRequest>(), caller.userId)
            call.respond(OkResponse())
        }

        post("/flags") {
            val caller = call.caller()
            moderation.flag(call.receive<NewFlagRequest>(), caller.userId)
            call.respond(OkResponse())
        }
    }

    // ---------- moderación ----------
    // El chequeo de rol vive acá, en el servidor. Que la app esconda el menú
    // no es control de acceso.
    authenticate("jwt") {
        route("/moderation") {

            get("/bars/pending") {
                call.requireRole(Role.moderator)
                call.respond(bars.pending(200))
            }

            post("/bars/{id}/approve") {
                call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!bars.setStatus(id, "approved")) notFound("no existe ese bar")
                call.respond(OkResponse())
            }

            post("/bars/{id}/reject") {
                call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!bars.setStatus(id, "rejected")) notFound("no existe ese bar")
                call.respond(OkResponse())
            }

            get("/flags") {
                call.requireRole(Role.moderator)
                call.respond(moderation.openFlags())
            }

            post("/flags/{id}/resolve") {
                val caller = call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!moderation.resolve(id, caller.userId)) notFound("no existe o ya está resuelta")
                call.respond(OkResponse())
            }

            /** Publica un precio retenido por outlier. */
            post("/prices/{id}/approve") {
                val caller = call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!prices.setStatus(id, "active", caller.userId)) notFound("no existe ese precio")
                call.respond(OkResponse())
            }

            post("/prices/{id}/remove") {
                val caller = call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!prices.setStatus(id, "removed", caller.userId)) notFound("no existe ese precio")
                call.respond(OkResponse())
            }

            post("/reviews/{id}/remove") {
                call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!reviews.setStatus(id, "removed")) notFound("no existe esa reseña")
                call.respond(OkResponse())
            }

            post("/users/{id}/ban") {
                call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!users.setBanned(id, true)) notFound("no existe ese usuario")
                call.respond(OkResponse())
            }

            post("/users/{id}/unban") {
                call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!users.setBanned(id, false)) notFound("no existe ese usuario")
                call.respond(OkResponse())
            }

            /** Sólo admin: nombrar y sacar moderadores. */
            post("/users/{id}/role") {
                call.requireRole(Role.admin)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                val role = runCatching { Role.valueOf(call.receive<RoleChangeRequest>().role) }
                    .getOrElse { badRequest("rol inválido: user, moderator o admin") }
                if (!users.setRole(id, role)) notFound("no existe ese usuario")
                call.respond(OkResponse())
            }
        }
    }
}
