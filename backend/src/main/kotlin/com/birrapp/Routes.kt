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
import com.birrapp.photos.*
import com.birrapp.prices.*
import com.birrapp.ratings.*
import com.birrapp.reviews.*
import com.birrapp.traffic.TrafficPing
import com.birrapp.traffic.TrafficRepo

@Serializable data class RoleChangeRequest(val role: String)
@Serializable data class OkResponse(val ok: Boolean = true)

fun Route.apiRoutes(
    bars: BarRepo,
    prices: PriceRepo,
    reviews: ReviewRepo,
    ratings: RatingRepo,
    photos: PhotoRepo,
    moderation: ModerationRepo,
    users: UserRepo,
    traffic: TrafficRepo,
    /** Borra el objeto del bucket. Ver PhotoRepo.remove: bajar una foto no
     *  alcanza con cambiarle el estado. */
    deletePhotoObject: suspend (String) -> Unit,
) {
    get("/health") { call.respond(OkResponse()) }

    get("/styles") { call.respond(prices.styles()) }

    get("/brands") { call.respond(prices.brands()) }

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
        // El default de 8 es el del autocompletado al cargar un bar, donde una
        // lista larga estorba. El buscador de la lista pide más. Se acota a 50
        // igual: sin tope, un `q` de una letra devuelve la base entera.
        val limit = call.request.queryParameters["limit"]?.toIntOrNull()?.coerceIn(1, 50) ?: 8
        call.respond(bars.search(q, lat, lng, limit))
    }

    get("/bars/{id}") {
        val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
        val lat = call.request.queryParameters["lat"]?.toDoubleOrNull()
        val lng = call.request.queryParameters["lng"]?.toDoubleOrNull()
        call.respond(bars.detail(id, lat, lng) ?: notFound("no existe ese bar"))
    }

    /**
     * Comentarios de una birra. Van detrás de un ícono, no en la vista
     * principal.
     *
     * Sesión opcional: se lee sin cuenta, pero con token el propio comentario
     * viene marcado y la UI lo muestra como "Vos" en vez de repetirte tu
     * nombre.
     */
    authenticate("jwt", optional = true) {
        get("/bars/{id}/ratings/{style}/comments") {
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            val style = call.parameters["style"] ?: badRequest("falta style")
            val brand = call.request.queryParameters["brand"]
            call.respond(
                ratings.comments(id, style, brand, viewerId = call.callerOrNull()?.userId),
            )
        }

        get("/bars/{id}/photos") {
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            call.respond(photos.forBar(id, viewerId = call.callerOrNull()?.userId))
        }

        /**
         * El beacon de visita.
         *
         * Único endpoint de escritura sin sesión obligatoria, porque medir a
         * los anónimos exige justamente eso. Lo acota el RateLimit global de
         * 120 req/min por IP que ya está instalado.
         */
        post("/traffic") {
            val body = call.receive<TrafficPing>()
            val id = runCatching { java.util.UUID.fromString(body.clientId) }.getOrNull()
                ?: badRequest("clientId inválido")
            traffic.record(id, authed = call.callerOrNull() != null)
            call.respond(OkResponse())
        }
    }

    get("/bars/{id}/reviews") {
        val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
        call.respond(reviews.forBar(id))
    }

    get("/bars/{id}/history") {
        val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
        val style = call.request.queryParameters["style"] ?: badRequest("falta style")
        // Sin `brand` la serie es la de la birra sin marca, no la del estilo
        // entero: son cervezas distintas y mezclarlas dibuja un zigzag que no
        // es una variación de precio.
        val brand = call.request.queryParameters["brand"]
        call.respond(prices.history(id, style, brand))
    }

    // ---------- aportes (requiere sesión) ----------
    authenticate("jwt") {

        post("/prices") {
            val caller = call.caller()
            call.respond(prices.report(call.receive<NewPriceRequest>(), caller.userId))
        }

        /**
         * "Sigue igual" — un solo tap.
         *
         * Pasa a POST con cuerpo: la marca puede tener caracteres que no
         * sobreviven bien en la URL, y un mismo estilo puede tener varias
         * marcas con precios distintos en el mismo bar.
         */
        post("/bars/{id}/confirm") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            val body = call.receive<ConfirmPriceRequest>()
            call.respond(prices.confirm(id, body.styleSlug, body.brandSlug, caller.userId))
        }

        /**
         * La forma vieja de confirmar, con el estilo en la URL y sin marca.
         *
         * Existe sólo para los APK ya instalados: la 0.3.24 está en los
         * teléfonos de los que están probando la app y no se actualiza sola.
         * Sin esto, "Sigue igual" —el gesto que mantiene fresco todo el mapa—
         * les devolvería 404 desde el momento en que se despliega esta
         * versión, y el síntoma sería un error genérico imposible de asociar
         * con un cambio de servidor.
         *
         * Confirma la birra sin marca, que es lo único que esa versión sabía
         * cargar. Se puede borrar cuando nadie tenga una anterior a la 0.4.0.
         */
        post("/bars/{id}/confirm/{style}") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            val style = call.parameters["style"] ?: badRequest("falta el estilo")
            call.respond(prices.confirm(id, style, null, caller.userId))
        }

        /** Alta de marca por un usuario. Queda pendiente de moderación. */
        post("/brands") {
            val caller = call.caller()
            call.respond(prices.createBrand(call.receive<NewBrandRequest>(), caller.userId))
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

        /** Votar una birra. Pisa el voto anterior del mismo usuario. */
        /**
         * Comentar. Se pueden dejar varios sobre la misma birra.
         *
         * Aparte de la nota porque son reglas distintas: la nota es una sola
         * por persona —si no, cinco votos propios inflan el promedio— y los
         * comentarios no tienen ese problema.
         */
        post("/comments") {
            val caller = call.caller()
            val id = ratings.addComment(call.receive<NewCommentRequest>(), caller.userId)
            call.respond(HttpStatusCode.Created, mapOf("id" to id))
        }

        /** Borrar un comentario propio. Cualquiera puede borrar lo que escribió. */
        post("/comments/{id}/remove") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            if (!ratings.removeOwnComment(id, caller.userId)) {
                notFound("no existe ese comentario tuyo")
            }
            call.respond(OkResponse())
        }

        post("/ratings") {
            val caller = call.caller()
            ratings.upsert(call.receive<NewRatingRequest>(), caller.userId)
            call.respond(OkResponse())
        }

        /** Lo que votó quien mira, para pintar sus estrellas distinto. */
        get("/bars/{id}/my-ratings") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            call.respond(ratings.mine(id, caller.userId))
        }

        /**
         * Permiso para subir una foto. Devuelve una URL firmada contra R2 y la
         * llave; los bytes van del navegador al bucket sin pasar por acá.
         */
        post("/photos/upload-url") {
            call.caller()
            call.respond(photos.uploadUrl(call.receive<UploadUrlRequest>()))
        }

        /** El navegador avisa que la subida terminó. Recién ahí se guarda la fila. */
        post("/photos") {
            val caller = call.caller()
            call.respond(photos.confirm(call.receive<ConfirmPhotoRequest>(), caller.userId))
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

            /** Borra el bar y sus precios. Para lugares inventados. */
            post("/bars/{id}/delete") {
                call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!bars.delete(id)) notFound("no existe ese bar")
                call.respond(OkResponse())
            }

            post("/bars/{id}/reject") {
                call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!bars.setStatus(id, "rejected")) notFound("no existe ese bar")
                call.respond(OkResponse())
            }

            /**
             * Bajar una foto borra el objeto del bucket, no sólo la fila.
             * Mientras el objeto exista, cualquiera con el link la sigue
             * viendo: se sirve desde una URL pública, no desde acá. Por eso
             * esto no se puede deshacer.
             */
            post("/photos/{id}/remove") {
                call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                val key = photos.remove(id) ?: notFound("no existe esa foto")
                deletePhotoObject(key)
                call.respond(OkResponse())
            }

            post("/comments/{id}/remove") {
                call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!ratings.setCommentStatus(id, "removed")) {
                    notFound("no existe ese comentario")
                }
                call.respond(OkResponse())
            }

            post("/ratings/{id}/remove") {
                val mod = call.requireRole(Role.moderator)
                val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
                if (!ratings.setStatus(id, "removed", mod.userId)) notFound("no existe ese voto")
                call.respond(OkResponse())
            }

            /** Sólo los números, para el contador de Perfil. */
            get("/summary") {
                call.requireRole(Role.moderator)
                call.respond(moderation.summary())
            }

            /**
             * Dashboard: quién se anotó y qué aportó.
             *
             * Va detrás del rol de moderador y no del de admin: es lectura, y
             * quien modera necesita saber si la persona que cargó un precio
             * raro es alguien que aporta desde hace meses o una cuenta de ayer.
             */
            get("/dashboard/users") {
                call.requireRole(Role.moderator)
                val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 100
                call.respond(moderation.recentUsers(limit.coerceIn(1, 500)))
            }

            get("/dashboard/summary") {
                call.requireRole(Role.moderator)
                call.respond(moderation.dashboardSummary())
            }

            get("/brands/pending") {
                call.requireRole(Role.moderator)
                call.respond(prices.pendingBrands())
            }

            post("/brands/{slug}/approve") {
                call.requireRole(Role.moderator)
                val slug = call.parameters["slug"] ?: badRequest("falta slug")
                if (!prices.setBrandStatus(slug, "approved")) notFound("no existe esa marca")
                call.respond(OkResponse())
            }

            post("/brands/{slug}/reject") {
                call.requireRole(Role.moderator)
                val slug = call.parameters["slug"] ?: badRequest("falta slug")
                if (!prices.setBrandStatus(slug, "rejected")) notFound("no existe esa marca")
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
