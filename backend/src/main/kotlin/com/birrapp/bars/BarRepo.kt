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
        // Con filtro de estilo, el precio del pin tiene que ser el DE ESE
        // estilo. Antes el filtro sólo elegía qué bares aparecían y el precio
        // seguía saliendo de `v_bar_headline`, que es el más barato de
        // cualquier estilo: filtrando IPA se veía el precio de la rubia. Eso
        // vacía de sentido al filtro, que es justamente comparar lo mismo
        // contra lo mismo.
        val filtered = styleSlug != null

        val priceCols = if (filtered) {
            "cp.price AS from_price, cp.age_days AS freshest_age_days"
        } else {
            "h.from_price, h.freshest_age_days"
        }

        // JOIN en vez de EXISTS: hace falta la fila para leerle el precio, no
        // sólo saber que existe.
        val joins = if (filtered) {
            """
            JOIN v_current_prices cp
              ON cp.bar_id = b.id AND cp.style_slug = ? AND cp.freshness <> 'stale'
            """.trimIndent()
        } else {
            "LEFT JOIN v_bar_headline h ON h.bar_id = b.id"
        }

        val orderBy = when (sort) {
            BarSort.distance -> "distance_meters ASC"
            BarSort.cheapest ->
                if (filtered) "cp.price ASC, distance_meters ASC"
                else "h.from_price ASC NULLS LAST, distance_meters ASC"
        }

        val sql = """
            SELECT b.id, b.name,
                   ST_Y(b.location::geometry) AS lat,
                   ST_X(b.location::geometry) AS lng,
                   $priceCols,
                   ST_Distance(b.location, ST_MakePoint(?, ?)::geography) AS distance_meters
            FROM bars b
            $joins
            WHERE b.status = 'approved'
              AND ST_DWithin(b.location, ST_MakePoint(?, ?)::geography, ?)
            ORDER BY $orderBy
            LIMIT ?
        """.trimIndent()

        // El orden importa: el slug va en el JOIN, que en el SQL aparece antes
        // del WHERE, pero después del ST_Distance del SELECT.
        val args = buildList<Any?> {
            add(lng); add(lat)            // ST_MakePoint es (x=lng, y=lat)
            if (filtered) add(styleSlug)
            add(lng); add(lat); add(radiusMeters)
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

        // Una fila por birra del bar: la birra es (estilo, marca).
        //
        // Las filas salen de la unión de las tres cosas que pueden existir
        // sobre una birra —precio vigente, notas, fotos— y no de recorrer
        // `beer_styles`. Dos razones:
        //
        // 1. Una birra sin precio no puede desaparecer. Cuando se borra el
        //    reporte, sus fotos y sus notas siguen en la base y sin esto
        //    quedaban sin ninguna forma de llegar a ellas.
        // 2. Con marcas, unir por estilo solo hacía producto cartesiano: un
        //    bar con IPA de Antares e IPA de Juguetes Perdidos, ambas
        //    votadas, daba cuatro filas y la nota de una terminaba colgada
        //    de la otra. Las tres tablas se cruzan por (estilo, marca), y
        //    `IS NOT DISTINCT FROM` es lo que hace que "sin marca" case con
        //    "sin marca" en vez de que NULL no case con nada.
        //
        // Orden: por estilo según el vocabulario, y dentro de cada estilo
        // primero las que tienen precio, de la más barata a la más cara y con
        // las stale al final. Que las marcas de un mismo estilo queden
        // contiguas es lo que le permite a la pantalla agruparlas en
        // sub-solapas sin reordenar nada.
        val prices = c.query(
            """
            WITH beers AS (
                SELECT style_id, brand_id FROM v_current_prices WHERE bar_id = ?
                UNION
                SELECT style_id, brand_id FROM v_style_ratings  WHERE bar_id = ?
                UNION
                SELECT style_id, brand_id FROM bar_photos
                 WHERE bar_id = ? AND status = 'active'
            )
            SELECT s.slug AS style_slug, s.name_es AS style_name,
                   cp.id, cp.price, cp.size_ml, cp.age_days, cp.freshness,
                   br.slug AS brand_slug, br.name AS brand_name,
                   br.craft AS brand_craft,
                   sr.rating_raw, sr.rating_avg,
                   coalesce(sr.rating_count, 0) AS rating_count,
                   EXTRACT(DAY FROM (now() - sr.last_rated_at))::int AS rating_age_days
            FROM beers x
            JOIN beer_styles s ON s.id = x.style_id
            LEFT JOIN brands br ON br.id = x.brand_id
            LEFT JOIN v_current_prices cp
                   ON cp.bar_id = ? AND cp.style_id = x.style_id
                  AND cp.brand_id IS NOT DISTINCT FROM x.brand_id
            LEFT JOIN v_style_ratings sr
                   ON sr.bar_id = ? AND sr.style_id = x.style_id
                  AND sr.brand_id IS NOT DISTINCT FROM x.brand_id
            ORDER BY s.sort_order, s.id,
                     (cp.id IS NULL), cp.freshness = 'stale',
                     cp.price ASC, br.name
            """.trimIndent(),
            id, id, id, id, id,
        ) { rs ->
            StylePriceDto(
                id = rs.getLong("id").takeUnless { rs.wasNull() },
                styleSlug = rs.getString("style_slug"),
                styleName = rs.getString("style_name"),
                brandSlug = rs.getString("brand_slug"),
                brandName = rs.getString("brand_name"),
                brandCraft = rs.getBoolean("brand_craft").takeUnless { rs.wasNull() },
                price = rs.getBigDecimal("price")?.toDouble(),
                sizeMl = rs.getInt("size_ml").takeUnless { rs.wasNull() },
                ageDays = rs.getInt("age_days").takeUnless { rs.wasNull() },
                freshness = rs.getString("freshness"),
                ratingRaw = rs.getBigDecimal("rating_raw")?.toDouble(),
                ratingAvg = rs.getBigDecimal("rating_avg")?.toDouble(),
                ratingCount = rs.getInt("rating_count"),
                ratingAgeDays = rs.getInt("rating_age_days").takeUnless { rs.wasNull() },
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
        // Validación de entrada. La columna es `text` sin límite, así que sin
        // esto alguien puede cargar un nombre de un megabyte: no rompe la
        // base, pero llena la lista y el mapa de basura.
        val name = req.name.trim()
        if (name.length < 2) badRequest("el nombre es demasiado corto")
        if (name.length > 120) badRequest("el nombre es demasiado largo")
        if ((req.address?.length ?: 0) > 300) badRequest("la dirección es demasiado larga")
        if (req.lat !in -90.0..90.0 || req.lng !in -180.0..180.0) {
            badRequest("coordenadas fuera de rango")
        }
        // Un place_id de Google tiene un formato acotado; cualquier otra cosa
        // en ese campo es alguien probando.
        req.googlePlaceId?.let {
            if (it.length > 255 || !it.matches(Regex("[A-Za-z0-9_-]+"))) {
                badRequest("identificador de lugar inválido")
            }
        }

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
            name, req.lng, req.lat,
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
            name, req.address?.trim(), req.neighbourhood?.trim(), req.lng, req.lat,
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
