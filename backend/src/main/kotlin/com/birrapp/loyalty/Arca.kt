package com.birrapp.loyalty

import java.io.ByteArrayInputStream
import java.io.File
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Security
import java.security.cert.X509Certificate
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Base64
import org.bouncycastle.cert.jcajce.JcaCertStore
import org.bouncycastle.cms.CMSProcessableByteArray
import org.bouncycastle.cms.CMSSignedDataGenerator
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder
import org.slf4j.LoggerFactory

/**
 * Constatación de comprobantes contra ARCA (ex AFIP).
 *
 * ## Las dos mitades
 *
 * **WSAA** es el portero: se le manda un pedido de acceso firmado con el
 * certificado, y devuelve un token y una firma que valen unas 12 horas. **WSCDC**
 * es el servicio que dice si un comprobante existe, y pide ese token en cada
 * llamada.
 *
 * El token se cachea. Pedirlo en cada constatación no sólo es lento: ARCA
 * rechaza pedidos de acceso repetidos con el mismo rango de tiempo, así que un
 * cliente que no cachea empieza a fallar apenas hay dos escaneos seguidos.
 *
 * ## Por qué firmar un CMS y no un JWT
 *
 * WSAA no inventó nada: pide un PKCS#7 / CMS `SignedData` con el XML del pedido
 * adentro, firmado con el certificado que ARCA emitió. El JDK sabe firmar bytes,
 * pero no sabe armar esa estructura — de ahí BouncyCastle.
 *
 * ## Qué pasa si no contesta
 *
 * [constatar] devuelve `null`, y eso NO es "aprobado". Quien llama tiene que
 * tratarlo como "todavía no sabemos" y no acreditar nada: el beneficio se canjea
 * en cinco minutos y se toma, así que acreditar sin respuesta abre una ventana
 * en la que un QR inventado se convierte en una pinta.
 *
 * ## Homologación
 *
 * ARCA tiene un ambiente de prueba con sus propias URLs y su propio certificado.
 * Se elige con `ARCA_ENV`; el default es homologación a propósito — llegar a
 * producción por olvido es peor que no llegar.
 */
data class ArcaConfig(
    /** CUIT con el que se pide acceso, sin guiones. */
    val cuit: String,
    /** PKCS#12 con el certificado y la clave, en base64. */
    val pkcs12Base64: String,
    val pkcs12Password: String,
    /** `homologacion` o `produccion`. */
    val ambiente: String,
) {
    val esProduccion: Boolean get() = ambiente.equals("produccion", ignoreCase = true)

    companion object {
        /**
         * Lee la configuración, o `null` si no está completa.
         *
         * Null y no una excepción: sin certificado el programa de puntos sigue
         * andando con el validador de juguete, que es lo que hace que la prueba
         * de concepto se pueda mirar antes de que el trámite en ARCA termine.
         */
        fun fromEnv(raw: (String) -> String?): ArcaConfig? {
            val cuit = raw("ARCA_CUIT")?.filter { it.isDigit() } ?: return null
            // El .p12 puede venir en base64 —lo cómodo en Railway, que no tiene
            // archivos— o como ruta a un archivo montado.
            val p12 = raw("ARCA_PKCS12_BASE64")
                ?: raw("ARCA_PKCS12_PATH")?.let {
                    runCatching { Base64.getEncoder().encodeToString(File(it).readBytes()) }.getOrNull()
                }
                ?: return null
            val pass = raw("ARCA_PKCS12_PASSWORD") ?: return null
            if (cuit.length != 11) return null
            return ArcaConfig(cuit, p12, pass, raw("ARCA_ENV") ?: "homologacion")
        }
    }
}

class ArcaValidator(private val cfg: ArcaConfig) : TicketValidator {

    private val log = LoggerFactory.getLogger(ArcaValidator::class.java)

    private val wsaaUrl = if (cfg.esProduccion)
        "https://wsaa.afip.gov.ar/ws/services/LoginCms"
    else "https://wsaahomo.afip.gov.ar/ws/services/LoginCms"

    private val wscdcUrl = if (cfg.esProduccion)
        "https://servicios1.afip.gov.ar/wscdc/service.asmx"
    else "https://wswhomo.afip.gov.ar/wscdc/service.asmx"

    /** Token y firma de WSAA, con su vencimiento. */
    private data class Acceso(val token: String, val sign: String, val vence: Instant)

    @Volatile private var acceso: Acceso? = null

    override fun constatar(t: TicketValidado): Char? {
        val a = accesoVigente() ?: return null
        val cuerpo = sobreConstatar(a, t)
        val respuesta = postSoap(wscdcUrl, cuerpo, "http://ar.gov.afip.dif.FEV1/ComprobanteConstatar")
            ?: return null

        // El servicio contesta `<Resultado>A</Resultado>` o `R`. Se busca la
        // etiqueta y no se parsea el XML entero: la respuesta tiene namespaces
        // que cambian entre ambientes, y un parser estricto se rompe con eso
        // mientras que el dato que importa es una letra.
        val resultado = Regex("<Resultado>\\s*([AR])\\s*</Resultado>")
            .find(respuesta)?.groupValues?.get(1)?.firstOrNull()

        if (resultado == null) {
            log.warn("WSCDC contestó algo que no se pudo leer: {}", respuesta.take(400))
        }
        return resultado
    }

    // -----------------------------------------------------------------------
    // WSAA
    // -----------------------------------------------------------------------

    @Synchronized
    private fun accesoVigente(): Acceso? {
        // Un minuto de margen: un token que vence mientras viaja el pedido es
        // un rechazo que parece un rechazo del comprobante.
        acceso?.let { if (it.vence.isAfter(Instant.now().plusSeconds(60))) return it }
        return runCatching { pedirAcceso() }
            .onFailure { log.warn("No se pudo pedir acceso a WSAA: {}", it.message) }
            .getOrNull()
            ?.also { acceso = it }
    }

    private fun pedirAcceso(): Acceso {
        val (llave, cadena) = leerPkcs12()
        val ahora = Instant.now()
        // El rango va corto y hacia atrás: ARCA rechaza un `generationTime`
        // en el futuro, y los relojes no coinciden nunca del todo.
        val desde = ahora.minusSeconds(120)
        val hasta = ahora.plusSeconds(60 * 60 * 11)

        val tra = """
            <?xml version="1.0" encoding="UTF-8"?>
            <loginTicketRequest version="1.0">
              <header>
                <uniqueId>${ahora.epochSecond}</uniqueId>
                <generationTime>${iso(desde)}</generationTime>
                <expirationTime>${iso(hasta)}</expirationTime>
              </header>
              <service>wscdc</service>
            </loginTicketRequest>
        """.trimIndent()

        val cms = firmarCms(tra.toByteArray(), llave, cadena)
        val sobre = """
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                              xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
              <soapenv:Body>
                <wsaa:loginCms><wsaa:in0>$cms</wsaa:in0></wsaa:loginCms>
              </soapenv:Body>
            </soapenv:Envelope>
        """.trimIndent()

        val r = postSoap(wsaaUrl, sobre, "") ?: error("WSAA no contestó")

        // La respuesta trae el XML del ticket escapado adentro del SOAP.
        val xml = r.substringAfter("<loginCmsReturn>", "").substringBefore("</loginCmsReturn>")
            .replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        val token = xml.substringAfter("<token>", "").substringBefore("</token>")
        val sign = xml.substringAfter("<sign>", "").substringBefore("</sign>")
        if (token.isBlank() || sign.isBlank()) error("WSAA contestó sin token: ${r.take(300)}")

        return Acceso(token, sign, hasta)
    }

    private fun leerPkcs12(): Pair<PrivateKey, List<X509Certificate>> {
        val ks = KeyStore.getInstance("PKCS12")
        ks.load(
            ByteArrayInputStream(Base64.getDecoder().decode(cfg.pkcs12Base64.trim())),
            cfg.pkcs12Password.toCharArray(),
        )
        val alias = ks.aliases().asSequence().firstOrNull { ks.isKeyEntry(it) }
            ?: error("el PKCS#12 no tiene ninguna clave privada")
        val llave = ks.getKey(alias, cfg.pkcs12Password.toCharArray()) as PrivateKey
        val cadena = ks.getCertificateChain(alias).map { it as X509Certificate }
        return llave to cadena
    }

    /** El CMS `SignedData` que WSAA pide, en base64. */
    private fun firmarCms(
        datos: ByteArray, llave: PrivateKey, cadena: List<X509Certificate>,
    ): String {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(BouncyCastleProvider())
        }
        val gen = CMSSignedDataGenerator()
        val firmante = JcaContentSignerBuilder("SHA256withRSA")
            .setProvider(BouncyCastleProvider.PROVIDER_NAME)
            .build(llave)
        gen.addSignerInfoGenerator(
            JcaSignerInfoGeneratorBuilder(
                JcaDigestCalculatorProviderBuilder()
                    .setProvider(BouncyCastleProvider.PROVIDER_NAME).build(),
            ).build(firmante, cadena.first()),
        )
        gen.addCertificates(JcaCertStore(cadena))
        // `true` = el contenido viaja adentro del sobre. WSAA necesita leer el
        // pedido, así que no puede ir separado.
        val firmado = gen.generate(CMSProcessableByteArray(datos), true)
        return Base64.getEncoder().encodeToString(firmado.encoded)
    }

    // -----------------------------------------------------------------------
    // WSCDC
    // -----------------------------------------------------------------------

    private fun sobreConstatar(a: Acceso, t: TicketValidado): String {
        // `CbteModo`: CAE o CAEA. El QR lo dice en `tipoCodAut` (E o A); acá se
        // manda CAE salvo que el comprobante diga lo contrario.
        val modo = "CAE"
        // A consumidor final el QR no trae documento del receptor. ARCA acepta
        // tipo 99 con número 0, que es el "sin identificar" de su tabla.
        val fecha = t.fecha.toString().replace("-", "")
        return """
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                              xmlns:ar="http://ar.gov.afip.dif.FEV1/">
              <soapenv:Body>
                <ar:ComprobanteConstatar>
                  <ar:Auth>
                    <ar:Token>${a.token}</ar:Token>
                    <ar:Sign>${a.sign}</ar:Sign>
                    <ar:Cuit>${cfg.cuit}</ar:Cuit>
                  </ar:Auth>
                  <ar:CmpReq>
                    <ar:CbteModo>$modo</ar:CbteModo>
                    <ar:CuitEmisor>${t.cuit}</ar:CuitEmisor>
                    <ar:PtoVta>${t.ptoVta}</ar:PtoVta>
                    <ar:CbteTipo>${t.cbteTipo}</ar:CbteTipo>
                    <ar:CbteNro>${t.cbteNro}</ar:CbteNro>
                    <ar:CbteFch>$fecha</ar:CbteFch>
                    <ar:ImpTotal>${t.importe}</ar:ImpTotal>
                    <ar:CodAutorizacion>${t.codAut}</ar:CodAutorizacion>
                    <ar:DocTipoReceptor>99</ar:DocTipoReceptor>
                    <ar:DocNroReceptor>0</ar:DocNroReceptor>
                  </ar:CmpReq>
                </ar:ComprobanteConstatar>
              </soapenv:Body>
            </soapenv:Envelope>
        """.trimIndent()
    }

    // -----------------------------------------------------------------------

    /**
     * Un POST de SOAP, con timeout corto.
     *
     * Corto a propósito: esto corre mientras alguien mira la pantalla esperando
     * sus puntos, y ARCA tiene días malos. Si no contesta en ese rato, la
     * respuesta honesta es "no sabemos" y que reintente — no dejarlo esperando.
     */
    private fun postSoap(url: String, cuerpo: String, action: String): String? = runCatching {
        val c = java.net.URI(url).toURL().openConnection() as java.net.HttpURLConnection
        c.requestMethod = "POST"
        c.doOutput = true
        c.connectTimeout = 6_000
        c.readTimeout = 12_000
        c.setRequestProperty("Content-Type", "text/xml; charset=utf-8")
        if (action.isNotEmpty()) c.setRequestProperty("SOAPAction", action)
        c.outputStream.use { it.write(cuerpo.toByteArray()) }
        val flujo = if (c.responseCode in 200..299) c.inputStream else c.errorStream
        flujo?.bufferedReader()?.use { it.readText() }
    }.onFailure { log.warn("SOAP a {} falló: {}", url, it.message) }.getOrNull()

    private fun iso(i: Instant): String =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX")
            .withZone(ZoneOffset.ofHours(-3)).format(i)
}
