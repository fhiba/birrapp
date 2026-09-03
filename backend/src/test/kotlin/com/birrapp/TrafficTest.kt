package com.birrapp

import com.birrapp.core.query
import com.birrapp.traffic.TrafficRepo
import java.util.UUID
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * El conteo de visitantes.
 *
 * Lo que se testea es que una visita repetida el mismo día no invente una
 * persona nueva, y que alguien que entra anónimo y después inicia sesión
 * cuente como convertido y no como dos.
 */
class TrafficTest {
    private val repo by lazy { TrafficRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.resetTraffic()

    private fun rows() = TestDb.db.conn { c ->
        c.query("SELECT client_id, authed FROM traffic_sessions WHERE day = current_date") {
            it.getString("client_id") to it.getBoolean("authed")
        }
    }

    @Test
    fun `varias visitas del mismo cliente en el dia son una sola fila`() {
        val id = UUID.randomUUID()
        repeat(3) { repo.record(id, authed = false) }

        assertEquals(1, rows().size, "recargar la app no es una persona más")
    }

    @Test
    fun `entrar anonimo y despues loguearse cuenta como convertido`() {
        val id = UUID.randomUUID()
        repo.record(id, authed = false)
        repo.record(id, authed = true)

        assertEquals(listOf(id.toString() to true), rows())
    }

    @Test
    fun `una visita con sesion no vuelve a anonima al recargar`() {
        val id = UUID.randomUUID()
        repo.record(id, authed = true)
        repo.record(id, authed = false)

        assertTrue(rows().single().second, "authed sólo sube, nunca baja")
    }

    @Test
    fun `dos clientes distintos son dos personas`() {
        repo.record(UUID.randomUUID(), authed = false)
        repo.record(UUID.randomUUID(), authed = false)

        assertEquals(2, rows().size)
    }
}
