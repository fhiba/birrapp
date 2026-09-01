package com.birrapp.ratings

import kotlinx.serialization.Serializable
import com.birrapp.core.Db
import com.birrapp.core.badRequest
import com.birrapp.core.notFound
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.core.update

@Serializable
data class NewRatingRequest(
    val barId: Long,
    val styleSlug: String,
    val rating: Int,
    val body: String? = null,
)

@Serializable
data class RatingCommentDto(
    val id: Long,
    val authorName: String,
    val rating: Int,
    val body: String?,
    val ageDays: Int,
    val mine: Boolean,
)

/** Lo que el usuario votó, por estilo. Vacío si no inició sesión. */
@Serializable
data class MyRatingDto(val styleSlug: String, val rating: Int)

class RatingRepo(private val db: Db) {

    /**
     * Alta o pisada del voto.
     *
     * A diferencia de los precios esto NO es append-only: el historial de
     * precios es el dato, pero un voto viejo del mismo usuario no le sirve a
     * nadie. De ahí el ON CONFLICT.
     */
    fun upsert(req: NewRatingRequest, userId: Long) = db.conn { c ->
        if (req.rating !in 1..5) badRequest("la nota va de 1 a 5")
        val body = req.body?.trim()?.takeIf { it.isNotEmpty() }
        if (body != null && body.length > 600) badRequest("el comentario es demasiado largo")

        val styleId = c.queryOne(
            "SELECT id FROM beer_styles WHERE slug = ? AND active", req.styleSlug,
        ) { it.getLong("id") } ?: notFound("no existe ese estilo")

        c.update(
            """
            INSERT INTO beer_ratings (bar_id, style_id, user_id, rating, body)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (bar_id, style_id, user_id) DO UPDATE
               SET rating = excluded.rating,
                   body = excluded.body,
                   updated_at = now(),
                   -- Si un moderador lo había bajado, editarlo lo revive: es
                   -- contenido nuevo, no el que se moderó.
                   status = 'active'
            """.trimIndent(),
            req.barId, styleId, userId, req.rating, body,
        )
    }

    /** Comentarios de una birra concreta, para el modal. */
    fun comments(barId: Long, styleSlug: String, viewerId: Long?, limit: Int = 100):
        List<RatingCommentDto> = db.conn {
        it.query(
            """
            SELECT r.id, r.rating, r.body, u.display_name, r.user_id,
                   EXTRACT(DAY FROM (now() - r.updated_at))::int AS age_days
            FROM beer_ratings r
            JOIN users u ON u.id = r.user_id
            JOIN beer_styles s ON s.id = r.style_id
            WHERE r.bar_id = ? AND s.slug = ? AND r.status = 'active'
              AND r.body IS NOT NULL
            ORDER BY r.updated_at DESC LIMIT ?
            """.trimIndent(),
            barId, styleSlug, limit,
        ) { rs ->
            RatingCommentDto(
                id = rs.getLong("id"),
                authorName = rs.getString("display_name"),
                rating = rs.getInt("rating"),
                body = rs.getString("body"),
                ageDays = rs.getInt("age_days"),
                mine = viewerId != null && rs.getLong("user_id") == viewerId,
            )
        }
    }

    /** Los votos propios en un bar, para pintar las estrellas distinto. */
    fun mine(barId: Long, userId: Long): List<MyRatingDto> = db.conn {
        it.query(
            """
            SELECT s.slug, r.rating
            FROM beer_ratings r JOIN beer_styles s ON s.id = r.style_id
            WHERE r.bar_id = ? AND r.user_id = ? AND r.status = 'active'
            """.trimIndent(),
            barId, userId,
        ) { rs -> MyRatingDto(rs.getString("slug"), rs.getInt("rating")) }
    }

    fun setStatus(ratingId: Long, status: String, moderatorId: Long): Boolean = db.conn {
        it.update(
            "UPDATE beer_ratings SET status = ?::content_status WHERE id = ?",
            status, ratingId,
        ) > 0
    }
}
