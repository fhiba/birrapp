package com.birrapp.auth

import kotlinx.serialization.Serializable
import com.birrapp.core.Db
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.core.update
import java.security.MessageDigest
import java.security.SecureRandom
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.Base64
import kotlin.random.Random

/**
 * Los límites del alias, en un solo lugar.
 *
 * Los usan la validación de lo que alguien escribe y la derivación automática
 * del alias de una cuenta nueva. Separados, el generador podía producir algo
 * que la validación rechazaba — y el que lo iba a descubrir era el que tocaba
 * "Guardar" sobre un alias que la app le había puesto sola.
 */
private const val MIN_ALIAS = 3
private const val MAX_ALIAS = 20

/** Cuántos alias con número se prueban antes de rendirse. */
private const val INTENTOS_ALIAS = 12

enum class Role { user, moderator, admin;
    /** admin implica moderator; moderator implica user. */
    fun atLeast(other: Role): Boolean = ordinal >= other.ordinal
}

data class User(
    val id: Long,
    val googleSub: String,
    val email: String,
    val displayName: String,
    val avatarUrl: String?,
    val role: Role,
    val bannedAt: Instant?,
    /** Preferencias. Ver `V16__currency_and_settings.sql` por qué tienen default. */
    val currency: String = com.birrapp.core.Currency.DEFAULT,
    val defaultSizeMl: Int = 473,
    val defaultRadiusM: Int = 2000,
    /**
     * Cómo te ves en público (BIR-9). Null = no estás en la tabla de
     * colaboradores, que es el default: aparecer se elige, no se hereda del
     * nombre que puso Google.
     */
    val alias: String? = null,
    /** Slugs de los estilos y marcas favoritos. Ver `V21__beer_preferences.sql`. */
    val favoriteStyles: List<String> = emptyList(),
    val favoriteBrands: List<String> = emptyList(),
    /**
     * Cuándo terminó la bienvenida. Null = cuenta recién creada que todavía no
     * la hizo, y es lo que decide si la app la muestra. Ver `V22__onboarding.sql`.
     */
    val onboardedAt: Instant? = null,
) {
    val isBanned: Boolean get() = bannedAt != null
}

@Serializable
data class UserStats(
    val prices: Int,
    /** Toques de "Sigue igual". Se cuenta pero ya no se muestra: nadie
     *  reconocía qué era "Confirmados" mirando la pantalla. */
    val confirmations: Int,
    val bars: Int,
    val reviews: Int,
    val photos: Int,
    /**
     * Birras anotadas (BIR-43).
     *
     * Viaja con el resto de los números en vez de tener su propio pedido:
     * Perfil los muestra a los cinco juntos, y traerlos en dos viajes hacía
     * que la grilla se dibujara en dos tiempos.
     *
     * Con default para que una app vieja que no lo manda —ni lo espera— siga
     * deserializando esto sin romperse.
     */
    val beers: Int = 0,
    /**
     * Las birras de los últimos 45 días, que es de donde sale el nivel del
     * perfil.
     *
     * Ventana móvil y no total histórico: el nivel se mantiene tomando. Quien
     * dejó de anotar hace dos meses baja, y eso es lo que lo hace decir algo
     * sobre cómo venís y no sobre cuánto acumulaste alguna vez.
     *
     * 45 días es el mismo corte que `VIEJO_DIAS` —cuándo un precio deja de ser
     * referencia— y no es casualidad: es lo que el proyecto ya considera
     * "todavía cuenta".
     */
    val beersRecent: Int = 0,
)

@Serializable
data class UserDto(
    val id: Long,
    val email: String,
    val displayName: String,
    val avatarUrl: String?,
    val role: String,
    /**
     * Con qué moneda carga precios, no en cuál los ve: cada precio se muestra
     * siempre en la moneda del bar. Ver V16.
     */
    val currency: String = com.birrapp.core.Currency.DEFAULT,
    val defaultSizeMl: Int = 473,
    val defaultRadiusM: Int = 2000,
    /**
     * Cómo te ves en público (BIR-9). Null = no estás en la tabla de
     * colaboradores, que es el default: aparecer se elige, no se hereda del
     * nombre que puso Google.
     */
    val alias: String? = null,
    /**
     * Las birras favoritas (V21). La ficha del bar las usa para decidir qué
     * tres pastillas van adelante cuando hay más de tres.
     */
    val favoriteStyles: List<String> = emptyList(),
    val favoriteBrands: List<String> = emptyList(),
    /**
     * Si ya pasó por la bienvenida. Viaja como booleano y no como fecha porque
     * la app sólo necesita decidir si la muestra; cuándo fue no lo usa nadie.
     *
     * Default `true` para que una app vieja, que no lo manda ni lo espera, no
     * se coma una bienvenida que no sabe dibujar.
     */
    val onboarded: Boolean = true,
)

/** Lo que una persona puede cambiar de sí misma. Todo opcional: se manda lo que cambió. */
@Serializable
data class UpdateMeRequest(
    val displayName: String? = null,
    /**
     * El nombre con el que aparecés en público (BIR-9). Cadena vacía = sacarlo
     * y desaparecer de la tabla de colaboradores.
     */
    val alias: String? = null,
    /**
     * Las birras favoritas. Lista vacía = sacarlas todas; ausente = no tocar.
     * Son dos campos y no uno porque se eligen en dos pasos distintos.
     */
    val favoriteStyles: List<String>? = null,
    val favoriteBrands: List<String>? = null,
    val currency: String? = null,
    val defaultSizeMl: Int? = null,
    val defaultRadiusM: Int? = null,
    /**
     * `true` cierra la bienvenida. Sólo se puede cerrar: mandar `false` no la
     * reabre, porque nada en la app necesita volver a mostrarla y un cliente
     * con un bug no tiene por qué poder devolverle a alguien una pantalla que
     * ya pasó.
     */
    val onboarded: Boolean? = null,
)

fun User.toDto() = UserDto(
    id, email, displayName, avatarUrl, role.name,
    currency, defaultSizeMl, defaultRadiusM, alias,
    favoriteStyles, favoriteBrands, onboardedAt != null,
)

/** Lo que hay que limpiar fuera de la base después de borrar una cuenta. */
data class DeletedAccount(val objectKeys: List<String>)

class UserRepo(private val db: Db) {

    private fun map(rs: ResultSet) = User(
        id = rs.getLong("id"),
        googleSub = rs.getString("google_sub"),
        email = rs.getString("email"),
        displayName = rs.getString("display_name"),
        avatarUrl = rs.getString("avatar_url"),
        role = Role.valueOf(rs.getString("role")),
        bannedAt = rs.getTimestamp("banned_at")?.toInstant(),
        currency = rs.getString("currency"),
        defaultSizeMl = rs.getInt("default_size_ml"),
        defaultRadiusM = rs.getInt("default_radius_m"),
        alias = rs.getString("alias"),
        favoriteStyles = slugs(rs, "favorite_styles"),
        favoriteBrands = slugs(rs, "favorite_brands"),
        onboardedAt = rs.getTimestamp("onboarded_at")?.toInstant(),
    )

    fun findById(id: Long): User? = db.conn {
        it.queryOne("SELECT * FROM users WHERE id = ?", id, map = ::map)
    }

    /**
     * Si la cuenta está baneada, ahora mismo y según la base.
     *
     * Existe porque el rol y la identidad viajan en el JWT, pero el ban **no
     * puede** esperar a que el token expire: hasta `JWT_ACCESS_MINUTES` de
     * abuso sostenido después de haber baneado a alguien es justo lo que la
     * herramienta viene a cortar (era el "a decidir" de BIR-6). Un SELECT por
     * escritura es barato; dos horas de comentarios abusivos no.
     */
    fun isBanned(userId: Long): Boolean = db.conn {
        it.queryOne(
            "SELECT banned_at IS NOT NULL AS banned FROM users WHERE id = ?", userId,
        ) { rs -> rs.getBoolean("banned") } ?: false
    }

    /**
     * Alta o actualización por `google_sub`.
     *
     * El rol NUNCA se toca en el upsert: si un moderador vuelve a loguear no
     * puede perder el rol, y tampoco se puede escalar privilegios volviendo
     * a loguear. Sólo se refrescan nombre y foto.
     */
    fun upsert(identity: GoogleIdentity, bootstrapAdmins: Set<String>): User = db.tx { c ->
        val initialRole =
            if (identity.email.lowercase() in bootstrapAdmins) Role.admin else Role.user

        c.update(
            """
            INSERT INTO users (google_sub, email, display_name, avatar_url,
                               google_avatar_url, role)
            VALUES (?, ?, ?, ?, ?, ?::user_role)
            ON CONFLICT (google_sub) DO UPDATE
              SET email             = EXCLUDED.email,
                  display_name      = EXCLUDED.display_name,
                  google_avatar_url = EXCLUDED.google_avatar_url,
                  -- La foto propia le gana a la de Google y no se pisa al
                  -- volver a entrar. Sin esto, cada login deshacía la que el
                  -- usuario había subido.
                  avatar_url        = CASE
                      WHEN users.avatar_key IS NULL THEN EXCLUDED.avatar_url
                      ELSE users.avatar_url
                  END
            """.trimIndent(),
            identity.sub, identity.email, identity.name, identity.picture,
            identity.picture, initialRole.name,
        )
        val u = c.queryOne("SELECT * FROM users WHERE google_sub = ?", identity.sub, map = ::map)!!

        // Cuenta recién creada: se le deja un alias puesto para que la
        // bienvenida tenga algo que mostrar. Ver `aliasAutomatico`.
        if (u.onboardedAt == null && u.alias == null) {
            val propuesto = aliasAutomatico(c, u.displayName)
            if (propuesto != null) {
                c.update("UPDATE users SET alias = ? WHERE id = ?", propuesto, u.id)
                return@tx u.copy(alias = propuesto)
            }
        }
        u
    }

    /**
     * Un alias libre derivado del nombre de la cuenta: "Felipe Hiba" da
     * `felipe_hiba`.
     *
     * **Sólo para cuentas nuevas, y sólo porque la bienvenida lo muestra.**
     * V20 dejó el alias opt-in y sin default a propósito: `display_name` viene
     * de Google y suele ser el nombre real, y sembrarlo solo equivale a
     * publicar a alguien en la tabla de colaboradores sin preguntarle. Eso
     * sigue valiendo para todo el que ya tiene cuenta — por eso V22 los marca
     * como que ya pasaron por la bienvenida, y por acá no vuelven a pasar.
     *
     * Lo que cambia para una cuenta nueva es que **hay una pantalla**: el
     * primer paso de la bienvenida muestra este alias ya escrito en el campo,
     * dice que es el nombre con el que se la va a ver en público, y deja
     * cambiarlo o borrarlo antes de seguir. El default deja de ser algo que
     * pasa a escondidas y pasa a ser algo que se acepta; sin él, el campo
     * arranca vacío y la mayoría sigue de largo sin entender qué se perdió.
     *
     * **El número al final es por el índice único.** Los nombres se repiten y
     * los alias no pueden: dos "Juan Pérez" no pueden ser los dos `juan_perez`.
     * Se prueba primero el limpio, que es el que alguien querría, y recién si
     * está tomado se le cuelga un número.
     *
     * Devuelve null si no encontró ninguno libre. En ese caso la cuenta queda
     * sin alias y la bienvenida la recibe con el campo vacío, que es un peor
     * comienzo pero no un error: el alias se puede poner después.
     */
    private fun aliasAutomatico(c: Connection, nombre: String): String? {
        // Todo lo que no sea letra o número pasa a ser un guión bajo, y las
        // corridas se colapsan en uno solo: "Ana  María  de la Cruz" no puede
        // dar `ana__maría__de_la_cruz`.
        val base = nombre.trim().lowercase()
            .replace(Regex("[^\\p{L}\\p{N}]+"), "_")
            .trim('_')
            .take(MAX_ALIAS)
            .trimEnd('_')
            .ifEmpty { "birrero" }

        fun libre(a: String) = c.queryOne(
            "SELECT 1 FROM users WHERE lower(alias) = lower(?)", a,
        ) { true } == null

        if (base.length >= MIN_ALIAS && libre(base)) return base

        // Con el número, el alias tiene que seguir entrando en el límite, así
        // que lo que se recorta es la parte del nombre y no el sufijo.
        repeat(INTENTOS_ALIAS) {
            val sufijo = "_" + Random.nextInt(100, 10_000)
            val cand = base.take(MAX_ALIAS - sufijo.length).trimEnd('_') + sufijo
            if (libre(cand)) return cand
        }
        return null
    }

    /**
     * Cambia lo que una persona puede cambiar de sí misma.
     *
     * Se actualiza sólo lo que viene: mandar el objeto entero desde el front
     * haría que dos pantallas abiertas se pisen los cambios entre sí.
     *
     * El nombre se valida como el de un bar y por lo mismo — la columna es
     * `text` sin límite y aparece en la lista de colaboradores.
     */
    fun updateMe(userId: Long, req: UpdateMeRequest): User = db.tx { c ->
        req.displayName?.let { raw ->
            val name = raw.trim()
            if (name.length < 2) com.birrapp.core.badRequest("el nombre es demasiado corto")
            if (name.length > 60) com.birrapp.core.badRequest("el nombre es demasiado largo")
            c.update("UPDATE users SET display_name = ? WHERE id = ?", name, userId)
        }
        req.alias?.let { raw ->
            val alias = raw.trim()
            if (alias.isEmpty()) {
                // Sacarse de la lista tiene que costar lo mismo que entrar.
                c.update("UPDATE users SET alias = NULL WHERE id = ?", userId)
                return@let
            }
            if (alias.length < MIN_ALIAS) com.birrapp.core.badRequest("el alias es demasiado corto")
            if (alias.length > MAX_ALIAS) com.birrapp.core.badRequest("el alias es demasiado largo")
            // Letras, números, espacio y guiones. Sin esto entran emojis,
            // saltos de línea y espacios invisibles, y la tabla pública es
            // justo donde eso se usa para hacerse notar.
            if (!Regex("^[\\p{L}\\p{N}][\\p{L}\\p{N} ._-]*$").matches(alias)) {
                com.birrapp.core.badRequest("el alias sólo puede llevar letras, números, espacios y . _ -")
            }
            // El índice único es el que decide de verdad: entre comprobar y
            // escribir hay una carrera, y dos personas pidiendo el mismo alias
            // a la vez es exactamente el caso que la carrera pierde.
            val tomado = c.queryOne(
                "SELECT 1 FROM users WHERE lower(alias) = lower(?) AND id <> ?", alias, userId,
            ) { true } ?: false
            if (tomado) com.birrapp.core.badRequest("ese alias ya está tomado")
            c.update("UPDATE users SET alias = ? WHERE id = ?", alias, userId)
        }
        // Las favoritas. Se validan contra el vocabulario real: un slug
        // inventado acá no rompe nada al escribir, pero después no coincide
        // con nada y la persona ve que "no le guardó la preferencia" sin
        // entender por qué.
        req.favoriteStyles?.let { pedidos ->
            c.update(
                "UPDATE users SET favorite_styles = ? WHERE id = ?",
                c.createArrayOf("text", limpiar(c, pedidos, "beer_styles").toTypedArray()),
                userId,
            )
        }
        req.favoriteBrands?.let { pedidos ->
            c.update(
                "UPDATE users SET favorite_brands = ? WHERE id = ?",
                c.createArrayOf("text", limpiar(c, pedidos, "brands").toTypedArray()),
                userId,
            )
        }
        req.currency?.let { raw ->
            val cur = com.birrapp.core.Currency.normalize(raw)
                ?: com.birrapp.core.badRequest("no conocemos esa moneda: $raw")
            c.update("UPDATE users SET currency = ? WHERE id = ?", cur, userId)
        }
        req.defaultSizeMl?.let { ml ->
            if (ml !in 100..2000) com.birrapp.core.badRequest("tamaño fuera de rango (100-2000 ml)")
            c.update("UPDATE users SET default_size_ml = ? WHERE id = ?", ml, userId)
        }
        req.defaultRadiusM?.let { m ->
            if (m !in 300..20_000) com.birrapp.core.badRequest("radio fuera de rango")
            c.update("UPDATE users SET default_radius_m = ? WHERE id = ?", m, userId)
        }
        // Cerrar la bienvenida. `IS NULL` para que reintentar el pedido —o dos
        // pestañas cerrándola a la vez— no corra la fecha: el primero que la
        // cierra es el que vale.
        if (req.onboarded == true) {
            c.update(
                "UPDATE users SET onboarded_at = now() WHERE id = ? AND onboarded_at IS NULL",
                userId,
            )
        }
        c.queryOne("SELECT * FROM users WHERE id = ?", userId, map = ::map)!!
    }

    /**
     * Guarda la foto propia y devuelve la llave de la anterior, si había.
     *
     * Devuelve la vieja para que quien llama borre el objeto del bucket: si no,
     * cada cambio de foto deja un archivo huérfano ahí para siempre, y son
     * públicos.
     */
    fun setAvatar(userId: Long, key: String, url: String): String? = db.tx { c ->
        val previous = c.queryOne(
            "SELECT avatar_key FROM users WHERE id = ?", userId,
        ) { it.getString("avatar_key") }
        c.update(
            "UPDATE users SET avatar_key = ?, avatar_url = ? WHERE id = ?",
            key, url, userId,
        )
        previous
    }

    /** Saca la foto propia y vuelve a la de Google. Devuelve la llave a borrar. */
    fun clearAvatar(userId: Long): String? = db.tx { c ->
        val previous = c.queryOne(
            "SELECT avatar_key FROM users WHERE id = ?", userId,
        ) { it.getString("avatar_key") }
        c.update(
            "UPDATE users SET avatar_key = NULL, avatar_url = google_avatar_url WHERE id = ?",
            userId,
        )
        previous
    }

    /**
     * Cambia el rol de alguien, de parte de [actorId].
     *
     * **Nadie se cambia el rol a sí mismo.** No es una formalidad: el rol sólo
     * se siembra al crear la cuenta —`BOOTSTRAP_ADMIN_EMAILS` se lee en el
     * INSERT y el upsert no lo toca nunca—, así que al único admin que queda no
     * lo puede volver a subir nadie. Un toque de más en una lista de usuarios y
     * la salida es un UPDATE a mano en la base de producción.
     *
     * La regla vive acá y no en el handler porque acá la alcanzan los tests: el
     * proyecto no tiene pruebas de ruta, así que una guardia en la ruta sería
     * una guardia sin cubrir.
     */
    fun setRole(actorId: Long, targetId: Long, role: Role): Boolean {
        if (actorId == targetId) {
            com.birrapp.core.badRequest("no podés cambiarte el rol a vos mismo: pedíselo a otro admin")
        }
        return db.conn {
            it.update("UPDATE users SET role = ?::user_role WHERE id = ?", role.name, targetId) > 0
        }
    }

    /**
     * Borra la cuenta y sus datos personales.
     *
     * Obligatorio por las políticas de Apple y de Google Play si la app
     * permite crear cuenta.
     *
     * Los reportes de precio NO se borran: son observaciones sobre bares, no
     * datos personales, y borrarlos degradaría el mapa para todos. Se
     * desvinculan del usuario (`reported_by` queda NULL), que es lo que pide
     * la regulación: que la persona deje de ser identificable.
     */
    fun deleteAccount(userId: Long): DeletedAccount? = db.tx { c ->
        // Las fotos propias se juntan ANTES de borrar la fila: el FK es ON
        // DELETE CASCADE, así que después de borrar al usuario ya no hay forma
        // de saber qué objetos del bucket eran suyos. Y quedarían públicos,
        // que es exactamente lo que el borrado de cuenta viene a evitar.
        val objects = c.query(
            "SELECT object_key FROM bar_photos WHERE user_id = ?", userId,
        ) { it.getString("object_key") }.toMutableList()

        c.queryOne("SELECT avatar_key FROM users WHERE id = ?", userId) {
            it.getString("avatar_key")
        }?.let { objects += it }

        c.update("UPDATE price_reports SET reported_by = NULL WHERE reported_by = ?", userId)
        c.update("DELETE FROM reviews WHERE user_id = ?", userId)
        c.update("UPDATE flags SET reporter_id = NULL WHERE reporter_id = ?", userId)
        c.update("DELETE FROM refresh_tokens WHERE user_id = ?", userId)
        if (c.update("DELETE FROM users WHERE id = ?", userId) == 0) return@tx null
        DeletedAccount(objects)
    }

    fun stats(userId: Long): UserStats = db.conn { c ->
        c.queryOne(
            """
            SELECT
              (SELECT count(*) FROM price_reports
                WHERE reported_by = ? AND status = 'active') AS precios,
              (SELECT count(*) FROM price_reports
                WHERE reported_by = ? AND is_confirmation) AS confirmaciones,
              (SELECT count(*) FROM bars WHERE created_by = ?) AS bares,
              (SELECT count(*) FROM reviews WHERE user_id = ?) AS resenas,
              (SELECT count(*) FROM bar_photos
                WHERE user_id = ? AND status = 'active') AS fotos,
              -- El contador de birras viaja acá y no en su propio pedido
              -- (BIR-43). Perfil mostraba un solo número y para conseguirlo
              -- llamaba a `/beers/summary`, que arma el calendario del mes,
              -- las rachas, los bares top y los emblemas. Era la consulta más
              -- cara de la pantalla, para dibujar un entero.
              (SELECT coalesce(sum(qty), 0)::int FROM beer_logs
                WHERE user_id = ?) AS birras,
              -- Las de los últimos 45 días, que es de lo que sale el nivel.
              -- Es una ventana móvil a propósito: el nivel se mantiene tomando,
              -- no se gana una vez. El índice (user_id, drank_at DESC) ya
              -- cubre el filtro.
              (SELECT coalesce(sum(qty), 0)::int FROM beer_logs
                WHERE user_id = ? AND drank_at > now() - interval '45 days')
                AS birras_recientes
            """.trimIndent(),
            userId, userId, userId, userId, userId, userId, userId,
        ) { rs ->
            UserStats(
                prices = rs.getInt("precios"),
                confirmations = rs.getInt("confirmaciones"),
                bars = rs.getInt("bares"),
                reviews = rs.getInt("resenas"),
                photos = rs.getInt("fotos"),
                beers = rs.getInt("birras"),
                beersRecent = rs.getInt("birras_recientes"),
            )
        } ?: UserStats(0, 0, 0, 0, 0)
    }

    fun setBanned(userId: Long, banned: Boolean): Boolean = db.conn {
        it.update(
            "UPDATE users SET banned_at = ${if (banned) "now()" else "NULL"} WHERE id = ?",
            userId,
        ) > 0
    }
}

/**
 * Refresh tokens opacos y rotativos, guardados hasheados.
 *
 * Se guarda SHA-256, nunca el token en claro: si se filtra la base, los
 * hashes no sirven para autenticarse.
 */
class RefreshTokenRepo(private val db: Db) {
    private val rng = SecureRandom()

    fun issue(userId: Long, ttlDays: Long): String {
        val raw = ByteArray(32).also { rng.nextBytes(it) }
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        db.conn {
            it.update(
                "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) " +
                    "VALUES (?, ?, now() + make_interval(days => ?))",
                userId, sha256(raw), ttlDays.toInt(),
            )
        }
        return raw
    }

    /**
     * Consume el token y emite uno nuevo (rotación). null si es inválido.
     *
     * El token viejo NO se revoca en el acto: se le deja una ventana corta de
     * gracia. Con revocación inmediata, si la respuesta con el token nuevo se
     * pierde —red inestable, la app se cierra a mitad— el cliente se queda con
     * uno ya muerto y en el siguiente intento lo echa la sesión, sin que haya
     * pasado nada malo. Con la ventana, ese reintento funciona.
     *
     * La rotación sigue cumpliendo su función: un token robado deja de servir
     * en segundos, no en 60 días.
     */
    fun rotate(raw: String, ttlDays: Long): Pair<Long, String>? = db.tx { c ->
        val userId = c.queryOne(
            "SELECT user_id FROM refresh_tokens " +
                "WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > now()",
            sha256(raw),
        ) { it.getLong("user_id") } ?: return@tx null

        c.update(
            "UPDATE refresh_tokens SET expires_at = now() + interval '90 seconds' " +
                "WHERE token_hash = ?",
            sha256(raw),
        )
        val next = ByteArray(32).also { rng.nextBytes(it) }
            .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        c.update(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) " +
                "VALUES (?, ?, now() + make_interval(days => ?))",
            userId, sha256(next), ttlDays.toInt(),
        )
        userId to next
    }

    fun revokeAllFor(userId: Long) = db.conn {
        it.update(
            "UPDATE refresh_tokens SET revoked_at = now() " +
                "WHERE user_id = ? AND revoked_at IS NULL",
            userId,
        )
    }

    private fun sha256(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray())
            .joinToString("") { "%02x".format(it) }
}

/** Lee una columna `text[]`, tolerando null. */
private fun slugs(rs: ResultSet, col: String): List<String> {
    val arr = rs.getArray(col) ?: return emptyList()
    @Suppress("UNCHECKED_CAST")
    return (arr.array as Array<String?>).filterNotNull()
}

/** Cuántas favoritas se aceptan por lista. */
private const val MAX_FAVORITAS = 10

/**
 * Deja sólo los slugs que existen de verdad, sin repetir y con un techo.
 *
 * El techo no es por espacio: la ficha del bar muestra tres, así que guardar
 * cincuenta no le sirve a nadie y sí es una forma de que alguien meta un array
 * enorme en cada perfil.
 */
private fun limpiar(
    c: java.sql.Connection, pedidos: List<String>, tabla: String,
): List<String> {
    val unicos = pedidos.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
    if (unicos.isEmpty()) return emptyList()
    if (unicos.size > MAX_FAVORITAS) {
        com.birrapp.core.badRequest("son demasiadas favoritas (máximo $MAX_FAVORITAS)")
    }
    val existen = c.query(
        "SELECT slug FROM $tabla WHERE slug = ANY (?)",
        c.createArrayOf("text", unicos.toTypedArray()),
    ) { it.getString("slug") }.toSet()
    // Se conserva el orden en que las eligió: es el orden en que las va a ver.
    return unicos.filter { it in existen }
}
