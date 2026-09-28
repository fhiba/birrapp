package com.birrapp.loyalty

import com.birrapp.core.Db
import com.birrapp.core.badRequest
import com.birrapp.core.forbidden
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.core.unauthorized
import com.birrapp.core.update
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import kotlinx.serialization.Serializable

/**
 * Las cuentas del portal del bar.
 *
 * ## Por qué mail y clave, y no Google
 *
 * Todo el resto de la app entra con Google, y para el mozo no sirve: el celular
 * del bar es del bar, no de la persona, y pedirle a cada mozo que deje su cuenta
 * de Google abierta en el mostrador es pedirle que preste su identidad entera
 * —su mail, su Drive— para confirmar un canje.
 *
 * Es la primera vez que la app guarda contraseñas, así que conviene decir qué se
 * hace y qué no:
 *
 * - **PBKDF2-HMAC-SHA256, del JDK.** Sin dependencia nueva. No es Argon2, que
 *   sería mejor contra un atacante con GPU, pero con 210.000 iteraciones está
 *   dentro de lo que OWASP acepta hoy y no suma una librería al proyecto por
 *   una pantalla de login. El hash se guarda **auto-descriptivo**
 *   (`pbkdf2$sha256$iteraciones$sal$hash`), así que el día que convenga cambiar
 *   de algoritmo se puede, verificando con el viejo y re-hasheando al entrar.
 * - **Sal por cuenta**, del generador criptográfico.
 * - **Comparación en tiempo constante**, para no filtrar el hash byte a byte.
 *
 * ## Lo que este login NO es
 *
 * No emite tokens que sirvan en la app de usuario. El token del portal lleva
 * `scope: "partner"` y el del usuario no lo lleva: un mozo no puede usar su
 * sesión para actuar como persona, ni al revés. Sin esa separación, una cuenta
 * de bar sería una cuenta de usuario con otro nombre.
 */
@Serializable
data class StaffDto(
    val id: Long,
    val partnerId: Long,
    val barId: Long,
    val barName: String,
    val email: String,
    val displayName: String,
    val role: String,
)

class PartnerAuthRepo(private val db: Db) {

    /**
     * Da de alta una cuenta del portal.
     *
     * El mail se guarda tal como se escribió pero se compara en minúsculas: el
     * índice único es sobre `lower(email)`, así que `Mozo@Bar.com` y
     * `mozo@bar.com` son la misma cuenta.
     */
    fun crear(
        partnerId: Long, email: String, clave: String, nombre: String, rol: String = "staff",
    ): StaffDto = db.tx { c ->
        val mail = email.trim()
        if (!mail.contains('@') || mail.length < 5) badRequest("ese mail no parece válido")
        validarClave(clave)
        if (rol !in setOf("owner", "staff")) badRequest("rol inválido: owner o staff")

        val tomado = c.queryOne(
            "SELECT 1 FROM partner_staff WHERE lower(email) = lower(?)", mail,
        ) { true } ?: false
        if (tomado) badRequest("ya hay una cuenta con ese mail")

        val id = c.queryOne(
            "INSERT INTO partner_staff (partner_id, email, password_hash, display_name, role) " +
                "VALUES (?, ?, ?, ?, ?::staff_role) RETURNING id",
            partnerId, mail, hash(clave), nombre.trim().ifEmpty { mail.substringBefore('@') }, rol,
        ) { it.getLong("id") }!!

        buscarPorId(c, id)!!
    }

    /**
     * Valida mail y clave.
     *
     * El mensaje de error es **el mismo** para "no existe ese mail" y para "la
     * clave está mal". Distinguirlos convierte el login en un oráculo que dice
     * qué mails tienen cuenta, y de ahí sale la lista para el siguiente intento.
     *
     * Y se hashea igual cuando la cuenta no existe: si sólo se hasheara en el
     * caso bueno, la diferencia de tiempo diría lo mismo que el mensaje que
     * acabamos de igualar.
     */
    fun login(email: String, clave: String): StaffDto = db.conn { c ->
        val fila = c.queryOne(
            """
            SELECT s.id, s.password_hash
            FROM partner_staff s
            JOIN partner_bars p ON p.id = s.partner_id
            WHERE lower(s.email) = lower(?) AND s.disabled_at IS NULL
              AND p.status IN ('active', 'onboarding')
            """.trimIndent(),
            email.trim(),
        ) { it.getLong("id") to it.getString("password_hash") }

        val hashGuardado = fila?.second ?: HASH_DE_DESCARTE
        val coincide = verificar(clave, hashGuardado)
        if (fila == null || !coincide) unauthorized("mail o clave incorrectos")

        buscarPorId(c, fila.first)!!
    }

    fun staffDelBar(partnerId: Long): List<StaffDto> = db.conn { c ->
        c.query(
            "$SELECT_STAFF WHERE s.partner_id = ? AND s.disabled_at IS NULL " +
                "ORDER BY s.role, lower(s.display_name)",
            partnerId,
        ) { mapStaff(it) }
    }

    /**
     * Apaga una cuenta de mozo.
     *
     * No se borra: los canjes que confirmó apuntan acá, y un canje sin quien lo
     * confirmó es un canje sin auditoría. Un mozo que se fue es una cuenta
     * apagada.
     *
     * Y no se puede apagar al último dueño: sin dueño no hay quien administre
     * el bar, y recuperarlo sería entrar a la base a mano.
     */
    fun deshabilitar(partnerId: Long, staffId: Long): Boolean = db.tx { c ->
        val rol = c.queryOne(
            "SELECT role::text AS r FROM partner_staff " +
                "WHERE id = ? AND partner_id = ? AND disabled_at IS NULL",
            staffId, partnerId,
        ) { it.getString("r") } ?: return@tx false

        if (rol == "owner") {
            val dueños = c.queryOne(
                "SELECT count(*)::int AS n FROM partner_staff " +
                    "WHERE partner_id = ? AND role = 'owner' AND disabled_at IS NULL",
                partnerId,
            ) { it.getInt("n") } ?: 0
            if (dueños <= 1) forbidden("es el único dueño: el bar quedaría sin quien lo administre")
        }

        c.update("UPDATE partner_staff SET disabled_at = now() WHERE id = ?", staffId) > 0
    }

    fun porId(staffId: Long): StaffDto? = db.conn { buscarPorId(it, staffId) }

    private fun buscarPorId(c: java.sql.Connection, id: Long): StaffDto? = c.queryOne(
        "$SELECT_STAFF WHERE s.id = ? AND s.disabled_at IS NULL", id,
    ) { mapStaff(it) }

    private fun mapStaff(rs: java.sql.ResultSet) = StaffDto(
        id = rs.getLong("id"), partnerId = rs.getLong("partner_id"),
        barId = rs.getLong("bar_id"), barName = rs.getString("bar_name"),
        email = rs.getString("email"), displayName = rs.getString("display_name"),
        role = rs.getString("rol"),
    )

    private companion object {
        val SELECT_STAFF = """
            SELECT s.id, s.partner_id, s.email, s.display_name, s.role::text AS rol,
                   p.bar_id, b.name AS bar_name
            FROM partner_staff s
            JOIN partner_bars p ON p.id = s.partner_id
            JOIN bars b ON b.id = p.bar_id
        """.trimIndent()

        /**
         * Un hash real contra el que verificar cuando la cuenta no existe.
         *
         * Es de la clave "no-existe" y no le sirve a nadie para entrar: está
         * sólo para que el login tarde lo mismo exista o no exista el mail.
         */
        val HASH_DE_DESCARTE = hash("no-existe")
    }
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

private const val ITERACIONES = 210_000
private const val LARGO_BITS = 256
private val random = SecureRandom()

/** Mínimos de la clave. Cortos a propósito: los pone un mozo, no un sysadmin. */
fun validarClave(clave: String) {
    if (clave.length < 8) badRequest("la clave necesita al menos 8 caracteres")
    if (clave.length > 200) badRequest("esa clave es demasiado larga")
    if (clave.isBlank()) badRequest("la clave no puede estar vacía")
}

/** `pbkdf2$sha256$iteraciones$sal$hash`, en base64 sin relleno. */
fun hash(clave: String, sal: ByteArray = ByteArray(16).also { random.nextBytes(it) }): String {
    val b64 = Base64.getEncoder().withoutPadding()
    return "pbkdf2\$sha256\$$ITERACIONES\$${b64.encodeToString(sal)}\$" +
        b64.encodeToString(derivar(clave, sal, ITERACIONES))
}

fun verificar(clave: String, guardado: String): Boolean {
    val partes = guardado.split('$')
    if (partes.size != 5 || partes[0] != "pbkdf2" || partes[1] != "sha256") return false
    val iteraciones = partes[2].toIntOrNull() ?: return false
    val dec = Base64.getDecoder()
    val sal = runCatching { dec.decode(partes[3]) }.getOrNull() ?: return false
    val esperado = runCatching { dec.decode(partes[4]) }.getOrNull() ?: return false
    return igualEnTiempoConstante(derivar(clave, sal, iteraciones), esperado)
}

private fun derivar(clave: String, sal: ByteArray, iteraciones: Int): ByteArray =
    SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        .generateSecret(PBEKeySpec(clave.toCharArray(), sal, iteraciones, LARGO_BITS))
        .encoded

/**
 * Comparación que tarda lo mismo coincidan o no.
 *
 * `contentEquals` corta en el primer byte distinto, y esa diferencia de tiempo
 * alcanza para adivinar el hash byte por byte con suficientes intentos.
 */
private fun igualEnTiempoConstante(a: ByteArray, b: ByteArray): Boolean {
    if (a.size != b.size) return false
    var dif = 0
    for (i in a.indices) dif = dif or (a[i].toInt() xor b[i].toInt())
    return dif == 0
}
