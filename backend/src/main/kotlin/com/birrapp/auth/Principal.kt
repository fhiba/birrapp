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
