package com.birrapp.moderation

import com.birrapp.core.Db
import com.birrapp.core.query
import kotlinx.serialization.Serializable

/**
 * El peso de cada tipo de aporte para rankear gente: precio 3, bar 3, foto 2,
 * nota 2, confirmación 1.
 *
 * Las confirmaciones pesan menos porque mantener fresco lo que ya está es un
 * aporte real, pero más barato que relevar un precio nuevo; sin ese descuento
 * el ranking lo gana quien aprieta "Sigue igual" en serie.
 *
 * Hay una sola definición a propósito. La comparten tres queries —`recentUsers`
 * en ModerationRepo, y acá `topContributors` y `top5Share`— y tres copias
 * sueltas se desincronizan igual que se desincronizaban las dos que había entre
 * el back y el front antes de centralizar el score.
 *
 * Se interpola cruda en el SQL, no es un parámetro: nunca armarla con texto de
 * afuera. Nombra la columna `kind` sin calificar y resuelve en las tres porque
 * `v_contributions` es la única tabla con esa columna en cada query.
 */
internal const val CONTRIBUTION_WEIGHT =
    """CASE kind WHEN 'price'  THEN 3
                 WHEN 'bar'    THEN 3
                 WHEN 'photo'  THEN 2
                 WHEN 'rating' THEN 2
                 ELSE 1 END"""

@Serializable
data class PulseDay(
    val day: String,
    val prices: Int,
    val confirmations: Int,
    val bars: Int,
    val photos: Int,
    val ratings: Int,
)

@Serializable
data class WeeklyPoint(val week: String, val signups: Int, val contributors: Int)

@Serializable
data class CoverageDay(val day: String, val bars: Int, val covered: Int)

/** Visitantes distintos de un día, partidos por si tenían sesión o no. */
@Serializable
data class TrafficDay(val day: String, val anon: Int, val authed: Int)

@Serializable
data class TopContributor(
    val userId: Long,
    val displayName: String,
    val score: Int,
    val prices: Int,
    val confirmations: Int,
    val bars: Int,
    val photos: Int,
    val ratings: Int,
)

/**
 * Visitantes → cuentas → aportó alguna vez → aportó ≥5 veces → aportó en 30 días.
 *
 * Ojo: son cinco conteos independientes, no subconjuntos anidados. Los cuatro
 * últimos son sobre la misma población pero no encajan uno dentro de otro
 * —`activeMonth` no cae dentro de `fiveOrMore`, alguien con dos aportes esta
 * semana suma en el primero y no en el segundo—, y `visitors30` ni siquiera
 * comparte población con el resto: cuenta clientes de la PWA, la mayoría sin
 * cuenta. Dibujarlo como un embudo estricto de barras que sólo pueden
 * achicarse sería una mentira gráfica.
 */
@Serializable
data class Funnel(
    /**
     * Clientes distintos en 30 días. Es el escalón cero: sin él el embudo
     * arranca en "cuentas" y esconde la caída más grande, que es de los que
     * miran a los que se anotan.
     *
     * Mide la PWA solamente: la app de Android no manda el beacon.
     */
    val visitors30: Int,
    val accounts: Int,
    val everContributed: Int,
    val fiveOrMore: Int,
    val activeMonth: Int,
)

/** Todo lo que el dashboard pide de una sola vez. */
@Serializable
data class DashboardAnalytics(
    val pulse: List<PulseDay>,
    val weekly: List<WeeklyPoint>,
    val coverage: List<CoverageDay>,
    val traffic: List<TrafficDay>,
    val topContributors: List<TopContributor>,
    val top5Share: Double,
    val funnel: Funnel,
)

/**
 * Las analíticas del dashboard: lo mismo que ya muestra, pero en el tiempo.
 *
 * Va aparte de ModerationRepo porque son preguntas distintas. Ese repo
 * contesta "qué hay que revisar ahora"; este contesta "cómo viene la cosa", y
 * mezclarlos deja un archivo que hace dos cosas y no se termina de leer.
 *
 * Todas las series rellenan los días vacíos con generate_series. Un hueco que
 * el front dibuje como línea recta entre dos puntos lejanos es una mentira
 * gráfica, y el lugar barato de evitarla es el SQL.
 */
class AnalyticsRepo(private val db: Db) {

    /** Aportes por día, desglosados por tipo. El pulso de la app. */
    fun pulse(days: Int = 30): List<PulseDay> = db.conn { c ->
        c.query(
            """
            WITH d AS (
                SELECT generate_series(
                    date_trunc('day', now()) - make_interval(days => ? - 1),
                    date_trunc('day', now()),
                    interval '1 day')::date AS day
            )
            SELECT d.day,
                   count(*) FILTER (WHERE c.kind = 'price')        AS prices,
                   count(*) FILTER (WHERE c.kind = 'confirmation') AS confirmations,
                   count(*) FILTER (WHERE c.kind = 'bar')          AS bars,
                   count(*) FILTER (WHERE c.kind = 'photo')        AS photos,
                   count(*) FILTER (WHERE c.kind = 'rating')       AS ratings
            FROM d LEFT JOIN v_contributions c ON c.at::date = d.day
            GROUP BY d.day
            ORDER BY d.day
            """.trimIndent(),
            days,
        ) { rs ->
            PulseDay(
                day = rs.getDate("day").toString(),
                prices = rs.getInt("prices"),
                confirmations = rs.getInt("confirmations"),
                bars = rs.getInt("bars"),
                photos = rs.getInt("photos"),
                ratings = rs.getInt("ratings"),
            )
        }
    }

    /**
     * Altas de cuenta contra personas que aportaron, por semana.
     *
     * `contributors` cuenta personas distintas, no aportes: la pregunta es
     * cuántos de los que se anotan hacen algo, y sumar aportes la contestaría
     * mal porque una sola persona muy activa la infla sola.
     */
    fun weekly(weeks: Int = 12): List<WeeklyPoint> = db.conn { c ->
        c.query(
            """
            WITH w AS (
                SELECT generate_series(
                    date_trunc('week', now()) - make_interval(weeks => ? - 1),
                    date_trunc('week', now()),
                    interval '1 week')::date AS week
            ), s AS (
                SELECT date_trunc('week', created_at)::date AS week, count(*)::int AS n
                FROM users GROUP BY 1
            ), k AS (
                SELECT date_trunc('week', at)::date AS week,
                       count(DISTINCT user_id)::int AS n
                FROM v_contributions GROUP BY 1
            )
            SELECT w.week,
                   coalesce(s.n, 0) AS signups,
                   coalesce(k.n, 0) AS contributors
            FROM w
            LEFT JOIN s ON s.week = w.week
            LEFT JOIN k ON k.week = w.week
            ORDER BY w.week
            """.trimIndent(),
            weeks,
        ) { rs ->
            WeeklyPoint(
                week = rs.getDate("week").toString(),
                signups = rs.getInt("signups"),
                contributors = rs.getInt("contributors"),
            )
        }
    }

    /**
     * Bares con al menos un precio no vencido, día por día.
     *
     * `price_reports` es append-only, así que la historia está intacta y la
     * cobertura pasada se reconstruye. Los 45 días son el corte de `stale`
     * que ya define `v_current_prices` en V2: el último punto se aproxima al
     * `barsWithFreshPrice` que el dashboard ya muestra (la diferencia es la
     * ventana de hasta 24h entre midnight y la hora actual).
     *
     * El denominador cuenta bares que existen hoy y cuyo `created_at` es ≤ d.day.
     * Es un proxy, no la verdad: `bars` no guarda `approved_at`, así que uno que
     * estuvo pendiente dos meses antes de aprobarse cuenta desde que nació, y uno
     * aprobado después rechazado no cuenta nunca. Se acepta porque el grueso de
     * bares entró del import de OSM ya aprobado, la cola de moderación es una
     * persona, y esto es un gráfico de tendencia — agregar `approved_at` quedaría
     * igual de aproximado pero pareciendo exacto.
     *
     * Son dos subconsultas correlacionadas por día. Con ~740 bares es
     * instantáneo; si algún día molesta, se materializa.
     */
    fun coverage(days: Int = 90): List<CoverageDay> = db.conn { c ->
        c.query(
            """
            WITH d AS (
                SELECT generate_series(
                    date_trunc('day', now()) - make_interval(days => ? - 1),
                    date_trunc('day', now()),
                    interval '1 day')::date AS day
            )
            SELECT d.day,
                   (SELECT count(*)::int FROM bars b
                     WHERE b.status = 'approved'
                       AND b.created_at::date <= d.day)              AS bars,
                   (SELECT count(DISTINCT pr.bar_id)::int FROM price_reports pr
                     WHERE pr.status = 'active'
                       AND pr.created_at::date <= d.day
                       AND pr.created_at > d.day - interval '45 days') AS covered
            FROM d ORDER BY d.day
            """.trimIndent(),
            days,
        ) { rs ->
            CoverageDay(
                day = rs.getDate("day").toString(),
                bars = rs.getInt("bars"),
                covered = rs.getInt("covered"),
            )
        }
    }

    /**
     * Visitantes por día, anónimos contra con sesión.
     *
     * Una fila de `traffic_sessions` ya es un cliente distinto en un día —la
     * clave primaria es (day, client_id)— así que acá alcanza con contar filas
     * y no hace falta DISTINCT.
     */
    fun traffic(days: Int = 30): List<TrafficDay> = db.conn { c ->
        c.query(
            """
            WITH d AS (
                SELECT generate_series(
                    date_trunc('day', now()) - make_interval(days => ? - 1),
                    date_trunc('day', now()),
                    interval '1 day')::date AS day
            )
            SELECT d.day,
                   count(t.client_id) FILTER (WHERE NOT t.authed)::int AS anon,
                   count(t.client_id) FILTER (WHERE t.authed)::int     AS authed
            FROM d LEFT JOIN traffic_sessions t ON t.day = d.day
            GROUP BY d.day
            ORDER BY d.day
            """.trimIndent(),
            days,
        ) { rs ->
            TrafficDay(
                day = rs.getDate("day").toString(),
                anon = rs.getInt("anon"),
                authed = rs.getInt("authed"),
            )
        }
    }

    /**
     * Los que más aportan, por score.
     *
     * El peso sale de [CONTRIBUTION_WEIGHT], el mismo que usa
     * DashboardUserDto.score.
     */
    fun topContributors(limit: Int = 10): List<TopContributor> = db.conn { c ->
        c.query(
            """
            SELECT u.id, u.display_name,
                   sum($CONTRIBUTION_WEIGHT)::int                      AS score,
                   count(*) FILTER (WHERE c.kind = 'price')::int        AS prices,
                   count(*) FILTER (WHERE c.kind = 'confirmation')::int AS confirmations,
                   count(*) FILTER (WHERE c.kind = 'bar')::int          AS bars,
                   count(*) FILTER (WHERE c.kind = 'photo')::int        AS photos,
                   count(*) FILTER (WHERE c.kind = 'rating')::int       AS ratings
            FROM v_contributions c
            JOIN users u ON u.id = c.user_id
            GROUP BY u.id, u.display_name
            ORDER BY score DESC, u.display_name
            LIMIT ?
            """.trimIndent(),
            limit,
        ) { rs ->
            TopContributor(
                userId = rs.getLong("id"),
                displayName = rs.getString("display_name"),
                score = rs.getInt("score"),
                prices = rs.getInt("prices"),
                confirmations = rs.getInt("confirmations"),
                bars = rs.getInt("bars"),
                photos = rs.getInt("photos"),
                ratings = rs.getInt("ratings"),
            )
        }
    }

    /**
     * Qué porción del total concentran los cinco primeros.
     *
     * En una app que depende de aportes gratis, si el 80% lo hacen tres
     * personas el mapa tiene un punto único de falla. Hoy eso es invisible: la
     * lista está ordenada por aportes pero no dice cuánto pesa la cabeza.
     */
    fun top5Share(): Double = db.conn { c ->
        c.query(
            """
            WITH s AS (
                SELECT sum($CONTRIBUTION_WEIGHT) AS score
                FROM v_contributions GROUP BY user_id
            )
            -- El ::numeric fuerza división real: sin él, un ::int de más en la
            -- CTE la volvería entera y toda fracción se truncaría a 0.
            SELECT coalesce(
                (SELECT sum(score) FROM (SELECT score FROM s ORDER BY score DESC LIMIT 5) t)::numeric
                    / nullif((SELECT sum(score) FROM s), 0),
                0)::float8 AS share
            """.trimIndent(),
        ) { it.getDouble("share") }.first()
    }

    /** En qué escalón se cae la gente. */
    fun funnel(): Funnel = db.conn { c ->
        c.query(
            """
            WITH per_user AS (
                SELECT user_id,
                       count(*) AS n,
                       max(at)  AS last_at
                FROM v_contributions GROUP BY user_id
            )
            -- count(DISTINCT client_id) y no count(*): un cliente que vuelve
            -- cinco días distintos tiene cinco filas y es una sola persona.
            SELECT (SELECT count(DISTINCT client_id) FROM traffic_sessions
                     WHERE day > current_date - 30)::int                  AS visitors,
                   (SELECT count(*) FROM users)::int                      AS accounts,
                   (SELECT count(*) FROM per_user)::int                   AS ever,
                   (SELECT count(*) FROM per_user WHERE n >= 5)::int      AS five,
                   (SELECT count(*) FROM per_user
                     WHERE last_at > now() - interval '30 days')::int     AS active
            """.trimIndent(),
        ) { rs ->
            Funnel(
                visitors30 = rs.getInt("visitors"),
                accounts = rs.getInt("accounts"),
                everContributed = rs.getInt("ever"),
                fiveOrMore = rs.getInt("five"),
                activeMonth = rs.getInt("active"),
            )
        }.first()
    }

    /**
     * Las métricas en una sola llamada.
     *
     * Van juntas y no en un endpoint por serie porque se muestran juntas: un
     * request por serie para pintar una pantalla es latencia regalada, y el
     * dashboard ya las pide en paralelo.
     */
    fun all() = DashboardAnalytics(
        pulse = pulse(),
        weekly = weekly(),
        coverage = coverage(),
        traffic = traffic(),
        topContributors = topContributors(),
        top5Share = top5Share(),
        funnel = funnel(),
    )
}
