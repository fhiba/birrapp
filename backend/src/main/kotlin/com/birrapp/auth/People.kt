package com.birrapp.auth

import kotlinx.serialization.Serializable
import com.birrapp.core.Db
import com.birrapp.core.badRequest
import com.birrapp.core.notFound
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.core.update

/**
 * El perfil de otra persona (BIR-6).
 *
 * **No lleva el email.** El perfil propio lo muestra porque es tuyo; el ajeno
 * no tiene por qué, y una vez que un endpoint devuelve emails de terceros es
 * una fuga que hay que andar tapando después. Lo que se ve de alguien es el
 * nombre, la foto, desde cuándo está y qué aportó — que es todo público, está
 * firmado con ese nombre en el mapa.
 *
 * `banned` y `role` viajan sólo para moderadores; para el resto van en null.
 * Que una cuenta esté baneada no es información pública: sería una lista de
 * escarmiento.
 */
@Serializable
data class PersonDto(
    val id: Long,
    val displayName: String,
    val avatarUrl: String?,
    /** Días desde que se registró. */
    val ageDays: Int,
    val prices: Int,
    val bars: Int,
    val photos: Int,
    val ratings: Int,
    val comments: Int,
    /** true = vos la bloqueaste. Null si mirás sin sesión. */
    val blocked: Boolean? = null,
    /** Sólo para moderadores. */
    val banned: Boolean? = null,
    val role: String? = null,
)

class PeopleRepo(private val db: Db) {

    /**
     * Lo que se puede mostrar de una persona.
     *
     * Los cinco contadores salen de una sola consulta con subqueries y no de
     * cinco viajes: es una pantalla, no cinco.
     */
    fun profile(id: Long, viewerId: Long?, asModerator: Boolean): PersonDto = db.conn { c ->
        c.queryOne(
            """
            SELECT u.id, u.display_name, u.avatar_url, u.banned_at, u.role,
                   EXTRACT(DAY FROM (now() - u.created_at))::int AS age_days,
                   (SELECT count(*) FROM price_reports p
                     WHERE p.reported_by = u.id AND p.status = 'active'
                       AND NOT p.is_confirmation)                        AS prices,
                   (SELECT count(*) FROM bars b
                     WHERE b.created_by = u.id AND b.status = 'approved') AS bars,
                   (SELECT count(*) FROM bar_photos f
                     WHERE f.user_id = u.id AND f.status = 'active')      AS photos,
                   (SELECT count(*) FROM beer_ratings r
                     WHERE r.user_id = u.id AND r.status = 'active')      AS ratings,
                   (SELECT count(*) FROM beer_comments m
                     WHERE m.user_id = u.id AND m.status = 'active')      AS comments,
                   (SELECT count(*) FROM user_blocks bl
                     WHERE bl.blocker_id = ?::bigint AND bl.blocked_id = u.id) AS blocked
            FROM users u WHERE u.id = ?
            """.trimIndent(),
            viewerId, id,
        ) { rs ->
            PersonDto(
                id = rs.getLong("id"),
                displayName = rs.getString("display_name"),
                avatarUrl = rs.getString("avatar_url"),
                ageDays = rs.getInt("age_days"),
                prices = rs.getInt("prices"),
                bars = rs.getInt("bars"),
                photos = rs.getInt("photos"),
                ratings = rs.getInt("ratings"),
                comments = rs.getInt("comments"),
                blocked = if (viewerId == null) null else rs.getInt("blocked") > 0,
                banned = if (asModerator) rs.getTimestamp("banned_at") != null else null,
                role = if (asModerator) rs.getString("role") else null,
            )
        } ?: notFound("no existe esa persona")
    }

    /**
     * Bloquear o desbloquear. Idempotente en los dos sentidos: es un toggle y
     * tocarlo dos veces rápido no puede romper nada.
     */
    fun setBlocked(blockerId: Long, blockedId: Long, on: Boolean) = db.conn { c ->
        if (blockerId == blockedId) badRequest("no te podés bloquear a vos mismo")
        if (on) {
            c.queryOne("SELECT 1 AS x FROM users WHERE id = ?", blockedId) { it.getInt("x") }
                ?: notFound("no existe esa persona")
            c.update(
                "INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?) " +
                    "ON CONFLICT DO NOTHING",
                blockerId, blockedId,
            )
        } else {
            c.update(
                "DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?",
                blockerId, blockedId,
            )
        }
    }

    /** A quiénes bloqueó esta persona, para poder desbloquearlas. */
    fun blocked(blockerId: Long): List<PersonDto> = db.conn {
        it.query(
            """
            SELECT u.id, u.display_name, u.avatar_url,
                   EXTRACT(DAY FROM (now() - u.created_at))::int AS age_days
            FROM user_blocks bl JOIN users u ON u.id = bl.blocked_id
            WHERE bl.blocker_id = ? ORDER BY bl.created_at DESC
            """.trimIndent(),
            blockerId,
        ) { rs ->
            PersonDto(
                id = rs.getLong("id"),
                displayName = rs.getString("display_name"),
                avatarUrl = rs.getString("avatar_url"),
                ageDays = rs.getInt("age_days"),
                prices = 0, bars = 0, photos = 0, ratings = 0, comments = 0,
                blocked = true,
            )
        }
    }
}

/**
 * El predicado que esconde el contenido de las personas bloqueadas.
 *
 * Se pega en el WHERE de cada lista de contenido firmado —comentarios, fotos—
 * y toma **un solo parámetro**: el id de quien mira, que puede ser NULL.
 *
 * Va como constante y no copiado en cada consulta porque el día que se agregue
 * una lista nueva de contenido con autor hay que acordarse de filtrarla, y
 * tener un nombre para esto es la única pista de que hace falta.
 *
 * Las dos direcciones: si cualquiera de los dos bloqueó al otro, no se ve.
 */
const val NOT_BLOCKED = """
    AND NOT EXISTS (
        SELECT 1 FROM user_blocks bl
        WHERE (bl.blocker_id = ?::bigint AND bl.blocked_id = %s)
           OR (bl.blocked_id = ?::bigint AND bl.blocker_id = %s)
    )
"""

/** [NOT_BLOCKED] con la columna del autor de esa consulta puesta. */
fun notBlocked(authorColumn: String): String = NOT_BLOCKED.format(authorColumn, authorColumn)
