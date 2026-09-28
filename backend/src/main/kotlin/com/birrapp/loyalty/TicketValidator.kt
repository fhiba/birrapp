package com.birrapp.loyalty

import com.birrapp.core.badRequest
import java.math.BigDecimal
import java.time.LocalDate
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * De un QR de ARCA a un comprobante validado.
 *
 * ## Dos mitades que no hay que confundir
 *
 * **Parsear no es validar.** El QR es `https://.../fe/qr/?p=<JSON en base64>`:
 * decodificarlo lee lo que alguien escribió y nada más. Cualquiera arma un QR
 * con un JSON inventado en dos minutos. Lo que dice si el comprobante existe es
 * WSCDC, el servicio de ARCA.
 *
 * Por eso son dos piezas: [parsear], que es determinístico, testeable y no sale
 * a la red, y [TicketValidator], que es la llamada al tercero.
 *
 * ## Por qué la validación es una interfaz
 *
 * En la prueba de concepto corre [ValidadorDeJuguete], que aprueba lo que está
 * bien formado. Eso permite tener el flujo entero andando —escanear, acreditar,
 * canjear, confirmar— sin depender del alta en ARCA, que es trámite y
 * certificado.
 *
 * Cuando el certificado esté, entra la implementación real y **no cambia nada
 * más**: ni el repo, ni las rutas, ni las pantallas.
 */
interface TicketValidator {
    /** `A` aprobado, `R` rechazado, o `null` si ARCA no contestó. */
    fun constatar(t: TicketValidado): Char?
}

/**
 * El de la prueba de concepto: aprueba todo lo bien formado.
 *
 * **No confundir con "valida".** No consulta nada: está para poder probar el
 * resto del sistema. En staging alcanza; en producción, con este validador, un
 * QR inventado acredita puntos.
 *
 * Por eso lleva el nombre que lleva. Si alguna vez aparece en una config de
 * producción, el nombre es lo que lo va a delatar en la revisión.
 */
class ValidadorDeJuguete : TicketValidator {
    override fun constatar(t: TicketValidado): Char = 'A'
}

/**
 * Los campos del QR que nos interesan.
 *
 * Se aceptan los dominios de ARCA y de AFIP: los tickets viejos traen el
 * segundo y siguen siendo válidos.
 */
private val DOMINIOS = listOf("arca.gob.ar", "afip.gob.ar")

/**
 * Lee el QR y devuelve el comprobante, o rebota diciendo qué le falta.
 *
 * Valida la **forma**, que es lo único que se puede validar sin salir a la red:
 * que la URL sea de ARCA, que el base64 tenga un JSON adentro, y que estén los
 * campos que hacen a la identidad del comprobante. Un QR de una gaseosa o el de
 * una factura de luz se caen acá y nunca llegan a gastar una llamada a ARCA.
 */
fun parsear(url: String): TicketValidado {
    val limpio = url.trim()
    if (DOMINIOS.none { limpio.contains(it, ignoreCase = true) }) {
        badRequest("ese QR no es de un comprobante de ARCA")
    }

    val p = Regex("[?&]p=([^&]+)").find(limpio)?.groupValues?.get(1)
        ?: badRequest("ese QR no trae los datos del comprobante")

    val json = runCatching {
        // `getUrlDecoder` y no el común: el parámetro viaja en una URL, así que
        // puede venir con `-` y `_` en vez de `+` y `/`.
        val bytes = runCatching { Base64.getUrlDecoder().decode(p) }
            .getOrElse { Base64.getDecoder().decode(p) }
        Json.parseToJsonElement(String(bytes)).jsonObject
    }.getOrElse { badRequest("no pudimos leer ese QR") }

    fun texto(k: String): String? = json[k]?.jsonPrimitive?.contentOrNull()
    fun entero(k: String): Int? = texto(k)?.trim()?.toIntOrNull()

    val cuit = texto("cuit")?.filter { it.isDigit() }
        ?: badRequest("ese comprobante no dice de qué bar es")
    if (cuit.length != 11) badRequest("el CUIT del comprobante no es válido")

    val importe = texto("importe")?.trim()?.toBigDecimalOrNull()
        ?: badRequest("ese comprobante no dice el importe")
    if (importe <= BigDecimal.ZERO) badRequest("el importe del comprobante no es válido")

    val fecha = runCatching { LocalDate.parse(texto("fecha")) }
        .getOrElse { badRequest("la fecha del comprobante no es válida") }

    return TicketValidado(
        cuit = cuit,
        ptoVta = entero("ptoVta") ?: badRequest("falta el punto de venta"),
        cbteTipo = entero("tipoCmp") ?: badRequest("falta el tipo de comprobante"),
        cbteNro = texto("nroCmp")?.trim()?.toLongOrNull()
            ?: badRequest("falta el número de comprobante"),
        fecha = fecha,
        importe = importe,
        // El QR trae el código de moneda; 'PES' es el de pesos.
        moneda = texto("moneda")?.take(3)?.uppercase() ?: "PES",
        codAut = texto("codAut") ?: badRequest("ese comprobante no trae código de autorización"),
        payload = limpio,
    )
}

/** El JSON de ARCA mezcla números y strings en los mismos campos. */
private fun kotlinx.serialization.json.JsonPrimitive.contentOrNull(): String? =
    content.takeIf { it.isNotBlank() && it != "null" }
