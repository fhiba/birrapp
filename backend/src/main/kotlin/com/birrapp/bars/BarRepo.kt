package com.birrapp.bars

import com.birrapp.core.Db
import com.birrapp.core.badRequest
import com.birrapp.core.conflict
import com.birrapp.core.tooManyRequests
import com.birrapp.core.query
import com.birrapp.core.update
import com.birrapp.core.queryOne
import java.sql.ResultSet

class BarRepo(private val db: Db) {

    private companion object {
        const val MAX_NAME = 120
        const val MAX_ADDRESS = 200
        const val MAX_BARS_PER_DAY = 10
    }

    /**
     * Bares aprobados dentro de un radio.
     *
     * ST_DWithin sobre `geography` usa el índice GiST — es la razón por la que
     * esto es rápido. Un filtro por bounding box calculado en Kotlin sería
     * varios órdenes de magnitud peor y además da mal cerca de los polos.
     *
     * Orden `cheapest`: NULLS LAST es deliberado. `from_price` es NULL cuando
     * el bar sólo tiene precios stale, y un precio viejo no puede encabezar
     * un ranking de "más barata".
     */
    fun nearby(
        lat: Double,
        lng: Double,
        radiusMeters: Int,
        sort: BarSort,
        limit: Int,
        styleSlug: String? = null,
    ): List<BarPinDto> {
        val styleFilter = if (styleSlug != null) {
            """
            AND EXISTS (
                SELECT 1 FROM v_current_prices cp
                WHERE cp.bar_id = b.id AND cp.style_slug = ? AND cp.freshness <> 'stale'
            )
            """.trimIndent()
        } else ""

        val orderBy = when (sort) {
            BarSort.distance -> "distance_meters ASC"
            BarSort.cheapest -> "h.from_price ASC NULLS LAST, distance_meters ASC"
        }

        val sql = """
            SELECT b.id, b.name,
                   ST_Y(b.location::geometry) AS lat,
                   ST_X(b.location::geometry) AS lng,
                   h.from_price, h.freshest_age_days,
                   ST_Distance(b.location, ST_MakePoint(?, ?)::geography) AS distance_meters
            FROM bars b
            LEFT JOIN v_bar_headline h ON h.bar_id = b.id
            WHERE b.status = 'approved'
              AND ST_DWithin(b.location, ST_MakePoint(?, ?)::geography, ?)
              $styleFilter
            ORDER BY $orderBy
            LIMIT ?
        """.trimIndent()

        val args = buildList<Any?> {
            add(lng); add(lat)            // ST_MakePoint es (x=lng, y=lat)
            add(lng); add(lat); add(radiusMeters)
            if (styleSlug != null) add(styleSlug)
            add(limit)
        }

        return db.conn { it.query(sql, *args.toTypedArray(), map = ::mapPin) }
    }

    private fun mapPin(rs: ResultSet) = BarPinDto(
        id = rs.getLong("id"),
        name = rs.getString("name"),
        lat = rs.getDouble("lat"),
        lng = rs.getDouble("lng"),
        fromPrice = rs.getBigDecimal("from_price")?.toDouble(),
        freshestAgeDays = rs.getInt("freshest_age_days").takeUnless { rs.wasNull() },
        distanceMeters = rs.getDouble("distance_meters").takeUnless { rs.wasNull() },
    )

    /**
     * Busca bares ya cargados por nombre.
     *
     * Va antes que Google al dar de alta: si el bar ya está, el usuario lo ve
     * y sigue de largo en vez de crear un duplicado. Es la defensa más barata
     * contra el mismo bar cargado cinco veces con cinco grafías distintas.
     *
     * Ordena por cercanía cuando hay un punto de referencia: "Venice" en
     * Martínez casi seguro es el de Martínez, no uno homónimo en Palermo.
     */
    fun search(query: String, lat: Double?, lng: Double?, limit: Int = 8): List<BarPinDto> {
        val q = query.trim()
        if (q.length < 2) return emptyList()
        val hasPoint = lat != null && lng != null

        val sql = """
            SELECT b.id, b.name,
                   ST_Y(b.location::geometry) AS lat,
                   ST_X(b.location::geometry) AS lng,
                   h.from_price, h.freshest_age_days,
                   CASE WHEN ?::float8 IS NULL THEN NULL
                        ELSE ST_Distance(b.location, ST_MakePoint(?, ?)::geography) END
                        AS distance_meters
            FROM bars b
            LEFT JOIN v_bar_headline h ON h.bar_id = b.id
            WHERE b.status = 'approved'
              AND bar_search_key(b.name) LIKE '%' || bar_search_key(?) || '%'
            ORDER BY ${if (hasPoint) "distance_meters ASC NULLS LAST," else ""}
                     length(b.name) ASC
            LIMIT ?
        """.trimIndent()

        return db.conn {
            it.query(
                sql,
                lat, if (hasPoint) lng else null, if (hasPoint) lat else null, q, limit,
                map = ::mapPin,
            )
        }
    }

    fun detail(id: Long, fromLat: Double?, fromLng: Double?): BarDetailDto? = db.conn { c ->
        val bar = c.queryOne(
            """
            SELECT b.id, b.name, b.address, b.neighbourhood, b.status, b.google_place_id,
                   ST_Y(b.location::geometry) AS lat,
                   ST_X(b.location::geometry) AS lng,
                   CASE WHEN ?::float8 IS NULL THEN NULL
                        ELSE ST_Distance(b.location, ST_MakePoint(?, ?)::geography) END
                        AS distance_meters,
                   (SELECT avg(rating)::float8 FROM reviews r
                     WHERE r.bar_id = b.id AND r.status = 'active') AS avg_rating,
                   (SELECT count(*) FROM reviews r
                     WHERE r.bar_id = b.id AND r.status = 'active') AS review_count
            FROM bars b WHERE b.id = ?
            """.trimIndent(),
            fromLat, fromLng, fromLat, id,
        ) { rs ->
            BarDetailDto(
                id = rs.getLong("id"),
                name = rs.getString("name"),
                address = rs.getString("address"),
                neighbourhood = rs.getString("neighbourhood"),
                lat = rs.getDouble("lat"),
                lng = rs.getDouble("lng"),
                status = rs.getString("status"),
                googlePlaceId = rs.getString("google_place_id"),
                distanceMeters = rs.getDouble("distance_meters").takeUnless { rs.wasNull() },
                prices = emptyList(),
                avgRating = rs.getDouble("avg_rating").takeUnless { rs.wasNull() },
                reviewCount = rs.getInt("review_count"),
            )
        } ?: return@conn null

        val prices = c.query(
            """
            SELECT id, style_slug, style_name, price, size_ml, age_days, freshness
            FROM v_current_prices WHERE bar_id = ?
            ORDER BY freshness = 'stale', price ASC
            """.trimIndent(),
            id,
        ) { rs ->
            StylePriceDto(
                id = rs.getLong("id"),
                styleSlug = rs.getString("style_slug"),
                styleName = rs.getString("style_name"),
                price = rs.getBigDecimal("price").toDouble(),
                sizeMl = rs.getInt("size_ml"),
                ageDays = rs.getInt("age_days"),
                freshness = rs.getString("freshness"),
            )
        }
        bar.copy(prices = prices)
    }

    /**
     * Alta comunitaria. Queda `pending` hasta que un moderador la apruebe.
     *
     * Antes rechaza duplicados obvios: mismo nombre a menos de 100 m casi
     * siempre es el mismo bar cargado dos veces. Sin esto el mapa se llena
     * de pines repetidos y los precios se parten entre ellos.
     */
    fun create(req: NewBarRequest, createdBy: Long): Long = db.conn { c ->
        // Deduplicación en dos pasos. El place_id es el criterio fuerte:
        // si dos personas cargan el mismo bar desde el buscador de Google,
        // traen exactamente el mismo ID y no hay ambigüedad.
        req.googlePlaceId?.let { placeId ->
            val existing = c.queryOne(
                "SELECT id FROM bars WHERE google_place_id = ?", placeId,
            ) { it.getLong("id") }
            if (existing != null) conflict("ese bar ya está cargado (id $existing)")
        }

        // Sin place_id sólo queda el heurístico: mismo nombre a menos de
        // 100 m. Es más débil, por eso estos quedan pendientes de moderación.
        val dup = c.queryOne(
            """
            SELECT id FROM bars
            WHERE lower(name) = lower(?)
              AND ST_DWithin(location, ST_MakePoint(?, ?)::geography, 100)
              AND status <> 'rejected'
            LIMIT 1
            """.trimIndent(),
            req.name, req.lng, req.lat,
        ) { it.getLong("id") }
        if (dup != null) conflict("ya existe un bar con ese nombre a menos de 100 m (id $dup)")

        // Un bar elegido del buscador de Google entra aprobado: el riesgo que
        // cubre la moderación es que alguien invente un lugar, y venir con
        // place_id ya prueba que existe. Lo cargado a mano sigue en cola.
        val status = if (req.googlePlaceId != null) "approved" else "pending"

        c.queryOne(
            """
            INSERT INTO bars (name, address, neighbourhood, location, status,
                              created_by, google_place_id)
            VALUES (?, ?, ?, ST_MakePoint(?, ?)::geography, ?::moderation_status, ?, ?)
            RETURNING id
            """.trimIndent(),
            req.name, req.address, req.neighbourhood, req.lng, req.lat,
            status, createdBy, req.googlePlaceId,
        ) { it.getLong("id") }!!
    }

    fun setStatus(barId: Long, status: String): Boolean = db.conn {
        it.query(
            "UPDATE bars SET status = ?::moderation_status, updated_at = now() " +
                "WHERE id = ? RETURNING id",
            status, barId,
        ) { rs -> rs.getLong("id") }.isNotEmpty()
    }

    /**
     * Borra un bar. Sólo moderación.
     *
     * Los precios se van en cascada porque un precio sin bar no significa
     * nada. Para sacar un bar de circulación sin perder su historial está
     * `setStatus(rejected)`, que es lo que conviene salvo que el bar sea
     * inventado.
     */
    fun delete(barId: Long): Boolean = db.conn {
        it.update("DELETE FROM bars WHERE id = ?", barId) > 0
    }

    fun pending(limit: Int): List<BarPinDto> = db.conn {
        it.query(
            """
            SELECT id, name, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
                   NULL::numeric AS from_price, NULL::int AS freshest_age_days,
                   NULL::float8 AS distance_meters
            FROM bars WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?
            """.trimIndent(),
            limit, map = ::mapPin,
        )
    }
}
