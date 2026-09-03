package com.birrapp.moderation

import com.birrapp.core.Db
import com.birrapp.core.query
import kotlinx.serialization.Serializable

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
     * que ya define `v_current_prices` en V2: así el último punto de esta
     * serie coincide con el `barsWithFreshPrice` que el dashboard ya muestra.
     *
     * El denominador son los bares aprobados A ESA FECHA y no los de hoy: con
     * el total actual, la cobertura de hace tres meses se vería falsamente
     * baja sólo porque después se cargaron más bares.
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
}
