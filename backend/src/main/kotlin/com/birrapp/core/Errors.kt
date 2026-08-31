package com.birrapp.core

import io.ktor.http.HttpStatusCode
import kotlinx.serialization.Serializable

/** Error de dominio con status HTTP. StatusPages lo traduce a JSON. */
class ApiException(
    val status: HttpStatusCode,
    override val message: String,
    val code: String = status.description.lowercase().replace(' ', '_'),
) : RuntimeException(message)

@Serializable
data class ApiError(val code: String, val message: String)

fun badRequest(msg: String): Nothing = throw ApiException(HttpStatusCode.BadRequest, msg, "bad_request")
fun unauthorized(msg: String): Nothing = throw ApiException(HttpStatusCode.Unauthorized, msg, "unauthorized")
fun forbidden(msg: String): Nothing = throw ApiException(HttpStatusCode.Forbidden, msg, "forbidden")
fun notFound(msg: String): Nothing = throw ApiException(HttpStatusCode.NotFound, msg, "not_found")
fun conflict(msg: String): Nothing = throw ApiException(HttpStatusCode.Conflict, msg, "conflict")
fun tooManyRequests(msg: String): Nothing =
    throw ApiException(HttpStatusCode.TooManyRequests, msg, "rate_limited")
