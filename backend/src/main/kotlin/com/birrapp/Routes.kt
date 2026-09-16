package com.birrapp

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.auth.authenticate
import io.ktor.server.plugins.origin
import io.ktor.server.plugins.ratelimit.RateLimitName
import io.ktor.server.plugins.ratelimit.rateLimit
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import com.birrapp.auth.*
import com.birrapp.bars.*
import com.birrapp.beers.*
import com.birrapp.core.CoverageBudget
import com.birrapp.core.ApiError
import com.birrapp.core.badRequest
import com.birrapp.core.notFound
import com.birrapp.core.tooManyRequests
import com.birrapp.moderation.*
import com.birrapp.photos.*
import com.birrapp.prices.*
import com.birrapp.ratings.*
import com.birrapp.reviews.*
import com.birrapp.traffic.TrafficPing
import com.birrapp.traffic.TrafficRepo

@Serializable data class RoleChangeRequest(val role: String)
@Serializable data class OkResponse(val ok: Boolean = true)

/** Cómo quedó el pulgar de una foto después de tocarlo (BIR-10). */
@Serializable data class PhotoVotes(val votes: Int, val votedByMe: Boolean)

/**
 * Techos de `/bars`. Ver [CoverageBudget] para por qué existen estos números.
 *
 * La relación que importa es **`MAX_LIMIT` < `CoverageBudget.DEFAULT_PER_DAY`**:
 * si un solo request pudiera traer más bares que el presupuesto de todo el día,
 * ese request sería irrespondible siempre y el endpoint quedaría roto para
 * cualquiera. Con 200 contra 400 hay margen de dos pedidos completos de
 * territorio nuevo antes de tocar el techo.
 *
 * El tope viejo era 500, y con ~738 bares cargados eso es el 68% de la base en
 * una sola llamada: no había presupuesto de cobertura posible que sirviera.
 */
private const val MAX_LIMIT = 200

/**
 * 20 km. El slider del mapa llega a 15, y `useBars` sobre-pide 2.5x, así que el
 * cliente real toca este techo sólo con el radio al máximo — donde igual está
 * mirando media ciudad y el recorte de `project()` le deja 400 bares.
 *
 * El tope viejo era 50 km, que desde el Obelisco cubre hasta La Plata.
 */
private const val MAX_RADIUS_M = 20_000

/**
 * La clave del presupuesto: la misma que usa el `RateLimit` de `Application.kt`.
 *
 * Detrás de un proxy esto vale por `XForwardedHeaders`, que ya está instalado.
 * No se guarda en ningún lado — ver [CoverageBudget].
 */
private fun ApplicationCall.clientKey(): String = request.origin.remoteHost

fun Route.apiRoutes(
    bars: BarRepo,
    prices: PriceRepo,
    beers: BeerRepo,
    people: PeopleRepo,
    reviews: ReviewRepo,
    ratings: RatingRepo,
    photos: PhotoRepo,
    leaderboard: com.birrapp.community.LeaderboardRepo,
    moderation: ModerationRepo,
    analytics: AnalyticsRepo,
    users: UserRepo,
    traffic: TrafficRepo,
    /** Cuántos bares distintos puede descubrir una IP por día. Ver BIR-13. */
    budget: CoverageBudget,
    /** Borra el objeto del bucket. Ver PhotoRepo.remove: bajar una foto no
     *  alcanza con cambiarle el estado. */
    deletePhotoObject: suspend (String) -> Unit,
) {
    get("/health") { call.respond(OkResponse()) }

    get("/styles") { call.respond(prices.styles()) }

    /**
     * Stats de precio de una zona (BIR-33). Público: es la misma información
     * que ya se ve recorriendo el mapa, sólo que sumada.
     *
     * El radio usa los mismos techos que `/bars`: la consulta recorre las
     * mismas filas y sin tope alguien pide el país entero.
     */
    get("/stats/prices") {
        val lat = call.request.queryParameters["lat"]?.toDoubleOrNull()
            ?: badRequest("falta lat")
        val lng = call.request.queryParameters["lng"]?.toDoubleOrNull()
            ?: badRequest("falta lng")
        val radius = (call.request.queryParameters["radius"]?.toIntOrNull() ?: 2000)
            .coerceIn(100, MAX_RADIUS_M)
        call.respond(
            prices.areaStats(
                lat, lng, radius,
                styleSlug = call.request.queryParameters["style"],
                brandSlug = call.request.queryParameters["brand"],
            ),
        )
    }

    get("/brands") { call.respond(prices.brands()) }

    /**
     * Los que más aportaron este mes (BIR-9). Pública y sin sesión: la gracia
     * es que se vea, y esconderla detrás del login la deja sin público.
     *
     * Sólo sale quien eligió un alias. Ver `LeaderboardRepo` por qué.
     */
    get("/colaboradores") {
        call.respond(
            leaderboard.ofMonth(
                month = call.request.queryParameters["mes"],
                limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 50,
            ),
        )
    }

    // ---------- lectura pública ----------
    // El mapa se puede mirar sin cuenta. Pedir login para ver precios mataría
    // la adopción; el login sólo hace falta para aportar.

    get("/bars") {
        val q = call.request.queryParameters
        val lat = q["lat"]?.toDoubleOrNull() ?: badRequest("falta lat")
        val lng = q["lng"]?.toDoubleOrNull() ?: badRequest("falta lng")
        if (lat !in -90.0..90.0 || lng !in -180.0..180.0) badRequest("coordenadas fuera de rango")

        val radius = (q["radius"]?.toIntOrNull() ?: 2000).coerceIn(100, MAX_RADIUS_M)
        val limit = (q["limit"]?.toIntOrNull() ?: 200).coerceIn(1, MAX_LIMIT)
        val sort = when (q["sort"]) {
            null, "distance" -> BarSort.distance
            "cheapest" -> BarSort.cheapest
            "rated" -> BarSort.rated
            else -> badRequest("sort inválido: usar distance, cheapest o rated")
        }

        val found = bars.nearby(lat, lng, radius, sort, limit, q["style"])
        // Se cobra después de resolver, no antes: hasta no tener el resultado
        // no se sabe qué bares son, y lo que se cuenta son bares distintos, no
        // requests. Repetir una zona ya vista no cuesta nada.
        if (!budget.charge(call.clientKey(), found.map { it.id })) {
            tooManyRequests(
                "por hoy alcanzaste el límite de bares nuevos desde esta conexión; " +
                    "las zonas que ya miraste siguen andando"
            )
        }
        call.respond(found)
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

        // La búsqueda también descubre base: recorriendo el abecedario se llega
        // a lo mismo que paseando el mapa, así que paga del mismo presupuesto.
        val hits = bars.search(q, lat, lng, limit)
        if (!budget.charge(call.clientKey(), hits.map { it.id })) {
            tooManyRequests(
                "por hoy alcanzaste el límite de bares nuevos desde esta conexión; " +
                    "las zonas que ya miraste siguen andando"
            )
        }
        call.respond(hits)
    }

    /**
     * El perfil de otra persona (BIR-6).
     *
     * Sesión opcional: se puede mirar sin cuenta —lo que aportó alguien es
     * público, está firmado con su nombre en el mapa— pero con token viaja si
     * la bloqueaste, y si quien mira modera, también si está baneada.
     */
    authenticate("jwt", optional = true) {
        get("/users/{id}") {
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            val who = call.callerOrNull()
            call.respond(
                people.profile(
                    id, who?.userId,
                    asModerator = who?.role?.atLeast(Role.moderator) == true,
                ),
            )
        }
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
            // Tope de 100 por página: es lo que había antes como tope total, y
            // deja al cliente pedir de a poco sin poder pedir la tabla entera.
            val limit = (call.request.queryParameters["limit"]?.toIntOrNull() ?: 100)
                .coerceIn(1, 100)
            val offset = (call.request.queryParameters["offset"]?.toIntOrNull() ?: 0)
                .coerceAtLeast(0)
            call.respond(
                ratings.comments(
                    id, style, brand,
                    viewerId = call.callerOrNull()?.userId,
                    limit = limit, offset = offset,
                ),
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
         * los anónimos exige justamente eso. Por eso lleva su propio límite
         * ("traffic", 5 req/min por IP): el global de 120 cuida al servidor
         * pero deja margen de sobra para inflar la tabla con filas falsas, y el
         * único valor de la tabla es que las filas sean visitas reales.
         */
        rateLimit(RateLimitName("traffic")) {
            post("/traffic") {
                val body = call.receive<TrafficPing>()
                val id = runCatching { java.util.UUID.fromString(body.clientId) }.getOrNull()
                    ?: badRequest("clientId inválido")
                traffic.record(id, authed = call.callerOrNull() != null)
                call.respond(OkResponse())
            }
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

        /**
         * Un ban corta acá, no cuando expira el token.
         *
         * El rol y la identidad viajan en el JWT justamente para no ir a la
         * base en cada request, y para el rol el precio es aceptable: degradar
         * a alguien tarda como mucho una expiración. Para el ban no: son hasta
         * dos horas de abuso sostenido después de haber apretado el botón, que
         * es exactamente lo que la herramienta viene a cortar (el "a decidir"
         * de BIR-6).
         *
         * Va como interceptor del bloque entero y no como línea al principio de
         * cada handler: hay una docena, y el endpoint número trece se va a
         * olvidar de ponerla.
         */
        intercept(ApplicationCallPipeline.Plugins) {
            // `context` y no `call`: en un interceptor de pipeline el call es
            // el contexto, no una propiedad del receptor.
            val who = context.callerOrNull() ?: return@intercept
            if (users.isBanned(who.userId)) {
                context.respond(
                    HttpStatusCode.Forbidden,
                    ApiError("banned", "tu cuenta está suspendida"),
                )
                finish()
            }
        }

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

        /**
         * Anotar una birra tomada (BIR-34).
         *
         * Todo el cuerpo es opcional: `POST /beers {}` suma una birra a
         * ahora mismo. Es la versión de un tap, la misma idea que "Sigue
         * igual" — si anotar exige elegir bar, marca y estilo, nadie anota.
         */
        post("/beers") {
            val caller = call.caller()
            val body = runCatching { call.receive<NewBeerLogRequest>() }
                .getOrElse { NewBeerLogRequest() }
            call.respond(HttpStatusCode.Created, beers.log(body, caller.userId))
        }

        /** Lo que dibuja "Mis birras": calendario del mes, totales y emblemas. */
        get("/beers/summary") {
            val caller = call.caller()
            call.respond(
                beers.summary(caller.userId, call.request.queryParameters["month"]),
            )
        }

        /** Borrar una birra propia. Es dato personal: se borra de verdad. */
        delete("/beers/{id}") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            if (!beers.remove(id, caller.userId)) notFound("no existe esa birra tuya")
            call.respond(OkResponse())
        }

        /**
         * Bloquear a alguien (BIR-17). Herramienta del usuario, distinta del
         * ban: el ban saca a alguien de la comunidad y lo aplica un moderador;
         * esto sólo decide qué ve quien bloquea.
         */
        post("/blocks/{id}") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            people.setBlocked(caller.userId, id, on = true)
            call.respond(OkResponse())
        }

        delete("/blocks/{id}") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            people.setBlocked(caller.userId, id, on = false)
            call.respond(OkResponse())
        }

        /** A quiénes bloqueaste, para poder deshacerlo. */
        get("/blocks") {
            call.respond(people.blocked(call.caller().userId))
        }

        /** Los bares favoritos de quien mira (BIR-37 / BIR-5). */
        get("/favorites") {
            val caller = call.caller()
            val q = call.request.queryParameters
            // Mismos parámetros que `/bars`: con el filtro de favoritos
            // prendido, la lista tiene que seguir respondiendo a la píldora de
            // estilo y al orden. Antes los ignoraba y los controles quedaban
            // de adorno.
            val sort = when (q["sort"]) {
                null, "distance" -> BarSort.distance
                "cheapest" -> BarSort.cheapest
                "rated" -> BarSort.rated
                else -> badRequest("sort inválido: usar distance, cheapest o rated")
            }
            call.respond(
                bars.favorites(
                    caller.userId,
                    q["lat"]?.toDoubleOrNull(),
                    q["lng"]?.toDoubleOrNull(),
                    sort = sort,
                    styleSlug = q["style"]?.takeIf { it.isNotBlank() },
                ),
            )
        }

        post("/favorites/{id}") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            bars.setFavorite(caller.userId, id, on = true)
            call.respond(OkResponse())
        }

        delete("/favorites/{id}") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            bars.setFavorite(caller.userId, id, on = false)
            call.respond(OkResponse())
        }

        /** Alta de estilo por un usuario (BIR-35). Pendiente de moderación. */
        post("/styles") {
            val caller = call.caller()
            call.respond(prices.createStyle(call.receive<NewStyleRequest>(), caller.userId))
        }

        /** Alta de marca por un usuario. Queda pendiente de moderación. */
        post("/brands") {
            val caller = call.caller()
            call.respond(prices.createBrand(call.receive<NewBrandRequest>(), caller.userId))
        }

        post("/bars") {
            val caller = call.caller()
            // La moneda de quien lo carga entra como último recurso, cuando el
            // bar no vino del buscador de Google y no se eligió una a mano.
            val id = bars.create(
                call.receive<NewBarRequest>(), caller.userId,
                creatorCurrency = users.findById(caller.userId)?.currency,
            )
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

        /**
         * Retirar el voto (BIR-11).
         *
         * Va por POST con cuerpo y no por DELETE con la birra en la URL, por
         * lo mismo que "Sigue igual": los slugs llevan acentos y guiones, y
         * un `penon-del-aguila` en el path es una fuente de errores de
         * encoding que no aporta nada.
         *
         * No tener voto que retirar no es un error: el botón es el reverso de
         * la estrella y tocarlo dos veces tiene que terminar igual las dos.
         */
        post("/ratings/retract") {
            val caller = call.caller()
            ratings.retract(call.receive<RetractRatingRequest>(), caller.userId)
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

        /**
         * El pulgar de una foto (BIR-10). Devuelve cuántos quedaron, para que
         * el número de la pantalla salga del servidor y no de sumar uno acá:
         * con dos personas votando a la vez, sumar en el cliente muestra un
         * conteo que nadie tiene.
         */
        post("/photos/{id}/vote") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            call.respond(PhotoVotes(photos.vote(id, caller.userId, on = true), votedByMe = true))
        }

        delete("/photos/{id}/vote") {
            val caller = call.caller()
            val id = call.parameters["id"]?.toLongOrNull() ?: badRequest("id inválido")
            call.respond(PhotoVotes(photos.vote(id, caller.userId, on = false), votedByMe = false))
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
            /**
             * Las últimas fotos subidas, para repasarlas (BIR-10).
             *
             * No es una cola de aprobación —las fotos se publican al subirlas
             * y así se quedan— sino la pantalla donde mirar lo que entró.
             * Existe porque los pulgares le suben el premio a subir fotos, y
             * hasta acá una foto sólo se revisaba si alguien la denunciaba.
             */
            get("/photos/recent") {
                call.requireRole(Role.moderator)
                call.respond(photos.recent())
            }

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

            /**
             * Las mismas preguntas que el resumen, pero en el tiempo.
             *
             * Un contador sin tendencia no dice si 12 precios en la semana es
             * bueno, malo o igual que siempre.
             */
            get("/dashboard/analytics") {
                call.requireRole(Role.moderator)
                call.respond(analytics.all())
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

            get("/styles/pending") {
                call.requireRole(Role.moderator)
                call.respond(prices.pendingStyles())
            }

            post("/styles/{slug}/approve") {
                call.requireRole(Role.moderator)
                val slug = call.parameters["slug"] ?: badRequest("falta el estilo")
                if (!prices.setStyleStatus(slug, "approved")) notFound("no existe ese estilo")
                call.respond(OkResponse())
            }

            /**
             * Rechazar no borra: puede haber precios colgando del estilo, y
             * `price_reports.style_id` es ON DELETE RESTRICT justamente para
             * que un rechazo no se lleve puesto un precio cargado.
             */
            post("/styles/{slug}/reject") {
                call.requireRole(Role.moderator)
                val slug = call.parameters["slug"] ?: badRequest("falta el estilo")
                if (!prices.setStyleStatus(slug, "rejected")) notFound("no existe ese estilo")
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
