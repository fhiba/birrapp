package com.birrapp.core

import java.io.File

/**
 * Config desde entorno o backend/.env.
 *
 * Falla al arrancar nombrando exactamente lo que falta. La alternativa —
 * arrancar igual y romper en el primer login con un NPE — cuesta mucho más
 * caro de diagnosticar.
 */
data class Config(
    val port: Int,
    val bindHost: String,
    val dbUrl: String,
    val dbUser: String,
    val dbPassword: String,
    val googleWebClientId: String,
    val googleClientSecret: String,
    val publicBaseUrl: String,
    val appRedirectScheme: String,
    val apkDir: String,
    val jwtSecret: String,
    val jwtIssuer: String,
    val jwtAudience: String,
    val accessMinutes: Long,
    val refreshDays: Long,
    val bootstrapAdminEmails: Set<String>,
) {
    companion object {
        private const val PLACEHOLDER = "REPLACE_ME"

        fun load(envFile: File = File(".env")): Config {
            val fromFile: Map<String, String> = if (envFile.exists()) {
                envFile.readLines()
                    .map { it.trim() }
                    .filter { it.isNotEmpty() && !it.startsWith("#") && it.contains("=") }
                    .associate { line ->
                        val i = line.indexOf('=')
                        line.take(i).trim() to line.substring(i + 1).trim().trim('"')
                    }
            } else emptyMap()

            fun raw(key: String): String? =
                System.getenv(key)?.takeIf { it.isNotBlank() } ?: fromFile[key]?.takeIf { it.isNotBlank() }

            val missing = mutableListOf<String>()
            fun required(key: String, hint: String): String {
                val v = raw(key)
                if (v == null || v == PLACEHOLDER) missing += "  $key — $hint"
                return v ?: ""
            }

            // Se avisa pero no se aborta: sin client ID de Google el mapa
            // público anda igual, y sólo el login queda deshabilitado. Frenar
            // todo el servidor por eso obligaría a tener las credenciales
            // antes de poder trabajar en nada.
            val pending = mutableListOf<String>()
            fun optional(key: String, hint: String): String {
                val v = raw(key)
                if (v == null || v == PLACEHOLDER) { pending += "  $key — $hint"; return "" }
                return v
            }

            val cfg = Config(
                port       = raw("PORT")?.toIntOrNull() ?: 8080,
                // En producción conviene 127.0.0.1: así el único camino de
                // entrada es el proxy (Funnel/Cloudflare) y nadie en la LAN
                // puede pegarle directo ni falsear X-Forwarded-For.
                bindHost   = raw("BIND_HOST") ?: "0.0.0.0",
                dbUrl      = raw("DATABASE_URL") ?: "jdbc:postgresql://localhost:5433/birrapp",
                dbUser     = raw("DATABASE_USER") ?: "birrapp",
                dbPassword = raw("DATABASE_PASSWORD") ?: "birrapp_dev",
                googleWebClientId = optional(
                    "GOOGLE_WEB_CLIENT_ID",
                    "client ID del cliente OAuth *Web*. Sin esto el login queda " +
                        "deshabilitado; el resto anda. Ver docs/SETUP.md paso 4b.",
                ),
                googleClientSecret = optional(
                    "GOOGLE_CLIENT_SECRET",
                    "secreto del cliente OAuth Web. Sin esto no funciona el " +
                        "login por navegador; Credential Manager sí anda.",
                ),
                publicBaseUrl = (raw("PUBLIC_BASE_URL") ?: "").trimEnd('/'),
                appRedirectScheme = raw("APP_REDIRECT_SCHEME") ?: "birrapp",
                apkDir = raw("APK_DIR") ?: "/home/jaiba/birrapp-deploy/apk",
                jwtSecret = required(
                    "JWT_SECRET",
                    "secreto propio de birrapp, NO de Google. Generar: openssl rand -base64 48",
                ),
                jwtIssuer     = raw("JWT_ISSUER") ?: "birrapp",
                jwtAudience   = raw("JWT_AUDIENCE") ?: "birrapp-app",
                accessMinutes = raw("JWT_ACCESS_MINUTES")?.toLongOrNull() ?: 30,
                refreshDays   = raw("JWT_REFRESH_DAYS")?.toLongOrNull() ?: 60,
                bootstrapAdminEmails = (raw("BOOTSTRAP_ADMIN_EMAILS") ?: "")
                    .split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet(),
            )

            if (pending.isNotEmpty()) {
                println(
                    buildString {
                        appendLine()
                        appendLine("-".repeat(64))
                        appendLine("birrapp arranca con funcionalidad reducida. Falta:")
                        appendLine()
                        pending.forEach { appendLine(it) }
                        appendLine()
                        appendLine("El mapa, la lista y el detalle de bares funcionan igual.")
                        appendLine("-".repeat(64))
                    }
                )
            }

            if (missing.isNotEmpty()) {
                error(
                    buildString {
                        appendLine()
                        appendLine("=".repeat(64))
                        appendLine("Falta configuración para arrancar birrapp:")
                        appendLine()
                        missing.forEach { appendLine(it) }
                        appendLine()
                        appendLine("Cargalos en backend/.env (copiá .env.example) o como variables")
                        appendLine("de entorno. Guía completa: docs/SETUP.md")
                        appendLine("=".repeat(64))
                    }
                )
            }
            return cfg
        }
    }
}
