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
    /** null = sin marca. Sin esto dos birras del mismo estilo se ven iguales. */
    val brandName: String?,
    val price: Double,
    val sizeMl: Int,
    /** La del reporte, que es la del bar. Sin esto el monto no tiene unidad. */
    val currency: String = com.birrapp.core.Currency.DEFAULT,
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
    val brandName: String?,
    val url: String,
    val ageDays: Int,
)

@Serializable
data class MyCommentDto(
    val id: Long,
    val barId: Long,
    val barName: String,
    val styleName: String,
    val brandName: String?,
    val body: String,
    val ageDays: Int,
)

/**
 * Los aportes propios, de a una clase por vez (BIR-44).
 *
 * Las cuatro listas siguen en el mismo DTO y no hay un endpoint por tipo
 * porque el cliente ya distingue por `tipo`: con cuatro rutas habría cuatro
 * formas de lo mismo. Lo que cambió es que sólo viene llena la que se pidió;
 * sin `tipo` vienen las cuatro, que es lo que sigue pidiendo la app de
 * Android.
 */
@Serializable
data class MyContributionsDto(
    val bars: List<MyBarDto> = emptyList(),
    val prices: List<MyPriceDto> = emptyList(),
    val photos: List<MyPhotoDto> = emptyList(),
    val comments: List<MyCommentDto> = emptyList(),
    /**
     * Para pedir la página siguiente. `null` = no hay más.
     *
     * Es opaco a propósito: hoy es `<created_at>|<id>`, y que el cliente no
     * lo interprete deja cambiar el orden sin romperlo. Va el id además de la
     * fecha porque dos aportes del mismo segundo con cursor de sólo fecha se
     * saltean entre página y página.
     */
    val nextCursor: String? = null,
)

/** Qué clase de aporte se está pidiendo. Ausente = las cuatro. */
enum class ContributionKind { bars, prices, photos, comments }

/**
 * Lo que cargó una persona, en un solo lugar.
 *
 * Existe porque hasta ahora la única forma de encontrar algo propio mal
 * cargado era acordarse en qué bar fue y navegar hasta ahí. Con veinte
 * aportes eso ya no escala.
 */
class ContributionRepo(private val db: Db, private val r2: R2) {

    /**
     * [kind] null trae las cuatro listas, que es como nació y como la sigue
     * llamando Android. Con `kind` viene una sola: la pantalla web muestra
     * una por vez, así que abrir "precios" se bajaba además las fotos, los
     * bares y los comentarios de la persona — cuatro listas para dibujar una.
     */
    fun forUser(
        userId: Long,
        kind: ContributionKind? = null,
        limit: Int = DEFAULT_PAGE,
        before: String? = null,
    ): MyContributionsDto = db.conn { c ->
        val n = limit.coerceIn(1, MAX_PAGE)
        val cur = Cursor.parse(before)
        // Se pide uno de más para saber si hay página siguiente sin contar la
        // tabla entera: si vuelven n+1, sobra uno y ese es el corte.
        val take = n + 1

        fun want(k: ContributionKind) = kind == null || kind == k

        val barCur = mutableListOf<String>()
        val bars = if (!want(ContributionKind.bars)) emptyList() else c.query(
            """
            SELECT id, name, status, created_at,
                   EXTRACT(DAY FROM (now() - created_at))::int AS age_days
            FROM bars WHERE created_by = ?
              ${gate("created_at", "id")}
            ORDER BY created_at DESC, id DESC LIMIT ?
            """.trimIndent(),
            userId, cur?.at, cur?.id, take,
        ) { rs ->
            barCur += cursorOf(rs, "created_at", "id")
            MyBarDto(rs.getLong("id"), rs.getString("name"),
                rs.getString("status"), rs.getInt("age_days"))
        }

        // `isCurrent` sale de cruzar con la vista: sirve para avisar que
        // borrar ESE reporte cambia lo que ve todo el mundo, y no sólo saca
        // una fila del historial.
        val priceCur = mutableListOf<String>()
        val prices = if (!want(ContributionKind.prices)) emptyList() else c.query(
            """
            SELECT pr.id, pr.bar_id, b.name AS bar_name, s.name_es AS style_name,
                   br.name AS brand_name,
                   pr.price, pr.size_ml, pr.currency, pr.is_confirmation,
                   pr.created_at AS cur_at,
                   EXTRACT(DAY FROM (now() - pr.created_at))::int AS age_days,
                   (cp.id = pr.id) AS is_current
            FROM price_reports pr
            JOIN bars b ON b.id = pr.bar_id
            JOIN beer_styles s ON s.id = pr.style_id
            LEFT JOIN brands br ON br.id = pr.brand_id
            -- La marca va en el ON, no sólo el estilo: la vista tiene una fila
            -- por marca, así que sin esto un bar con dos IPA duplicaba cada
            -- reporte y marcaba como vigente el de la otra marca.
            LEFT JOIN v_current_prices cp
                   ON cp.bar_id = pr.bar_id AND cp.style_id = pr.style_id
                  AND cp.brand_id IS NOT DISTINCT FROM pr.brand_id
            WHERE pr.reported_by = ? AND pr.status = 'active'
              ${gate("pr.created_at", "pr.id")}
            ORDER BY pr.created_at DESC, pr.id DESC LIMIT ?
            """.trimIndent(),
            userId, cur?.at, cur?.id, take,
        ) { rs ->
            priceCur += cursorOf(rs, "cur_at", "id")
            MyPriceDto(
                id = rs.getLong("id"),
                barId = rs.getLong("bar_id"),
                barName = rs.getString("bar_name"),
                styleName = rs.getString("style_name"),
                brandName = rs.getString("brand_name"),
                price = rs.getBigDecimal("price").toDouble(),
                sizeMl = rs.getInt("size_ml"),
                currency = rs.getString("currency"),
                ageDays = rs.getInt("age_days"),
                isConfirmation = rs.getBoolean("is_confirmation"),
                isCurrent = rs.getBoolean("is_current"),
            )
        }

        val photoCur = mutableListOf<String>()
        val photos = if (!want(ContributionKind.photos)) emptyList() else c.query(
            """
            SELECT p.id, p.bar_id, b.name AS bar_name, s.name_es AS style_name,
                   br.name AS brand_name, p.object_key, p.created_at AS cur_at,
                   EXTRACT(DAY FROM (now() - p.created_at))::int AS age_days
            FROM bar_photos p
            JOIN bars b ON b.id = p.bar_id
            JOIN beer_styles s ON s.id = p.style_id
            LEFT JOIN brands br ON br.id = p.brand_id
            WHERE p.user_id = ? AND p.status = 'active'
              ${gate("p.created_at", "p.id")}
            ORDER BY p.created_at DESC, p.id DESC LIMIT ?
            """.trimIndent(),
            userId, cur?.at, cur?.id, take,
        ) { rs ->
            photoCur += cursorOf(rs, "cur_at", "id")
            MyPhotoDto(
                id = rs.getLong("id"),
                barId = rs.getLong("bar_id"),
                barName = rs.getString("bar_name"),
                styleName = rs.getString("style_name"),
                brandName = rs.getString("brand_name"),
                url = r2.publicUrl(rs.getString("object_key")),
                ageDays = rs.getInt("age_days"),
            )
        }

        // Los comentarios también son un aporte propio, y hasta ahora la
        // única forma de encontrar uno era acordarse en qué bar fue.
        val commentCur = mutableListOf<String>()
        val comments = if (!want(ContributionKind.comments)) emptyList() else c.query(
            """
            SELECT cm.id, cm.bar_id, b.name AS bar_name, s.name_es AS style_name,
                   br.name AS brand_name, cm.body, cm.created_at AS cur_at,
                   EXTRACT(DAY FROM (now() - cm.created_at))::int AS age_days
            FROM beer_comments cm
            JOIN bars b ON b.id = cm.bar_id
            JOIN beer_styles s ON s.id = cm.style_id
            LEFT JOIN brands br ON br.id = cm.brand_id
            WHERE cm.user_id = ? AND cm.status = 'active'
              ${gate("cm.created_at", "cm.id")}
            ORDER BY cm.created_at DESC, cm.id DESC LIMIT ?
            """.trimIndent(),
            userId, cur?.at, cur?.id, take,
        ) { rs ->
            commentCur += cursorOf(rs, "cur_at", "id")
            MyCommentDto(
                id = rs.getLong("id"),
                barId = rs.getLong("bar_id"),
                barName = rs.getString("bar_name"),
                styleName = rs.getString("style_name"),
                brandName = rs.getString("brand_name"),
                body = rs.getString("body"),
                ageDays = rs.getInt("age_days"),
            )
        }

        // El cursor es el de la lista que se pidió. Sin `kind` no hay uno
        // solo que sirva —son cuatro listas con cuatro cortes— y devolver el
        // de una sería decirle al cliente que paginó las cuatro.
        val (barPage, barNext) = trim(bars, barCur, n)
        val (pricePage, priceNext) = trim(prices, priceCur, n)
        val (photoPage, photoNext) = trim(photos, photoCur, n)
        val (commentPage, commentNext) = trim(comments, commentCur, n)

        MyContributionsDto(
            bars = barPage, prices = pricePage, photos = photoPage, comments = commentPage,
            nextCursor = when (kind) {
                ContributionKind.bars -> barNext
                ContributionKind.prices -> priceNext
                ContributionKind.photos -> photoNext
                ContributionKind.comments -> commentNext
                null -> null
            },
        )
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

// ---------- paginación por cursor (BIR-44) ----------

/** Cuántos aportes trae una página si nadie pide otra cosa. */
private const val DEFAULT_PAGE = 30

/**
 * Techo duro. Existe para que `?limit=100000` no sea una forma de bajarse la
 * tabla: el límite del servidor no puede depender de lo que pida el cliente.
 */
private const val MAX_PAGE = 100

/**
 * El corte del cursor.
 *
 * Compara la tupla `(fecha, id)` y no sólo la fecha: dos aportes cargados en
 * el mismo segundo —que es lo que pasa cuando alguien carga tres precios
 * seguidos— se saltean entre una página y la siguiente si el corte es sólo
 * por fecha.
 *
 * El centinela en el COALESCE es para no tener dos SQL, una con cursor y otra
 * sin: sin cursor el corte es `< (infinito, maxlong)`, que no filtra nada.
 */
private fun gate(at: String, id: String) =
    "AND ($at, $id) < " +
        "(COALESCE(?::timestamptz, 'infinity'), COALESCE(?::bigint, 9223372036854775807))"

private class Cursor(val at: String, val id: Long) {
    companion object {
        /** Formato `<iso>|<id>`. Un cursor ilegible se trata como ausente. */
        fun parse(raw: String?): Cursor? {
            val s = raw?.trim().orEmpty()
            val i = s.lastIndexOf('|')
            if (i <= 0) return null
            val id = s.substring(i + 1).toLongOrNull() ?: return null
            return Cursor(s.substring(0, i), id)
        }
    }
}

private fun cursorOf(rs: java.sql.ResultSet, atCol: String, idCol: String) =
    "${rs.getTimestamp(atCol).toInstant()}|${rs.getLong(idCol)}"

/**
 * Recorta la página al tamaño pedido y devuelve el cursor de la última fila
 * que queda.
 *
 * Se consultó una fila de más: si volvió, hay página siguiente. Es la forma
 * barata de saberlo — un `count(*)` por página cuesta recorrer la tabla
 * entera para contestar un sí o un no.
 */
private fun <T> trim(items: List<T>, cursors: List<String>, n: Int): Pair<List<T>, String?> =
    if (items.size <= n) items to null else items.take(n) to cursors[n - 1]
