package com.birrapp.photos

import java.net.URLEncoder
import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * URLs firmadas para Cloudflare R2, hablando S3 (SigV4).
 *
 * Por qué a mano y no con el SDK de AWS: son ~15 MB de dependencias
 * transitivas en el fat jar para dos operaciones, PUT y DELETE. Mismo criterio
 * que con el ORM — la dependencia cuesta más de lo que resuelve. El algoritmo
 * está fijado por un test contra un vector conocido, así que no se puede
 * romper en silencio.
 *
 * Los bytes de la foto NUNCA pasan por acá: el backend firma y el navegador
 * sube directo al bucket. Si atravesaran el backend se pagaría el ancho de
 * banda dos veces y se le pondría carga de CPU a un proceso que hoy sólo
 * resuelve consultas.
 *
 * R2 usa la región literal `auto` y estilo de ruta (`/bucket/key`), no
 * subdominio por bucket.
 */
class R2(
    private val accountId: String,
    private val bucket: String,
    private val accessKeyId: String,
    private val secretAccessKey: String,
    /** Base pública de lectura: el subdominio r2.dev o un dominio propio. */
    val publicBase: String,
) {
    val isConfigured: Boolean
        get() = accountId.isNotBlank() && bucket.isNotBlank() &&
            accessKeyId.isNotBlank() && secretAccessKey.isNotBlank() && publicBase.isNotBlank()

    private val host get() = "$accountId.r2.cloudflarestorage.com"

    /** URL pública de lectura de un objeto ya subido. */
    fun publicUrl(key: String) = "${publicBase.trimEnd('/')}/$key"

    fun presignPut(key: String, expiresSeconds: Int = 600, now: Instant = Instant.now()) =
        presign("PUT", key, expiresSeconds, now)

    fun presignDelete(key: String, expiresSeconds: Int = 60, now: Instant = Instant.now()) =
        presign("DELETE", key, expiresSeconds, now)

    internal fun presign(
        method: String,
        key: String,
        expiresSeconds: Int,
        now: Instant,
    ): String {
        val amzDate = AMZ.format(now.atOffset(ZoneOffset.UTC))
        val date = amzDate.take(8)
        val scope = "$date/$REGION/$SERVICE/aws4_request"

        // Ordenados alfabéticamente: la firma depende del orden exacto.
        val query = listOf(
            "X-Amz-Algorithm" to ALGO,
            "X-Amz-Credential" to "$accessKeyId/$scope",
            "X-Amz-Date" to amzDate,
            "X-Amz-Expires" to expiresSeconds.toString(),
            "X-Amz-SignedHeaders" to "host",
        ).sortedBy { it.first }
            .joinToString("&") { (k, v) -> "${enc(k)}=${enc(v)}" }

        // La barra NO se escapa en el path, a diferencia de la query.
        val path = "/$bucket/$key".split("/").joinToString("/") { enc(it) }

        // UNSIGNED-PAYLOAD: el cuerpo lo pone el navegador, el servidor no lo
        // ve y por lo tanto no puede hashearlo.
        val canonical = listOf(
            method, path, query, "host:$host", "", "host", "UNSIGNED-PAYLOAD",
        ).joinToString("\n")

        val toSign = "$ALGO\n$amzDate\n$scope\n${sha256Hex(canonical.toByteArray())}"

        var k = hmac("AWS4$secretAccessKey".toByteArray(), date)
        k = hmac(k, REGION)
        k = hmac(k, SERVICE)
        k = hmac(k, "aws4_request")
        val signature = hmac(k, toSign).toHex()

        return "https://$host$path?$query&X-Amz-Signature=$signature"
    }

    private companion object {
        const val ALGO = "AWS4-HMAC-SHA256"
        const val REGION = "auto"
        const val SERVICE = "s3"
        val AMZ: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")

        /**
         * Escapado de AWS, que no es el de `URLEncoder`: el espacio va como
         * %20 y no como `+`, y `~` queda tal cual. Con el default la firma
         * sale mal sólo para algunas llaves, que es la peor forma de fallar.
         */
        fun enc(s: String): String =
            URLEncoder.encode(s, Charsets.UTF_8)
                .replace("+", "%20")
                .replace("*", "%2A")
                .replace("%7E", "~")

        fun sha256Hex(b: ByteArray): String =
            MessageDigest.getInstance("SHA-256").digest(b).toHex()

        fun hmac(key: ByteArray, data: String): ByteArray =
            Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }
                .doFinal(data.toByteArray())

        fun ByteArray.toHex() = joinToString("") { "%02x".format(it) }
    }
}
