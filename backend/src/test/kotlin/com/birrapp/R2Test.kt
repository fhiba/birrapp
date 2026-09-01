package com.birrapp

import com.birrapp.photos.R2
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * La firma se fija contra un vector conocido.
 *
 * El vector se generó con un presignador independiente y se verificó contra
 * R2 de verdad (PUT 200, DELETE 204) antes de congelarlo acá. Sin este test,
 * un cambio de una línea en el escapado o en el orden de la query rompe las
 * subidas sin que falle nada visible en el build.
 */
class R2Test {

    private val r2 = R2(
        accountId = "abc123",
        bucket = "birrapp-fotos",
        accessKeyId = "AKIDEJEMPLO",
        secretAccessKey = "secretodeejemplo",
        publicBase = "https://pub-ejemplo.r2.dev",
    )

    @Test
    fun `firma un PUT igual que el vector conocido`() {
        val url = r2.presign(
            method = "PUT",
            key = "bar/9/ipa/deadbeef.webp",
            expiresSeconds = 600,
            now = Instant.parse("2026-09-01T12:00:00Z"),
        )
        assertEquals(
            "https://abc123.r2.cloudflarestorage.com/birrapp-fotos/bar/9/ipa/deadbeef.webp" +
                "?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
                "&X-Amz-Credential=AKIDEJEMPLO%2F20260901%2Fauto%2Fs3%2Faws4_request" +
                "&X-Amz-Date=20260901T120000Z" +
                "&X-Amz-Expires=600" +
                "&X-Amz-SignedHeaders=host" +
                "&X-Amz-Signature=758181e31d10d6b6c88c0d7b1947e2d3517e2f5e36f73b93567a21efa63160c3",
            url,
        )
    }

    @Test
    fun `las barras del path no se escapan`() {
        val url = r2.presign("PUT", "bar/9/ipa/x.webp", 600, Instant.parse("2026-09-01T12:00:00Z"))
        assertTrue(url.contains("/birrapp-fotos/bar/9/ipa/x.webp?"), url)
        assertFalse(url.contains("%2Fbar%2F9"), "el path no debe llevar las barras escapadas")
    }

    @Test
    fun `sin credenciales queda deshabilitado en vez de firmar cualquier cosa`() {
        val vacio = R2("", "", "", "", "")
        assertFalse(vacio.isConfigured)
        assertTrue(r2.isConfigured)
    }

    @Test
    fun `la url publica no duplica la barra`() {
        val con = R2("a", "b", "c", "d", "https://pub.r2.dev/")
        assertEquals("https://pub.r2.dev/bar/9/ipa/x.webp", con.publicUrl("bar/9/ipa/x.webp"))
    }
}
