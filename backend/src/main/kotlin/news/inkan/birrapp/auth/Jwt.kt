package news.inkan.birrapp.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import news.inkan.birrapp.core.Config
import java.util.Date

/**
 * Emite los JWT de acceso propios de birrapp.
 *
 * Usa auth0 java-jwt a propósito: es la librería con la que ktor-server-auth-jwt
 * los verifica del otro lado. Firmar con una librería y verificar con otra es
 * pedir un bug de interoperabilidad para más adelante.
 *
 * Nimbus queda sólo para verificar los ID token de Google (JWKS/RS256), que es
 * lo que hace bien.
 */
class JwtService(private val cfg: Config) {

    private val algorithm = Algorithm.HMAC256(cfg.jwtSecret)

    fun accessToken(user: User): String {
        val now = System.currentTimeMillis()
        return JWT.create()
            .withSubject(user.id.toString())
            .withIssuer(cfg.jwtIssuer)
            .withAudience(cfg.jwtAudience)
            .withIssuedAt(Date(now))
            .withExpiresAt(Date(now + cfg.accessMinutes * 60_000))
            // El rol viaja en el token, pero es de corta vida (30 min por
            // defecto): degradar a alguien tarda como mucho una expiración.
            // El precio a pagar por no ir a la base en cada request.
            .withClaim("role", user.role.name)
            .withClaim("email", user.email)
            .sign(algorithm)
    }
}
