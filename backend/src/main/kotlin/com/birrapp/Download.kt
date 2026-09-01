package com.birrapp

import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.path
import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.header
import io.ktor.server.response.respondFile
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date

/**
 * Descarga directa del APK.
 *
 * Se sirve desde el propio dominio en vez de subirlo a WeTransfer o similar:
 * el link no vence, no depende de un tercero y es el mismo siempre, así que
 * se puede compartir una vez y después sólo reemplazar el archivo.
 *
 * No reemplaza a Play para distribuir en serio —Play maneja actualizaciones
 * automáticas y firma— pero para pasarle el APK a un grupo de gente que lo
 * va a probar, alcanza y sobra.
 */
/**
 * Sirve la PWA en /app.
 *
 * Un solo handler resuelve todo, en vez de `staticFiles` + una ruta comodín:
 * con las dos, el comodín ganaba también para los assets y devolvía el HTML
 * del shell con `Content-Type: text/html` en lugar del JS. El navegador lo
 * recibía con 200, no sabía ejecutarlo, y la app quedaba en blanco.
 *
 * Regla: si la ruta corresponde a un archivo real, se sirve; si no, se
 * devuelve el shell, porque es una ruta del router (/app/perfil, /app/bar/12)
 * que el servidor no conoce.
 */
fun Route.webAppRoutes(webDir: File) {
    if (!webDir.isDirectory) return
    val shell = File(webDir, "index.html")
    val canonicalRoot = webDir.canonicalFile

    suspend fun ApplicationCall.serveShell() {
        // El shell cambia en cada deploy y no puede cachearse.
        response.header(HttpHeaders.CacheControl, "no-cache")
        respondFile(shell)
    }

    get("/app") { call.serveShell() }

    get("/app/{...}") {
        val rel = call.request.path().removePrefix("/app/").substringBefore('?')
        val target = File(webDir, rel)

        // Sin esto, "/app/../../etc/passwd" saldría del directorio servido.
        val inside = target.canonicalFile.path.startsWith(canonicalRoot.path)

        if (rel.isNotBlank() && inside && target.isFile) {
            // Los assets llevan hash en el nombre: son inmutables.
            if (rel.startsWith("assets/")) {
                call.response.header(HttpHeaders.CacheControl, "public, max-age=31536000, immutable")
            }
            call.respondFile(target)
        } else {
            call.serveShell()
        }
    }
}

fun Route.downloadRoutes(apkDir: File) {

    route("/descargar") {

        get {
            val apk = latestApk(apkDir)
            call.respondText(ContentType.Text.Html, HttpStatusCode.OK) {
                landingPage(apk)
            }
        }

        get("/birrapp.apk") {
            val apk = latestApk(apkDir)
                ?: return@get call.respondText(
                    "No hay ninguna versión disponible por ahora.",
                    status = HttpStatusCode.NotFound,
                )
            // Sin este tipo MIME Android no ofrece instalar: lo trata como
            // un archivo cualquiera y lo deja tirado en Descargas.
            call.response.header(
                HttpHeaders.ContentDisposition,
                ContentDisposition.Attachment
                    .withParameter(ContentDisposition.Parameters.FileName, "birrapp.apk")
                    .toString(),
            )
            call.respondFile(apk)
        }
    }
}

private fun latestApk(dir: File): File? =
    dir.listFiles { f -> f.isFile && f.extension == "apk" }
        ?.maxByOrNull { it.lastModified() }

/** Saca la version del nombre: birrapp-0.2.2-20260901.apk -> 0.2.2 */
private fun versionOf(apk: File): String? =
    Regex("[0-9]+\\.[0-9]+\\.[0-9]+").find(apk.name)?.value

private fun landingPage(apk: File?): String {
    val version = apk?.let { versionOf(it) }
    val size = apk?.let { "%.1f MB".format(it.length() / 1_048_576.0) } ?: "—"
    val date = apk?.let {
        SimpleDateFormat("d/M/yyyy HH:mm").format(Date(it.lastModified()))
    } ?: "—"
    val available = apk != null

    return """
<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>birrapp</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #1A1410; color: #FBF6EE; padding: 24px;
    font: 15px/1.5 system-ui, -apple-system, sans-serif;
  }
  .card { width: 100%; max-width: 420px; }
  h1 { font-size: 34px; margin: 0 0 6px; letter-spacing: -1px; }
  .sub { color: #B6A899; margin: 0 0 28px; }
  .btn {
    display: block; text-align: center; text-decoration: none;
    background: #FFB627; color: #1A1410; font-weight: 600;
    padding: 16px; border-radius: 14px; margin-bottom: 10px;
  }
  .btn.off { background: #332822; color: #8A7B6D; pointer-events: none; }
  .meta { color: #8A7B6D; font-size: 12px; text-align: center; margin-bottom: 30px; }
  ol { color: #B6A899; font-size: 14px; padding-left: 20px; margin: 0; }
  li { margin-bottom: 10px; }
  .note {
    margin-top: 26px; padding: 13px; border-radius: 12px;
    background: rgba(255,182,39,.10); color: #B6A899; font-size: 12.5px;
  }
  code { color: #FFB627; }
  .ver {
    display: inline-block; margin-left: 6px; padding: 2px 8px;
    border-radius: 20px; background: rgba(255,182,39,.15);
    color: #FFB627; font-size: 12px; vertical-align: middle;
  }
</style>
</head>
<body>
  <div class="card">
    <h1>birrapp</h1>
    <p class="sub">El precio de la pinta, en el mapa.${if (version != null) " <span class=\"ver\">v$version</span>" else ""}</p>

    <a class="btn ${if (available) "" else "off"}" href="/descargar/birrapp.apk">
      ${if (available) "Descargar para Android" else "No disponible por ahora"}
    </a>
    <p class="meta">${if (version != null) "versión $version · " else ""}$size · actualizado el $date</p>

    <ol>
      <li>Tocá <strong>Descargar</strong>. Android va a avisarte que este tipo
          de archivo puede ser dañino: es el aviso normal para cualquier app
          que no venga de Play.</li>
      <li>Abrí el archivo descargado. Si te pide permiso para
          <strong>instalar apps desconocidas</strong>, activalo para el
          navegador y volvé.</li>
      <li>Instalar. Listo.</li>
    </ol>

    <div class="note">
      Para que el mapa te muestre bares cerca hace falta darle permiso de
      <code>ubicación</code>. Podés mirar el mapa sin cuenta; para cargar
      precios sí hace falta iniciar sesión.
    </div>
  </div>
</body>
</html>
    """.trimIndent()
}
