package com.birrapp

import com.birrapp.auth.GoogleIdentity
import com.birrapp.auth.UpdateMeRequest
import com.birrapp.auth.UserRepo
import com.birrapp.auth.toDto
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * La bienvenida de una cuenta nueva y el alias que se le deja puesto (V22).
 *
 * Lo que se prueba acá no es tanto el formato del alias como **a quién se le
 * pone y a quién no**. V20 decidió que el alias es opt-in porque sembrarlo con
 * el nombre de Google publica a alguien en una tabla pública sin preguntarle;
 * el default sólo es aceptable porque la bienvenida lo muestra y deja
 * cambiarlo. Si un día se le asignara alias a una cuenta vieja —que nunca ve
 * esa pantalla— volveríamos exactamente al problema que V20 evitó, y es lo que
 * cuidan varias de estas pruebas.
 */
class OnboardingTest {

    private val users by lazy { UserRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    private var n = 0
    private fun identity(nombre: String) = GoogleIdentity(
        sub = "sub-${n++}-${System.nanoTime()}",
        email = "u${n}@test.local",
        emailVerified = true,
        name = nombre,
        picture = null,
    )

    private fun alta(nombre: String) = users.upsert(identity(nombre), emptySet())

    // ---------- el alias que se deja puesto ----------

    @Test
    fun `una cuenta nueva arranca con el alias armado con su nombre`() {
        assertEquals("felipe_hiba", alta("Felipe Hiba").alias)
    }

    @Test
    fun `el segundo con el mismo nombre no se lo lleva puesto`() {
        val primero = alta("Felipe Hiba")
        val segundo = alta("Felipe Hiba")

        assertEquals("felipe_hiba", primero.alias)
        assertNotNull(segundo.alias)
        assertTrue(
            segundo.alias != primero.alias,
            "el alias es único: el segundo tiene que recibir otro, no fallar ni pisar al primero",
        )
        assertTrue(
            segundo.alias!!.startsWith("felipe_hiba"),
            "y tiene que seguir pareciéndose a su nombre: era ${segundo.alias}",
        )
    }

    @Test
    fun `los acentos y la puntuacion no rompen el alias`() {
        // El alias admite letras con acento; lo que no admite es puntuación
        // suelta ni espacios de más.
        assertEquals("josé_pérez", alta("José Pérez").alias)
        assertEquals("ana_maría_de_la_cruz", alta("Ana  María  de la Cruz").alias)
        // El apóstrofo cae en la misma regla que cualquier otro signo y pasa a
        // ser un guión bajo. `oconnor` se leería mejor, pero sostener esa
        // excepción es empezar a tener opiniones sobre la ortografía de los
        // apellidos del mundo — y esto es un valor por defecto que se puede
        // cambiar en el mismo paso en que se muestra.
        assertEquals("o_connor", alta("O'Connor").alias)
    }

    @Test
    fun `un nombre larguisimo se recorta al limite del alias`() {
        val a = alta("Wolfeschlegelsteinhausenbergerdorff Von Habsburgo")
        assertNotNull(a.alias)
        assertTrue(a.alias!!.length <= 20, "20 es el techo de la validación: era ${a.alias!!.length}")
    }

    @Test
    fun `un nombre de una sola letra igual da un alias valido`() {
        val a = alta("A")
        assertNotNull(a.alias)
        assertTrue(a.alias!!.length >= 3, "3 es el piso de la validación: era '${a.alias}'")
    }

    @Test
    fun `un nombre sin letras ni numeros cae en uno de repuesto`() {
        val a = alta("!!! ???")
        assertNotNull(a.alias, "sin esto la bienvenida arrancaría con el campo vacío")
        assertTrue(a.alias!!.length >= 3)
    }

    @Test
    fun `el alias que se genera pasa la propia validacion del alias`() {
        // La derivación y la validación son dos códigos distintos sobre la
        // misma regla. Si se separan, el que se entera es quien toca "Guardar"
        // sobre un alias que le puso la app sola.
        val a = alta("Ana  María  de la Cruz")
        val r = users.updateMe(a.id, UpdateMeRequest(alias = a.alias))
        assertEquals(a.alias, r.alias)
    }

    // ---------- a quién NO se le toca el alias ----------

    @Test
    fun `volver a entrar no le cambia el alias a nadie`() {
        val id = identity("Felipe Hiba")
        val primera = users.upsert(id, emptySet())
        users.updateMe(primera.id, UpdateMeRequest(alias = "elegido"))

        val segunda = users.upsert(id, emptySet())
        assertEquals("elegido", segunda.alias, "el alias elegido a mano manda sobre el automático")
    }

    @Test
    fun `una cuenta que ya paso por la bienvenida y borro su alias se queda sin alias`() {
        val id = identity("Felipe Hiba")
        val u = users.upsert(id, emptySet())
        users.updateMe(u.id, UpdateMeRequest(onboarded = true))
        users.updateMe(u.id, UpdateMeRequest(alias = ""))

        val devuelta = users.upsert(id, emptySet())
        assertNull(
            devuelta.alias,
            "borrar el alias es salir de la tabla pública; volver a entrar no puede devolverte ahí",
        )
    }

    // ---------- la marca de la bienvenida ----------

    @Test
    fun `una cuenta nueva no paso por la bienvenida y una vieja si`() {
        val nueva = alta("Nueva Cuenta")
        assertTrue(!nueva.toDto().onboarded, "recién creada: hay que mostrarle la bienvenida")

        val cerrada = users.updateMe(nueva.id, UpdateMeRequest(onboarded = true))
        assertTrue(cerrada.toDto().onboarded)
    }

    @Test
    fun `cerrar la bienvenida dos veces no corre la fecha`() {
        val u = alta("Alguien")
        val primera = users.updateMe(u.id, UpdateMeRequest(onboarded = true)).onboardedAt
        val segunda = users.updateMe(u.id, UpdateMeRequest(onboarded = true)).onboardedAt
        assertEquals(primera, segunda, "el primero que la cierra es el que vale")
    }

    @Test
    fun `la bienvenida no se puede reabrir`() {
        val u = alta("Alguien")
        users.updateMe(u.id, UpdateMeRequest(onboarded = true))
        // `false` no es "reabrir": es "no toco esto". Un cliente con un bug no
        // puede devolverle a alguien una pantalla que ya pasó.
        val r = users.updateMe(u.id, UpdateMeRequest(onboarded = false))
        assertTrue(r.toDto().onboarded)
    }

    @Test
    fun `guardar los ajustes y cerrar la bienvenida viaja en un solo pedido`() {
        // El último paso guarda y cierra a la vez: en dos viajes, si el segundo
        // falla la pantalla vuelve a aparecer con todo ya elegido.
        val u = alta("Alguien")
        val r = users.updateMe(u.id, UpdateMeRequest(
            defaultRadiusM = 5000, currency = "USD", defaultSizeMl = 500, onboarded = true,
        ))
        assertEquals(5000, r.defaultRadiusM)
        assertEquals("USD", r.currency)
        assertEquals(500, r.defaultSizeMl)
        assertTrue(r.toDto().onboarded)
    }
}
