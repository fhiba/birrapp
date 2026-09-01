package com.birrapp.auth

import kotlinx.serialization.Serializable
import com.birrapp.core.Db
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.core.update
import com.birrapp.photos.R2

@Serializable
data class MyBarDto(
    val id: Long,
    val name: String,
    /** pending · approved · rejected */
    val status: String,
    val ageDays: Int,
)

@Serializable
data class MyPriceDto(
    val id: Long,
    val barId: Long,
    val barName: String,
    val styleName: String,
    val price: Double,
    val sizeMl: Int,
    val ageDays: Int,
    /** Entró por "Sigue igual" y no por carga manual. */
    val isConfirmation: Boolean,
    /** Es el precio que la app muestra hoy para ese bar y estilo. */
    val isCurrent: Boolean,
)

@Serializable
data class MyPhotoDto(
    val id: Long,
    val barId: Long,
    val barName: String,
    val styleName: String,
    val url: String,
    val ageDays: Int,
)

@Serializable
data class MyContributionsDto(
    val bars: List<MyBarDto>,
    val prices: List<MyPriceDto>,
    val photos: List<MyPhotoDto>,
)

/**
 * Lo que cargó una persona, en un solo lugar.
 *
 * Existe porque hasta ahora la única forma de encontrar algo propio mal
 * cargado era acordarse en qué bar fue y navegar hasta ahí. Con veinte
 * aportes eso ya no escala.
 */
class ContributionRepo(private val db: Db, private val r2: R2) {

    fun forUser(userId: Long, limit: Int = 200): MyContributionsDto = db.conn { c ->
        val bars = c.query(
            """
            SELECT id, name, status,
                   EXTRACT(DAY FROM (now() - created_at))::int AS age_days
            FROM bars WHERE created_by = ?
            ORDER BY created_at DESC LIMIT ?
            """.trimIndent(),
            userId, limit,
        ) { rs ->
            MyBarDto(rs.getLong("id"), rs.getString("name"),
                rs.getString("status"), rs.getInt("age_days"))
        }

        // `isCurrent` sale de cruzar con la vista: sirve para avisar que
        // borrar ESE reporte cambia lo que ve todo el mundo, y no sólo saca
        // una fila del historial.
        val prices = c.query(
            """
            SELECT pr.id, pr.bar_id, b.name AS bar_name, s.name_es AS style_name,
                   pr.price, pr.size_ml, pr.is_confirmation,
                   EXTRACT(DAY FROM (now() - pr.created_at))::int AS age_days,
                   (cp.id = pr.id) AS is_current
            FROM price_reports pr
            JOIN bars b ON b.id = pr.bar_id
            JOIN beer_styles s ON s.id = pr.style_id
            LEFT JOIN v_current_prices cp
                   ON cp.bar_id = pr.bar_id AND cp.style_id = pr.style_id
            WHERE pr.reported_by = ? AND pr.status = 'active'
            ORDER BY pr.created_at DESC LIMIT ?
            """.trimIndent(),
            userId, limit,
        ) { rs ->
            MyPriceDto(
                id = rs.getLong("id"),
                barId = rs.getLong("bar_id"),
                barName = rs.getString("bar_name"),
                styleName = rs.getString("style_name"),
                price = rs.getBigDecimal("price").toDouble(),
                sizeMl = rs.getInt("size_ml"),
                ageDays = rs.getInt("age_days"),
                isConfirmation = rs.getBoolean("is_confirmation"),
                isCurrent = rs.getBoolean("is_current"),
            )
        }

        val photos = c.query(
            """
            SELECT p.id, p.bar_id, b.name AS bar_name, s.name_es AS style_name,
                   p.object_key,
                   EXTRACT(DAY FROM (now() - p.created_at))::int AS age_days
            FROM bar_photos p
            JOIN bars b ON b.id = p.bar_id
            JOIN beer_styles s ON s.id = p.style_id
            WHERE p.user_id = ? AND p.status = 'active'
            ORDER BY p.created_at DESC LIMIT ?
            """.trimIndent(),
            userId, limit,
        ) { rs ->
            MyPhotoDto(
                id = rs.getLong("id"),
                barId = rs.getLong("bar_id"),
                barName = rs.getString("bar_name"),
                styleName = rs.getString("style_name"),
                url = r2.publicUrl(rs.getString("object_key")),
                ageDays = rs.getInt("age_days"),
            )
        }

        MyContributionsDto(bars, prices, photos)
    }

    /**
     * Baja un reporte propio.
     *
     * El `reported_by = ?` en el WHERE es el control de acceso: sin él,
     * cualquiera con una sesión válida bajaría el precio de cualquier otro
     * mandando un id. No se toca `price`, sólo el estado, así que la regla de
     * append-only sigue en pie.
     */
    fun removeOwnPrice(priceId: Long, userId: Long): Boolean = db.conn {
        it.update(
            """
            UPDATE price_reports SET status = 'removed'
            WHERE id = ? AND reported_by = ? AND status = 'active'
            """.trimIndent(),
            priceId, userId,
        ) > 0
    }

    /** Devuelve la llave del objeto si la foto era de esa persona. */
    fun removeOwnPhoto(photoId: Long, userId: Long): String? = db.conn { c ->
        val key = c.queryOne(
            "SELECT object_key FROM bar_photos WHERE id = ? AND user_id = ? AND status = 'active'",
            photoId, userId,
        ) { it.getString("object_key") } ?: return@conn null
        c.update("UPDATE bar_photos SET status = 'removed' WHERE id = ?", photoId)
        key
    }
}
