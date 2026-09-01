package com.birrapp.auth

import kotlinx.serialization.Serializable
import com.birrapp.core.Db
import com.birrapp.core.queryOne
import com.birrapp.core.update
import java.security.MessageDigest
import java.security.SecureRandom
import java.sql.ResultSet
import java.time.Instant
import java.util.Base64

enum class Role { user, moderator, admin;
    /** admin implica moderator; moderator implica user. */
    fun atLeast(other: Role): Boolean = ordinal >= other.ordinal
}

data class User(
    val id: Long,
    val googleSub: String,
    val email: String,
    val displayName: String,
    val avatarUrl: String?,
    val role: Role,
    val bannedAt: Instant?,
) {
    val isBanned: Boolean get() = bannedAt != null
}

@Serializable
data class UserStats(
    val prices: Int,
    /** Toques de "Sigue igual". Se cuenta pero ya no se muestra: nadie
     *  reconocía qué era "Confirmados" mirando la pantalla. */
    val confirmations: Int,
    val bars: Int,
    val reviews: Int,
    val photos: Int,
)

@Serializable
data class UserDto(
    val id: Long,
    val email: String,
    val displayName: String,
    val avatarUrl: String?,
    val role: String,
)

fun User.toDto() = UserDto(id, email, displayName, avatarUrl, role.name)

class UserRepo(private val db: Db) {

    private fun map(rs: ResultSet) = User(
        id = rs.getLong("id"),
        googleSub = rs.getString("google_sub"),
        email = rs.getString("email"),
        displayName = rs.getString("display_name"),
        avatarUrl = rs.getString("avatar_url"),
        role = Role.valueOf(rs.getString("role")),
        bannedAt = rs.getTimestamp("banned_at")?.toInstant(),
    )

    fun findById(id: Long): User? = db.conn {
        it.queryOne("SELECT * FROM users WHERE id = ?", id, map = ::map)
    }

    /**
     * Alta o actualización por `google_sub`.
     *
     * El rol NUNCA se toca en el upsert: si un moderador vuelve a loguear no
     * puede perder el rol, y tampoco se puede escalar privilegios volviendo
     * a loguear. Sólo se refrescan nombre y foto.
     */
    fun upsert(identity: GoogleIdentity, bootstrapAdmins: Set<String>): User = db.tx { c ->
        val initialRole =
            if (identity.email.lowercase() in bootstrapAdmins) Role.admin else Role.user

        c.update(
            """
            INSERT INTO users (google_sub, email, display_name, avatar_url, role)
            VALUES (?, ?, ?, ?, ?::user_role)
            ON CONFLICT (google_sub) DO UPDATE
              SET email        = EXCLUDED.email,
                  display_name = EXCLUDED.display_name,
                  avatar_url   = EXCLUDED.avatar_url
            """.trimIndent(),
            identity.sub, identity.email, identity.name, identity.picture, initialRole.name,
        )
        c.queryOne("SELECT * FROM users WHERE google_sub = ?", identity.sub, map = ::map)!!
    }

    fun setRole(userId: Long, role: Role): Boolean = db.conn {
        it.update("UPDATE users SET role = ?::user_role WHERE id = ?", role.name, userId) > 0
    }

    /**
     * Borra la cuenta y sus datos personales.
     *
     * Obligatorio por las políticas de Apple y de Google Play si la app
     * permite crear cuenta.
     *
     * Los reportes de precio NO se borran: son observaciones sobre bares, no
     * datos personales, y borrarlos degradaría el mapa para todos. Se
     * desvinculan del usuario (`reported_by` queda NULL), que es lo que pide
     * la regulación: que la persona deje de ser identificable.
     */
    fun deleteAccount(userId: Long): Boolean = db.tx { c ->
        c.update("UPDATE price_reports SET reported_by = NULL WHERE reported_by = ?", userId)
        c.update("DELETE FROM reviews WHERE user_id = ?", userId)
        c.update("UPDATE flags SET reporter_id = NULL WHERE reporter_id = ?", userId)
        c.update("DELETE FROM refresh_tokens WHERE user_id = ?", userId)
        c.update("DELETE FROM users WHERE id = ?", userId) > 0
    }

    fun stats(userId: Long): UserStats = db.conn { c ->
        c.queryOne(
            """
            SELECT
              (SELECT count(*) FROM price_reports
                WHERE reported_by = ? AND status = 'active') AS precios,
              (SELECT count(*) FROM price_reports
                WHERE reported_by = ? AND is_confirmation) AS confirmaciones,
              (SELECT count(*) FROM bars WHERE created_by = ?) AS bares,
              (SELECT count(*) FROM reviews WHERE user_id = ?) AS resenas,
              (SELECT count(*) FROM bar_photos
                WHERE user_id = ? AND status = 'active') AS fotos
            """.trimIndent(),
            userId, userId, userId, userId, userId,
        ) { rs ->
            UserStats(
                prices = rs.getInt("precios"),
                confirmations = rs.getInt("confirmaciones"),
                bars = rs.getInt("bares"),
                reviews = rs.getInt("resenas"),
                photos = rs.getInt("fotos"),
            )
        } ?: UserStats(0, 0, 0, 0, 0)
    }

    fun setBanned(userId: Long, banned: Boolean): Boolean = db.conn {
        it.update(
            "UPDATE users SET banned_at = ${if (banned) "now()" else "NULL"} WHERE id = ?",
            userId,
        ) > 0
    }
}

/**
 * Refresh tokens opacos y rotativos, guardados hasheados.
 *
 * Se guarda SHA-256, nunca el token en claro: si se filtra la base, los
 * hashes no sirven para autenticarse.
 */
class RefreshTokenRepo(private val db: Db) {
    private val rng = SecureRandom()

    fun issue(userId: Long, ttlDays: Long): String {
        val raw = ByteArray(32).also { rng.nextBytes(it) }
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        db.conn {
            it.update(
                "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) " +
                    "VALUES (?, ?, now() + make_interval(days => ?))",
                userId, sha256(raw), ttlDays.toInt(),
            )
        }
        return raw
    }

    /** Consume el token y emite uno nuevo (rotación). null si es inválido. */
    fun rotate(raw: String, ttlDays: Long): Pair<Long, String>? = db.tx { c ->
        val userId = c.queryOne(
            "SELECT user_id FROM refresh_tokens " +
                "WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > now()",
            sha256(raw),
        ) { it.getLong("user_id") } ?: return@tx null

        c.update("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = ?", sha256(raw))
        val next = ByteArray(32).also { rng.nextBytes(it) }
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        c.update(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) " +
                "VALUES (?, ?, now() + make_interval(days => ?))",
            userId, sha256(next), ttlDays.toInt(),
        )
        userId to next
    }

    fun revokeAllFor(userId: Long) = db.conn {
        it.update(
            "UPDATE refresh_tokens SET revoked_at = now() " +
                "WHERE user_id = ? AND revoked_at IS NULL",
            userId,
        )
    }

    private fun sha256(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray())
            .joinToString("") { "%02x".format(it) }
}
