/**
 * Recarga cuando hay una versión nueva.
 *
 * `skipWaiting` hace que el service worker nuevo tome control enseguida, pero
 * la pestaña abierta sigue con el JavaScript viejo hasta que se recargue. Sin
 * esto, después de cada deploy el usuario ve la versión anterior — y no tiene
 * forma de saber que tiene que recargar.
 *
 * Se recarga una sola vez por control nuevo: sin la guarda, dos pestañas
 * pueden entrar en un bucle de recargas.
 */
export function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })
}
