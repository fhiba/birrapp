package com.birrapp.beers

import kotlinx.serialization.Serializable
import com.birrapp.core.Db
import com.birrapp.core.badRequest
import com.birrapp.core.longOrNull
import com.birrapp.core.notFound
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.core.update
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * La zona horaria con la que se arma el calendario.
 *
 * No es un detalle: una birra de las once de la noche en Buenos Aires son las
 * dos de la mañana del día siguiente en UTC. Agrupando por el `timestamptz`
 * crudo, media noche de viernes aparece el sábado y las rachas se cortan
 * solas. La app es de Buenos Aires, así que la zona está fija acá y no se
 * negocia con el cliente: que el navegador mandara su zona haría que el mismo
 * dato se viera distinto según dónde esté el teléfono.
 */
private const val TZ = "America/Argentina/Buenos_Aires"

/** Techo de antigüedad al anotar. Un año atrás ya no es "me tomé una birra". */
private const val MAX_BACKDATE_DAYS = 365L

/**
 * Cuántas birras se pueden anotar en un día.
 *
 * **Día de calendario, no 24 horas móviles.** Ocho el viernes a la noche y ocho
 * el sábado a la noche son dos salidas y tienen que poder anotarse las dos; una
 * ventana móvil de 24 horas las junta y rebota la segunda por algo que no pasó.
 * El día se corta en Buenos Aires, igual que el calendario de "Mis birras".
 *
 * El tope mira `drank_at` y no `created_at`: si mirara cuándo se anotó, se
 * saltea cargando al día siguiente lo de anoche.
 *
 * Quince es alto a propósito. No está para discutirle a nadie cuánto tomó —una
 * previa larga entra— sino para que el ranking no lo gane quien tenga más
 * paciencia tocando un botón.
 */
const val MAX_BIRRAS_POR_DIA = 15

/** El código que la app reconoce para abrir el aviso. Ver `LogBeerSheet`. */
const val CODIGO_LIMITE_DIARIO = "limite_diario"

/** Cuánto hacia atrás mira la tabla de birras por zona. */
private const val DIAS_RANKING = 30

@Serializable
data class NewBeerLogRequest(
    /** Opcional: se puede anotar una birra sin decir dónde. */
    val barId: Long? = null,
    val styleSlug: String? = null,
    val brandSlug: String? = null,
    val qty: Int = 1,
    /** ISO-8601. Ausente = ahora. */
    val drankAt: String? = null,
)

@Serializable
data class BeerLogDto(
    val id: Long,
    val barId: Long?,
    val barName: String?,
    val styleSlug: String?,
    val styleName: String?,
    val brandSlug: String?,
    val brandName: String?,
    val qty: Int,
    /** Fecha local (Buenos Aires), `YYYY-MM-DD`. Es la que ordena el calendario. */
    val day: String,
    val drankAt: String,
)

/** Un día con birras. Los días en cero no viajan: el calendario los dibuja igual. */
@Serializable
data class BeerDayDto(val day: String, val qty: Int)

/**
 * Una fila de la tabla de birras por zona.
 *
 * `days` viaja porque desempata y porque dice algo: veinte birras en dos días
 * y veinte en quince no son la misma historia, y el orden usa el menor número
 * de días como segundo criterio sólo para que el empate sea estable.
 */
@Serializable
data class BeerRankDto(
    val userId: Long,
    val alias: String,
    val avatarUrl: String?,
    val beers: Int,
    val days: Int,
)

@Serializable
data class BeerBarDto(val barId: Long, val barName: String, val qty: Int)

/**
 * Un emblema. `target` viaja para que la UI pueda dibujar cuánto falta sin
 * saber las reglas: si el número vive en el cliente, cambiar un umbral acá
 * obliga a publicar una versión de la PWA.
 */
@Serializable
data class BadgeDto(
    val id: String,
    val name: String,
    val detail: String,
    val progress: Int,
    val target: Int,
)

@Serializable
data class BeerSummaryDto(
    val total: Int,
    /** Días seguidos con al menos una birra, contando hasta hoy o ayer. */
    val currentStreak: Int,
    val bestStreak: Int,
    val distinctBars: Int,
    /** Mes pedido, `YYYY-MM`. */
    val month: String,
    val monthTotal: Int,
    val days: List<BeerDayDto>,
    val topBars: List<BeerBarDto>,
    val badges: List<BadgeDto>,
    /** Las del mes que se está mirando, de la más nueva a la más vieja. */
    val logs: List<BeerLogDto>,
)

class BeerRepo(private val db: Db) {

    fun log(req: NewBeerLogRequest, userId: Long): BeerLogDto = db.conn { c ->
        if (req.qty !in 1..20) badRequest("la cantidad tiene que estar entre 1 y 20")

        val drankAt = req.drankAt?.let {
            runCatching { Instant.parse(it) }.getOrElse { badRequest("esa fecha no es válida") }
        } ?: Instant.now()
        // El futuro no se anota. La hora del teléfono puede ir unos minutos
        // adelantada, así que se tolera un margen chico en vez de rebotar a
        // alguien por un reloj mal sincronizado.
        if (drankAt.isAfter(Instant.now().plus(1, ChronoUnit.HOURS))) {
            badRequest("esa birra todavía no te la tomaste")
        }
        if (drankAt.isBefore(Instant.now().minus(MAX_BACKDATE_DAYS, ChronoUnit.DAYS))) {
            badRequest("esa fecha es demasiado vieja")
        }

        // El bar tiene que existir y estar aprobado: anotar birras en un bar
        // pendiente dejaría el conteo colgado de algo que quizás se rechaza.
        if (req.barId != null) {
            c.queryOne(
                "SELECT 1 AS x FROM bars WHERE id = ? AND status = 'approved'", req.barId,
            ) { it.getInt("x") } ?: notFound("no existe un bar aprobado con id ${req.barId}")
        }

        // Estilo y marca: igual que en los precios, se aceptan los pendientes.
        // Quien acaba de proponer un estilo puede usarlo enseguida.
        val styleId = req.styleSlug?.let { slug ->
            c.queryOne("SELECT id FROM beer_styles WHERE slug = ?", slug) { it.getLong("id") }
                ?: notFound("estilo desconocido: $slug")
        }
        val brandId = req.brandSlug?.let { slug ->
            c.queryOne("SELECT id FROM brands WHERE slug = ?", slug) { it.getLong("id") }
                ?: notFound("marca desconocida: $slug")
        }

        // El tope del día, contra lo que ya hay anotado para esa misma fecha.
        // Se cuenta sobre `drank_at` de las dos puntas: la birra que entra y
        // las que ya están.
        val yaEseDia = c.queryOne(
            """
            SELECT coalesce(sum(qty), 0)::int AS n FROM beer_logs
            WHERE user_id = ?
              AND (drank_at AT TIME ZONE ?)::date = (?::timestamptz AT TIME ZONE ?)::date
            """.trimIndent(),
            userId, TZ, java.sql.Timestamp.from(drankAt), TZ,
        ) { it.getInt("n") } ?: 0

        if (yaEseDia + req.qty > MAX_BIRRAS_POR_DIA) {
            // Código propio para que la app pueda abrir el aviso en vez de
            // mostrar el texto del error en un renglón rojo. Lo que hay que
            // decir acá no entra en una línea, y no es un reto: es el único
            // momento en que la app puede decir algo útil.
            throw com.birrapp.core.ApiException(
                io.ktor.http.HttpStatusCode.BadRequest,
                "Ya tenés $yaEseDia birras anotadas para ese día.",
                CODIGO_LIMITE_DIARIO,
            )
        }

        c.queryOne(
            """
            INSERT INTO beer_logs (user_id, bar_id, style_id, brand_id, qty, drank_at)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id
            """.trimIndent(),
            userId, req.barId, styleId, brandId, req.qty,
            java.sql.Timestamp.from(drankAt),
        ) { it.getLong("id") }!!.let { id ->
            c.queryOne("$LOG_SELECT WHERE l.id = ?", id, map = ::toLog)!!
        }
    }

    /**
     * Quiénes tomaron más, entre los bares de esta zona (últimos 30 días).
     *
     * ## Por qué cuenta bares y no personas
     *
     * Una birra sin bar **no entra**. No es una omisión: sin bar no se la puede
     * ubicar, y un ranking por cercanía que incluya lo que no sabe dónde pasó
     * no es por cercanía. Se avisa en la bienvenida, antes de que alguien anote
     * la primera y se pregunte por qué no figura.
     *
     * La contra conocida es que la tabla va a estar casi vacía al principio,
     * porque la mayoría de las birras se anotan sin decir dónde. Se prefiere
     * eso a un número que no significa nada.
     *
     * ## El tope diario se aplica también acá
     *
     * `least(sum(qty), MAX_BIRRAS_POR_DIA)` por persona y por día. El tope ya
     * se controla al anotar, pero esta tabla también lee filas **anteriores al
     * tope**, que nunca pasaron por ese control. Confiar en el dato sería dejar
     * el ranking decidido por lo que se cargó antes de que existiera la regla.
     *
     * Ojo con qué recorta: el tope se aplica a las birras **de esta zona**. Diez
     * acá y diez en otro barrio el mismo día no se suman para recortarse entre
     * ellas, y está bien — cada zona cuenta lo suyo.
     *
     * ## Quién aparece
     *
     * Sólo quien tiene alias, la misma regla que la tabla de colaboradores
     * (V20): el nombre de Google no se publica en ningún lado. Y las cuentas
     * suspendidas no figuran.
     */
    fun leaderboard(
        lat: Double, lng: Double, radiusMeters: Int, limit: Int = 10,
    ): List<BeerRankDto> = db.conn { c ->
        c.query(
            """
            WITH cerca AS (
                SELECT id FROM bars
                WHERE status = 'approved'
                  AND ST_DWithin(location, ST_MakePoint(?, ?)::geography, ?)
            ),
            por_dia AS (
                SELECT l.user_id,
                       least(sum(l.qty), ?) AS qty
                  FROM beer_logs l
                  JOIN cerca b ON b.id = l.bar_id
                 WHERE l.drank_at > now() - make_interval(days => ?)
                 GROUP BY l.user_id, (l.drank_at AT TIME ZONE ?)::date
            )
            SELECT u.id, u.alias, u.avatar_url,
                   sum(p.qty)::int AS birras,
                   count(*)::int   AS dias
              FROM por_dia p
              JOIN users u ON u.id = p.user_id
             WHERE u.alias IS NOT NULL AND u.banned_at IS NULL
             GROUP BY u.id, u.alias, u.avatar_url
             ORDER BY birras DESC, dias ASC, lower(u.alias)
             LIMIT ?
            """.trimIndent(),
            lng, lat, radiusMeters,
            MAX_BIRRAS_POR_DIA, DIAS_RANKING, TZ,
            limit.coerceIn(1, 50),
        ) { rs ->
            BeerRankDto(
                userId = rs.getLong("id"),
                alias = rs.getString("alias"),
                avatarUrl = rs.getString("avatar_url"),
                beers = rs.getInt("birras"),
                days = rs.getInt("dias"),
            )
        }
    }

    /** Borra una birra propia. Devuelve false si no era suya o no existe. */
    fun remove(id: Long, userId: Long): Boolean = db.conn {
        it.update("DELETE FROM beer_logs WHERE id = ? AND user_id = ?", id, userId) > 0
    }

    /**
     * Todo lo que la pantalla "Mis birras" necesita, en una sola llamada.
     *
     * Los totales y las rachas se calculan sobre la historia entera; el
     * calendario y la lista, sólo sobre el mes pedido. Van juntos porque la
     * pantalla los muestra juntos: partirlo en cuatro endpoints serían cuatro
     * viajes para dibujar una vista.
     */
    fun summary(userId: Long, month: String?): BeerSummaryDto = db.conn { c ->
        val first = monthStart(month)
        val monthLabel = first.toString().take(7)

        val totals = c.queryOne(
            """
            SELECT coalesce(sum(qty), 0)::int AS total,
                   count(DISTINCT bar_id)::int AS bars,
                   count(DISTINCT style_id)::int AS styles
            FROM beer_logs WHERE user_id = ?
            """.trimIndent(),
            userId,
        ) { rs -> Triple(rs.getInt("total"), rs.getInt("bars"), rs.getInt("styles")) }
            ?: Triple(0, 0, 0)

        val (current, best) = streaks(c, userId)

        val days = c.query(
            """
            SELECT (drank_at AT TIME ZONE '$TZ')::date AS day, sum(qty)::int AS qty
            FROM beer_logs
            WHERE user_id = ?
              AND (drank_at AT TIME ZONE '$TZ')::date >= ?
              AND (drank_at AT TIME ZONE '$TZ')::date < ?
            GROUP BY 1 ORDER BY 1
            """.trimIndent(),
            userId, java.sql.Date.valueOf(first), java.sql.Date.valueOf(first.plusMonths(1)),
        ) { rs -> BeerDayDto(rs.getDate("day").toString(), rs.getInt("qty")) }

        val topBars = c.query(
            """
            SELECT b.id, b.name, sum(l.qty)::int AS qty
            FROM beer_logs l JOIN bars b ON b.id = l.bar_id
            WHERE l.user_id = ?
            GROUP BY b.id, b.name
            ORDER BY qty DESC, b.name
            LIMIT 3
            """.trimIndent(),
            userId,
        ) { rs -> BeerBarDto(rs.getLong("id"), rs.getString("name"), rs.getInt("qty")) }

        val logs = c.query(
            """
            $LOG_SELECT
            WHERE l.user_id = ?
              AND (l.drank_at AT TIME ZONE '$TZ')::date >= ?
              AND (l.drank_at AT TIME ZONE '$TZ')::date < ?
            ORDER BY l.drank_at DESC
            """.trimIndent(),
            userId, java.sql.Date.valueOf(first), java.sql.Date.valueOf(first.plusMonths(1)),
            map = ::toLog,
        )

        BeerSummaryDto(
            total = totals.first,
            currentStreak = current,
            bestStreak = best,
            distinctBars = totals.second,
            month = monthLabel,
            monthTotal = days.sumOf { it.qty },
            days = days,
            topBars = topBars,
            badges = badges(totals.first, totals.second, totals.third, best),
            logs = logs,
        )
    }

    /**
     * Racha actual y mejor racha, en días.
     *
     * Gaps and islands: a cada día distinto se le resta su número de fila, y
     * los días consecutivos caen todos en el mismo grupo. Hacerlo en Kotlin
     * significaría bajarse la lista entera de días para contarlos.
     *
     * La racha actual admite que el último día sea ayer: si se cortara a
     * medianoche, abrir la app a la mañana mostraría siempre cero.
     */
    private fun streaks(c: java.sql.Connection, userId: Long): Pair<Int, Int> = c.queryOne(
        """
        WITH days AS (
            SELECT DISTINCT (drank_at AT TIME ZONE '$TZ')::date AS d
            FROM beer_logs WHERE user_id = ?
        ), islands AS (
            SELECT d, d - (row_number() OVER (ORDER BY d))::int AS grp FROM days
        ), runs AS (
            SELECT count(*)::int AS len, max(d) AS last_day FROM islands GROUP BY grp
        )
        SELECT coalesce(max(len), 0) AS best,
               coalesce(max(len) FILTER (
                   WHERE last_day >= (now() AT TIME ZONE '$TZ')::date - 1
               ), 0) AS current
        FROM runs
        """.trimIndent(),
        userId,
    ) { rs -> rs.getInt("current") to rs.getInt("best") } ?: (0 to 0)

    /**
     * Los emblemas se derivan de los datos, no se guardan.
     *
     * Una tabla de emblemas ganados haría falta si hubiera que saber CUÁNDO se
     * ganó cada uno o si las reglas dependieran de algo que no está en los
     * logs. Hoy no es el caso: cinco cuentas sobre la misma tabla dan lo
     * mismo, y no hay nada que se pueda desincronizar.
     */
    private fun badges(total: Int, bars: Int, styles: Int, bestStreak: Int) = listOf(
        BadgeDto("primera", "La primera", "Anotaste tu primera birra", total.coerceAtMost(1), 1),
        BadgeDto("diez", "Decena", "Diez birras anotadas", total.coerceAtMost(10), 10),
        BadgeDto("cincuenta", "Cincuentón", "Cincuenta birras anotadas", total.coerceAtMost(50), 50),
        BadgeDto("cinco-bares", "Paseandero", "Birras en cinco bares distintos", bars.coerceAtMost(5), 5),
        BadgeDto("cinco-estilos", "Curioso", "Cinco estilos distintos", styles.coerceAtMost(5), 5),
        BadgeDto("racha-7", "Semana redonda", "Siete días seguidos", bestStreak.coerceAtMost(7), 7),
    )

    /** Primer día del mes pedido. Sin `month`, el mes corriente en Buenos Aires. */
    private fun monthStart(month: String?): LocalDate {
        if (month == null) {
            return LocalDate.now(java.time.ZoneId.of(TZ)).withDayOfMonth(1)
        }
        return runCatching { LocalDate.parse("$month-01") }
            .getOrElse { badRequest("mes inválido, se espera YYYY-MM") }
    }

    private companion object {
        val LOG_SELECT = """
            SELECT l.id, l.qty, l.drank_at,
                   (l.drank_at AT TIME ZONE '$TZ')::date AS day,
                   b.id AS bar_id, b.name AS bar_name,
                   s.slug AS style_slug, s.name_es AS style_name,
                   br.slug AS brand_slug, br.name AS brand_name
            FROM beer_logs l
            LEFT JOIN bars b ON b.id = l.bar_id
            LEFT JOIN beer_styles s ON s.id = l.style_id
            LEFT JOIN brands br ON br.id = l.brand_id
        """.trimIndent()

        fun toLog(rs: java.sql.ResultSet) = BeerLogDto(
            id = rs.getLong("id"),
            barId = rs.longOrNull("bar_id"),
            barName = rs.getString("bar_name"),
            styleSlug = rs.getString("style_slug"),
            styleName = rs.getString("style_name"),
            brandSlug = rs.getString("brand_slug"),
            brandName = rs.getString("brand_name"),
            qty = rs.getInt("qty"),
            day = rs.getDate("day").toString(),
            drankAt = rs.getTimestamp("drank_at").toInstant().toString(),
        )
    }
}
