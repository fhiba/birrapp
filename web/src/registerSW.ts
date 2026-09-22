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
 *
 * ## Y hay que PREGUNTAR si hay versión nueva
 *
 * `controllerchange` avisa cuando el service worker nuevo toma control, pero
 * alguien tiene que haberlo descubierto antes. El navegador busca la
 * actualización **al registrarlo**, o sea una vez por carga de página — y una
 * app que se queda abierta no vuelve a cargar nunca. Una PWA en el teléfono
 * puede pasar días así, y una pestaña en la compu también.
 *
 * Eso costó tres reportes de bugs que no existían: un filtro que "no andaba",
 * un padding que "no se había arreglado" y una lista de estilos vacía. En los
 * tres el código en producción ya estaba bien y lo que corría era el bundle
 * anterior. El costo real no es el deploy que tarda: es el rato que se pierde
 * buscando un bug en el lugar equivocado.
 *
 * Ahora se pregunta cada vez que la app vuelve al frente. Si no hay nada nuevo
 * es un pedido condicional que devuelve 304; si lo hay, se instala, toma
 * control y el `controllerchange` de arriba recarga.
 */
export function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })

  const buscar = () => {
    if (document.visibilityState !== 'visible') return
    // `ready` espera a que haya uno activo; sin eso, en la primerísima carga
    // esto correría antes de que exista registro y no haría nada.
    navigator.serviceWorker.ready
      .then(reg => reg.update())
      .catch(() => { /* sin conexión: se vuelve a probar la próxima vez */ })
  }
  document.addEventListener('visibilitychange', buscar)
}
