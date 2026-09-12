package com.birrapp

import com.birrapp.core.ApiException
import com.birrapp.prices.NewPriceRequest
import com.birrapp.prices.NewStyleRequest
import com.birrapp.prices.PriceRepo
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Estilos propuestos por usuarios (BIR-35).
 *
 * Mismo trato que las marcas: entra pendiente, no ensucia la lista de nadie
 * hasta que un moderador lo aprueba, pero quien lo propuso puede usarlo
 * enseguida — si tuviera que esperar la aprobación, cargaría el precio con el
 * estilo equivocado y ese dato ya no se arregla.
 */
class StyleProposalTest {

    private val repo by lazy { PriceRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `un estilo propuesto entra pendiente y no aparece en la lista publica`() {
        val u = TestDb.insertUser()
        val nuevo = repo.createStyle(NewStyleRequest("Gose salada"), u)

        assertEquals("gose-salada", nuevo.slug)
        assertFalse(repo.styles().any { it.slug == "gose-salada" }, "todavía no está aprobado")
        assertTrue(repo.pendingStyles().any { it.slug == "gose-salada" })
    }

    @Test
    fun `quien lo propone puede cargarle un precio antes de la aprobacion`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("El Bar", -34.6037, -58.3816)
        repo.createStyle(NewStyleRequest("Gose"), u)

        val ok = repo.report(NewPriceRequest(bar, "gose", 7000.0), u)
        assertFalse(ok.heldForReview)
    }

    @Test
    fun `aprobar lo publica y rechazar lo saca sin borrarlo`() {
        val u = TestDb.insertUser()
        repo.createStyle(NewStyleRequest("Gose"), u)

        assertTrue(repo.setStyleStatus("gose", "approved"))
        assertTrue(repo.styles().any { it.slug == "gose" })

        assertTrue(repo.setStyleStatus("gose", "rejected"))
        assertFalse(repo.styles().any { it.slug == "gose" })
        // Sigue existiendo: si se borrara, se llevaría puestos los precios que
        // ya tuviera colgando.
        assertTrue(repo.createStyle(NewStyleRequest("Gose"), u).slug == "gose")
    }

    @Test
    fun `proponer dos veces lo mismo devuelve el que ya hay`() {
        val u = TestDb.insertUser()
        repo.createStyle(NewStyleRequest("Gose"), u)
        repo.createStyle(NewStyleRequest("  gose  "), u)

        assertEquals(1, repo.pendingStyles().count { it.slug == "gose" })
    }

    @Test
    fun `un estilo existente no se duplica ni se pisa`() {
        val u = TestDb.insertUser()
        val ipa = repo.createStyle(NewStyleRequest("IPA"), u)

        assertEquals("ipa", ipa.slug)
        assertEquals("IPA", ipa.name, "no pisa el nombre del vocabulario")
        assertTrue(repo.styles().any { it.slug == "ipa" }, "el estilo de siempre sigue publicado")
    }

    @Test
    fun `rechaza nombres que no sirven`() {
        val u = TestDb.insertUser()
        assertFailsWith<ApiException> { repo.createStyle(NewStyleRequest("a"), u) }
        assertFailsWith<ApiException> { repo.createStyle(NewStyleRequest("!!!"), u) }
        assertFailsWith<ApiException> { repo.createStyle(NewStyleRequest("x".repeat(41)), u) }
    }
}
