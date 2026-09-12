package com.birrapp.photos

import kotlinx.serialization.Serializable
import com.birrapp.core.Db
import com.birrapp.core.badRequest
import com.birrapp.core.notFound
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.core.update
import java.util.UUID

@Serializable
data class UploadUrlRequest(
    val barId: Long,
    val styleSlug: String,
    /** null = "sin marca". La foto pertenece a una birra concreta. */
    val brandSlug: String? = null,
)

@Serializable
data class UploadUrlResponse(val uploadUrl: String, val key: String)

@Serializable
data class ConfirmPhotoRequest(
    val barId: Long,
    val styleSlug: String,
    val brandSlug: String? = null,
    val key: String,
)

@Serializable
data class PhotoDto(
    val id: Long,
    val styleSlug: String,
    /** A qué birra pertenece: el estilo solo ya no la identifica. */
    val brandSlug: String?,
    val url: String,
    val authorName: String?,
    val ageDays: Int,
    val mine: Boolean,
    /** Pulgares (BIR-10). */
    val votes: Int = 0,
    val votedByMe: Boolean = false,
    /**
     * La más votada de este mes en este bar.
     *
     * Se calcula acá y no en el cliente porque el mes es el de Buenos Aires:
     * resolverlo con la zona del navegador haría que la foto del mes cambie
     * según dónde esté parado quien mira.
     */
    val topOfMonth: Boolean = false,
)

private const val TZ = "America/Argentina/Buenos_Aires"

class PhotoRepo(private val db: Db, private val r2: R2) {

    /**
     * Llave del objeto. Lleva un UUID y no el nombre del archivo original: el
     * nombre que manda el cliente es texto arbitrario y terminaría en una URL
     * pública, con lo que eso implica de recorridos de ruta y de datos del
     * dispositivo de quien la sacó.
     */
    // La marca entra en la llave: dos birras del mismo estilo en el mismo bar
    // son cosas distintas y no deberían compartir carpeta en el bucket.
    private fun newKey(barId: Long, slug: String, brand: String?) =
        "bar/$barId/$slug/${brand ?: "_"}/${UUID.randomUUID()}.webp"

    fun uploadUrl(req: UploadUrlRequest): UploadUrlResponse = db.conn { c ->
        if (!r2.isConfigured) badRequest("subir fotos no está disponible por ahora")
        c.queryOne("SELECT 1 FROM beer_styles WHERE slug = ? AND active", req.styleSlug) { }
            ?: notFound("no existe ese estilo")
        c.queryOne("SELECT 1 FROM bars WHERE id = ?", req.barId) { }
            ?: notFound("no existe ese bar")

        val key = newKey(req.barId, req.styleSlug, req.brandSlug)
        UploadUrlResponse(uploadUrl = r2.presignPut(key), key = key)
    }

    /**
     * La fila se escribe recién cuando el navegador confirma que la subida
     * salió bien. Al revés —fila primero, subida después— cada subida
     * abandonada dejaría una foto rota en la galería.
     */
    fun confirm(req: ConfirmPhotoRequest, userId: Long): PhotoDto = db.conn { c ->
        // La llave la generamos nosotros; aceptar una arbitraria dejaría
        // apuntar una fila a cualquier objeto del bucket.
        val prefix = "bar/${req.barId}/${req.styleSlug}/${req.brandSlug ?: "_"}/"
        if (!req.key.startsWith(prefix) || req.key.contains("..")) {
            badRequest("llave inválida")
        }
        val styleId = c.queryOne(
            "SELECT id FROM beer_styles WHERE slug = ? AND active", req.styleSlug,
        ) { it.getLong("id") } ?: notFound("no existe ese estilo")

        val brandId = req.brandSlug?.let { slug ->
            c.queryOne("SELECT id FROM brands WHERE slug = ?", slug) { it.getLong("id") }
                ?: notFound("marca desconocida: $slug")
        }

        val id = c.queryOne(
            """
            INSERT INTO bar_photos (bar_id, style_id, brand_id, user_id, object_key)
            VALUES (?, ?, ?, ?, ?) RETURNING id
            """.trimIndent(),
            req.barId, styleId, brandId, userId, req.key,
        ) { it.getLong("id") } ?: badRequest("no se pudo guardar la foto")

        PhotoDto(id, req.styleSlug, req.brandSlug, r2.publicUrl(req.key), null, 0, true)
    }

    /**
     * Las fotos de un bar, con sus pulgares.
     *
     * La foto del mes va primero y no ordenada por votos entre todas: el
     * orden sigue siendo cronológico porque quien mira quiere ver lo último
     * que se subió, y un ranking permanente dejaría la misma foto arriba para
     * siempre. La del mes se corre al principio y se marca; el mes que viene
     * es otra.
     */
    fun forBar(barId: Long, viewerId: Long?): List<PhotoDto> = db.conn {
        it.query(
            """
            WITH v AS (
                SELECT pv.photo_id,
                       count(*)::int                AS votes,
                       -- Con viewerId NULL la comparación da NULL y bool_or
                       -- devuelve NULL: el COALESCE de abajo lo vuelve false.
                       bool_or(pv.user_id = ?::bigint) AS mine
                FROM photo_votes pv
                -- Acotado a este bar: sin el join, contar los pulgares de una
                -- foto obliga a recorrer los votos de la base entera.
                JOIN bar_photos bp ON bp.id = pv.photo_id AND bp.bar_id = ?
                GROUP BY pv.photo_id
            ),
            top AS (
                SELECT p.id
                FROM bar_photos p
                JOIN photo_votes pv ON pv.photo_id = p.id
                WHERE p.bar_id = ? AND p.status = 'active'
                  AND to_char(p.created_at AT TIME ZONE '$TZ', 'YYYY-MM')
                    = to_char(now()        AT TIME ZONE '$TZ', 'YYYY-MM')
                GROUP BY p.id
                -- Empate: gana la más nueva. Premiar a la que llegó primero
                -- sólo por haber estado más días juntando pulgares convierte
                -- la foto del mes en la del día 1.
                ORDER BY count(*) DESC, p.created_at DESC
                LIMIT 1
            )
            SELECT p.id, p.object_key, p.user_id, s.slug, b.slug AS brand_slug,
                   u.display_name,
                   EXTRACT(DAY FROM (now() - p.created_at))::int AS age_days,
                   COALESCE(v.votes, 0)    AS votes,
                   COALESCE(v.mine, false) AS voted_by_me,
                   (p.id = (SELECT id FROM top)) AS top_of_month
            FROM bar_photos p
            JOIN beer_styles s ON s.id = p.style_id
            LEFT JOIN brands b ON b.id = p.brand_id
            LEFT JOIN users u ON u.id = p.user_id
            LEFT JOIN v ON v.photo_id = p.id
            WHERE p.bar_id = ? AND p.status = 'active'
            ORDER BY (p.id = (SELECT id FROM top)) DESC, p.created_at DESC
            """.trimIndent(),
            viewerId, barId, barId, barId,
        ) { rs ->
            PhotoDto(
                id = rs.getLong("id"),
                styleSlug = rs.getString("slug"),
                brandSlug = rs.getString("brand_slug"),
                url = r2.publicUrl(rs.getString("object_key")),
                authorName = rs.getString("display_name"),
                ageDays = rs.getInt("age_days"),
                mine = viewerId != null && rs.getLong("user_id") == viewerId,
                votes = rs.getInt("votes"),
                votedByMe = rs.getBoolean("voted_by_me"),
                // NULL cuando no hay foto del mes: `p.id = NULL` da NULL, no false.
                topOfMonth = rs.getBoolean("top_of_month") && !rs.wasNull(),
            )
        }
    }

    /**
     * Poner o sacar el pulgar. Devuelve cuántos quedaron.
     *
     * Idempotente en los dos sentidos: el botón es un interruptor y dos
     * toques seguidos —o un toque repetido por una red lenta— no pueden
     * dejar dos votos ni tirar un error en la cara.
     *
     * No se puede votar una foto bajada: sigue existiendo la fila, pero ya no
     * se muestra en ningún lado, así que un voto ahí sólo podría llegar
     * adivinando el id.
     */
    fun vote(photoId: Long, userId: Long, on: Boolean): Int = db.conn { c ->
        c.queryOne("SELECT 1 FROM bar_photos WHERE id = ? AND status = 'active'", photoId) { }
            ?: notFound("no existe esa foto")

        if (on) {
            c.update(
                "INSERT INTO photo_votes (photo_id, user_id) VALUES (?, ?) " +
                    "ON CONFLICT DO NOTHING",
                photoId, userId,
            )
        } else {
            c.update("DELETE FROM photo_votes WHERE photo_id = ? AND user_id = ?", photoId, userId)
        }

        c.queryOne("SELECT count(*)::int AS n FROM photo_votes WHERE photo_id = ?", photoId) {
            it.getInt("n")
        } ?: 0
    }

    /**
     * Bajar una foto NO alcanza con cambiar el estado.
     *
     * Precios y reseñas se sirven desde acá, así que marcarlos `removed` los
     * saca de circulación. Las fotos se sirven desde una URL pública del
     * bucket: mientras el objeto exista, cualquiera con el link la ve. Por eso
     * moderar una foto borra el objeto, y por eso es irreversible.
     */
    fun remove(photoId: Long): String? = db.conn { c ->
        val key = c.queryOne(
            "SELECT object_key FROM bar_photos WHERE id = ?", photoId,
        ) { it.getString("object_key") } ?: return@conn null
        c.update("UPDATE bar_photos SET status = 'removed' WHERE id = ?", photoId)
        key
    }
}
