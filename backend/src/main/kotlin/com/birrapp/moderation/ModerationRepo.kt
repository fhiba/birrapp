package com.birrapp.moderation

import kotlinx.serialization.Serializable
import com.birrapp.core.Db
import com.birrapp.core.badRequest
import com.birrapp.core.query
import com.birrapp.core.update

@Serializable
data class NewFlagRequest(val targetType: String, val targetId: Long, val reason: String)

@Serializable
data class FlagDto(
    val id: Long,
    val targetType: String,
    val targetId: Long,
    val reason: String,
    val createdAt: String,
    val reporterName: String?,
    /** Texto del contenido denunciado, para no tener que ir a buscarlo. */
    val targetSummary: String?,
)

private val VALID_TARGETS = setOf("bar", "price", "review")

class ModerationRepo(private val db: Db) {

    fun flag(req: NewFlagRequest, userId: Long) {
        if (req.targetType !in VALID_TARGETS) badRequest("tipo inválido: ${req.targetType}")
        if (req.reason.isBlank()) badRequest("hace falta un motivo")
        db.conn {
            it.update(
                "INSERT INTO flags (target_type, target_id, reporter_id, reason) " +
                    "VALUES (?::flag_target, ?, ?, ?)",
                req.targetType, req.targetId, userId, req.reason.take(500),
            )
        }
    }

    fun openFlags(limit: Int = 100): List<FlagDto> = db.conn {
        it.query(
            """
            SELECT f.id, f.target_type::text AS target_type, f.target_id, f.reason,
                   f.created_at, u.display_name AS reporter_name,
                   CASE f.target_type
                       WHEN 'bar'    THEN (SELECT b.name FROM bars b WHERE b.id = f.target_id)
                       WHEN 'review' THEN (SELECT r.body FROM reviews r WHERE r.id = f.target_id)
                       WHEN 'price'  THEN (SELECT pr.price::text || ' / ' || pr.size_ml || 'ml'
                                             FROM price_reports pr WHERE pr.id = f.target_id)
                   END AS target_summary
            FROM flags f
            LEFT JOIN users u ON u.id = f.reporter_id
            WHERE f.resolved_at IS NULL
            ORDER BY f.created_at ASC LIMIT ?
            """.trimIndent(),
            limit,
        ) { rs ->
            FlagDto(
                id = rs.getLong("id"),
                targetType = rs.getString("target_type"),
                targetId = rs.getLong("target_id"),
                reason = rs.getString("reason"),
                createdAt = rs.getTimestamp("created_at").toInstant().toString(),
                reporterName = rs.getString("reporter_name"),
                targetSummary = rs.getString("target_summary"),
            )
        }
    }

    fun resolve(flagId: Long, moderatorId: Long): Boolean = db.conn {
        it.update(
            "UPDATE flags SET resolved_by = ?, resolved_at = now() " +
                "WHERE id = ? AND resolved_at IS NULL",
            moderatorId, flagId,
        ) > 0
    }
}
