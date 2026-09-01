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
data class UploadUrlRequest(val barId: Long, val styleSlug: String)

@Serializable
data class UploadUrlResponse(val uploadUrl: String, val key: String)

@Serializable
data class ConfirmPhotoRequest(val barId: Long, val styleSlug: String, val key: String)

@Serializable
data class PhotoDto(
    val id: Long,
    val styleSlug: String,
    val url: String,
    val authorName: String?,
    val ageDays: Int,
    val mine: Boolean,
)

class PhotoRepo(private val db: Db, private val r2: R2) {

    /**
     * Llave del objeto. Lleva un UUID y no el nombre del archivo original: el
     * nombre que manda el cliente es texto arbitrario y terminaría en una URL
     * pública, con lo que eso implica de recorridos de ruta y de datos del
     * dispositivo de quien la sacó.
     */
    private fun newKey(barId: Long, slug: String) =
        "bar/$barId/$slug/${UUID.randomUUID()}.webp"

    fun uploadUrl(req: UploadUrlRequest): UploadUrlResponse = db.conn { c ->
        if (!r2.isConfigured) badRequest("subir fotos no está disponible por ahora")
        c.queryOne("SELECT 1 FROM beer_styles WHERE slug = ? AND active", req.styleSlug) { }
            ?: notFound("no existe ese estilo")
        c.queryOne("SELECT 1 FROM bars WHERE id = ?", req.barId) { }
            ?: notFound("no existe ese bar")

        val key = newKey(req.barId, req.styleSlug)
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
        val prefix = "bar/${req.barId}/${req.styleSlug}/"
        if (!req.key.startsWith(prefix) || req.key.contains("..")) {
            badRequest("llave inválida")
        }
        val styleId = c.queryOne(
            "SELECT id FROM beer_styles WHERE slug = ? AND active", req.styleSlug,
        ) { it.getLong("id") } ?: notFound("no existe ese estilo")

        val id = c.queryOne(
            """
            INSERT INTO bar_photos (bar_id, style_id, user_id, object_key)
            VALUES (?, ?, ?, ?) RETURNING id
            """.trimIndent(),
            req.barId, styleId, userId, req.key,
        ) { it.getLong("id") } ?: badRequest("no se pudo guardar la foto")

        PhotoDto(id, req.styleSlug, r2.publicUrl(req.key), null, 0, true)
    }

    fun forBar(barId: Long, viewerId: Long?): List<PhotoDto> = db.conn {
        it.query(
            """
            SELECT p.id, p.object_key, p.user_id, s.slug, u.display_name,
                   EXTRACT(DAY FROM (now() - p.created_at))::int AS age_days
            FROM bar_photos p
            JOIN beer_styles s ON s.id = p.style_id
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.bar_id = ? AND p.status = 'active'
            ORDER BY p.created_at DESC
            """.trimIndent(),
            barId,
        ) { rs ->
            PhotoDto(
                id = rs.getLong("id"),
                styleSlug = rs.getString("slug"),
                url = r2.publicUrl(rs.getString("object_key")),
                authorName = rs.getString("display_name"),
                ageDays = rs.getInt("age_days"),
                mine = viewerId != null && rs.getLong("user_id") == viewerId,
            )
        }
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
