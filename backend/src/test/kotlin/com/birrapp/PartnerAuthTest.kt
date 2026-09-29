package com.birrapp

import com.birrapp.core.ApiException
import com.birrapp.loyalty.PartnerAuthRepo
import com.birrapp.loyalty.hash
import com.birrapp.loyalty.verificar
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Las cuentas del portal del bar.
 *
 * Primera vez que la app guarda contraseñas, así que lo que se prueba acá no es
 * "entra con la clave buena" —eso es lo fácil— sino las tres propiedades que
 * hacen que un login no regale información: que el hash nunca se repita, que
 * el mensaje de error sea el mismo exista o no el mail, y que el último dueño
 * de un bar no se pueda apagar.
 */
class PartnerAuthTest {

    private val repo by lazy { PartnerAuthRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    private fun socio(cuit: String = "30712345678"): Long = TestDb.db.conn { c ->
        val bar = TestDb.insertBar("Bar ${cuit.takeLast(4)}", -34.6037, -58.3816)
        c.prepareStatement(
            "INSERT INTO partner_bars (bar_id, cuit, legal_name, status) " +
                "VALUES (?, ?, 'Bar SRL', 'active') RETURNING id",
        ).use { st ->
            st.setLong(1, bar); st.setString(2, cuit)
            st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
        }
    }

    // ---------- el hash ----------

    @Test
    fun `la misma clave nunca da el mismo hash`() {
        // Sal por cuenta. Sin esto, dos mozos con la clave "birrapp1" tienen el
        // mismo hash, y una tabla precalculada las rompe a las dos de una vez.
        val a = hash("birrapp1")
        val b = hash("birrapp1")
        assertTrue(a != b, "la sal tiene que ser distinta en cada hash")
        assertTrue(verificar("birrapp1", a) && verificar("birrapp1", b))
    }

    @Test
    fun `el hash dice con qué se hizo`() {
        // Auto-descriptivo para poder cambiar de algoritmo después sin migrar
        // la columna: se verifica con lo que dice la fila, no con lo que el
        // código cree que se usó.
        val h = hash("birrapp1")
        val partes = h.split('$')
        assertEquals("pbkdf2", partes[0])
        assertEquals("sha256", partes[1])
        assertTrue(partes[2].toInt() >= 200_000, "las iteraciones tienen que ser muchas")
    }

    @Test
    fun `una clave incorrecta no verifica`() {
        val h = hash("birrapp1")
        assertFalse(verificar("birrapp2", h))
        assertFalse(verificar("", h))
    }

    @Test
    fun `un hash corrupto no hace pasar a nadie`() {
        // Si la columna se ensucia, el login tiene que decir no — nunca sí, y
        // nunca explotar.
        for (basura in listOf("", "x", "pbkdf2\$sha256\$mal\$mal\$mal", "\$\$\$\$")) {
            assertFalse(verificar("birrapp1", basura), "no puede pasar con: '$basura'")
        }
    }

    // ---------- alta ----------

    @Test
    fun `crea la cuenta del dueño y entra`() {
        val p = socio()
        val creada = repo.crear(p, "Dueño@Bar.com", "birrapp1", "Dueño", "owner")
        assertEquals("owner", creada.role)

        // El mail se compara en minúsculas: el índice único es sobre lower().
        val s = repo.login("dueño@bar.com", "birrapp1")
        assertEquals(creada.id, s.id)
        assertEquals(p, s.partnerId)
    }

    @Test
    fun `no se puede repetir el mail`() {
        val p = socio()
        repo.crear(p, "mozo@bar.com", "birrapp1", "Mozo")
        // Ni con otra capitalización: harían ambiguo el login.
        assertFailsWith<ApiException> { repo.crear(p, "MOZO@bar.com", "otraclave", "Otro") }
    }

    @Test
    fun `una clave corta no entra`() {
        val p = socio()
        assertFailsWith<ApiException> { repo.crear(p, "mozo@bar.com", "corta", "Mozo") }
    }

    // ---------- login ----------

    @Test
    fun `el error es el mismo exista o no el mail`() {
        // Distinguirlos convierte el login en un oráculo que dice qué mails
        // tienen cuenta, y de ahí sale la lista para el siguiente intento.
        val p = socio()
        repo.crear(p, "mozo@bar.com", "birrapp1", "Mozo")

        val claveMal = assertFailsWith<ApiException> { repo.login("mozo@bar.com", "birrapp2") }
        val mailMal = assertFailsWith<ApiException> { repo.login("nadie@bar.com", "birrapp1") }

        assertEquals(claveMal.message, mailMal.message)
        assertEquals(claveMal.status, mailMal.status)
    }

    @Test
    fun `una cuenta apagada no entra`() {
        val p = socio()
        repo.crear(p, "dueño@bar.com", "birrapp1", "Dueño", "owner")
        val mozo = repo.crear(p, "mozo@bar.com", "birrapp1", "Mozo")

        assertTrue(repo.deshabilitar(p, mozo.id))
        assertFailsWith<ApiException> { repo.login("mozo@bar.com", "birrapp1") }
    }

    // ---------- el bar no puede quedar sin dueño ----------

    @Test
    fun `no se puede apagar al unico dueño`() {
        val p = socio()
        val dueño = repo.crear(p, "dueño@bar.com", "birrapp1", "Dueño", "owner")

        val e = assertFailsWith<ApiException> { repo.deshabilitar(p, dueño.id) }
        assertTrue(e.message.contains("único dueño"), e.message)
        // Y sigue pudiendo entrar: rebotar no puede dejarlo a medio apagar.
        repo.login("dueño@bar.com", "birrapp1")
    }

    @Test
    fun `con dos dueños se puede apagar uno`() {
        val p = socio()
        val uno = repo.crear(p, "uno@bar.com", "birrapp1", "Uno", "owner")
        repo.crear(p, "dos@bar.com", "birrapp1", "Dos", "owner")
        assertTrue(repo.deshabilitar(p, uno.id))
    }

    @Test
    fun `un bar no puede apagar al mozo de otro`() {
        val p1 = socio("30712345678")
        val p2 = socio("30787654321")
        val mozo = repo.crear(p1, "mozo@bar1.com", "birrapp1", "Mozo")

        assertFalse(
            repo.deshabilitar(p2, mozo.id),
            "el partnerId va en el WHERE: un bar no alcanza las cuentas de otro",
        )
        repo.login("mozo@bar1.com", "birrapp1")
    }

    @Test
    fun `el listado es sólo del bar que pregunta`() {
        val p1 = socio("30712345678")
        val p2 = socio("30787654321")
        repo.crear(p1, "a@bar1.com", "birrapp1", "A", "owner")
        repo.crear(p1, "b@bar1.com", "birrapp1", "B")
        repo.crear(p2, "c@bar2.com", "birrapp1", "C", "owner")

        assertEquals(2, repo.staffDelBar(p1).size)
        assertEquals(1, repo.staffDelBar(p2).size)
    }
}
