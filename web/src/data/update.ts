/**
 * Forzar actualización desde la propia app.
 *
 * En iOS, una PWA instalada en la pantalla de inicio no tiene barra de
 * direcciones ni recarga forzada: si el service worker sirve una versión
 * vieja, el usuario no tiene forma de salir salvo borrar la app y volver a
 * agregarla. Esto le da una salida sin desinstalar nada.
 *
 * Se desregistra el service worker y se borran sus cachés antes de recargar:
 * con sólo recargar, el mismo worker vuelve a servir lo mismo.
 */
export async function forceUpdate() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
  } catch {
    // Si algo falla igual conviene recargar: peor es quedarse trabado.
  }
  // `location.reload()` puede tomar de la caché de navegación; con un
  // parámetro nuevo el pedido sale sí o sí a la red.
  const url = new URL(location.href)
  url.searchParams.set('_u', Date.now().toString(36))
  location.replace(url.toString())
}
