package com.birrapp.prices

import kotlinx.serialization.Serializable
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
)

@Serializable
data class PriceAccepted(
    val id: Long,
    /** true = quedó en cola de moderación por precio atípico, no publicado. */
    val heldForReview: Boolean,
    val message: String,
)

@Serializable
data class StyleDto(val slug: String, val name: String)

/** Cuántas horas hay que esperar para volver a reportar el mismo (bar, estilo). */
private const val REPORT_COOLDOWN_HOURS = 6

/** Un precio a más de N veces la mediana del estilo se retiene para revisión. */
private const val OUTLIER_FACTOR = 3.0

/** Mínimo de datos antes de que la mediana signifique algo. */
private const val OUTLIER_MIN_SAMPLES = 5

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

    fun styles(): List<StyleDto> = db.conn {
        it.query(
            "SELECT slug, name_es FROM beer_styles WHERE active ORDER BY sort_order, name_es",
        ) { rs -> StyleDto(rs.getString("slug"), rs.getString("name_es")) }
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

            val barExists = c.queryOne(
                "SELECT 1 AS x FROM bars WHERE id = ? AND status = 'approved'", req.barId,
            ) { it.getInt("x") } != null
            if (!barExists) notFound("no existe un bar aprobado con id ${req.barId}")

            // Rate limit por (usuario, bar, estilo). Sin esto una sola persona
            // puede mover el precio de un bar tantas veces como quiera.
            val recent = c.queryOne(
                """
                SELECT count(*) AS n FROM price_reports
                WHERE reported_by = ? AND bar_id = ? AND style_id = ?
                  AND created_at > now() - make_interval(hours => ?)
                """.trimIndent(),
                userId, req.barId, styleId, REPORT_COOLDOWN_HOURS,
            ) { it.getInt("n") } ?: 0
            if (recent > 0) {
                tooManyRequests(
                    "ya reportaste este estilo en este bar hace menos de " +
                        "$REPORT_COOLDOWN_HOURS horas",
                )
            }

            // Detección de outliers contra la mediana vigente del estilo.
            // Normalizada a precio por litro: comparar una pinta de 473 ml
            // contra un schop de 330 ml daría falsos positivos constantes.
            val median = c.queryOne(
                """
                SELECT percentile_cont(0.5) WITHIN GROUP (
                           ORDER BY (price / size_ml * 1000)
                       ) AS m,
                       count(*) AS n
                FROM v_current_prices WHERE style_id = ? AND freshness <> 'stale'
                """.trimIndent(),
                styleId,
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
                    (bar_id, style_id, price, size_ml, reported_by, status, is_confirmation)
                VALUES (?, ?, ?, ?, ?, ?::content_status, ?)
                RETURNING id
                """.trimIndent(),
                req.barId, styleId, req.price, req.sizeMl, userId,
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
                    "auto: %.0f $/L contra una mediana de %.0f $/L para el estilo"
                        .format(perLitre, medianPerLitre),
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
    fun confirm(barId: Long, styleSlug: String, userId: Long): PriceAccepted = db.conn { c ->
        val current = c.queryOne(
            """
            SELECT cp.price, cp.size_ml FROM v_current_prices cp
            WHERE cp.bar_id = ? AND cp.style_slug = ?
            """.trimIndent(),
            barId, styleSlug,
        ) { rs -> rs.getBigDecimal("price").toDouble() to rs.getInt("size_ml") }
            ?: notFound("no hay un precio vigente para confirmar")

        report(
            NewPriceRequest(barId, styleSlug, current.first, current.second),
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

    /** Histórico por bar+estilo. Lo interesante que ningún competidor tiene. */
    fun history(barId: Long, styleSlug: String, limit: Int = 50): List<PricePoint> = db.conn {
        it.query(
            """
            SELECT pr.price, pr.size_ml, pr.created_at
            FROM price_reports pr
            JOIN beer_styles bs ON bs.id = pr.style_id
            WHERE pr.bar_id = ? AND bs.slug = ? AND pr.status = 'active'
            ORDER BY pr.created_at DESC LIMIT ?
            """.trimIndent(),
            barId, styleSlug, limit,
        ) { rs ->
            PricePoint(
                price = rs.getBigDecimal("price").toDouble(),
                sizeMl = rs.getInt("size_ml"),
                at = rs.getTimestamp("created_at").toInstant().toString(),
            )
        }
    }
}

@Serializable
data class PricePoint(val price: Double, val sizeMl: Int, val at: String)
