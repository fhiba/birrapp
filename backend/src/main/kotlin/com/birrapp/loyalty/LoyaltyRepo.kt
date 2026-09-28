package com.birrapp.loyalty

import com.birrapp.core.Db
import com.birrapp.core.badRequest
import com.birrapp.core.conflict
import com.birrapp.core.notFound
import com.birrapp.core.query
import com.birrapp.core.queryOne
import com.birrapp.core.update
import java.math.BigDecimal
import java.security.SecureRandom
import java.sql.Connection
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Instant
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlinx.serialization.Serializable

/**
 * Los puntos: acreditar, reservar y canjear.
 *
 * ## La regla de oro de este archivo
 *
 * **Todo lo que toca puntos va adentro de `db.tx`, y el saldo se mueve siempre
 * por `points_balance`.** No porque haga falta para leer —el saldo se podría
 * calcular con un `SUM` sobre el ledger— sino porque actualizar esa fila toma
 * su lock, y ése es el único punto donde dos canjes de la misma persona se
 * serializan. Sin eso, dos pedidos simultáneos leen el mismo saldo, los dos ven
 * que alcanza y los dos reservan.
 *
 * El `CHECK (balance >= 0)` es la última palabra. Acá no se comprueba el saldo
 * antes de reservar: se resta, y si no alcanzaba, la base rebota la
 * transacción entera. Comprobar antes sería exactamente la carrera que se
 * quiere evitar.
 *
 * ## El orden de los locks
 *
 * Siempre **primero la persona, después el beneficio**. Dos transacciones que
 * tomen los mismos dos locks en orden distinto se abrazan y una muere por
 * deadlock. Es una convención y hay que respetarla en todo lo que se agregue.
 */
@Serializable
data class SaldoDto(
    val balance: Int,
    /** Cuántos vencen dentro de la ventana próxima, para poder avisar. */
    val venceEnBreve: Int,
)

@Serializable
data class BeneficioDto(
    val id: Long,
    val partnerId: Long,
    val barId: Long,
    val barName: String,
    val title: String,
    val detail: String?,
    val costPoints: Int,
    /** `null` = sin tope de stock. */
    val stock: Int?,
)

/** Lo que ve quien acaba de reservar: el código y hasta cuándo sirve. */
@Serializable
data class CanjeDto(
    val redemptionId: Long,
    val code: String,
    val expiresAt: String,
    val benefitTitle: String,
    val barName: String,
)

/** Una fila del listado de canjes del bar, para conciliar contra el POS. */
@Serializable
data class CanjeDelBarDto(
    val id: Long,
    val benefitTitle: String,
    val costPoints: Int,
    val status: String,
    val userName: String,
    val createdAt: String,
    val redeemedAt: String?,
    /** Qué mozo lo confirmó. Null si todavía no se confirmó. */
    val redeemedBy: String?,
)

/** Lo que ve el mozo al confirmar. */
@Serializable
data class CanjeConfirmadoDto(
    val redemptionId: Long,
    val benefitTitle: String,
    val costPoints: Int,
    val userName: String,
)

class LoyaltyRepo(
    private val db: Db,
    private val program: LoyaltyProgram,
    /**
     * La pimienta con la que se guarda el código de canje.
     *
     * El código son seis dígitos y vive cinco minutos, así que el valor de
     * robarlo es bajo — pero una lectura de la base no tiene por qué entregar
     * códigos vivos. Se usa HMAC y no un hash a secas para que no alcance con
     * tener la base: hace falta también el secreto del servidor.
     *
     * Determinístico a propósito: el mozo tipea el código y hay que poder
     * encontrarlo por él.
     */
    private val pepper: String,
) {
    private val random = SecureRandom()

    // ---------------------------------------------------------------------
    // Saldo
    // ---------------------------------------------------------------------

    fun saldo(userId: Long): SaldoDto = db.conn { c ->
        val balance = c.queryOne(
            "SELECT balance FROM points_balance WHERE user_id = ?", userId,
        ) { it.getInt("balance") } ?: 0

        // Lo que vence pronto sale del ledger y no del saldo: el saldo es un
        // número solo, y para avisar "se te vencen 300" hace falta saber de qué
        // acreditaciones vienen.
        val pronto = c.queryOne(
            """
            SELECT coalesce(sum(amount), 0)::int AS n FROM points_ledger
            WHERE user_id = ? AND kind = 'earn'
              AND expires_at > now() AND expires_at < now() + interval '7 days'
            """.trimIndent(),
            userId,
        ) { it.getInt("n") } ?: 0

        SaldoDto(balance, minOf(pronto, balance))
    }

    fun movimientos(userId: Long, limit: Int = 50): List<Map<String, String>> = db.conn { c ->
        c.query(
            """
            SELECT kind::text AS kind, amount, created_at, expires_at
            FROM points_ledger WHERE user_id = ?
            ORDER BY created_at DESC, id DESC LIMIT ?
            """.trimIndent(),
            userId, limit.coerceIn(1, 200),
        ) { rs ->
            buildMap {
                put("kind", rs.getString("kind"))
                put("amount", rs.getInt("amount").toString())
                put("at", rs.getTimestamp("created_at").toInstant().toString())
                rs.getTimestamp("expires_at")?.let { put("expiresAt", it.toInstant().toString()) }
            }
        }
    }

    // ---------------------------------------------------------------------
    // Acreditar
    // ---------------------------------------------------------------------

    /**
     * Acredita los puntos de un comprobante ya validado.
     *
     * Quien llama es el responsable de haber validado el ticket contra ARCA:
     * este método **no valida nada del comprobante**, sólo lo registra y
     * acredita. La separación es a propósito — la validación es un servicio
     * externo y lento, y no puede vivir adentro de la transacción que mueve el
     * saldo.
     *
     * Lo que sí garantiza: que el mismo comprobante no acredite dos veces. No
     * lo comprueba antes, lo intenta y deja que el índice único decida. Entre
     * comprobar e insertar hay una carrera y ésta es exactamente la operación
     * donde esa carrera vale plata.
     */
    fun acreditar(userId: Long, ticket: TicketValidado): Acreditacion = db.tx { c ->
        val partner = c.queryOne(
            "SELECT id FROM partner_bars WHERE cuit = ? AND status = 'active'", ticket.cuit,
        ) { it.getLong("id") } ?: run {
            registrarRechazo(c, userId, ticket, "bar_no_afiliado")
            return@tx Acreditacion.Rechazada("bar_no_afiliado")
        }

        // El techo diario, contra lo ya acreditado hoy en hora de Buenos Aires.
        val hoy = c.queryOne(
            """
            SELECT coalesce(sum(points), 0)::int AS n FROM ticket_claims
            WHERE user_id = ? AND status = 'approved'
              AND (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
                = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
            """.trimIndent(),
            userId,
        ) { it.getInt("n") } ?: 0

        val puntos = program.puntosPor(ticket.importe)
        if (puntos <= 0) {
            registrarRechazo(c, userId, ticket, "importe_sin_puntos", partner)
            return@tx Acreditacion.Rechazada("importe_sin_puntos")
        }
        if (hoy + puntos > program.puntosMaximosPorDia) {
            registrarRechazo(c, userId, ticket, "tope_diario", partner)
            return@tx Acreditacion.Rechazada("tope_diario")
        }

        val ticketId = try {
            c.queryOne(
                """
                INSERT INTO ticket_claims
                    (user_id, partner_id, cuit, pto_vta, cbte_tipo, cbte_nro, cbte_fecha,
                     importe, moneda, cod_aut, qr_payload, status, arca_result,
                     arca_checked_at, points)
                VALUES (?, ?, ?, ?, ?, ?, ?::date, ?, ?, ?, ?, 'approved', 'A', now(), ?)
                RETURNING id
                """.trimIndent(),
                userId, partner, ticket.cuit, ticket.ptoVta, ticket.cbteTipo, ticket.cbteNro,
                ticket.fecha.toString(), ticket.importe, ticket.moneda, ticket.codAut,
                ticket.payload, puntos,
            ) { it.getLong("id") }!!
        } catch (e: org.postgresql.util.PSQLException) {
            // 23505 = unique_violation. Es el índice de identidad: alguien ya
            // reclamó este comprobante. No es un error del servidor, es la
            // respuesta.
            if (e.sqlState == "23505") return@tx Acreditacion.Rechazada("ya_reclamado")
            throw e
        }

        mover(c, userId, "earn", puntos, ticketId = ticketId, expiresAt = program.venceEl())
        Acreditacion.Acreditada(puntos, saldoDe(c, userId))
    }

    private fun registrarRechazo(
        c: Connection, userId: Long, t: TicketValidado, motivo: String, partner: Long? = null,
    ) {
        c.update(
            """
            INSERT INTO ticket_claims
                (user_id, partner_id, cuit, pto_vta, cbte_tipo, cbte_nro, cbte_fecha,
                 importe, moneda, cod_aut, qr_payload, status, reject_code, points)
            VALUES (?, ?, ?, ?, ?, ?, ?::date, ?, ?, ?, ?, 'rejected', ?, 0)
            """.trimIndent(),
            userId, partner, t.cuit, t.ptoVta, t.cbteTipo, t.cbteNro, t.fecha.toString(),
            t.importe, t.moneda, t.codAut, t.payload, motivo,
        )
    }

    // ---------------------------------------------------------------------
    // Canjear
    // ---------------------------------------------------------------------

    /**
     * Reserva un beneficio: debita los puntos y devuelve el código.
     *
     * Debita **al reservar** y no al canjear. Así el saldo que se muestra es el
     * que se puede gastar, sin tener que restar reservas vivas en cada lectura;
     * si el código vence sin usarse, se devuelve.
     */
    fun reservar(userId: Long, benefitId: Long): CanjeDto = db.tx { c ->
        // Lock de la persona PRIMERO. Ver el comentario de arriba sobre orden.
        asegurarSaldo(c, userId)

        val b = c.queryOne(
            """
            SELECT b.id, b.partner_id, b.title, b.cost_points, b.stock, b.status::text AS st,
                   b.starts_at, b.ends_at, ba.name AS bar_name
            FROM benefits b
            JOIN partner_bars p ON p.id = b.partner_id
            JOIN bars ba ON ba.id = p.bar_id
            WHERE b.id = ? AND p.status = 'active'
            FOR UPDATE OF b
            """.trimIndent(),
            benefitId,
        ) { rs ->
            Beneficio(
                id = rs.getLong("id"), partnerId = rs.getLong("partner_id"),
                title = rs.getString("title"), cost = rs.getInt("cost_points"),
                stock = rs.getObject("stock")?.let { (it as Number).toInt() },
                status = rs.getString("st"), barName = rs.getString("bar_name"),
            )
        } ?: notFound("ese beneficio no existe o el bar no está activo")

        if (b.status != "active") conflict("ese beneficio no está disponible")
        if (b.stock != null && b.stock <= 0) conflict("ese beneficio se agotó")

        val expira = Instant.now().plus(program.vigenciaDelCodigo)
        val codigo = sortearCodigo()

        val redemptionId = c.queryOne(
            """
            INSERT INTO redemptions
                (benefit_id, partner_id, user_id, cost_points, code_hash, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id
            """.trimIndent(),
            b.id, b.partnerId, userId, b.cost, hash(codigo), Timestamp.from(expira),
        ) { it.getLong("id") }!!

        // El débito. Si no alcanzaba, el CHECK de `points_balance` rebota la
        // transacción entera y el canje que acabamos de insertar se va con ella.
        mover(c, userId, "hold", -b.cost, redemptionId = redemptionId)

        if (b.stock != null) {
            c.update("UPDATE benefits SET stock = stock - 1 WHERE id = ?", b.id)
        }

        CanjeDto(redemptionId, codigo, expira.toString(), b.title, b.barName)
    }

    /**
     * El mozo confirma un código.
     *
     * El código se busca **acotado al bar del mozo**. Un código del bar de al
     * lado no existe para éste, y eso no depende de que quien llama se acuerde
     * de comparar: está en el WHERE.
     */
    fun confirmar(staffId: Long, partnerId: Long, codigo: String): CanjeConfirmadoDto {
        // La transacción NO lanza. Ésta es la parte que costó un test:
        // liberar los puntos y después tirar la excepción adentro del mismo
        // `db.tx` hacía rollback de la liberación junto con todo lo demás, así
        // que el código quedaba vencido, los puntos sin devolver, y la persona
        // veía "venció" con el saldo todavía descontado.
        //
        // Ahora la transacción devuelve qué pasó, y lo que tenga efecto —
        // liberar— corre en su propia transacción, ya afuera.
        val r = db.tx { c ->
            c.queryOne(
                """
                SELECT r.id, r.user_id, r.cost_points, r.expires_at, r.benefit_id, b.title,
                       coalesce(u.alias, u.display_name) AS quien
                FROM redemptions r
                JOIN benefits b ON b.id = r.benefit_id
                JOIN users u ON u.id = r.user_id
                WHERE r.partner_id = ? AND r.code_hash = ? AND r.status = 'pending'
                FOR UPDATE OF r
                """.trimIndent(),
                partnerId, hash(codigo),
            ) { rs ->
                val p = Pendiente(
                    id = rs.getLong("id"), userId = rs.getLong("user_id"),
                    cost = rs.getInt("cost_points"),
                    expiresAt = rs.getTimestamp("expires_at").toInstant(),
                    benefitId = rs.getLong("benefit_id"),
                    title = rs.getString("title"), quien = rs.getString("quien"),
                )
                if (p.expiresAt.isBefore(Instant.now())) {
                    p to null
                } else {
                    c.update(
                        "UPDATE redemptions SET status = 'redeemed', redeemed_at = now(), " +
                            "redeemed_by = ? WHERE id = ? AND status = 'pending'",
                        staffId, p.id,
                    )
                    // Los puntos NO se mueven: ya se debitaron al reservar.
                    p to CanjeConfirmadoDto(p.id, p.title, p.cost, p.quien)
                }
            }
        } ?: notFound("ese código no existe o ya se usó")

        val (pendiente, confirmado) = r
        if (confirmado != null) return confirmado

        // Vencido. Se libera en el momento en que alguien lo descubre, en vez
        // de esperar al barrido: el saldo vuelve mientras la persona todavía
        // está en la mesa.
        db.tx { c -> liberar(c, pendiente.id, pendiente.userId, pendiente.cost, pendiente.benefitId) }
        conflict("ese código venció")
    }

    /**
     * Devuelve los puntos de las reservas que vencieron.
     *
     * Corre como barrido y también al toparse con una vencida. Que sea
     * idempotente es lo que permite las dos cosas: el `WHERE status =
     * 'pending'` de cada UPDATE es lo que impide devolver dos veces.
     */
    fun liberarVencidas(limit: Int = 200): Int = db.tx { c ->
        val vencidas = c.query(
            "SELECT id, user_id, cost_points, benefit_id FROM redemptions " +
                "WHERE status = 'pending' AND expires_at < now() " +
                "ORDER BY expires_at LIMIT ? FOR UPDATE SKIP LOCKED",
            limit,
        ) { rs ->
            Triple(rs.getLong("id"), rs.getLong("user_id"), rs.getInt("cost_points")) to
                rs.getLong("benefit_id")
        }
        for ((t, benefitId) in vencidas) {
            val (id, userId, cost) = t
            liberar(c, id, userId, cost, benefitId)
        }
        vencidas.size
    }

    /**
     * Cierra una reserva vencida y devuelve lo que había tomado.
     *
     * El `WHERE status = 'pending'` del UPDATE es lo que la hace idempotente:
     * si otra transacción llegó primero, `filas` es 0 y no se devuelve nada.
     * Sin esa guarda, dos barridos simultáneos acreditan los puntos dos veces —
     * que es fabricar plata desde una tarea de mantenimiento.
     */
    private fun liberar(
        c: Connection, redemptionId: Long, userId: Long, cost: Int, benefitId: Long,
    ) {
        val filas = c.update(
            "UPDATE redemptions SET status = 'expired' WHERE id = ? AND status = 'pending'",
            redemptionId,
        )
        if (filas > 0) {
            mover(c, userId, "release", cost, redemptionId = redemptionId)
            c.update(
                "UPDATE benefits SET stock = stock + 1 WHERE id = ? AND stock IS NOT NULL",
                benefitId,
            )
        }
    }

    // ---------------------------------------------------------------------
    // Catálogo
    // ---------------------------------------------------------------------

    fun beneficios(limit: Int = 50): List<BeneficioDto> = db.conn { c ->
        c.query(
            """
            SELECT b.id, b.partner_id, b.title, b.detail, b.cost_points, b.stock,
                   p.bar_id, ba.name AS bar_name
            FROM benefits b
            JOIN partner_bars p ON p.id = b.partner_id AND p.status = 'active'
            JOIN bars ba ON ba.id = p.bar_id
            WHERE b.status = 'active'
              AND (b.starts_at IS NULL OR b.starts_at <= now())
              AND (b.ends_at   IS NULL OR b.ends_at   >  now())
              AND (b.stock IS NULL OR b.stock > 0)
            ORDER BY b.cost_points ASC, b.id
            LIMIT ?
            """.trimIndent(),
            limit.coerceIn(1, 200),
        ) { rs ->
            BeneficioDto(
                id = rs.getLong("id"), partnerId = rs.getLong("partner_id"),
                barId = rs.getLong("bar_id"), barName = rs.getString("bar_name"),
                title = rs.getString("title"), detail = rs.getString("detail"),
                costPoints = rs.getInt("cost_points"),
                stock = rs.getObject("stock")?.let { (it as Number).toInt() },
            )
        }
    }

    // ---------------------------------------------------------------------
    // El portal del bar
    // ---------------------------------------------------------------------

    /**
     * Los beneficios del bar, **incluidos los pausados y agotados**.
     *
     * Al contrario del catálogo público, que sólo muestra lo disponible: acá el
     * dueño viene a administrar, y esconderle lo que pausó sería esconderle por
     * qué no aparece en la app.
     */
    fun beneficiosDelBar(partnerId: Long): List<BeneficioDto> = db.conn { c ->
        c.query(
            """
            SELECT b.id, b.partner_id, b.title, b.detail, b.cost_points, b.stock,
                   p.bar_id, ba.name AS bar_name
            FROM benefits b
            JOIN partner_bars p ON p.id = b.partner_id
            JOIN bars ba ON ba.id = p.bar_id
            WHERE b.partner_id = ? AND b.status <> 'archived'
            ORDER BY b.status, b.cost_points, b.id
            """.trimIndent(),
            partnerId,
        ) { rs ->
            BeneficioDto(
                id = rs.getLong("id"), partnerId = rs.getLong("partner_id"),
                barId = rs.getLong("bar_id"), barName = rs.getString("bar_name"),
                title = rs.getString("title"), detail = rs.getString("detail"),
                costPoints = rs.getInt("cost_points"),
                stock = rs.getObject("stock")?.let { (it as Number).toInt() },
            )
        }
    }

    /**
     * Publica un beneficio.
     *
     * Entra **activo** y no como borrador: el dueño lo está creando para que se
     * vea, y un estado intermedio que hay que recordar activar es la forma más
     * rápida de que un bar crea que publicó algo que no publicó.
     */
    fun crearBeneficio(
        partnerId: Long, titulo: String, detalle: String?, costo: Int,
        stock: Int?, topeDiario: Int?,
    ): BeneficioDto = db.tx { c ->
        val t = titulo.trim()
        if (t.length < 3) badRequest("el título es demasiado corto")
        if (t.length > 80) badRequest("el título es demasiado largo")
        if (costo <= 0) badRequest("el costo en puntos tiene que ser mayor a cero")
        if (stock != null && stock < 0) badRequest("el stock no puede ser negativo")
        if (topeDiario != null && topeDiario <= 0) badRequest("el tope diario tiene que ser mayor a cero")

        val id = c.queryOne(
            "INSERT INTO benefits (partner_id, title, detail, cost_points, stock, daily_cap, status) " +
                "VALUES (?, ?, ?, ?, ?, ?, 'active') RETURNING id",
            partnerId, t, detalle?.trim()?.ifEmpty { null }, costo, stock, topeDiario,
        ) { it.getLong("id") }!!

        beneficiosDelBar(partnerId).first { it.id == id }
    }

    /** Los canjes del bar, lo más nuevo primero. */
    fun canjesDelBar(partnerId: Long, limit: Int = 100): List<CanjeDelBarDto> = db.conn { c ->
        c.query(
            """
            SELECT r.id, r.cost_points, r.status::text AS st, r.created_at, r.redeemed_at,
                   b.title, coalesce(u.alias, u.display_name) AS quien,
                   s.display_name AS mozo
            FROM redemptions r
            JOIN benefits b ON b.id = r.benefit_id
            JOIN users u ON u.id = r.user_id
            LEFT JOIN partner_staff s ON s.id = r.redeemed_by
            WHERE r.partner_id = ?
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT ?
            """.trimIndent(),
            partnerId, limit.coerceIn(1, 500),
        ) { rs ->
            CanjeDelBarDto(
                id = rs.getLong("id"), benefitTitle = rs.getString("title"),
                costPoints = rs.getInt("cost_points"), status = rs.getString("st"),
                userName = rs.getString("quien"),
                createdAt = rs.getTimestamp("created_at").toInstant().toString(),
                redeemedAt = rs.getTimestamp("redeemed_at")?.toInstant()?.toString(),
                redeemedBy = rs.getString("mozo"),
            )
        }
    }

    // ---------------------------------------------------------------------
    // Internos
    // ---------------------------------------------------------------------

    /** Crea la fila de saldo si no estaba. Es la que después se bloquea. */
    private fun asegurarSaldo(c: Connection, userId: Long) {
        c.update(
            "INSERT INTO points_balance (user_id, balance) VALUES (?, 0) " +
                "ON CONFLICT (user_id) DO NOTHING",
            userId,
        )
    }

    /**
     * Un movimiento y su efecto en el saldo, juntos y en la misma transacción.
     *
     * Separarlos deja un instante en que el ledger y el saldo no coinciden, y
     * ese instante es el que se explota.
     */
    private fun mover(
        c: Connection, userId: Long, kind: String, amount: Int,
        ticketId: Long? = null, redemptionId: Long? = null,
        expiresAt: Instant? = null, note: String? = null,
    ) {
        asegurarSaldo(c, userId)
        c.update(
            "INSERT INTO points_ledger (user_id, kind, amount, ticket_id, redemption_id, expires_at, note) " +
                "VALUES (?, ?::points_kind, ?, ?, ?, ?, ?)",
            userId, kind, amount, ticketId, redemptionId,
            expiresAt?.let { Timestamp.from(it) }, note,
        )
        c.update(
            "UPDATE points_balance SET balance = balance + ?, updated_at = now() WHERE user_id = ?",
            amount, userId,
        )
    }

    private fun saldoDe(c: Connection, userId: Long): Int = c.queryOne(
        "SELECT balance FROM points_balance WHERE user_id = ?", userId,
    ) { it.getInt("balance") } ?: 0

    /** Seis dígitos, con el generador criptográfico y no con `Random`. */
    private fun sortearCodigo(): String = "%06d".format(random.nextInt(1_000_000))

    private fun hash(codigo: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(pepper.toByteArray(), "HmacSHA256"))
        return mac.doFinal(codigo.toByteArray()).joinToString("") { "%02x".format(it) }
    }

    private data class Beneficio(
        val id: Long, val partnerId: Long, val title: String, val cost: Int,
        val stock: Int?, val status: String, val barName: String,
    )

    private data class Pendiente(
        val id: Long, val userId: Long, val cost: Int,
        val expiresAt: Instant, val benefitId: Long,
        val title: String, val quien: String,
    )
}

/** Lo que trae un comprobante ya validado. Ver `TicketValidator`. */
data class TicketValidado(
    val cuit: String,
    val ptoVta: Int,
    val cbteTipo: Int,
    val cbteNro: Long,
    val fecha: java.time.LocalDate,
    val importe: BigDecimal,
    val moneda: String,
    val codAut: String,
    val payload: String,
)

sealed interface Acreditacion {
    data class Acreditada(val puntos: Int, val saldo: Int) : Acreditacion
    data class Rechazada(val motivo: String) : Acreditacion
}
