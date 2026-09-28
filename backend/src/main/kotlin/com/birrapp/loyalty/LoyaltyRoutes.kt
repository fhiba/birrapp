package com.birrapp.loyalty

import com.birrapp.auth.JwtService
import com.birrapp.auth.PartnerCaller
import com.birrapp.auth.caller
import com.birrapp.auth.requireOwner
import com.birrapp.auth.requirePartner
import com.birrapp.core.badRequest
import io.ktor.http.HttpStatusCode
import io.ktor.server.auth.authenticate
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.Serializable

@Serializable data class EscanearRequest(val qr: String)
@Serializable data class ReservarRequest(val benefitId: Long)
@Serializable data class LoginPortalRequest(val email: String, val password: String)
@Serializable data class ConfirmarRequest(val code: String)
@Serializable data class NuevoStaffRequest(
    val email: String, val password: String, val displayName: String = "",
    val role: String = "staff",
)
@Serializable data class NuevoBeneficioRequest(
    val title: String, val detail: String? = null, val costPoints: Int,
    val stock: Int? = null, val dailyCap: Int? = null,
)

@Serializable data class SesionPortalDto(val token: String, val staff: StaffDto)

@Serializable data class AcreditacionDto(
    val ok: Boolean,
    val puntos: Int = 0,
    val saldo: Int = 0,
    /** Código estable del rechazo, para que la app diga qué pasó en castellano. */
    val motivo: String? = null,
)

/**
 * Las rutas del programa de puntos.
 *
 * ## Dos públicos que no se cruzan
 *
 * Las rutas bajo `/loyalty` son de la persona y usan la sesión de siempre; las
 * de `/partner` son del bar y usan la del portal.
 *
 * (Sin comodines en este comentario a propósito: Kotlin anida los comentarios
 * de bloque, así que un `/` seguido de asterisco acá adentro abre otro y el
 * archivo deja de compilar con un error que no dice dónde está.) La separación no está en la ruta —eso sería una
 * convención— sino en el token: `requirePartner` exige el claim `scope` y
 * `caller()` rechaza a los que lo tienen. Un mozo no puede actuar como persona
 * ni al revés, y no hay parámetro que lo cambie.
 *
 * ## El `partnerId` sale del token, nunca del pedido
 *
 * Confirmar un canje, listar el personal y publicar un beneficio usan el bar
 * que viene firmado en el token. Si viniera en el cuerpo, cambiar un número
 * sería operar sobre el bar de al lado.
 */
fun Route.loyaltyRoutes(
    repo: LoyaltyRepo,
    partners: PartnerAuthRepo,
    validator: TicketValidator,
    jwt: JwtService,
) {
    // -----------------------------------------------------------------------
    // La persona
    // -----------------------------------------------------------------------

    /** El catálogo es público: es la vidriera del programa. */
    get("/loyalty/beneficios") { call.respond(repo.beneficios()) }

    authenticate("jwt") {
        get("/loyalty/saldo") { call.respond(repo.saldo(call.caller().userId)) }

        get("/loyalty/movimientos") {
            call.respond(repo.movimientos(call.caller().userId))
        }

        /**
         * Escanear un ticket.
         *
         * Tres pasos, en este orden y no en otro:
         *
         *  1. **Parsear.** No sale a la red. Un QR que no es de un comprobante
         *     se cae acá y no gasta una llamada a ARCA.
         *  2. **Constatar** contra ARCA. Es la única parte que dice si el
         *     comprobante existe de verdad.
         *  3. **Acreditar**, que es lo único transaccional.
         *
         * La validación va **antes** de la transacción, a propósito: sostener
         * una transacción abierta esperando a un tercero mantiene los locks
         * tomados, y si ARCA cuelga se seca el pool de conexiones.
         *
         * Y los puntos se acreditan **después** de la aprobación, nunca antes.
         * El beneficio se canjea en cinco minutos y se toma: si acreditáramos
         * optimista y el rechazo llegara después, habría que quitar puntos ya
         * gastados, y el saldo no puede ser negativo.
         */
        post("/loyalty/tickets") {
            val userId = call.caller().userId
            val body = runCatching { call.receive<EscanearRequest>() }
                .getOrElse { badRequest("falta el QR") }

            val ticket = parsear(body.qr)

            when (validator.constatar(ticket)) {
                'A' -> Unit
                'R' -> return@post call.respond(
                    HttpStatusCode.UnprocessableEntity,
                    AcreditacionDto(ok = false, motivo = "arca_rechazo"),
                )
                // ARCA no contestó. No se acredita: se rechaza para que se
                // reintente. Acreditar sin respuesta es la ventana de fraude.
                else -> return@post call.respond(
                    HttpStatusCode.ServiceUnavailable,
                    AcreditacionDto(ok = false, motivo = "arca_sin_respuesta"),
                )
            }

            when (val r = repo.acreditar(userId, ticket)) {
                is Acreditacion.Acreditada ->
                    call.respond(AcreditacionDto(true, r.puntos, r.saldo))
                is Acreditacion.Rechazada ->
                    call.respond(
                        HttpStatusCode.UnprocessableEntity,
                        AcreditacionDto(ok = false, motivo = r.motivo),
                    )
            }
        }

        /** Reservar un beneficio: debita y devuelve el código. */
        post("/loyalty/canjes") {
            val body = runCatching { call.receive<ReservarRequest>() }
                .getOrElse { badRequest("falta el beneficio") }
            call.respond(repo.reservar(call.caller().userId, body.benefitId))
        }
    }

    // -----------------------------------------------------------------------
    // El portal del bar
    // -----------------------------------------------------------------------

    route("/partner") {
        /**
         * Login del portal.
         *
         * Sin `authenticate`: es la puerta. El repo se encarga de que el error
         * sea el mismo exista o no el mail.
         */
        post("/login") {
            val body = runCatching { call.receive<LoginPortalRequest>() }
                .getOrElse { badRequest("faltan mail y clave") }
            val staff = partners.login(body.email, body.password)
            call.respond(
                SesionPortalDto(
                    token = jwt.partnerToken(staff.id, staff.partnerId, staff.role),
                    staff = staff,
                ),
            )
        }

        authenticate("jwt") {
            get("/me") {
                val c = call.requirePartner()
                call.respond(partners.porId(c.staffId) ?: badRequest("esa cuenta no existe"))
            }

            /**
             * El mozo confirma un código.
             *
             * El bar sale del token. Un código del bar de al lado no existe
             * para éste, y eso está en el WHERE de la consulta — no depende de
             * que nadie se acuerde de comparar.
             */
            post("/canjes/confirmar") {
                val c: PartnerCaller = call.requirePartner()
                val body = runCatching { call.receive<ConfirmarRequest>() }
                    .getOrElse { badRequest("falta el código") }
                val codigo = body.code.filter { it.isDigit() }
                if (codigo.length != 6) badRequest("el código son seis dígitos")
                call.respond(repo.confirmar(c.staffId, c.partnerId, codigo))
            }

            /** Los beneficios del bar propio, incluidos los pausados. */
            get("/beneficios") {
                val c = call.requirePartner()
                call.respond(repo.beneficiosDelBar(c.partnerId))
            }

            post("/beneficios") {
                val c = call.requireOwner()
                val body = runCatching { call.receive<NuevoBeneficioRequest>() }
                    .getOrElse { badRequest("faltan los datos del beneficio") }
                call.respond(
                    repo.crearBeneficio(
                        c.partnerId, body.title, body.detail, body.costPoints,
                        body.stock, body.dailyCap,
                    ),
                )
            }

            get("/staff") {
                val c = call.requirePartner()
                call.respond(partners.staffDelBar(c.partnerId))
            }

            post("/staff") {
                val c = call.requireOwner()
                val body = runCatching { call.receive<NuevoStaffRequest>() }
                    .getOrElse { badRequest("faltan los datos de la cuenta") }
                call.respond(
                    partners.crear(
                        c.partnerId, body.email, body.password, body.displayName, body.role,
                    ),
                )
            }

            /** Los canjes del bar, para conciliar contra el POS. */
            get("/canjes") {
                val c = call.requirePartner()
                call.respond(repo.canjesDelBar(c.partnerId))
            }
        }
    }
}
