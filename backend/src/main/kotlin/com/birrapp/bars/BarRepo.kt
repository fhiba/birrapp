package com.birrapp.bars

import com.birrapp.core.Currency
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
        styleSlugs: List<String> = emptyList(),
        minRating: Double? = null,
    ): List<BarPinDto> {
        // Con filtro de estilo, el precio del pin tiene que ser el DE ESE
        // estilo. Antes el filtro sólo elegía qué bares aparecían y el precio
        // seguía saliendo de `v_bar_headline`, que es el más barato de
        // cualquier estilo: filtrando IPA se veía el precio de la rubia. Eso
        // vacía de sentido al filtro, que es justamente comparar lo mismo
        // contra lo mismo.
        val filtered = styleSlugs.isNotEmpty()

        val priceCols = if (filtered) {
            "cp.price AS from_price, cp.age_days AS freshest_age_days"
        } else {
            "h.from_price, h.freshest_age_days"
        }

        /*
         * Varios estilos a la vez, con LATERAL y no con un JOIN a secas.
         *
         * El filtro pasó de uno a varios ("IPA o APA"), y un `= ANY(?)` sobre
         * `v_current_prices` devuelve una fila por estilo que coincida: un bar
         * con IPA y APA aparecería dos veces en el mapa, como dos pines
         * encimados con precios distintos.
         *
         * El LATERAL se queda con **la más barata de las que coinciden**, que
         * es la respuesta correcta a "¿cuánto me sale una IPA o una APA acá?"
         * y deja una fila por bar, como antes.
         */
        val joins = if (filtered) {
            """
            JOIN LATERAL (
                SELECT cp.price, cp.age_days
                FROM v_current_prices cp
                WHERE cp.bar_id = b.id
                  AND cp.style_slug = ANY (?)
                  AND cp.freshness <> 'stale'
                ORDER BY cp.price ASC
                LIMIT 1
            ) cp ON true
            """.trimIndent()
        } else {
            "LEFT JOIN v_bar_headline h ON h.bar_id = b.id"
        }

        /*
         * Piso de estrellas.
         *
         * Filtra por `rating_raw` —la nota que se muestra— y no por
         * `rating_sort`, que es la que lleva shrinkage. Es al revés que el
         * orden, y a propósito: si alguien filtra "4 o más" y en la lista
         * aparece un bar que dice 3,9, el filtro parece roto. Lo que se ve y
         * lo que se filtra tienen que ser el mismo número.
         *
         * Que un 5,0 de un solo voto pase el filtro es aceptable porque la
         * fila muestra el conteo al lado: "5,0 (1)" se lee solo. Esconderlo
         * sería decidir por la persona con información que ella tiene.
         *
         * Un bar sin votos no pasa: `rating_raw` es NULL y la comparación da
         * NULL. Es lo correcto — "no se sabe" no es "cumple".
         */
        val ratingGate = if (minRating != null) "AND r.rating_raw >= ?" else ""

        val orderBy = when (sort) {
            BarSort.distance -> "distance_meters ASC"
            BarSort.cheapest ->
                if (filtered) "cp.price ASC, distance_meters ASC"
                else "h.from_price ASC NULLS LAST, distance_meters ASC"
            // Por la nota con shrinkage, no por la que se muestra: un bar con
            // un solo voto de 5 no puede encabezar el ranking. NULLS LAST
            // porque un bar sin votos no es un bar mal puntuado — no se sabe,
            // y "no se sabe" va al final, igual que un precio stale.
            BarSort.rated -> "r.rating_sort DESC NULLS LAST, distance_meters ASC"
        }

        val sql = """
            SELECT b.id, b.name,
                   ST_Y(b.location::geometry) AS lat,
                   ST_X(b.location::geometry) AS lng,
                   $priceCols,
                   b.currency,
                   r.rating_raw, coalesce(r.rating_count, 0) AS rating_count,
                   ST_Distance(b.location, ST_MakePoint(?, ?)::geography) AS distance_meters
            FROM bars b
            $joins
            LEFT JOIN v_bar_ratings r ON r.bar_id = b.id
            WHERE b.status = 'approved'
              AND ST_DWithin(b.location, ST_MakePoint(?, ?)::geography, ?)
              $ratingGate
            ORDER BY $orderBy
            LIMIT ?
        """.trimIndent()

        // El orden importa: los slugs van en el JOIN, que en el SQL aparece
        // antes del WHERE, pero después del ST_Distance del SELECT.
        return db.conn { c ->
            val args = buildList<Any?> {
                add(lng); add(lat)            // ST_MakePoint es (x=lng, y=lat)
                if (filtered) add(c.createArrayOf("text", styleSlugs.toTypedArray()))
                add(lng); add(lat); add(radiusMeters)
                if (minRating != null) add(minRating)
                add(limit)
            }
            c.query(sql, *args.toTypedArray(), map = ::mapPin)
        }
    }

    private fun mapPin(rs: ResultSet) = BarPinDto(
        id = rs.getLong("id"),
        name = rs.getString("name"),
        lat = rs.getDouble("lat"),
        lng = rs.getDouble("lng"),
        fromPrice = rs.getBigDecimal("from_price")?.toDouble(),
        freshestAgeDays = rs.getInt("freshest_age_days").takeUnless { rs.wasNull() },
        distanceMeters = rs.getDouble("distance_meters").takeUnless { rs.wasNull() },
        currency = rs.getString("currency"),
        rating = rs.getBigDecimal("rating_raw")?.toDouble(),
        ratingCount = rs.getInt("rating_count"),
    )

    /**
     * Los favoritos de una persona, como pines (BIR-37 / BIR-5).
     *
     * Devuelve lo mismo que `nearby` para que la lista y el mapa los dibujen
     * con el componente que ya tienen. `distance_meters` es null salvo que se
     * pase un punto: los favoritos se miran sin estar cerca de ninguno.
     */
    /**
     * Los favoritos de una persona.
     *
     * Con techo y sin cursor (BIR-44). El corte a 200 no es paginación: es que
     * esto no puede ser una consulta sin límite, y a la vez nadie marca
     * doscientos bares como favoritos. El día que alguien lo haga, el que
     * doscientos uno no aparezca es un problema mucho más chico que bajarse la
     * lista entera en cada apertura de la pantalla.
     *
     * ponytail: techo duro, cursor cuando alguien pase de 200 favoritos.
     *
     * **Acepta el mismo filtro y el mismo orden que `nearby`, y no por
     * simetría.** Prendido el filtro de favoritos, la lista dejaba de
     * responder a la píldora de estilo y a "más cerca"/"más barata": los
     * controles seguían ahí, se podían tocar, y no pasaba nada. Esto ordenaba
     * siempre por cuándo lo habías marcado.
     *
     * Lo del orden tiene una consecuencia que no se ve hasta usarlo: con el
     * punto secundario puesto —mantener apretado el mapa para mirar otra
     * zona— la distancia SÍ se calculaba desde ese punto, así que cada fila
     * decía bien a cuánto estaba, pero la lista venía ordenada por otra cosa.
     * O sea "a 200 m" debajo de "a 4,1 km", que se lee como un error de la
     * app.
     */
    fun favorites(
        userId: Long,
        fromLat: Double?,
        fromLng: Double?,
        sort: BarSort = BarSort.distance,
        styleSlugs: List<String> = emptyList(),
        minRating: Double? = null,
        limit: Int = 200,
    ): List<BarPinDto> = db.conn { c ->
        // Con filtro de estilo el precio de la fila tiene que ser el DE ESE
        // estilo, no el más barato del bar: es el mismo JOIN que usa `nearby`,
        // y por el mismo motivo.
        val filtered = styleSlugs.isNotEmpty()
        // LATERAL por lo mismo que en `nearby`: con varios estilos, un JOIN a
        // secas devuelve una fila por estilo que coincida y el bar aparece
        // repetido. Se queda con la más barata de las que coinciden.
        val joins = if (filtered) {
            """
            JOIN LATERAL (
                SELECT cp.price, cp.age_days
                FROM v_current_prices cp
                WHERE cp.bar_id = b.id
                  AND cp.style_slug = ANY (?)
                  AND cp.freshness <> 'stale'
                ORDER BY cp.price ASC
                LIMIT 1
            ) cp ON true
            """.trimIndent()
        } else {
            "LEFT JOIN v_bar_headline h ON h.bar_id = b.id"
        }
        val ratingGate = if (minRating != null) "AND r.rating_raw >= ?" else ""
        val price = if (filtered) "cp.price AS from_price, cp.age_days AS freshest_age_days"
                    else "h.from_price, h.freshest_age_days"

        // Sin ubicación no hay distancia, así que ordenar por ella deja todo
        // empatado en NULL. En ese caso cae a lo de siempre: el último que
        // marcaste, arriba.
        val porDistancia = if (fromLat != null) "distance_meters ASC" else "f.created_at DESC"
        val orderBy = when (sort) {
            BarSort.distance -> porDistancia
            BarSort.cheapest ->
                if (filtered) "cp.price ASC, $porDistancia"
                else "h.from_price ASC NULLS LAST, $porDistancia"
            BarSort.rated -> "r.rating_sort DESC NULLS LAST, $porDistancia"
        }

        // `buildList<Any?>` explícito: sin el tipo, Kotlin infiere la
        // intersección de Double/String/Long y `vararg` reificado se queda con
        // el supertipo común, que es un aviso de compilación y una fuente
        // silenciosa de líos al pasar los parámetros.
        val args = buildList<Any?> {
            add(fromLat); add(fromLng); add(fromLat)
            if (filtered) add(c.createArrayOf("text", styleSlugs.toTypedArray()))
            add(userId)
            if (minRating != null) add(minRating)
            add(limit.coerceIn(1, 500))
        }

        c.query(
            """
            SELECT b.id, b.name,
                   ST_Y(b.location::geometry) AS lat,
                   ST_X(b.location::geometry) AS lng,
                   $price,
                   b.currency,
                   r.rating_raw, coalesce(r.rating_count, 0) AS rating_count,
                   CASE WHEN ?::float8 IS NULL THEN NULL
                        ELSE ST_Distance(b.location, ST_MakePoint(?, ?)::geography) END
                        AS distance_meters
            FROM favorites f
            JOIN bars b ON b.id = f.bar_id AND b.status = 'approved'
            $joins
            LEFT JOIN v_bar_ratings r ON r.bar_id = b.id
            WHERE f.user_id = ?
              $ratingGate
            ORDER BY $orderBy
            LIMIT ?
            """.trimIndent(),
            *args.toTypedArray(),
            map = ::mapPin,
        )
    }

    /**
     * Marca o desmarca un favorito. Idempotente en los dos sentidos: el botón
     * es un toggle y tocarlo dos veces rápido no puede romper nada.
     */
    fun setFavorite(userId: Long, barId: Long, on: Boolean) = db.conn { c ->
        if (on) {
            c.queryOne(
                "SELECT 1 AS x FROM bars WHERE id = ? AND status = 'approved'", barId,
            ) { it.getInt("x") } ?: com.birrapp.core.notFound("no existe un bar aprobado con id $barId")
            c.update(
                "INSERT INTO favorites (user_id, bar_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
                userId, barId,
            )
        } else {
            c.update("DELETE FROM favorites WHERE user_id = ? AND bar_id = ?", userId, barId)
        }
    }

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
                   b.currency,
                   r.rating_raw, coalesce(r.rating_count, 0) AS rating_count,
                   CASE WHEN ?::float8 IS NULL THEN NULL
                        ELSE ST_Distance(b.location, ST_MakePoint(?, ?)::geography) END
                        AS distance_meters
            FROM bars b
            LEFT JOIN v_bar_headline h ON h.bar_id = b.id
            LEFT JOIN v_bar_ratings r ON r.bar_id = b.id
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

    fun detail(
        id: Long, fromLat: Double?, fromLng: Double?, viewerId: Long? = null,
    ): BarDetailDto? = db.conn { c ->
        val bar = c.queryOne(
            """
            SELECT b.id, b.name, b.address, b.neighbourhood, b.status, b.google_place_id,
                   b.currency, b.country_code,
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
                currency = rs.getString("currency"),
                countryCode = rs.getString("country_code"),
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
                   cp.voters, cp.price_low, cp.price_high,
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
                voters = rs.getInt("voters").takeUnless { rs.wasNull() },
                priceLow = rs.getBigDecimal("price_low")?.toDouble(),
                priceHigh = rs.getBigDecimal("price_high")?.toDouble(),
            )
        }
        // Las birras propias en este bar. Se cuentan las cantidades y no las
        // filas: anotar "3 birras" de una es una fila.
        val mias = viewerId?.let {
            c.queryOne(
                "SELECT coalesce(sum(qty), 0)::int AS n FROM beer_logs " +
                    "WHERE user_id = ? AND bar_id = ?",
                it, id,
            ) { rs -> rs.getInt("n") } ?: 0
        }

        bar.copy(prices = prices, myBeers = mias)
    }

    /**
     * Alta comunitaria. Queda `pending` hasta que un moderador la apruebe.
     *
     * Antes rechaza duplicados obvios: mismo nombre a menos de 100 m casi
     * siempre es el mismo bar cargado dos veces. Sin esto el mapa se llena
     * de pines repetidos y los precios se parten entre ellos.
     */
    fun create(req: NewBarRequest, createdBy: Long, creatorCurrency: String? = null): Long =
        db.conn { c ->
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

        val country = req.countryCode?.trim()?.uppercase()?.takeIf { it.length == 2 }

        // La moneda, en orden de confianza: la que eligió quien lo carga gana
        // —hay bares que cobran en dólares en países que no los usan—, después
        // la del país que devolvió Google, y por último la de la persona, que
        // es la que más chance tiene de ser la del lugar donde está parada.
        val currency = Currency.normalize(req.currency)
            ?: Currency.ofCountry(country)
            ?: creatorCurrency
            ?: Currency.DEFAULT

        c.queryOne(
            """
            INSERT INTO bars (name, address, neighbourhood, location, status,
                              created_by, google_place_id, country_code, currency)
            VALUES (?, ?, ?, ST_MakePoint(?, ?)::geography, ?::moderation_status, ?, ?, ?, ?)
            RETURNING id
            """.trimIndent(),
            name, req.address?.trim(), req.neighbourhood?.trim(), req.lng, req.lat,
            status, createdBy, req.googlePlaceId, country, currency,
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
                   -- Un bar pendiente no tiene nada todavía: ni precio ni nota.
                   NULL::numeric AS rating_raw, 0 AS rating_count,
                   currency,
                   NULL::float8 AS distance_meters
            FROM bars WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?
            """.trimIndent(),
            limit, map = ::mapPin,
        )
    }
}
