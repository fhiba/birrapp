import { useEffect, useState } from 'react'
import { t } from '../i18n'

/**
 * Aviso de que no hay conexión.
 *
 * Esta app se usa parado en un bar, en un subsuelo, con una raya de señal: la
 * pérdida de conexión no es el caso raro, es un martes. Hasta ahora eso se
 * veía como "Error 0" o como una pantalla que no cargaba nunca, y no había
 * forma de distinguir "se cayó el servidor" de "estás sin datos".
 *
 * Lo que se muestra dice las dos cosas que importan: que el problema es de la
 * conexión y no de la app, y que lo que ya está en pantalla sigue sirviendo
 * —el mapa y los precios que se alcanzaron a cargar están en memoria—.
 *
 * `navigator.onLine` miente en un sentido: puede decir que hay red cuando el
 * wifi del bar no llega a ningún lado. Pero cuando dice que NO hay, no se
 * equivoca, y ése es justamente el caso que vale la pena avisar.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => { removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: 12, right: 12, zIndex: 75,
        top: `calc(var(--safe-top) + 10px)`,
        display: 'flex', alignItems: 'center', gap: 'var(--s-2)',
        padding: 'var(--s-3) var(--s-4)', borderRadius: 999,
        background: 'var(--elevated)', border: '1px solid var(--hairline)',
        boxShadow: '0 8px 26px rgba(0,0,0,.4)',
        fontSize: 'var(--t-2)', color: 'var(--muted)',
      }}
    >
      <span aria-hidden style={{
        width: 7, height: 7, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0,
      }} />
      {t('Offline.sinConexion')}
    </div>
  )
}
