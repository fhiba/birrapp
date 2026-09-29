package com.birrapp

import com.birrapp.core.ApiException
import com.birrapp.loyalty.parsear
import java.math.BigDecimal
import java.time.LocalDate
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * El parseo del QR de ARCA.
 *
 * **Parsear no es validar, y esa distinción es la mitad del antifraude.** Todo
 * lo que se prueba acá se puede falsificar en dos minutos: el QR es un JSON en
 * base64 dentro de una URL. Lo único que se verifica es la forma, y sirve para
 * dos cosas — dar un error entendible ante un QR que no es de un comprobante, y
 * no gastar una llamada a ARCA con algo que ni parece una factura.
 *
 * Que un QR pase estos tests no dice nada sobre si el comprobante existe.
 */
class TicketQrTest {

    private fun qr(
        cuit: String = "30712345678", importe: String = "12000.50",
        fecha: String = "2026-09-28", nro: String = "1234",
        dominio: String = "arca.gob.ar", extra: String = "",
    ): String {
        val json = """
            {"ver":1,"fecha":"$fecha","cuit":"$cuit","ptoVta":1,"tipoCmp":6,
             "nroCmp":"$nro","importe":"$importe","moneda":"PES","ctz":1,
             "tipoCodAut":"E","codAut":"71234567890123"$extra}
        """.trimIndent()
        val p = Base64.getUrlEncoder().withoutPadding().encodeToString(json.toByteArray())
        return "https://www.$dominio/fe/qr/?p=$p"
    }

    @Test
    fun `lee un comprobante bien formado`() {
        val t = parsear(qr())
        assertEquals("30712345678", t.cuit)
        assertEquals(1, t.ptoVta)
        assertEquals(6, t.cbteTipo)
        assertEquals(1234L, t.cbteNro)
        assertEquals(LocalDate.parse("2026-09-28"), t.fecha)
        assertEquals(BigDecimal("12000.50"), t.importe)
        assertEquals("71234567890123", t.codAut)
    }

    @Test
    fun `guarda el payload crudo`() {
        // Es lo único que permite auditar un claim dudoso meses después sin
        // depender de que ARCA conserve nada.
        val url = qr()
        assertEquals(url, parsear(url).payload)
    }

    @Test
    fun `los tickets viejos con dominio de AFIP siguen valiendo`() {
        assertEquals("30712345678", parsear(qr(dominio = "afip.gob.ar")).cuit)
    }

    @Test
    fun `un QR que no es de un comprobante se rechaza antes de molestar a ARCA`() {
        for (basura in listOf(
            "https://ejemplo.com/algo",
            "hola",
            "",
            "https://www.arca.gob.ar/fe/qr/",           // sin el parámetro
        )) {
            assertFailsWith<ApiException>("debería rebotar: '$basura'") { parsear(basura) }
        }
    }

    @Test
    fun `un base64 roto da un error entendible y no una excepción cualquiera`() {
        val e = assertFailsWith<ApiException> {
            parsear("https://www.arca.gob.ar/fe/qr/?p=no-es-base64-valido!!!")
        }
        assertTrue(e.message.contains("no pudimos leer"), e.message)
    }

    @Test
    fun `un comprobante sin los campos de identidad se rechaza`() {
        val sinCuit = Base64.getUrlEncoder().withoutPadding()
            .encodeToString("""{"importe":"100","fecha":"2026-09-28"}""".toByteArray())
        val e = assertFailsWith<ApiException> {
            parsear("https://www.arca.gob.ar/fe/qr/?p=$sinCuit")
        }
        assertTrue(e.message.contains("de qué bar"), e.message)
    }

    @Test
    fun `un CUIT que no tiene once digitos se rechaza`() {
        val e = assertFailsWith<ApiException> { parsear(qr(cuit = "123")) }
        assertTrue(e.message.contains("CUIT"), e.message)
    }

    @Test
    fun `un importe cero o negativo no es un consumo`() {
        assertFailsWith<ApiException> { parsear(qr(importe = "0")) }
        assertFailsWith<ApiException> { parsear(qr(importe = "-500")) }
    }

    @Test
    fun `una fecha imposible se rechaza`() {
        assertFailsWith<ApiException> { parsear(qr(fecha = "2026-13-45")) }
        assertFailsWith<ApiException> { parsear(qr(fecha = "ayer")) }
    }

    @Test
    fun `el CUIT se limpia de guiones`() {
        // ARCA manda once dígitos, pero hay emisores que le ponen guiones. Si
        // se guardara con guiones, no matchearía contra `partner_bars.cuit` y
        // el bar afiliado no se reconocería — un bug silencioso, porque el
        // rechazo diría "bar no afiliado".
        assertEquals("30712345678", parsear(qr(cuit = "30-71234567-8")).cuit)
    }
}
