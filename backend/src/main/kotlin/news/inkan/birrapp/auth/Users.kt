package news.inkan.birrapp.auth

import kotlinx.serialization.Serializable
import news.inkan.birrapp.core.Db
import news.inkan.birrapp.core.queryOne
import news.inkan.birrapp.core.update
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
