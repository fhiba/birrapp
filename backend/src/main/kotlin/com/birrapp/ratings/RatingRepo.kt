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
    /** null = "sin marca", que es un valor legítimo, no un dato faltante. */
    val brandSlug: String? = null,
    val rating: Int,
)

/**
 * Un comentario. Va aparte de la nota a propósito.
 *
 * La nota es una sola por persona y por birra —si no, cinco votos propios
 * inflan el promedio— pero los comentarios son varios: volviste seis meses
 * después y la canilla cambió, y eso es algo nuevo que decir, no una
 * corrección de lo anterior.
 */
@Serializable
data class NewCommentRequest(
    val barId: Long,
    val styleSlug: String,
    val brandSlug: String? = null,
    val body: String,
)

@Serializable
data class RatingCommentDto(
    val id: Long,
    val authorName: String,
    val body: String?,
    val ageDays: Int,
    val mine: Boolean,
    /**
     * La nota que esa persona le puso a esta birra, si le puso alguna.
     *
     * Puede faltar: comentar y puntuar son cosas separadas, y alguien puede
     * dejar un comentario sin votar.
     */
    val rating: Int?,
)

/** Lo que el usuario votó, por birra. Vacío si no inició sesión. */
@Serializable
data class MyRatingDto(val styleSlug: String, val brandSlug: String?, val rating: Int)

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

        val styleId = c.queryOne(
            "SELECT id FROM beer_styles WHERE slug = ? AND active", req.styleSlug,
        ) { it.getLong("id") } ?: notFound("no existe ese estilo")

        val brandId = req.brandSlug?.let { slug ->
            c.queryOne("SELECT id FROM brands WHERE slug = ?", slug) { it.getLong("id") }
                ?: notFound("marca desconocida: $slug")
        }

        // Dos ON CONFLICT distintos porque la unicidad va por índice parcial:
        // con brand_id NULL, UNIQUE no compara y haría falta otro índice.
        val conflictTarget =
            if (brandId != null) "(bar_id, style_id, brand_id, user_id) WHERE brand_id IS NOT NULL"
            else "(bar_id, style_id, user_id) WHERE brand_id IS NULL"

        c.update(
            """
            INSERT INTO beer_ratings (bar_id, style_id, brand_id, user_id, rating)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT $conflictTarget DO UPDATE
               SET rating = excluded.rating,
                   updated_at = now(),
                   -- Si un moderador lo había bajado, editarlo lo revive: es
                   -- contenido nuevo, no el que se moderó.
                   status = 'active'
            """.trimIndent(),
            req.barId, styleId, brandId, userId, req.rating,
        )
    }

    /** Alta de comentario. Se pueden dejar varios sobre la misma birra. */
    fun addComment(req: NewCommentRequest, userId: Long): Long = db.conn { c ->
        val body = req.body.trim()
        if (body.isEmpty()) badRequest("el comentario está vacío")
        if (body.length > 600) badRequest("el comentario es demasiado largo")

        val styleId = c.queryOne(
            "SELECT id FROM beer_styles WHERE slug = ? AND active", req.styleSlug,
        ) { it.getLong("id") } ?: notFound("no existe ese estilo")

        val brandId = req.brandSlug?.let { slug ->
            c.queryOne("SELECT id FROM brands WHERE slug = ?", slug) { it.getLong("id") }
                ?: notFound("marca desconocida: $slug")
        }

        c.queryOne(
            "INSERT INTO beer_comments (bar_id, style_id, brand_id, user_id, body) " +
                "VALUES (?, ?, ?, ?, ?) RETURNING id",
            req.barId, styleId, brandId, userId, body,
        ) { it.getLong("id") }!!
    }

    /**
     * Borra un comentario propio.
     *
     * La pertenencia va en el WHERE y no en un chequeo previo: entre comprobar
     * y borrar hay una carrera, y así un id ajeno simplemente no afecta
     * ninguna fila. Es la misma forma que usa el borrado de precios propios.
     *
     * No toca la nota: son cosas separadas, y quien borra lo que escribió no
     * está retirando su voto.
     */
    fun removeOwnComment(commentId: Long, userId: Long): Boolean = db.conn {
        it.update(
            "UPDATE beer_comments SET status = 'removed' " +
                "WHERE id = ? AND user_id = ? AND status = 'active'",
            commentId, userId,
        ) > 0
    }

    /** Moderación: baja el comentario de cualquiera. */
    fun setCommentStatus(commentId: Long, status: String): Boolean = db.conn {
        it.update(
            "UPDATE beer_comments SET status = ?::content_status WHERE id = ?",
            status, commentId,
        ) > 0
    }

    /** Comentarios de una birra concreta, para el modal. */
    fun comments(
        barId: Long, styleSlug: String, brandSlug: String?, viewerId: Long?, limit: Int = 100,
    ): List<RatingCommentDto> = db.conn {
        it.query(
            """
            SELECT cm.id, cm.body, u.display_name, cm.user_id, r.rating,
                   EXTRACT(DAY FROM (now() - cm.created_at))::int AS age_days
            FROM beer_comments cm
            JOIN users u ON u.id = cm.user_id
            JOIN beer_styles s ON s.id = cm.style_id
            LEFT JOIN brands b ON b.id = cm.brand_id
            -- La nota del autor sobre ESTA birra, para mostrarla al lado de lo
            -- que escribió. Va por LEFT JOIN porque comentar sin votar es
            -- válido: son dos acciones distintas desde que se separaron.
            LEFT JOIN beer_ratings r
                   ON r.bar_id = cm.bar_id AND r.style_id = cm.style_id
                  AND r.brand_id IS NOT DISTINCT FROM cm.brand_id
                  AND r.user_id = cm.user_id AND r.status = 'active'
            WHERE cm.bar_id = ? AND s.slug = ? AND cm.status = 'active'
              AND b.slug IS NOT DISTINCT FROM ?
            ORDER BY cm.created_at DESC LIMIT ?
            """.trimIndent(),
            barId, styleSlug, brandSlug, limit,
        ) { rs ->
            RatingCommentDto(
                id = rs.getLong("id"),
                authorName = rs.getString("display_name"),
                body = rs.getString("body"),
                ageDays = rs.getInt("age_days"),
                mine = viewerId != null && rs.getLong("user_id") == viewerId,
                rating = rs.getInt("rating").takeUnless { rs.wasNull() },
            )
        }
    }

    /** Los votos propios en un bar, para pintar las estrellas distinto. */
    fun mine(barId: Long, userId: Long): List<MyRatingDto> = db.conn {
        it.query(
            """
            SELECT s.slug, b.slug AS brand_slug, r.rating
            FROM beer_ratings r
            JOIN beer_styles s ON s.id = r.style_id
            LEFT JOIN brands b ON b.id = r.brand_id
            WHERE r.bar_id = ? AND r.user_id = ? AND r.status = 'active'
            """.trimIndent(),
            barId, userId,
        ) { rs ->
            MyRatingDto(rs.getString("slug"), rs.getString("brand_slug"), rs.getInt("rating"))
        }
    }

    fun setStatus(ratingId: Long, status: String, moderatorId: Long): Boolean = db.conn {
        it.update(
            "UPDATE beer_ratings SET status = ?::content_status WHERE id = ?",
            status, ratingId,
        ) > 0
    }
}
