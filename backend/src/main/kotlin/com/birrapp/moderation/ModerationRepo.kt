package com.birrapp.moderation

import java.sql.ResultSet
import kotlinx.serialization.Serializable
import com.birrapp.core.Db
import com.birrapp.core.badRequest
import com.birrapp.core.conflict
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.core.tooManyRequests
import com.birrapp.core.update

@Serializable
data class NewFlagRequest(val targetType: String, val targetId: Long, val reason: String)

@Serializable
data class FlagDto(
    val id: Long,
    val targetType: String,
    val targetId: Long,
    val reason: String,
    val createdAt: String,
    val reporterName: String?,
    /** Texto del contenido denunciado, para no tener que ir a buscarlo. */
    val targetSummary: String?,
    /** Quién cargó lo denunciado. NO es quien denunció: ver [reporterName]. */
    val author: AuthorDto? = null,
    /** Qué se quiso cargar y dónde. */
    val contrib: ContribDto? = null,
)

/**
 * Quién hizo el aporte que hay que mirar.
 *
 * La antigüedad de la cuenta y el ban son la mitad de la decisión: un precio
 * raro de una cuenta de ayer no es lo mismo que uno de alguien que viene
 * cargando hace meses. Antes esto no viajaba y había que ir a buscarlo al
 * dashboard, con el id en la mano.
 */
@Serializable
data class AuthorDto(
    val id: Long,
    val name: String,
    /** Días desde que se registró. */
    val ageDays: Int,
    val banned: Boolean,
)

/**
 * La operación que se quiere hacer: tal precio, de tal birra, en tal bar.
 *
 * Es lo que hace falta para decidir sin abrir otra pantalla. Sirve igual para
 * un precio denunciado, para la marca nueva que se usó al cargarlo y para el
 * estilo propuesto en esa misma carga: los tres son el mismo aporte visto
 * desde distinto lado.
 */
@Serializable
data class ContribDto(
    val barId: Long? = null,
    val barName: String? = null,
    val styleName: String? = null,
    val brandName: String? = null,
    val price: Double? = null,
    val sizeMl: Int? = null,
    val currency: String? = null,
    val createdAt: String? = null,
)

/** Un bar cargado a mano, esperando aprobación, con todo lo que hay para validarlo. */
@Serializable
data class PendingBarDto(
    val id: Long,
    val name: String,
    val lat: Double,
    val lng: Double,
    val address: String? = null,
    val neighbourhood: String? = null,
    /** Si vino del buscador de Google. Un bar con place_id entra aprobado. */
    val googlePlaceId: String? = null,
    val countryCode: String? = null,
    val currency: String,
    val createdAt: String,
    val author: AuthorDto? = null,
)

/**
 * Las columnas de autor, iguales en las cuatro colas. `u` es el alias del
 * LEFT JOIN a users: es LEFT porque el autor puede haberse borrado la cuenta.
 */
internal const val AUTHOR_COLS =
    "u.id AS author_id, u.display_name AS author_name, " +
        "EXTRACT(DAY FROM (now() - u.created_at))::int AS author_age_days, " +
        "u.banned_at IS NOT NULL AS author_banned"

internal fun ResultSet.authorOrNull(): AuthorDto? {
    val id = getLong("author_id")
    if (wasNull()) return null
    return AuthorDto(
        id = id,
        name = getString("author_name") ?: "(sin nombre)",
        ageDays = getInt("author_age_days"),
        banned = getBoolean("author_banned"),
    )
}

internal fun ResultSet.contribOrNull(): ContribDto? {
    val barId = getLong("bar_id").takeUnless { wasNull() }
    val price = getBigDecimal("price")?.toDouble()
    if (barId == null && price == null) return null
    return ContribDto(
        barId = barId,
        barName = getString("bar_name"),
        styleName = getString("style_name"),
        brandName = getString("brand_name"),
        price = price,
        sizeMl = getInt("size_ml").takeUnless { wasNull() },
        currency = getString("currency"),
        createdAt = getTimestamp("contrib_at")?.toInstant()?.toString(),
    )
}

private val VALID_TARGETS = setOf("bar", "price", "review")
private const val MAX_FLAGS_PER_DAY = 20

@Serializable
data class ModerationSummaryDto(
    val pendingBars: Int,
    val openFlags: Int,
    /** Marcas que cargó un usuario y todavía nadie aprobó. */
    val pendingBrands: Int,
    /** Estilos propuestos por un usuario, sin revisar. Ver BIR-35. */
    val pendingStyles: Int = 0,
)

/** Una persona y lo que aportó. Para el dashboard, no para la app. */
@Serializable
data class DashboardUserDto(
    val id: Long,
    val displayName: String,
    val email: String,
    val avatarUrl: String?,
    val role: String,
    /** Días desde que se registró. */
    val ageDays: Int,
    val banned: Boolean,
    val prices: Int,
    val confirmations: Int,
    val bars: Int,
    val photos: Int,
    val ratings: Int,
    /** Días desde su último aporte. Null = nunca aportó nada. */
    val lastActiveDays: Int?,
    /**
     * Los aportes pesados. La fórmula —y por qué las confirmaciones pesan
     * menos— vive en [CONTRIBUTION_WEIGHT], única definición para las tres
     * queries que la usan; este número sale de ahí. No vive en el front por lo
     * mismo: dos copias se desincronizan.
     */
    val score: Int,
)

@Serializable
data class DashboardSummaryDto(
    val users: Int,
    val usersWeek: Int,
    val usersMonth: Int,
    /** Personas distintas que aportaron algo en 30 días, no cantidad de aportes. */
    val contributorsMonth: Int,
    val pricesWeek: Int,
    val barsWithFreshPrice: Int,
    val bars: Int,
)

class ModerationRepo(private val db: Db) {

    fun flag(req: NewFlagRequest, userId: Long) {
        if (req.targetType !in VALID_TARGETS) badRequest("tipo inválido: ${req.targetType}")
        if (req.reason.isBlank()) badRequest("hace falta un motivo")
        db.conn {
            // La tabla no tiene constraint única, así que sin esto la misma
            // persona puede denunciar el mismo precio infinitas veces y tapar
            // la cola de moderación — justo la herramienta que haría falta
            // para limpiar el desastre.
            val yaDenuncio = it.queryOne(
                """
                SELECT 1 AS x FROM flags
                WHERE reporter_id = ? AND target_type = ?::flag_target
                  AND target_id = ? AND resolved_at IS NULL
                """.trimIndent(),
                userId, req.targetType, req.targetId,
            ) { rs -> rs.getInt("x") } != null
            if (yaDenuncio) conflict("ya denunciaste esto y todavía está en revisión")

            val hoy = it.queryOne(
                """
                SELECT count(*) AS n FROM flags
                WHERE reporter_id = ? AND created_at > now() - make_interval(hours => 24)
                """.trimIndent(),
                userId,
            ) { rs -> rs.getInt("n") } ?: 0
            if (hoy >= MAX_FLAGS_PER_DAY) {
                tooManyRequests("llegaste al límite de denuncias por hoy")
            }

            it.update(
                "INSERT INTO flags (target_type, target_id, reporter_id, reason) " +
                    "VALUES (?::flag_target, ?, ?, ?)",
                req.targetType, req.targetId, userId, req.reason.take(500),
            )
        }
    }

    /**
     * Sólo los números, para el contador.
     *
     * Existe aparte de las listas porque el contador se pide desde Perfil, que
     * no muestra nada del contenido: bajarse doscientos bares y sus reportes
     * para dibujar un "3" sería absurdo.
     */
    fun summary(): ModerationSummaryDto = db.conn { c ->
        ModerationSummaryDto(
            pendingBars = c.queryOne(
                "SELECT count(*) AS n FROM bars WHERE status = 'pending'",
            ) { it.getInt("n") } ?: 0,
            openFlags = c.queryOne(
                "SELECT count(*) AS n FROM flags WHERE resolved_at IS NULL",
            ) { it.getInt("n") } ?: 0,
            pendingBrands = c.queryOne(
                "SELECT count(*) AS n FROM brands WHERE status = 'pending'",
            ) { it.getInt("n") } ?: 0,
            pendingStyles = c.queryOne(
                "SELECT count(*) AS n FROM beer_styles WHERE status = 'pending'",
            ) { it.getInt("n") } ?: 0,
        )
    }

    /**
     * Quién se anotó y qué cargó, de lo más nuevo a lo más viejo.
     *
     * Los contadores salen de agregados por usuario y no de un `count(*)` por
     * fila: con una subconsulta por columna, la pantalla hacía cinco consultas
     * por cada persona de la lista.
     *
     * Los precios se cuentan separando carga manual de "Sigue igual". Sumarlos
     * en un solo número haría que alguien que sólo confirma parezca tan activo
     * como alguien que releva precios nuevos, y son dos aportes distintos:
     * confirmar mantiene fresco lo que ya está, cargar agrega lo que no.
     */
    fun recentUsers(limit: Int = 100): List<DashboardUserDto> = db.conn {
        it.query(
            """
            WITH p AS (
                SELECT reported_by AS uid,
                       count(*) FILTER (WHERE NOT is_confirmation) AS prices,
                       count(*) FILTER (WHERE is_confirmation)     AS confirmations,
                       max(created_at)                             AS last_at
                FROM price_reports WHERE status = 'active' AND reported_by IS NOT NULL
                GROUP BY reported_by
            ), b AS (
                SELECT created_by AS uid, count(*) AS bars, max(created_at) AS last_at
                FROM bars WHERE created_by IS NOT NULL GROUP BY created_by
            ), f AS (
                SELECT user_id AS uid, count(*) AS photos, max(created_at) AS last_at
                FROM bar_photos WHERE status = 'active' GROUP BY user_id
            ), r AS (
                SELECT user_id AS uid, count(*) AS ratings, max(updated_at) AS last_at
                FROM beer_ratings WHERE status = 'active' GROUP BY user_id
            ), sc AS (
                SELECT user_id AS uid,
                       sum($CONTRIBUTION_WEIGHT)::int AS score
                FROM v_contributions GROUP BY user_id
            )
            SELECT u.id, u.display_name, u.email, u.role::text AS role,
                   u.avatar_url,
                   EXTRACT(DAY FROM (now() - u.created_at))::int AS age_days,
                   u.banned_at IS NOT NULL AS banned,
                   coalesce(p.prices, 0)        AS prices,
                   coalesce(p.confirmations, 0) AS confirmations,
                   coalesce(b.bars, 0)          AS bars,
                   coalesce(f.photos, 0)        AS photos,
                   coalesce(r.ratings, 0)       AS ratings,
                   coalesce(sc.score, 0)        AS score,
                   EXTRACT(DAY FROM (now() - GREATEST(
                       p.last_at, b.last_at, f.last_at, r.last_at
                   )))::int AS last_active_days
            FROM users u
            LEFT JOIN p ON p.uid = u.id
            LEFT JOIN b ON b.uid = u.id
            LEFT JOIN f ON f.uid = u.id
            LEFT JOIN r ON r.uid = u.id
            LEFT JOIN sc ON sc.uid = u.id
            ORDER BY u.created_at DESC
            LIMIT ?
            """.trimIndent(),
            limit,
        ) { rs ->
            DashboardUserDto(
                id = rs.getLong("id"),
                displayName = rs.getString("display_name"),
                email = rs.getString("email"),
                avatarUrl = rs.getString("avatar_url"),
                role = rs.getString("role"),
                ageDays = rs.getInt("age_days"),
                banned = rs.getBoolean("banned"),
                prices = rs.getInt("prices"),
                confirmations = rs.getInt("confirmations"),
                bars = rs.getInt("bars"),
                photos = rs.getInt("photos"),
                ratings = rs.getInt("ratings"),
                lastActiveDays = rs.getInt("last_active_days").takeUnless { rs.wasNull() },
                score = rs.getInt("score"),
            )
        }
    }

    /**
     * Los números de arriba del dashboard.
     *
     * "Aportaron" cuenta gente distinta que hizo algo, no aportes: es la
     * pregunta que importa —cuántos de los que se anotaron volvieron a hacer
     * algo— y sumar aportes la respondería mal, porque una sola persona muy
     * activa la inflaría sola.
     */
    fun dashboardSummary(): DashboardSummaryDto = db.conn { c ->
        val n = { sql: String -> c.queryOne(sql) { it.getInt("n") } ?: 0 }
        DashboardSummaryDto(
            users = n("SELECT count(*) AS n FROM users"),
            usersWeek = n(
                "SELECT count(*) AS n FROM users WHERE created_at > now() - interval '7 days'",
            ),
            usersMonth = n(
                "SELECT count(*) AS n FROM users WHERE created_at > now() - interval '30 days'",
            ),
            contributorsMonth = n(
                """
                SELECT count(DISTINCT uid) AS n FROM (
                    SELECT reported_by AS uid FROM price_reports
                     WHERE status = 'active' AND created_at > now() - interval '30 days'
                    UNION ALL
                    SELECT created_by FROM bars WHERE created_at > now() - interval '30 days'
                    UNION ALL
                    SELECT user_id FROM bar_photos
                     WHERE status = 'active' AND created_at > now() - interval '30 days'
                    UNION ALL
                    SELECT user_id FROM beer_ratings
                     WHERE status = 'active' AND updated_at > now() - interval '30 days'
                ) x WHERE uid IS NOT NULL
                """.trimIndent(),
            ),
            pricesWeek = n(
                """
                SELECT count(*) AS n FROM price_reports
                 WHERE status = 'active' AND created_at > now() - interval '7 days'
                """.trimIndent(),
            ),
            // Bares con al menos un precio no vencido. Es la medida real de
            // cobertura del mapa: un bar sin precio fresco es un pin que no
            // responde la pregunta que la app viene a responder.
            barsWithFreshPrice = n(
                """
                SELECT count(DISTINCT bar_id) AS n FROM v_current_prices
                 WHERE freshness <> 'stale'
                """.trimIndent(),
            ),
            bars = n("SELECT count(*) AS n FROM bars WHERE status = 'approved'"),
        )
    }

    /**
     * Los bares cargados a mano que esperan aprobación.
     *
     * Trae dirección, barrio, coordenadas y place_id —todo lo que hay del
     * lugar— y quién lo cargó. La pantalla no pedía nada de esto: con el
     * nombre y dos números no se puede decidir si el bar existe, que es
     * exactamente la pregunta que la cola plantea.
     *
     * Vive acá y no en BarRepo porque es una consulta de la cola, no del mapa:
     * el DTO del mapa no tiene por qué cargar con la dirección de cada pin.
     */
    fun pendingBars(limit: Int = 200): List<PendingBarDto> = db.conn {
        it.query(
            """
            SELECT b.id, b.name,
                   ST_Y(b.location::geometry) AS lat, ST_X(b.location::geometry) AS lng,
                   b.address, b.neighbourhood, b.google_place_id, b.country_code,
                   b.currency, b.created_at,
                   $AUTHOR_COLS
            FROM bars b
            LEFT JOIN users u ON u.id = b.created_by
            WHERE b.status = 'pending'
            ORDER BY b.created_at ASC LIMIT ?
            """.trimIndent(),
            limit,
        ) { rs ->
            PendingBarDto(
                id = rs.getLong("id"),
                name = rs.getString("name"),
                lat = rs.getDouble("lat"),
                lng = rs.getDouble("lng"),
                address = rs.getString("address"),
                neighbourhood = rs.getString("neighbourhood"),
                googlePlaceId = rs.getString("google_place_id"),
                countryCode = rs.getString("country_code"),
                currency = rs.getString("currency"),
                createdAt = rs.getTimestamp("created_at").toInstant().toString(),
                author = rs.authorOrNull(),
            )
        }
    }

    /**
     * Las denuncias abiertas, con el aporte denunciado entero.
     *
     * Los tres tipos de denuncia se resuelven con el mismo LEFT JOIN por tipo:
     * sólo uno matchea por fila y los otros dos quedan en NULL. De ahí salen
     * las tres cosas que hacen falta para decidir —qué se quiso cargar, dónde,
     * y quién—, que antes no viajaban: la fila decía "price #42" y el
     * moderador tenía que ir a buscar el resto a mano.
     *
     * Ojo con [FlagDto.author] contra `reporterName`: el autor es quien cargó
     * el precio, el reporter quien lo denunció. En los precios retenidos por
     * outlier son la misma persona, porque la denuncia la escribe el server.
     */
    fun openFlags(limit: Int = 100): List<FlagDto> = db.conn {
        it.query(
            """
            SELECT f.id, f.target_type::text AS target_type, f.target_id, f.reason,
                   f.created_at, rep.display_name AS reporter_name,
                   CASE f.target_type
                       WHEN 'bar'    THEN fb.name
                       WHEN 'review' THEN rv.body
                       WHEN 'price'  THEN pr.price::text || ' / ' || pr.size_ml || 'ml'
                   END AS target_summary,
                   $AUTHOR_COLS,
                   coalesce(pr.bar_id, rv.bar_id, fb.id) AS bar_id,
                   coalesce(cb.name, fb.name)            AS bar_name,
                   st.name_es AS style_name, brd.name AS brand_name,
                   pr.price, pr.size_ml, pr.currency,
                   coalesce(pr.created_at, rv.created_at, fb.created_at) AS contrib_at
            FROM flags f
            LEFT JOIN users rep        ON rep.id = f.reporter_id
            LEFT JOIN price_reports pr ON f.target_type = 'price'  AND pr.id = f.target_id
            LEFT JOIN reviews rv       ON f.target_type = 'review' AND rv.id = f.target_id
            LEFT JOIN bars fb          ON f.target_type = 'bar'    AND fb.id = f.target_id
            LEFT JOIN bars cb          ON cb.id = coalesce(pr.bar_id, rv.bar_id)
            LEFT JOIN beer_styles st   ON st.id = pr.style_id
            LEFT JOIN brands brd       ON brd.id = pr.brand_id
            LEFT JOIN users u ON u.id = coalesce(pr.reported_by, rv.user_id, fb.created_by)
            WHERE f.resolved_at IS NULL
            ORDER BY f.created_at ASC LIMIT ?
            """.trimIndent(),
            limit,
        ) { rs ->
            FlagDto(
                id = rs.getLong("id"),
                targetType = rs.getString("target_type"),
                targetId = rs.getLong("target_id"),
                reason = rs.getString("reason"),
                createdAt = rs.getTimestamp("created_at").toInstant().toString(),
                reporterName = rs.getString("reporter_name"),
                targetSummary = rs.getString("target_summary"),
                author = rs.authorOrNull(),
                contrib = rs.contribOrNull(),
            )
        }
    }

    fun resolve(flagId: Long, moderatorId: Long): Boolean = db.conn {
        it.update(
            "UPDATE flags SET resolved_by = ?, resolved_at = now() " +
                "WHERE id = ? AND resolved_at IS NULL",
            moderatorId, flagId,
        ) > 0
    }
}
