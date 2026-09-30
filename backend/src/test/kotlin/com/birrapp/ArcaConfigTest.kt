package com.birrapp

import com.birrapp.loyalty.ArcaConfig
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * La configuración de ARCA.
 *
 * No prueba el diálogo con ARCA —eso necesita el certificado y no se puede
 * simular sin uno— sino lo que decide **si el sistema queda validando de
 * verdad o con el validador de juguete**. Que esa decisión falle hacia el lado
 * equivocado es lo caro: con el de juguete, cualquier QR inventado acredita
 * puntos.
 */
class ArcaConfigTest {

    private fun env(vararg pares: Pair<String, String>): (String) -> String? =
        { pares.toMap()[it] }

    private val COMPLETO = arrayOf(
        "ARCA_CUIT" to "30712345678",
        "ARCA_PKCS12_BASE64" to "MIIabc==",
        "ARCA_PKCS12_PASSWORD" to "secreto",
    )

    @Test
    fun `con todo puesto, configura`() {
        val c = ArcaConfig.fromEnv(env(*COMPLETO))
        assertNotNull(c)
        assertEquals("30712345678", c.cuit)
    }

    @Test
    fun `sin certificado no configura, y eso deja el validador de juguete`() {
        // Null y no excepción: sin certificado el resto del programa tiene que
        // seguir andando, que es lo que permite mirar la PoC mientras el
        // trámite en ARCA no terminó.
        assertNull(ArcaConfig.fromEnv(env()))
        for (falta in listOf("ARCA_CUIT", "ARCA_PKCS12_BASE64", "ARCA_PKCS12_PASSWORD")) {
            val parcial = COMPLETO.filterNot { it.first == falta }.toTypedArray()
            assertNull(
                ArcaConfig.fromEnv(env(*parcial)),
                "sin $falta no se puede hablar con ARCA, así que no puede configurar a medias",
            )
        }
    }

    @Test
    fun `el ambiente por defecto es homologacion`() {
        // Llegar a producción por olvido es peor que no llegar: el default
        // tiene que ser el que no toca datos fiscales de verdad.
        assertTrue(!ArcaConfig.fromEnv(env(*COMPLETO))!!.esProduccion)
    }

    @Test
    fun `produccion hay que pedirla explicitamente`() {
        val c = ArcaConfig.fromEnv(env(*COMPLETO, "ARCA_ENV" to "produccion"))!!
        assertTrue(c.esProduccion)
        // Y cualquier otra cosa NO es producción: un typo no puede mandarnos
        // contra el ambiente real.
        for (raro in listOf("prod", "PRODUCCION ", "produccón", "")) {
            val d = ArcaConfig.fromEnv(env(*COMPLETO, "ARCA_ENV" to raro))!!
            assertTrue(!d.esProduccion, "'$raro' no puede ser producción")
        }
    }

    @Test
    fun `el CUIT se limpia y se valida el largo`() {
        assertEquals(
            "30712345678",
            ArcaConfig.fromEnv(env(*COMPLETO, "ARCA_CUIT" to "30-71234567-8"))!!.cuit,
        )
        // Un CUIT corto es una variable mal puesta, y con eso ARCA rechaza todo
        // sin decir por qué. Mejor no configurar.
        assertNull(ArcaConfig.fromEnv(env(*COMPLETO, "ARCA_CUIT" to "123")))
    }
}
