package com.birrapp.prices

import kotlinx.serialization.Serializable
import com.birrapp.core.Currency
import com.birrapp.core.Db
import com.birrapp.core.badRequest
import com.birrapp.core.notFound
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.core.tooManyRequests
import com.birrapp.core.update

@Serializable
data class NewPriceRequest(
    val barId: Long,
    val styleSlug: String,
    val price: Double,
    val sizeMl: Int = 473,
    /** Opcional: no siempre se sabe, y obligarla frenaría la carga. */
    val brandSlug: String? = null,
)

@Serializable
data class ConfirmPriceRequest(
    val styleSlug: String,
    val brandSlug: String? = null,
)

@Serializable
data class BrandDto(val slug: String, val name: String, val craft: Boolean)

@Serializable
data class NewBrandRequest(val name: String, val craft: Boolean = true)

@Serializable
data class PriceAccepted(
    val id: Long,
    /** true = quedó en cola de moderación por precio atípico, no publicado. */
    val heldForReview: Boolean,
    val message: String,
)

@Serializable
data class StyleDto(val slug: String, val name: String)

@Serializable
data class NewStyleRequest(val name: String)

/** Una birra concreta de la zona, para señalarla con nombre y apellido. */
@Serializable
data class AreaBeerDto(
    val barId: Long,
    val barName: String,
    val styleSlug: String,
    val styleName: String,
    val brandSlug: String?,
    val brandName: String?,
    val price: Double,
    val sizeMl: Int,
    /** La edad viaja siempre: un precio sin su antigüedad al lado es mentira. */
    val ageDays: Int,
    /** El promedio real, el que se muestra. Null si nadie votó. */
    val ratingRaw: Double?,
    val ratingCount: Int,
)

/**
 * Resumen de precios de un radio. Todos los montos están normalizados a una
 * pinta de 473 ml — ver [PriceRepo.areaStats].
 */
@Serializable
data class AreaStatsDto(
    val samples: Int,
    val bars: Int,
    val avgPint: Double?,
    val medianPint: Double?,
    val minPint: Double?,
    val maxPint: Double?,
    val cheapest: AreaBeerDto?,
    /** Mejor relación nota/precio. Null si ninguna birra de la zona tiene votos. */
    val bestValue: AreaBeerDto?,
    /**
     * La moneda de TODOS los números de acá. Ver [PriceRepo.areaStats]: si en
     * el radio conviven dos monedas, esto es la que más precios tiene y el
     * resto queda afuera de la cuenta.
     */
    val currency: String = com.birrapp.core.Currency.DEFAULT,
    /** Cuántos precios del radio quedaron afuera por estar en otra moneda. */
    val otherCurrencies: Int = 0,
)

/**
 * Nombre libre → slug del vocabulario. Compartido por marcas y estilos: son
 * la misma operación y con dos copias se separan al primer arreglo.
 */
private fun slugify(name: String): String = name.lowercase()
    .replace(Regex("[^a-z0-9áéíóúñü ]"), "")
    .trim().replace(Regex("\\s+"), "-")
    .replace("á", "a").replace("é", "e").replace("í", "i")
    .replace("ó", "o").replace("ú", "u").replace("ñ", "n").replace("ü", "u")
    .take(60)

/** Cuántas horas hay que esperar para volver a reportar el mismo (bar, estilo). */
private const val REPORT_COOLDOWN_HOURS = 6

/** Un precio a más de N veces la mediana del estilo se retiene para revisión. */
private const val OUTLIER_FACTOR = 3.0

/** Mínimo de datos antes de que la mediana signifique algo. */
private const val OUTLIER_MIN_SAMPLES = 5

/**
 * Radio dentro del cual se buscan precios de referencia para decidir si uno es
 * atípico.
 *
 * 25 km es una ciudad y su alrededor: el área dentro de la cual tiene sentido
 * decir "acá la pinta sale más o menos esto". Más grande empieza a mezclar
 * ciudades con costos de vida distintos —que es el problema que este radio
 * viene a resolver—, y más chico deja sin referencia a cualquier barrio que
 * todavía tenga pocos precios cargados.
 */
private const val OUTLIER_RADIUS_M = 25_000

/**
 * Techo absoluto del precio.
 *
 * La columna es numeric(12,2), así que la base ya rechaza cualquier cosa por
 * encima de 10^10 — pero lo hace con "numeric field overflow", que sale como
 * error 500 y no le dice nada a quien lo cargó. Este tope corta antes y
 * devuelve un mensaje entendible.
 *
 * 10 millones de pesos es absurdo para una pinta hoy, y deja margen para
 * años de inflación antes de que haya que tocarlo.
 */
private const val MAX_PRICE = 10_000_000.0

class PriceRepo(private val db: Db) {

    fun brands(): List<BrandDto> = db.conn {
        it.query(
            """
            SELECT slug, name, craft FROM brands
            WHERE status = 'approved'
            -- Artesanales primero: es lo que más se carga en esta app.
            ORDER BY craft DESC, name
            """.trimIndent(),
        ) { rs -> BrandDto(rs.getString("slug"), rs.getString("name"), rs.getBoolean("craft")) }
    }

    /**
     * Alta de marca por un usuario. Queda pendiente hasta que un moderador la
     * apruebe: las marcas son una cola larga y la lista tiene que poder
     * crecer, pero sin que cualquiera meta basura en el vocabulario.
     */
    fun createBrand(req: NewBrandRequest, userId: Long): BrandDto = db.conn { c ->
        val name = req.name.trim()
        if (name.length < 2) badRequest("el nombre es demasiado corto")
        if (name.length > 60) badRequest("el nombre es demasiado largo")

        val slug = slugify(name)
        if (slug.isBlank()) badRequest("ese nombre no es válido")

        val existing = c.queryOne(
            "SELECT slug, name, craft FROM brands WHERE slug = ?", slug,
        ) { rs -> BrandDto(rs.getString("slug"), rs.getString("name"), rs.getBoolean("craft")) }
        if (existing != null) return@conn existing

        c.queryOne(
            "INSERT INTO brands (slug, name, craft, status, created_by) " +
                "VALUES (?, ?, ?, 'pending', ?) RETURNING slug, name, craft",
            slug, name, req.craft, userId,
        ) { rs -> BrandDto(rs.getString("slug"), rs.getString("name"), rs.getBoolean("craft")) }!!
    }

    fun pendingBrands(): List<BrandDto> = db.conn {
        it.query(
            "SELECT slug, name, craft FROM brands WHERE status = 'pending' ORDER BY created_at",
        ) { rs -> BrandDto(rs.getString("slug"), rs.getString("name"), rs.getBoolean("craft")) }
    }

    fun setBrandStatus(slug: String, status: String): Boolean = db.conn {
        it.update(
            "UPDATE brands SET status = ?::moderation_status WHERE slug = ?", status, slug,
        ) > 0
    }

    fun styles(): List<StyleDto> = db.conn {
        it.query(
            "SELECT slug, name_es FROM beer_styles WHERE active AND status = 'approved' " +
                "ORDER BY sort_order, name_es",
        ) { rs -> StyleDto(rs.getString("slug"), rs.getString("name_es")) }
    }

    /**
     * Alta de estilo por un usuario (BIR-35). Queda pendiente de moderación.
     *
     * Mismo trato que las marcas, y por el mismo motivo: el vocabulario
     * cerrado es lo que permite comparar IPA contra IPA, pero uno que no crece
     * deja afuera a la birra que la persona tiene enfrente y la obliga a
     * cargarla mal. `sort_order` va al fondo: el orden de la lista lo curó
     * alguien y un estilo nuevo no se gana el primer lugar por ser nuevo.
     */
    fun createStyle(req: NewStyleRequest, userId: Long): StyleDto = db.conn { c ->
        val name = req.name.trim()
        if (name.length < 2) badRequest("el nombre es demasiado corto")
        if (name.length > 40) badRequest("el nombre es demasiado largo")

        val slug = slugify(name)
        if (slug.isBlank()) badRequest("ese nombre no es válido")

        // Ya existe: se devuelve el que hay, aprobado o no. Proponer dos veces
        // lo mismo no puede fallar ni crear un duplicado.
        c.queryOne("SELECT slug, name_es FROM beer_styles WHERE slug = ?", slug) { rs ->
            StyleDto(rs.getString("slug"), rs.getString("name_es"))
        }?.let { return@conn it }

        c.queryOne(
            "INSERT INTO beer_styles (slug, name_es, sort_order, status, created_by) " +
                "VALUES (?, ?, 900, 'pending', ?) RETURNING slug, name_es",
            slug, name, userId,
        ) { rs -> StyleDto(rs.getString("slug"), rs.getString("name_es")) }!!
    }

    fun pendingStyles(): List<StyleDto> = db.conn {
        it.query(
            "SELECT slug, name_es FROM beer_styles WHERE status = 'pending' ORDER BY id",
        ) { rs -> StyleDto(rs.getString("slug"), rs.getString("name_es")) }
    }

    /**
     * Aprobar o rechazar un estilo propuesto.
     *
     * Rechazar NO borra la fila: puede haber precios y birras anotadas
     * colgando de ella, y `style_id` en `price_reports` es ON DELETE RESTRICT
     * justamente para que un rechazo no se lleve puesto un precio. Queda
     * 'rejected' y deja de ofrecerse.
     */
    fun setStyleStatus(slug: String, status: String): Boolean = db.conn {
        it.update(
            "UPDATE beer_styles SET status = ?::moderation_status WHERE slug = ?", status, slug,
        ) > 0
    }

    /**
     * Stats de precio de una zona (BIR-33).
     *
     * Todo se normaliza a 473 ml antes de promediar. Sin eso, un schop de 330
     * y una pinta de 473 se promedian como si fueran lo mismo y el número
     * baja cuando en realidad cambió el tamaño del vaso. El promedio sale
     * siempre en "lo que sale una pinta", que es la pregunta que la gente hace.
     *
     * Los `stale` quedan afuera, igual que en el orden "más barata": un
     * promedio construido con precios de hace tres meses no es el promedio de
     * hoy, y en pesos eso es mentir.
     */
    fun areaStats(
        lat: Double, lng: Double, radiusMeters: Int,
        styleSlug: String? = null, brandSlug: String? = null,
    ): AreaStatsDto = db.conn { c ->
        // Primero, en qué moneda está la zona.
        //
        // Promediar 8.000 pesos con 6 libras no da un precio, da un número sin
        // significado. Y convertir no es opción: necesita cotizaciones en vivo,
        // y una cotización vieja miente igual que un precio viejo.
        //
        // Así que se elige la moneda con más precios en el radio y el resto
        // queda afuera, diciéndolo: `otherCurrencies` viaja para que la
        // pantalla pueda avisar que hay precios que no está contando. Sólo
        // pasa cerca de una frontera; en el 99% de los casos da una sola.
        val monedas = c.query(
            """
            SELECT cp.currency, count(*)::int AS n
            FROM v_current_prices cp
            JOIN bars b ON b.id = cp.bar_id AND b.status = 'approved'
            WHERE cp.freshness <> 'stale'
              AND ST_DWithin(b.location, ST_MakePoint(?, ?)::geography, ?)
              AND (?::text IS NULL OR cp.style_slug = ?::text)
              AND (?::text IS NULL OR cp.brand_slug = ?::text)
            GROUP BY cp.currency ORDER BY n DESC, cp.currency
            """.trimIndent(),
            lng, lat, radiusMeters, styleSlug, styleSlug, brandSlug, brandSlug,
        ) { rs -> rs.getString("currency") to rs.getInt("n") }

        val currency = monedas.firstOrNull()?.first ?: Currency.DEFAULT
        val otras = monedas.drop(1).sumOf { it.second }
        // Se arma una sola vez y se usa en las tres consultas: los tres números
        // tienen que salir del mismo conjunto de birras o no son comparables.
        val from = """
            FROM v_current_prices cp
            JOIN bars b ON b.id = cp.bar_id AND b.status = 'approved'
            LEFT JOIN v_style_ratings sr
              ON sr.bar_id = cp.bar_id AND sr.style_id = cp.style_id
             AND sr.brand_id IS NOT DISTINCT FROM cp.brand_id
            WHERE cp.freshness <> 'stale'
              AND ST_DWithin(b.location, ST_MakePoint(?, ?)::geography, ?)
              AND (?::text IS NULL OR cp.style_slug = ?::text)
              AND (?::text IS NULL OR cp.brand_slug = ?::text)
              AND cp.currency = ?
        """.trimIndent()
        val args = arrayOf<Any?>(
            lng, lat, radiusMeters, styleSlug, styleSlug, brandSlug, brandSlug, currency,
        )

        val head = c.queryOne(
            """
            SELECT count(*)::int AS samples,
                   count(DISTINCT cp.bar_id)::int AS bars,
                   avg(cp.price / cp.size_ml * 473)::float8 AS avg_pint,
                   percentile_cont(0.5) WITHIN GROUP (
                       ORDER BY (cp.price / cp.size_ml * 473)
                   )::float8 AS median_pint,
                   min(cp.price / cp.size_ml * 473)::float8 AS min_pint,
                   max(cp.price / cp.size_ml * 473)::float8 AS max_pint
            $from
            """.trimIndent(),
            *args,
        ) { rs ->
            AreaStatsDto(
                samples = rs.getInt("samples"),
                bars = rs.getInt("bars"),
                avgPint = rs.getDouble("avg_pint").takeUnless { rs.wasNull() },
                medianPint = rs.getDouble("median_pint").takeUnless { rs.wasNull() },
                minPint = rs.getDouble("min_pint").takeUnless { rs.wasNull() },
                maxPint = rs.getDouble("max_pint").takeUnless { rs.wasNull() },
                cheapest = null, bestValue = null,
                currency = currency, otherCurrencies = otras,
            )
        }!!
        if (head.samples == 0) return@conn head

        val cheapest = c.queryOne(
            "$BEER_COLS $from ORDER BY (cp.price / cp.size_ml) ASC LIMIT 1",
            *args, map = ::mapAreaBeer,
        )

        // "El mejor de la zona": nota por peso, no la nota más alta ni el
        // precio más bajo. Una birra sin votos no puede ganar —no hay nada que
        // decir de su calidad— y por eso se usa `rating_avg`, que empuja hacia
        // la media global: si no, una sola persona votando 5 a la birra más
        // barata se lleva el puesto sola.
        val best = c.queryOne(
            "$BEER_COLS $from AND sr.rating_count > 0 " +
                "ORDER BY (sr.rating_avg / (cp.price / cp.size_ml * 473)) DESC LIMIT 1",
            *args, map = ::mapAreaBeer,
        )

        head.copy(cheapest = cheapest, bestValue = best)
    }

    /**
     * Inserta un reporte de precio. SIEMPRE INSERT, nunca UPDATE — el
     * histórico es el activo más valioso del proyecto y se pierde para
     * siempre si se pisan filas.
     */
    fun report(req: NewPriceRequest, userId: Long, isConfirmation: Boolean = false): PriceAccepted =
        db.tx { c ->
            if (req.price <= 0) badRequest("el precio tiene que ser mayor a cero")
            if (!req.price.isFinite()) badRequest("ese precio no es un número válido")
            if (req.price > MAX_PRICE) {
                badRequest("ese precio es demasiado alto, revisá si no sobra un cero")
            }
            if (req.sizeMl !in 100..2000) badRequest("tamaño fuera de rango (100-2000 ml)")

            val styleId = c.queryOne(
                "SELECT id FROM beer_styles WHERE slug = ? AND active", req.styleSlug,
            ) { it.getLong("id") } ?: notFound("estilo desconocido: ${req.styleSlug}")

            // La marca puede venir sin aprobar todavía: quien la creó puede
            // usarla enseguida, y el moderador decide después si queda.
            val brandId = req.brandSlug?.let { slug ->
                c.queryOne("SELECT id FROM brands WHERE slug = ?", slug) { it.getLong("id") }
                    ?: notFound("marca desconocida: $slug")
            }

            // La moneda sale del bar, no de quien reporta: es una propiedad
            // del lugar. Si cada persona trajera la suya, el mismo bar
            // terminaría con una lista mezclada donde "más barata" no
            // significa nada.
            val currency = c.queryOne(
                "SELECT currency FROM bars WHERE id = ? AND status = 'approved'", req.barId,
            ) { it.getString("currency") }
                ?: notFound("no existe un bar aprobado con id ${req.barId}")

            // Rate limit por (usuario, bar, estilo). Sin esto una sola persona
            // puede mover el precio de un bar tantas veces como quiera.
            val recent = c.queryOne(
                """
                SELECT count(*) AS n FROM price_reports
                WHERE reported_by = ? AND bar_id = ? AND style_id = ?
                  AND brand_id IS NOT DISTINCT FROM ?
                  AND created_at > now() - make_interval(hours => ?)
                """.trimIndent(),
                userId, req.barId, styleId, brandId, REPORT_COOLDOWN_HOURS,
            ) { it.getInt("n") } ?: 0
            if (recent > 0) {
                tooManyRequests(
                    "ya reportaste esta cerveza en este bar hace menos de " +
                        "$REPORT_COOLDOWN_HOURS horas",
                )
            }

            // Detección de outliers contra la mediana de LOS BARES DE AL LADO,
            // en la misma moneda. Normalizada a precio por litro: comparar una
            // pinta de 473 ml contra un schop de 330 ml daría falsos positivos
            // constantes.
            //
            // La referencia es geográfica y no global, que es la diferencia
            // entre detectar precios raros y castigar a quien carga desde otro
            // lado. Filtrar sólo por moneda no alcanza:
            //
            //   * Una misma moneda cubre lugares con precios muy distintos.
            //     Una pinta en Dublín y una en Lisboa son las dos en euros y
            //     no se parecen en nada; contra la mediana del euro entero,
            //     media Irlanda entra como "cara" y medio Portugal como
            //     "sospechosamente barata".
            //   * Y al revés: la mediana global de un estilo tapa la variación
            //     local, que es justo donde vive el precio raro que queremos
            //     encontrar — un bar cobrando el triple que los tres de la
            //     misma cuadra.
            //
            // Sin suficientes vecinos NO se compara contra nada: se deja pasar.
            // Retener el precio legítimo de alguien que acaba de descubrir la
            // app en una ciudad nueva es mucho peor que dejar entrar uno raro,
            // que además se ve con su antigüedad al lado y lo puede denunciar
            // cualquiera.
            val median = c.queryOne(
                """
                SELECT percentile_cont(0.5) WITHIN GROUP (
                           ORDER BY (cp.price / cp.size_ml * 1000)
                       ) AS m,
                       count(*) AS n
                FROM v_current_prices cp
                JOIN bars b ON b.id = cp.bar_id
                WHERE cp.style_id = ? AND cp.freshness <> 'stale' AND cp.currency = ?
                  AND ST_DWithin(
                        b.location,
                        (SELECT location FROM bars WHERE id = ?),
                        ?)
                """.trimIndent(),
                styleId, currency, req.barId, OUTLIER_RADIUS_M,
            ) { rs -> rs.getDouble("m").takeUnless { rs.wasNull() } to rs.getInt("n") }

            val perLitre = req.price / req.sizeMl * 1000
            val (medianPerLitre, sampleCount) = median ?: (null to 0)
            val isOutlier = medianPerLitre != null &&
                sampleCount >= OUTLIER_MIN_SAMPLES &&
                (perLitre > medianPerLitre * OUTLIER_FACTOR ||
                    perLitre < medianPerLitre / OUTLIER_FACTOR)

            val id = c.queryOne(
                """
                INSERT INTO price_reports
                    (bar_id, style_id, brand_id, price, size_ml, currency, reported_by,
                     status, is_confirmation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?::content_status, ?)
                RETURNING id
                """.trimIndent(),
                req.barId, styleId, brandId, req.price, req.sizeMl, currency, userId,
                // Un outlier entra como 'removed': queda registrado pero no
                // aparece en el mapa hasta que un moderador lo habilite.
                if (isOutlier) "removed" else "active",
                isConfirmation,
            ) { it.getLong("id") }!!

            if (isOutlier) {
                c.update(
                    "INSERT INTO flags (target_type, target_id, reporter_id, reason) " +
                        "VALUES ('price', ?, ?, ?)",
                    id, userId,
                    ("auto: %.0f/L contra una mediana de %.0f/L (%s) " +
                        "entre los bares a menos de %d km")
                        .format(perLitre, medianPerLitre, currency, OUTLIER_RADIUS_M / 1000),
                )
            }

            PriceAccepted(
                id = id,
                heldForReview = isOutlier,
                message = if (isOutlier) {
                    "Lo mandamos a revisión porque está muy lejos del resto de los precios. " +
                        "Si es correcto, un moderador lo publica."
                } else {
                    "¡Gracias! Ya está en el mapa."
                },
            )
        }

    /**
     * "Sigue igual": reinserta el precio vigente con fecha de hoy.
     *
     * Esta es la operación que mantiene vivo el dataset. Tiene que costar un
     * solo tap — si confirmar cuesta lo mismo que reportar, nadie confirma y
     * todo el mapa envejece.
     */
    fun confirm(
        barId: Long, styleSlug: String, brandSlug: String?, userId: Long,
    ): PriceAccepted = db.conn { c ->
        val current = c.queryOne(
            """
            SELECT cp.price, cp.size_ml FROM v_current_prices cp
            WHERE cp.bar_id = ? AND cp.style_slug = ?
              AND cp.brand_slug IS NOT DISTINCT FROM ?
            """.trimIndent(),
            barId, styleSlug, brandSlug,
        ) { rs -> rs.getBigDecimal("price").toDouble() to rs.getInt("size_ml") }
            ?: notFound("no hay un precio vigente para confirmar")

        report(
            NewPriceRequest(barId, styleSlug, current.first, current.second, brandSlug),
            userId,
            isConfirmation = true,
        )
    }

    fun setStatus(priceId: Long, status: String, moderatorId: Long): Boolean = db.conn {
        it.update(
            "UPDATE price_reports SET status = ?::content_status, removed_by = ? WHERE id = ?",
            status, moderatorId, priceId,
        ) > 0
    }

    /**
     * Histórico de una birra. Lo interesante que ningún competidor tiene.
     *
     * Va por (bar, estilo, marca) y no por (bar, estilo): mezclar la IPA de
     * Antares con la de Juguetes Perdidos daría una serie que sube y baja
     * porque son dos cervezas distintas, no porque el precio se haya movido.
     *
     * `brandSlug` null significa "sin marca", que es una birra concreta, no un
     * comodín: la comparación es contra NULL y no "cualquier marca".
     */
    fun history(
        barId: Long,
        styleSlug: String,
        brandSlug: String? = null,
        limit: Int = 50,
    ): List<PricePoint> = db.conn { c ->
        val brandId = brandSlug?.let {
            c.queryOne("SELECT id FROM brands WHERE slug = ?", it) { rs -> rs.getInt("id") }
                ?: notFound("marca desconocida: $it")
        }
        c.query(
            """
            SELECT pr.price, pr.size_ml, pr.created_at
            FROM price_reports pr
            JOIN beer_styles bs ON bs.id = pr.style_id
            WHERE pr.bar_id = ? AND bs.slug = ? AND pr.status = 'active'
              AND pr.brand_id IS NOT DISTINCT FROM ?
            ORDER BY pr.created_at DESC LIMIT ?
            """.trimIndent(),
            barId, styleSlug, brandId, limit,
        ) { rs ->
            PricePoint(
                price = rs.getBigDecimal("price").toDouble(),
                sizeMl = rs.getInt("size_ml"),
                at = rs.getTimestamp("created_at").toInstant().toString(),
            )
        }
    }

    private companion object {
        /** Las columnas de una birra de la zona. Se pega delante del FROM común. */
        val BEER_COLS = """
            SELECT cp.bar_id, b.name AS bar_name,
                   cp.style_slug, cp.style_name, cp.brand_slug, cp.brand_name,
                   cp.price, cp.size_ml, cp.age_days,
                   sr.rating_raw, coalesce(sr.rating_count, 0) AS rating_count
        """.trimIndent()

        fun mapAreaBeer(rs: java.sql.ResultSet) = AreaBeerDto(
            barId = rs.getLong("bar_id"),
            barName = rs.getString("bar_name"),
            styleSlug = rs.getString("style_slug"),
            styleName = rs.getString("style_name"),
            brandSlug = rs.getString("brand_slug"),
            brandName = rs.getString("brand_name"),
            price = rs.getBigDecimal("price").toDouble(),
            sizeMl = rs.getInt("size_ml"),
            ageDays = rs.getInt("age_days"),
            ratingRaw = rs.getBigDecimal("rating_raw")?.toDouble(),
            ratingCount = rs.getInt("rating_count"),
        )
    }
}

@Serializable
data class PricePoint(val price: Double, val sizeMl: Int, val at: String)
