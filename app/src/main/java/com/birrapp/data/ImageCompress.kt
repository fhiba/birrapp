package com.birrapp.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import java.io.ByteArrayOutputStream
import kotlin.math.max

/**
 * Compresión de la foto antes de subirla.
 *
 * Una foto de teléfono son 3-5 MB; a 1280px de lado largo en WebP quedan
 * ~200 KB. Sin esto, veinte fotos consumen lo que consumirían quinientas.
 *
 * Y hay un efecto que importa más que el tamaño: **volver a codificar el
 * bitmap borra el EXIF**, que trae las coordenadas GPS de dónde se sacó la
 * foto. Subir el archivo original publicaría la ubicación de quien la sacó en
 * una URL abierta. El redimensionado no es sólo una optimización.
 *
 * Mismos números que la PWA a propósito: son la misma foto en el mismo bucket,
 * y que pesen distinto según de dónde se subió no tendría ningún sentido.
 */
private const val MAX_SIDE = 1280
private const val QUALITY = 80

fun compressImage(context: Context, uri: Uri): ByteArray {
    // Primera pasada sin decodificar los píxeles: sólo para saber el tamaño y
    // poder pedir la segunda ya submuestreada. Decodificar una foto de 12 MP
    // entera para después achicarla es la forma más fácil de quedarse sin
    // memoria en un teléfono modesto.
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }

    val longest = max(bounds.outWidth, bounds.outHeight)
    if (longest <= 0) error("No se pudo leer la imagen")

    val opts = BitmapFactory.Options().apply {
        inSampleSize = generateSequence(1) { it * 2 }
            .first { longest / it <= MAX_SIDE * 2 }
    }
    val decoded = context.contentResolver.openInputStream(uri)
        .use { BitmapFactory.decodeStream(it, null, opts) }
        ?: error("No se pudo leer la imagen")

    val scale = minOf(1f, MAX_SIDE.toFloat() / max(decoded.width, decoded.height))
    val scaled =
        if (scale >= 1f) decoded
        else Bitmap.createScaledBitmap(
            decoded,
            (decoded.width * scale).toInt().coerceAtLeast(1),
            (decoded.height * scale).toInt().coerceAtLeast(1),
            true,
        )

    val format =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY
        else @Suppress("DEPRECATION") Bitmap.CompressFormat.WEBP

    return ByteArrayOutputStream().use { out ->
        scaled.compress(format, QUALITY, out)
        if (scaled !== decoded) scaled.recycle()
        decoded.recycle()
        out.toByteArray()
    }
}
