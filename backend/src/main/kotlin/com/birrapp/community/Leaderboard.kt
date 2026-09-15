package com.birrapp.community

import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.ZoneId
import com.birrapp.core.Db
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.moderation.CONTRIBUTION_WEIGHT
import com.birrapp.photos.R2

private const val TZ = "America/Argentina/Buenos_Aires"

@Serializable
data class ContributorDto(
    val userId: Long,
    /** El alias elegido. Nunca el nombre de Google: ver [LeaderboardRepo]. */
    val alias: String,
    val avatarUrl: String?,
    val score: Int,
    /** Aportes que puntuaron, ya con el tope por bar y día aplicado. */
    val contributions: Int,
    /** En cuántos bares distintos. Es lo que el mapa necesita que crezca. */
    val bars: Int,
)

@Serializable
data class PhotoOfMonthDto(
    val id: Long,
    val url: String,
    val barId: Long,
    val barName: String,
    val beerName: String,
    val authorAlias: String?,
    val votes: Int,
)

@Serializable
data class LeaderboardDto(
    /** Mes mirado, `YYYY-MM`. */
    val month: String,
    val contributors: List<ContributorDto>,
    /**
     * Cuánta gente aportó este mes sin alias puesto, y por lo tanto no está en
     * la lista. Va para que la página no mienta sobre cuánta gente participa:
     * una tabla de tres cuando aportaron cuarenta cuenta una historia falsa.
     */
    val hidden: Int,
    val photo: PhotoOfMonthDto?,
)

/**
 * La página de colaboradores (BIR-9).
 *
 * Existe porque la app agradece los aportes en privado —"Mis aportes" lo ve
 * sólo quien lo cargó— y no hay nada que devuelva estatus en público. En una
 * app que depende de que la gente releve precios gratis, esa es la palanca de
 * retención más barata que queda sin usar.
 *
 * ## Las dos decisiones que el ticket dejaba abiertas
 *
 * **1. Qué nombre se muestra: el alias, y sólo el alias.**
 *
 * `display_name` viene de Google y muy seguido es nombre y apellido reales.
 * Publicar eso no es una feature de interfaz, es un cambio de privacidad:
 * quien cargó un precio para que la app funcione no aceptó aparecer en una
 * lista pública con su nombre completo.
 *
 * Por eso el alias es opt-in y sin default: **sin alias no se aparece**. La
 * alternativa —sembrarlo con el nombre de pila de cada uno— publica a todos y
 * después les avisa, que es el orden equivocado. La contra es que al principio
 * la tabla va a estar casi vacía, y por eso viaja `hidden`.
 *
 * **2. Qué pesa cada aporte: lo mismo que ya pesaba, pero con tope.**
 *
 * Se reusa `CONTRIBUTION_WEIGHT`, que ya rankea gente en el dashboard, en vez
 * de inventar una economía nueva. Lo que se agrega es el tope que pide el
 * ticket: **un aporte que puntúa por persona, tipo, bar y día**. Veinte precios
 * en el mismo bar el mismo día valen lo mismo que uno.
 *
 * Es el punto entero del ranking público. Hecho público, el score se vuelve un
 * incentivo y la gente optimiza para el número; premiar el volumen crudo es
 * invitar a cargar precios inventados, que es exactamente el ataque contra el
 * que se defiende el resto de la app. Con el tope, la única forma de subir es
 * tocar bares distintos o volver otro día — las dos cosas que el mapa
 * necesita.
 *
 * El mes corre y se reinicia a propósito: una tabla histórica la gana siempre
 * el mismo y al que llega nuevo le dice que no tiene sentido empezar.
 */
class LeaderboardRepo(private val db: Db, private val r2: R2) {

    /** [month] en `YYYY-MM`; ausente = el mes corriente en Buenos Aires. */
    fun ofMonth(month: String?, limit: Int = 50): LeaderboardDto = db.conn { c ->
        val from = parseMonth(month)
        val to = from.plusMonths(1)
        val label = "%04d-%02d".format(from.year, from.monthValue)

        val contributors = c.query(
            """
            WITH del_mes AS (
                SELECT user_id, kind, bar_id,
                       (at AT TIME ZONE '$TZ')::date AS day
                FROM v_contributions
                WHERE (at AT TIME ZONE '$TZ')::date >= ?
                  AND (at AT TIME ZONE '$TZ')::date <  ?
            ),
            -- El tope: un aporte que puntúa por persona, tipo, bar y día.
            -- Sin esto, cargar veinte precios en el mismo bar es la forma más
            -- barata de ganar el mes, y es justo la que no hay que premiar.
            topeado AS (
                SELECT DISTINCT user_id, kind, bar_id, day FROM del_mes
            ),
            puntos AS (
                SELECT user_id,
                       sum($CONTRIBUTION_WEIGHT)::int   AS score,
                       count(*)::int                    AS aportes,
                       count(DISTINCT bar_id)::int      AS bares
                FROM topeado
                GROUP BY user_id
            )
            SELECT u.id, u.alias, u.avatar_url, p.score, p.aportes, p.bares
            FROM puntos p
            JOIN users u ON u.id = p.user_id
            -- Sin alias no se aparece, y una cuenta suspendida tampoco: la
            -- página es el premio, y premiar a quien se moderó sería raro.
            WHERE u.alias IS NOT NULL AND u.banned_at IS NULL
            ORDER BY p.score DESC, p.bares DESC, lower(u.alias)
            LIMIT ?
            """.trimIndent(),
            from, to, limit.coerceIn(1, 200),
        ) { rs ->
            ContributorDto(
                userId = rs.getLong("id"),
                alias = rs.getString("alias"),
                avatarUrl = rs.getString("avatar_url"),
                score = rs.getInt("score"),
                contributions = rs.getInt("aportes"),
                bars = rs.getInt("bares"),
            )
        }

        val hidden = c.queryOne(
            """
            SELECT count(DISTINCT c.user_id)::int AS n
            FROM v_contributions c
            JOIN users u ON u.id = c.user_id
            WHERE (c.at AT TIME ZONE '$TZ')::date >= ?
              AND (c.at AT TIME ZONE '$TZ')::date <  ?
              AND u.alias IS NULL AND u.banned_at IS NULL
            """.trimIndent(),
            from, to,
        ) { it.getInt("n") } ?: 0

        LeaderboardDto(label, contributors, hidden, photoOfMonth(c, from, to))
    }

    /**
     * La foto más votada del mes, de toda la app (BIR-10).
     *
     * Quedó sin lugar donde vivir cuando se hicieron los pulgares: en la
     * pantalla del bar competía con el precio, que es lo que la app viene a
     * contestar. Acá no compite con nada — esta página ES el reconocimiento.
     *
     * Necesita al menos un voto: destacar una foto que nadie votó no dice
     * nada. El autor sale con su alias, con la misma regla que la tabla; sin
     * alias la foto igual se muestra, pero sin firma.
     */
    private fun photoOfMonth(
        c: java.sql.Connection, from: LocalDate, to: LocalDate,
    ): PhotoOfMonthDto? = c.queryOne(
        """
        SELECT p.id, p.object_key, p.bar_id, ba.name AS bar_name,
               s.name_es AS style_name, b.name AS brand_name,
               u.alias AS author_alias,
               count(pv.user_id)::int AS votes
        FROM bar_photos p
        JOIN photo_votes pv ON pv.photo_id = p.id
        JOIN bars ba ON ba.id = p.bar_id
        JOIN beer_styles s ON s.id = p.style_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN users u ON u.id = p.user_id
        WHERE p.status = 'active'
          AND (p.created_at AT TIME ZONE '$TZ')::date >= ?
          AND (p.created_at AT TIME ZONE '$TZ')::date <  ?
        GROUP BY p.id, p.object_key, p.bar_id, ba.name, s.name_es, b.name, u.alias
        -- Empate: gana la más nueva, por lo mismo que la foto del mes de un
        -- bar. Premiar a la que llegó primero sólo por llevar más días
        -- juntando pulgares convierte la del mes en la del día 1.
        ORDER BY count(pv.user_id) DESC, p.created_at DESC
        LIMIT 1
        """.trimIndent(),
        from, to,
    ) { rs ->
        val style = rs.getString("style_name")
        val brand = rs.getString("brand_name")
        PhotoOfMonthDto(
            id = rs.getLong("id"),
            url = r2.publicUrl(rs.getString("object_key")),
            barId = rs.getLong("bar_id"),
            barName = rs.getString("bar_name"),
            beerName = brand?.let { "$style · $it" } ?: style,
            authorAlias = rs.getString("author_alias"),
            votes = rs.getInt("votes"),
        )
    }

    /** Un mes ilegible se trata como el corriente: la página no es un form. */
    private fun parseMonth(raw: String?): LocalDate {
        val hoy = LocalDate.now(ZoneId.of(TZ)).withDayOfMonth(1)
        val s = raw?.trim().orEmpty()
        if (!Regex("^\\d{4}-\\d{2}$").matches(s)) return hoy
        return runCatching { LocalDate.parse("$s-01") }.getOrDefault(hoy)
    }
}
