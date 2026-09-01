package com.birrapp.auth

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.forms.submitForm
import io.ktor.http.parameters
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap

/**
 * Login de Google por navegador, como alternativa a Credential Manager.
 *
 * Credential Manager sólo ofrece cuentas **ya agregadas al teléfono**. Si el
 * usuario no tiene ninguna, o quiere entrar con otra distinta a la del
 * dispositivo, queda sin salida. Este flujo cubre ese caso: abre Google en el
 * navegador y sirve para cualquier cuenta.
 *
 * El intercambio del `code` por el token lo hace el **servidor**, no la app:
 * requiere el client secret, y un secreto dentro de un APK no es un secreto —
 * cualquiera lo extrae con `apktool`.
 *
 * Se usa PKCE igual, aunque el intercambio sea del lado del servidor: protege
 * contra que alguien intercepte el `code` en el redirect y lo canjee por su
 * cuenta.
 */
class BrowserOAuth(
    private val clientId: String,
    private val clientSecret: String,
    private val redirectUri: String,
    private val http: HttpClient,
) {
    val isConfigured: Boolean get() = clientId.isNotBlank() && clientSecret.isNotBlank()

    private val rng = SecureRandom()

    /** Estados en vuelo. Efímeros: el flujo dura menos de un minuto. */
    private data class Pending(val verifier: String, val createdAt: Long)
    private val pending = ConcurrentHashMap<String, Pending>()

    private fun randomUrlSafe(bytes: Int = 32): String =
        ByteArray(bytes).also { rng.nextBytes(it) }
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

    /** Arma la URL de autorización y guarda el verifier contra el `state`. */
    fun startAuthorization(): Pair<String, String> {
        purgeExpired()
        val state = randomUrlSafe(24)
        val verifier = randomUrlSafe(48)
        val challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(
            MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray())
        )
        pending[state] = Pending(verifier, System.currentTimeMillis())

        val url = buildString {
            append("https://accounts.google.com/o/oauth2/v2/auth")
            append("?client_id=").append(urlEncode(clientId))
            append("&redirect_uri=").append(urlEncode(redirectUri))
            append("&response_type=code")
            append("&scope=").append(urlEncode("openid email profile"))
            append("&state=").append(urlEncode(state))
            append("&code_challenge=").append(urlEncode(challenge))
            append("&code_challenge_method=S256")
            // Fuerza el selector de cuentas: si no, Google reusa la sesión del
            // navegador en silencio y no se puede entrar con otra cuenta,
            // que es justo para lo que existe este camino.
            append("&prompt=select_account")
        }
        return url to state
    }

    /** Canjea el `code` por el ID token. null si el `state` no es válido. */
    suspend fun exchange(code: String, state: String): String? {
        val entry = pending.remove(state) ?: return null
        if (System.currentTimeMillis() - entry.createdAt > STATE_TTL_MILLIS) return null

        val response: TokenResponse = http.submitForm(
            url = "https://oauth2.googleapis.com/token",
            formParameters = parameters {
                append("code", code)
                append("client_id", clientId)
                append("client_secret", clientSecret)
                append("redirect_uri", redirectUri)
                append("grant_type", "authorization_code")
                append("code_verifier", entry.verifier)
            },
        ).body()
        return response.idToken
    }

    private fun purgeExpired() {
        val cutoff = System.currentTimeMillis() - STATE_TTL_MILLIS
        pending.entries.removeIf { it.value.createdAt < cutoff }
    }

    private fun urlEncode(s: String) = java.net.URLEncoder.encode(s, "UTF-8")

    private companion object {
        const val STATE_TTL_MILLIS = 10 * 60_000L
    }
}

@Serializable
private data class TokenResponse(
    @SerialName("id_token") val idToken: String? = null,
    @SerialName("access_token") val accessToken: String? = null,
)

/**
 * Entrega de la sesión a la app.
 *
 * El redirect vuelve por el navegador, así que no se pueden mandar los tokens
 * en la URL: quedarían en el historial y en los logs de cualquier intermedio.
 * En su lugar viaja un código de un solo uso que la app canjea por HTTPS.
 */
class HandoffStore {
    private data class Entry(val userId: Long, val createdAt: Long)
    private val entries = ConcurrentHashMap<String, Entry>()
    private val rng = SecureRandom()

    fun issue(userId: Long): String {
        val cutoff = System.currentTimeMillis() - TTL_MILLIS
        entries.entries.removeIf { it.value.createdAt < cutoff }
        val code = ByteArray(32).also { rng.nextBytes(it) }
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        entries[code] = Entry(userId, System.currentTimeMillis())
        return code
    }

    /** Un solo uso: se consume al leerlo. */
    fun consume(code: String): Long? {
        val entry = entries.remove(code) ?: return null
        if (System.currentTimeMillis() - entry.createdAt > TTL_MILLIS) return null
        return entry.userId
    }

    private companion object {
        const val TTL_MILLIS = 2 * 60_000L
    }
}
