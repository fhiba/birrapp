package com.birrapp

import com.birrapp.core.ApiException
import com.birrapp.loyalty.Acreditacion
import com.birrapp.loyalty.LoyaltyProgram
import com.birrapp.loyalty.LoyaltyRepo
import com.birrapp.loyalty.TicketValidado
import java.math.BigDecimal
import java.time.Duration
import java.time.LocalDate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * El programa de puntos, de punta a punta.
 *
 * Lo que se prueba acá no es "suma y resta bien": eso es lo fácil. Lo que se
 * prueba es que **no haya forma de terminar con más puntos de los que
 * corresponden**, ni de que una transacción a medias deje la base en un estado
 * que nadie sepa leer. Los dos tests que justifican el archivo son
 * `un saldo insuficiente no deja el canje a medias` y
 * `dos reservas simultaneas no pueden pasar las dos`.
 */
class LoyaltyRepoTest {

    private val program = LoyaltyProgram(
        pesosPorPunto = BigDecimal("100"),
        diasDeVigencia = 60,
        puntosMaximosPorDia = 500,
        vigenciaDelCodigo = Duration.ofMinutes(5),
    )
    private val repo by lazy { LoyaltyRepo(TestDb.db, program, "pimienta-de-test") }

    @BeforeTest fun setup() = TestDb.reset()

    private val CUIT = "30712345678"

    private fun socio(cuit: String = CUIT, estado: String = "active"): Long =
        TestDb.db.conn { c ->
            val bar = TestDb.insertBar("Bar ${cuit.takeLast(4)}", -34.6037, -58.3816)
            c.prepareStatement(
                "INSERT INTO partner_bars (bar_id, cuit, legal_name, status) " +
                    "VALUES (?, ?, 'Bar SRL', ?::partner_status) RETURNING id",
            ).use { st ->
                st.setLong(1, bar); st.setString(2, cuit); st.setString(3, estado)
                st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
            }
        }

    private fun beneficio(partner: Long, costo: Int, stock: Int? = null): Long =
        TestDb.db.conn { c ->
            c.prepareStatement(
                "INSERT INTO benefits (partner_id, title, cost_points, stock, status) " +
                    "VALUES (?, 'Pinta gratis', ?, ?, 'active') RETURNING id",
            ).use { st ->
                st.setLong(1, partner); st.setInt(2, costo)
                if (stock != null) st.setInt(3, stock) else st.setNull(3, java.sql.Types.INTEGER)
                st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
            }
        }

    private fun mozo(partner: Long): Long = TestDb.db.conn { c ->
        c.prepareStatement(
            "INSERT INTO partner_staff (partner_id, email, password_hash, display_name, role) " +
                "VALUES (?, ?, 'x', 'Mozo', 'staff') RETURNING id",
        ).use { st ->
            st.setLong(1, partner); st.setString(2, "mozo$partner@bar.test")
            st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
        }
    }

    private var nro = 1000L
    private fun ticket(importe: String, cuit: String = CUIT) = TicketValidado(
        cuit = cuit, ptoVta = 1, cbteTipo = 6, cbteNro = ++nro,
        fecha = LocalDate.now(), importe = BigDecimal(importe), moneda = "PES",
        codAut = "71234567890123", payload = "{}",
    )

    // ---------- acreditar ----------

    @Test
    fun `acredita los puntos de un ticket`() {
        val u = TestDb.insertUser("ana")
        socio()

        val r = repo.acreditar(u, ticket("12000"))
        assertTrue(r is Acreditacion.Acreditada, "debería acreditar: $r")
        assertEquals(120, r.puntos)
        assertEquals(120, repo.saldo(u).balance)
    }

    @Test
    fun `el mismo comprobante no acredita dos veces`() {
        val ana = TestDb.insertUser("ana")
        val beto = TestDb.insertUser("beto")
        socio()
        val t = ticket("12000")

        repo.acreditar(ana, t)
        // Beto le saca una foto al ticket de Ana.
        val r = repo.acreditar(beto, t)

        assertEquals(Acreditacion.Rechazada("ya_reclamado"), r)
        assertEquals(0, repo.saldo(beto).balance)
        assertEquals(120, repo.saldo(ana).balance, "y a Ana no le pasó nada")
    }

    @Test
    fun `un bar que no esta afiliado no acredita`() {
        val u = TestDb.insertUser("ana")
        socio(estado = "onboarding")
        assertEquals(
            Acreditacion.Rechazada("bar_no_afiliado"),
            repo.acreditar(u, ticket("12000")),
        )
    }

    @Test
    fun `el tope diario corta`() {
        val u = TestDb.insertUser("ana")
        socio()

        repo.acreditar(u, ticket("40000"))   // 400 puntos
        val r = repo.acreditar(u, ticket("20000"))   // 200 más: se pasa de 500

        assertEquals(Acreditacion.Rechazada("tope_diario"), r)
        assertEquals(400, repo.saldo(u).balance)
    }

    @Test
    fun `un importe que no llega a un punto se rechaza`() {
        val u = TestDb.insertUser("ana")
        socio()
        assertEquals(
            Acreditacion.Rechazada("importe_sin_puntos"),
            repo.acreditar(u, ticket("99")),
        )
    }

    // ---------- reservar ----------

    @Test
    fun `reservar debita al momento y devuelve el codigo`() {
        val u = TestDb.insertUser("ana")
        val p = socio()
        repo.acreditar(u, ticket("50000"))   // 500 puntos
        val b = beneficio(p, costo = 300, stock = 2)

        val canje = repo.reservar(u, b)

        assertEquals(6, canje.code.length)
        assertTrue(canje.code.all { it.isDigit() })
        assertEquals(200, repo.saldo(u).balance, "se debita al reservar, no al canjear")
        assertEquals(1, stockDe(b), "y el stock también baja al reservar")
    }

    /**
     * El test que justifica el diseño.
     *
     * El canje se inserta ANTES de debitar, porque el movimiento del ledger
     * necesita su id. Si el débito rebota por saldo insuficiente, ese canje
     * tiene que desaparecer con la transacción: si quedara, habría un código
     * vivo que el mozo puede confirmar sin que nadie haya pagado por él.
     */
    @Test
    fun `un saldo insuficiente no deja el canje a medias`() {
        val u = TestDb.insertUser("ana")
        val p = socio()
        repo.acreditar(u, ticket("10000"))   // 100 puntos
        val b = beneficio(p, costo = 300, stock = 1)

        assertFailsWith<Exception> { repo.reservar(u, b) }

        assertEquals(100, repo.saldo(u).balance, "el saldo no se movió")
        assertEquals(1, stockDe(b), "el stock tampoco")
        assertEquals(
            0, filas("SELECT count(*) FROM redemptions"),
            "y sobre todo: no quedó un código vivo que nadie pagó",
        )
        assertEquals(
            1, filas("SELECT count(*) FROM points_ledger"),
            "ni un movimiento de reserva colgado",
        )
    }

    /**
     * El otro test que justifica el diseño.
     *
     * Dos reservas simultáneas con saldo para una sola. Sin el lock de
     * `points_balance` las dos leen el mismo saldo, las dos ven que alcanza y
     * las dos pasan — que es exactamente el agujero por el que se fabrica
     * plata en un sistema de puntos.
     */
    @Test
    fun `dos reservas simultaneas no pueden pasar las dos`() {
        val u = TestDb.insertUser("ana")
        val p = socio()
        repo.acreditar(u, ticket("30000"))   // 300 puntos
        val b = beneficio(p, costo = 300)    // sin tope de stock: el freno es el saldo

        val largada = CountDownLatch(1)
        val ok = AtomicInteger()
        val hilos = (1..2).map {
            Thread {
                largada.await()
                runCatching { repo.reservar(u, b) }.onSuccess { ok.incrementAndGet() }
            }.apply { start() }
        }
        largada.countDown()
        hilos.forEach { it.join(10_000) }

        assertEquals(1, ok.get(), "tiene que pasar exactamente una")
        assertEquals(0, repo.saldo(u).balance)
        assertEquals(1, filas("SELECT count(*) FROM redemptions WHERE status = 'pending'"))
    }

    @Test
    fun `un beneficio agotado no se puede reservar`() {
        val u = TestDb.insertUser("ana")
        val p = socio()
        repo.acreditar(u, ticket("50000"))
        val b = beneficio(p, costo = 100, stock = 1)

        repo.reservar(u, b)
        val e = assertFailsWith<ApiException> { repo.reservar(u, b) }
        assertTrue(e.message.contains("agotó"), e.message)
    }

    // ---------- confirmar ----------

    @Test
    fun `el mozo confirma el codigo y los puntos no se mueven de nuevo`() {
        val u = TestDb.insertUser("ana")
        val p = socio()
        repo.acreditar(u, ticket("50000"))
        val b = beneficio(p, costo = 300)
        val canje = repo.reservar(u, b)
        val m = mozo(p)

        val conf = repo.confirmar(m, p, canje.code)

        assertEquals(300, conf.costPoints)
        assertEquals(200, repo.saldo(u).balance, "ya se había debitado al reservar")
        assertEquals(1, filas("SELECT count(*) FROM redemptions WHERE status = 'redeemed'"))
    }

    @Test
    fun `un codigo no se puede usar dos veces`() {
        val u = TestDb.insertUser("ana")
        val p = socio()
        repo.acreditar(u, ticket("50000"))
        val canje = repo.reservar(u, beneficio(p, costo = 300))
        val m = mozo(p)

        repo.confirmar(m, p, canje.code)
        assertFailsWith<ApiException> { repo.confirmar(m, p, canje.code) }
    }

    @Test
    fun `un codigo de otro bar no existe para este`() {
        val u = TestDb.insertUser("ana")
        val p1 = socio("30712345678")
        val p2 = socio("30787654321")
        repo.acreditar(u, ticket("50000"))
        val canje = repo.reservar(u, beneficio(p1, costo = 300))

        // El mozo del bar 2 tipea el código del bar 1.
        val e = assertFailsWith<ApiException> { repo.confirmar(mozo(p2), p2, canje.code) }
        assertTrue(e.message.contains("no existe"), e.message)
        assertEquals(
            1, filas("SELECT count(*) FROM redemptions WHERE status = 'pending'"),
            "y el canje del bar 1 sigue vivo",
        )
    }

    @Test
    fun `un codigo inventado no confirma nada`() {
        val p = socio()
        assertFailsWith<ApiException> { repo.confirmar(mozo(p), p, "000000") }
    }

    // ---------- vencimiento ----------

    @Test
    fun `una reserva vencida devuelve los puntos`() {
        val u = TestDb.insertUser("ana")
        val p = socio()
        repo.acreditar(u, ticket("50000"))
        val canje = repo.reservar(u, beneficio(p, costo = 300, stock = 1))
        assertEquals(200, repo.saldo(u).balance)

        vencer(canje.redemptionId)
        assertEquals(1, repo.liberarVencidas())

        assertEquals(500, repo.saldo(u).balance, "vuelven los puntos")
        assertEquals(1, stockDe(filas("SELECT benefit_id FROM redemptions").toLong()),
            "y vuelve el stock")
    }

    @Test
    fun `liberar dos veces no acredita dos veces`() {
        val u = TestDb.insertUser("ana")
        val p = socio()
        repo.acreditar(u, ticket("50000"))
        val canje = repo.reservar(u, beneficio(p, costo = 300))
        vencer(canje.redemptionId)

        repo.liberarVencidas()
        repo.liberarVencidas()

        assertEquals(500, repo.saldo(u).balance, "el barrido es idempotente o acredita de gratis")
    }

    @Test
    fun `confirmar un codigo vencido lo libera en vez de canjearlo`() {
        val u = TestDb.insertUser("ana")
        val p = socio()
        repo.acreditar(u, ticket("50000"))
        val canje = repo.reservar(u, beneficio(p, costo = 300))
        vencer(canje.redemptionId)

        assertFailsWith<ApiException> { repo.confirmar(mozo(p), p, canje.code) }
        assertEquals(500, repo.saldo(u).balance, "se libera en el momento en que se descubre")
    }

    // ---------- catálogo ----------

    @Test
    fun `el catalogo sólo muestra lo disponible`() {
        val p = socio()
        beneficio(p, costo = 300)
        val agotado = beneficio(p, costo = 100, stock = 0)
        val deOtroBar = beneficio(socio("30787654321", estado = "paused"), costo = 50)

        val lista = repo.beneficios()
        assertEquals(1, lista.size, "ni el agotado ni el del bar pausado")
        assertTrue(lista.none { it.id == agotado || it.id == deOtroBar })
    }

    // ---------- helpers ----------

    private fun filas(sql: String): Int = TestDb.db.conn { c ->
        c.prepareStatement(sql).use { st ->
            st.executeQuery().use { rs -> rs.next(); rs.getInt(1) }
        }
    }

    private fun stockDe(benefitId: Long): Int = TestDb.db.conn { c ->
        c.prepareStatement("SELECT stock FROM benefits WHERE id = ?").use { st ->
            st.setLong(1, benefitId)
            st.executeQuery().use { rs -> rs.next(); rs.getInt(1) }
        }
    }

    private fun vencer(redemptionId: Long) = TestDb.db.conn { c ->
        c.prepareStatement(
            "UPDATE redemptions SET expires_at = now() - interval '1 minute' WHERE id = ?",
        ).use { st -> st.setLong(1, redemptionId); st.execute() }
    }
}
