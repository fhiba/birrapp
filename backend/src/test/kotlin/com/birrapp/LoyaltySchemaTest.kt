package com.birrapp

import java.sql.SQLException
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Las garantías del esquema de puntos (V25).
 *
 * **Estos tests no prueban código: prueban la base.** Todavía no hay ni un
 * repositorio del programa de fidelización, y son a propósito lo primero que se
 * escribe. Las reglas que protegen plata están puestas como constraints en vez
 * de como chequeos en Kotlin, y esa decisión sólo vale si se verifica que la
 * base efectivamente rebota lo que tiene que rebotar. Un CHECK que nadie probó
 * es una intención, no una garantía.
 *
 * Cada test de acá se corresponde con una de las cuatro garantías que enumera
 * la migración, más la forma de los movimientos del ledger.
 *
 * Se escribe SQL crudo y no se usa ningún repo, también a propósito: lo que se
 * está probando es que **ningún** código futuro, ni siquiera uno con un bug,
 * pueda dejar la base en un estado imposible.
 */
class LoyaltySchemaTest {

    @BeforeTest fun setup() = TestDb.reset()

    // ---------- helpers ----------

    private fun exec(sql: String, vararg args: Any?): Unit = TestDb.db.conn { c ->
        c.prepareStatement(sql).use { st ->
            args.forEachIndexed { i, a -> st.setObject(i + 1, a) }
            st.execute()
        }
    }

    private fun <T> one(sql: String, vararg args: Any?, map: (java.sql.ResultSet) -> T): T =
        TestDb.db.conn { c ->
            c.prepareStatement(sql).use { st ->
                args.forEachIndexed { i, a -> st.setObject(i + 1, a) }
                st.executeQuery().use { rs -> rs.next(); map(rs) }
            }
        }

    private fun socio(cuit: String = "30712345678"): Long {
        val bar = TestDb.insertBar("El Bar ${cuit.takeLast(4)}", -34.6037, -58.3816)
        return one(
            "INSERT INTO partner_bars (bar_id, cuit, legal_name, status) " +
                "VALUES (?, ?, 'Bar SRL', 'active') RETURNING id",
            bar, cuit,
        ) { it.getLong(1) }
    }

    /** Un claim aprobado, con sus puntos. Devuelve el id del ticket. */
    private fun ticket(
        user: Long, partner: Long, nro: Long, puntos: Int = 100,
        cuit: String = "30712345678", estado: String = "approved",
    ): Long = one(
        """
        INSERT INTO ticket_claims
            (user_id, partner_id, cuit, pto_vta, cbte_tipo, cbte_nro, cbte_fecha,
             importe, cod_aut, qr_payload, status, points)
        VALUES (?, ?, ?, 1, 6, ?, current_date, 10000.00, '71234567890123', '{}', ?::claim_status, ?)
        RETURNING id
        """.trimIndent(),
        user, partner, cuit, nro, estado, if (estado == "approved") puntos else 0,
    ) { it.getLong(1) }

    // ---------- 1. un comprobante acredita una sola vez ----------

    @Test
    fun `el mismo comprobante no se puede acreditar dos veces`() {
        val ana = TestDb.insertUser("ana")
        val beto = TestDb.insertUser("beto")
        val p = socio()

        ticket(ana, p, nro = 5000)

        // Beto le saca una foto al ticket de Ana. Misma identidad de
        // comprobante, otra persona: la base tiene que rebotarlo igual.
        val e = assertFailsWith<SQLException> { ticket(beto, p, nro = 5000) }
        assertTrue(
            e.message!!.contains("idx_ticket_identity"),
            "tiene que rebotar por el índice de identidad y no por otra cosa: ${e.message}",
        )
    }

    @Test
    fun `un rechazo no quema el comprobante para siempre`() {
        val ana = TestDb.insertUser("ana")
        val p = socio()

        // ARCA rechazó, o se cayó. El intento queda registrado.
        ticket(ana, p, nro = 5000, estado = "rejected")
        ticket(ana, p, nro = 5000, estado = "rejected")

        // Y el comprobante se puede volver a intentar: si el índice cubriera
        // todas las filas, un problema transitorio dejaría a alguien sin poder
        // reclamar un ticket que es legítimo.
        ticket(ana, p, nro = 5000)

        assertEquals(
            3, one("SELECT count(*) FROM ticket_claims WHERE cbte_nro = 5000") { it.getInt(1) },
            "los rechazos se guardan: son lo que deja ver que el bar no emite QR",
        )
    }

    // ---------- 2. el saldo no puede quedar negativo ----------

    @Test
    fun `el saldo no puede quedar negativo`() {
        val ana = TestDb.insertUser("ana")
        exec("INSERT INTO points_balance (user_id, balance) VALUES (?, 50)", ana)

        val e = assertFailsWith<SQLException> {
            exec("UPDATE points_balance SET balance = balance - 80 WHERE user_id = ?", ana)
        }
        assertTrue(
            e.message!!.contains("points_balance_balance_check"),
            "lo tiene que frenar el CHECK y no el código: ${e.message}",
        )
        assertEquals(50, one("SELECT balance FROM points_balance WHERE user_id = ?", ana) { it.getInt(1) })
    }

    // ---------- 3. el stock no puede quedar negativo ----------

    @Test
    fun `el stock de un beneficio no puede quedar negativo`() {
        val p = socio()
        val b = one(
            "INSERT INTO benefits (partner_id, title, cost_points, stock, status) " +
                "VALUES (?, 'Pinta gratis', 500, 1, 'active') RETURNING id",
            p,
        ) { it.getLong(1) }

        exec("UPDATE benefits SET stock = stock - 1 WHERE id = ?", b)
        assertFailsWith<SQLException> {
            exec("UPDATE benefits SET stock = stock - 1 WHERE id = ?", b)
        }
    }

    // ---------- 4. un código vive una sola vez por bar ----------

    @Test
    fun `no puede haber dos codigos pendientes iguales en el mismo bar`() {
        val ana = TestDb.insertUser("ana")
        val beto = TestDb.insertUser("beto")
        val p = socio()
        val b = one(
            "INSERT INTO benefits (partner_id, title, cost_points, status) " +
                "VALUES (?, 'Pinta gratis', 500, 'active') RETURNING id", p,
        ) { it.getLong(1) }

        fun canje(user: Long) = exec(
            "INSERT INTO redemptions (benefit_id, partner_id, user_id, cost_points, code_hash, expires_at) " +
                "VALUES (?, ?, ?, 500, 'hash-de-123456', now() + interval '5 minutes')",
            b, p, user,
        )

        canje(ana)
        assertFailsWith<SQLException> { canje(beto) }

        // Cerrado el primero, el código puede volver a salir sorteado: si no,
        // con seis dígitos el espacio se agotaría solo con el uso.
        exec("UPDATE redemptions SET status = 'expired' WHERE user_id = ?", ana)
        canje(beto)
    }

    @Test
    fun `el mismo codigo en otro bar no choca`() {
        val ana = TestDb.insertUser("ana")
        val p1 = socio("30712345678")
        val p2 = socio("30787654321")
        fun beneficio(p: Long) = one(
            "INSERT INTO benefits (partner_id, title, cost_points, status) " +
                "VALUES (?, 'Pinta', 500, 'active') RETURNING id", p,
        ) { it.getLong(1) }

        for (p in listOf(p1, p2)) {
            exec(
                "INSERT INTO redemptions (benefit_id, partner_id, user_id, cost_points, code_hash, expires_at) " +
                    "VALUES (?, ?, ?, 500, 'hash-de-123456', now() + interval '5 minutes')",
                beneficio(p), p, ana,
            )
        }
        // Dos bares no comparten espacio de códigos: el mozo valida contra el
        // suyo, así que el "123456" de uno no tiene por qué existir en el otro.
    }

    // ---------- 5. la forma de los movimientos ----------

    @Test
    fun `un movimiento de acreditacion no puede ser negativo ni venir sin ticket`() {
        val ana = TestDb.insertUser("ana")
        val p = socio()
        val t = ticket(ana, p, nro = 7000)

        fun mov(kind: String, amount: Int, ticketId: Long?, venc: String?) = exec(
            "INSERT INTO points_ledger (user_id, kind, amount, ticket_id, expires_at) " +
                "VALUES (?, ?::points_kind, ?, ?, ?::timestamptz)",
            ana, kind, amount, ticketId, venc,
        )

        // El caso bueno.
        mov("earn", 100, t, "2027-01-01T00:00:00Z")

        // Acreditar en negativo sería un débito disfrazado de premio.
        assertFailsWith<SQLException> { mov("earn", -100, t, "2027-01-01T00:00:00Z") }
        // Sin ticket detrás, los puntos aparecieron de la nada.
        assertFailsWith<SQLException> { mov("earn", 100, null, "2027-01-01T00:00:00Z") }
        // Sin vencimiento, el punto es deuda para siempre.
        assertFailsWith<SQLException> { mov("earn", 100, t, null) }
        // Y cero no es un movimiento.
        assertFailsWith<SQLException> { mov("earn", 0, t, "2027-01-01T00:00:00Z") }
    }

    @Test
    fun `una reserva tiene que ser negativa y pertenecer a un canje`() {
        val ana = TestDb.insertUser("ana")

        fun hold(amount: Int, canje: Long?) = exec(
            "INSERT INTO points_ledger (user_id, kind, amount, redemption_id) " +
                "VALUES (?, 'hold', ?, ?)", ana, amount, canje,
        )

        // Sin canje al que pertenecer no se sabe qué se reservó ni qué liberar.
        assertFailsWith<SQLException> { hold(-500, null) }
        // Y una reserva que suma sería una forma de fabricar puntos.
        assertFailsWith<SQLException> { hold(500, null) }
    }

    @Test
    fun `un canje redimido exige quien lo confirmo`() {
        val ana = TestDb.insertUser("ana")
        val p = socio()
        val b = one(
            "INSERT INTO benefits (partner_id, title, cost_points, status) " +
                "VALUES (?, 'Pinta', 500, 'active') RETURNING id", p,
        ) { it.getLong(1) }
        val r = one(
            "INSERT INTO redemptions (benefit_id, partner_id, user_id, cost_points, code_hash, expires_at) " +
                "VALUES (?, ?, ?, 500, 'h', now() + interval '5 minutes') RETURNING id",
            b, p, ana,
        ) { it.getLong(1) }

        // Marcarlo redimido sin decir quién es perder la auditoría, que es la
        // razón por la que cada mozo tiene cuenta propia.
        assertFailsWith<SQLException> {
            exec("UPDATE redemptions SET status = 'redeemed', redeemed_at = now() WHERE id = ?", r)
        }
    }
}
