package com.birrapp.moderation

import com.birrapp.core.Db
import com.birrapp.core.query
import kotlinx.serialization.Serializable

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
@Serializable
data class PulseDay(
    val day: String,
    val prices: Int,
    val confirmations: Int,
    val bars: Int,
    val photos: Int,
    val ratings: Int,
)

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
}
