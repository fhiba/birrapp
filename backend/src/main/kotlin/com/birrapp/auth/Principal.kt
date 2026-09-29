package com.birrapp.auth

import io.ktor.server.application.ApplicationCall
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import com.birrapp.core.forbidden
import com.birrapp.core.unauthorized

/** Usuario autenticado, leído del JWT propio. */
data class CallerInfo(val userId: Long, val role: Role, val email: String)

fun ApplicationCall.callerOrNull(): CallerInfo? {
    val p = principal<JWTPrincipal>() ?: return null
    // Un token del portal del bar NO es una sesión de usuario. Los dos los
    // firma este servidor con el mismo secreto, así que sin este corte la
    // sesión de un mozo serviría para cargar precios y acumular puntos con una
    // cuenta que el bar administra.
    if (p.getClaim("scope", String::class) == "partner") return null
    val id = p.subject?.toLongOrNull() ?: return null
    val role = p.getClaim("role", String::class)?.let { runCatching { Role.valueOf(it) }.getOrNull() }
        ?: return null
    return CallerInfo(id, role, p.getClaim("email", String::class) ?: "")
}

fun ApplicationCall.caller(): CallerInfo =
    callerOrNull() ?: unauthorized("hace falta iniciar sesión")

/**
 * Chequeo de rol del lado del servidor.
 *
 * La app esconde la UI de moderación, pero esconder no es controlar: el
 * control vive acá. Un cliente modificado puede llamar cualquier endpoint.
 */
fun ApplicationCall.requireRole(minimum: Role): CallerInfo {
    val c = caller()
    if (!c.role.atLeast(minimum)) {
        forbidden("hace falta rol ${minimum.name} o superior")
    }
    return c
}

// ---------------------------------------------------------------------------
// El portal del bar
// ---------------------------------------------------------------------------

/** Quién está operando el portal, leído del token. */
data class PartnerCaller(val staffId: Long, val partnerId: Long, val role: String) {
    val isOwner: Boolean get() = role == "owner"
}

/**
 * Exige una sesión del portal del bar.
 *
 * El `partnerId` sale del **token** y no del pedido. Es lo que hace que un mozo
 * no pueda confirmar un canje de otro bar ni listar su personal: no hay
 * parámetro que pueda cambiar para apuntar a otro lado.
 */
fun ApplicationCall.requirePartner(): PartnerCaller {
    val p = principal<JWTPrincipal>() ?: unauthorized("hace falta iniciar sesión")
    if (p.getClaim("scope", String::class) != "partner") {
        forbidden("esto es del portal de bares")
    }
    val staffId = p.subject?.toLongOrNull() ?: unauthorized("sesión inválida")
    val partnerId = p.getClaim("partner", Long::class) ?: unauthorized("sesión inválida")
    return PartnerCaller(staffId, partnerId, p.getClaim("staffRole", String::class) ?: "staff")
}

/** Sólo el dueño: dar de alta mozos y publicar beneficios. */
fun ApplicationCall.requireOwner(): PartnerCaller {
    val c = requirePartner()
    if (!c.isOwner) forbidden("esto lo hace el dueño del bar")
    return c
}
