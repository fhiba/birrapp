package com.birrapp.auth

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.jwk.source.JWKSourceBuilder
import com.nimbusds.jose.proc.JWSVerificationKeySelector
import com.nimbusds.jose.proc.SecurityContext
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier
import com.nimbusds.jwt.proc.DefaultJWTProcessor
import java.net.URI
import java.util.Date

/** Los campos del ID token de Google que nos interesan. */
data class GoogleIdentity(
    val sub: String,
    val email: String,
    val emailVerified: Boolean,
    val name: String,
    val picture: String?,
)

/**
 * Verifica el ID token de Google contra el JWKS público de Google.
 *
 * El ID token de Google NUNCA se usa como token de sesión: se canjea una vez
 * acá y a partir de ahí manda el JWT propio de birrapp, que es el que lleva
 * el claim de rol. Un ID token de Google no puede decir "este tipo es
 * moderador" — eso lo decide nuestra base, no Google.
 */
class GoogleTokenVerifier(
    private val expectedAudience: String,
    jwksUri: String = "https://www.googleapis.com/oauth2/v3/certs",
    private val clock: () -> Date = { Date() },
) {
    private val issuers = setOf("https://accounts.google.com", "accounts.google.com")

    private val processor = DefaultJWTProcessor<SecurityContext>().apply {
        // JWKSourceBuilder cachea las claves y refresca solo; no hay que
        // pegarle a Google en cada login.
        val keySource = JWKSourceBuilder.create<SecurityContext>(URI(jwksUri).toURL()).build()
        jwsKeySelector = JWSVerificationKeySelector(JWSAlgorithm.RS256, keySource)
        jwtClaimsSetVerifier = DefaultJWTClaimsVerifier(
            expectedAudience,
            null,
            setOf("sub", "iss", "aud", "exp"),
        )
    }

    fun verify(idToken: String): GoogleIdentity {
        val claims = try {
            processor.process(idToken, null)
        } catch (e: Exception) {
            throw InvalidGoogleToken("no pudimos validar tu cuenta de Google")
        }

        if (claims.issuer !in issuers) {
            throw InvalidGoogleToken("issuer inesperado: ${claims.issuer}")
        }
        if (claims.audience.none { it == expectedAudience }) {
            // El detalle importa para diagnosticar (app y servidor con client
            // IDs distintos) pero no se le devuelve a quien está logueando.
            throw InvalidGoogleToken("no pudimos validar tu cuenta de Google")
        }
        val exp = claims.expirationTime ?: throw InvalidGoogleToken("token sin exp")
        if (exp.before(clock())) throw InvalidGoogleToken("la sesión de Google venció, probá de nuevo")

        val email = claims.getStringClaim("email")
            ?: throw InvalidGoogleToken("token sin email")
        // Un email no verificado no sirve para identificar a nadie.
        val verified = claims.getBooleanClaim("email_verified") ?: false
        if (!verified) throw InvalidGoogleToken("tu cuenta de Google no tiene el email verificado")

        return GoogleIdentity(
            sub = claims.subject,
            email = email,
            emailVerified = true,
            name = claims.getStringClaim("name") ?: email.substringBefore('@'),
            picture = claims.getStringClaim("picture"),
        )
    }
}

class InvalidGoogleToken(message: String) : RuntimeException(message)
