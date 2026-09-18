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

/**
 * El lado de la foto de perfil ya recortada, en píxeles.
 *
 * Se muestra a 64 CSS px y en una pantalla de teléfono eso son 192 reales. 512
 * deja margen para que mañana se vea más grande sin volver a pedirle la foto a
 * nadie, y sigue pesando menos que la original sin tocar.
 */
const LADO_AVATAR = 512

/**
 * Recorta un cuadrado de la imagen y lo devuelve listo para subir.
 *
 * El rectángulo viene en píxeles de la imagen original —lo calcula quien
 * maneja el encuadre— y acá sólo se dibuja. La cuenta vive allá porque depende
 * de cuánto se movió y se acercó la foto en pantalla; esto es la parte que
 * toca el canvas.
 *
 * Igual que [compressImage], volver a codificar borra el EXIF y con él las
 * coordenadas GPS. Acá importa lo mismo: una foto de perfil vive en una URL
 * abierta.
 */
export async function cropToSquare(
  file: File, rect: { x: number; y: number; side: number },
): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = LADO_AVATAR
    canvas.height = LADO_AVATAR
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo procesar la imagen')

    // Suavizado en alto: al bajar de 3000px a 512 sin esto quedan escalones en
    // los bordes, y en una cara se notan.
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      bitmap,
      rect.x, rect.y, rect.side, rect.side,
      0, 0, LADO_AVATAR, LADO_AVATAR,
    )

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/webp', QUALITY))
    if (!blob) throw new Error('No se pudo comprimir la imagen')
    return blob
  } finally {
    bitmap.close()
  }
}
