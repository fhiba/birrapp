/**
 * Compresión de la foto antes de subirla.
 *
 * Una foto de teléfono son 3-5 MB; a 1280px de lado largo en WebP quedan
 * ~200 KB. Sin esto, veinte fotos consumen lo que consumirían quinientas.
 *
 * Y hay un efecto que importa más que el tamaño: **volver a codificar en un
 * canvas borra el EXIF**, que trae las coordenadas GPS de dónde se sacó la
 * foto. Subir el archivo original publicaría la ubicación de quien la sacó en
 * una URL abierta. El redimensionado no es sólo una optimización.
 */
const MAX_SIDE = 1280
const QUALITY = 0.8

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo procesar la imagen')
    ctx.drawImage(bitmap, 0, 0, w, h)

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/webp', QUALITY))
    if (!blob) throw new Error('No se pudo comprimir la imagen')
    return blob
  } finally {
    // Sin esto la memoria del bitmap queda tomada hasta el próximo GC, y en
    // un teléfono con varias fotos seguidas eso se nota.
    bitmap.close()
  }
}
