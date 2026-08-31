package news.inkan.birrapp.reviews

import kotlinx.serialization.Serializable
import news.inkan.birrapp.core.Db
import news.inkan.birrapp.core.badRequest
import news.inkan.birrapp.core.query
import news.inkan.birrapp.core.update

@Serializable
data class NewReviewRequest(val barId: Long, val rating: Int, val body: String? = null)

@Serializable
data class ReviewDto(
    val id: Long,
    val authorName: String,
    val rating: Int,
    val body: String?,
    val createdAt: String,
)

class ReviewRepo(private val db: Db) {

    fun forBar(barId: Long, limit: Int = 50): List<ReviewDto> = db.conn {
        it.query(
            """
            SELECT r.id, r.rating, r.body, r.created_at, u.display_name
            FROM reviews r JOIN users u ON u.id = r.user_id
            WHERE r.bar_id = ? AND r.status = 'active'
            ORDER BY r.created_at DESC LIMIT ?
            """.trimIndent(),
            barId, limit,
        ) { rs ->
            ReviewDto(
                id = rs.getLong("id"),
                authorName = rs.getString("display_name"),
                rating = rs.getInt("rating"),
                body = rs.getString("body"),
                createdAt = rs.getTimestamp("created_at").toInstant().toString(),
            )
        }
    }

    /** Una reseña por usuario por bar; volver a enviar la reemplaza. */
    fun upsert(req: NewReviewRequest, userId: Long) {
        if (req.rating !in 1..5) badRequest("el puntaje va de 1 a 5")
        if ((req.body?.length ?: 0) > 2000) badRequest("la reseña es demasiado larga")
        db.conn {
            it.update(
                """
                INSERT INTO reviews (bar_id, user_id, rating, body)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (bar_id, user_id) DO UPDATE
                  SET rating = EXCLUDED.rating,
                      body = EXCLUDED.body,
                      created_at = now(),
                      status = 'active'
                """.trimIndent(),
                req.barId, userId, req.rating, req.body,
            )
        }
    }

    fun setStatus(reviewId: Long, status: String): Boolean = db.conn {
        it.update("UPDATE reviews SET status = ?::content_status WHERE id = ?", status, reviewId) > 0
    }
}
