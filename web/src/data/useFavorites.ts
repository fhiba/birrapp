import { useCallback, useEffect, useState } from 'react'
import * as api from './api'
import * as fb from './feedback'
import type { User } from './types'

/**
 * Los bares favoritos, sincronizados con la cuenta (BIR-37 / BIR-5).
 *
 * Se guardan en el servidor y no en el navegador porque la mitad de la gracia
 * es que sobrevivan al teléfono: quien marca diez bares en la PWA los quiere
 * ver cuando entra desde otro lado. En local serían diez bares que se pierden
 * al limpiar el sitio.
 *
 * Se trae sólo el conjunto de ids: alcanza para pintar el corazón en todos
 * lados, y la lista completa con nombres y precios la pide quien la muestra.
 * El corazón se pinta antes de que el servidor conteste y se revierte si
 * falla — marcar un favorito no puede sentirse como esperar.
 */
export function useFavorites(user: User | null) {
  const [ids, setIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!user) { setIds(new Set()); return }
    let alive = true
    api.favorites()
      .then(bars => { if (alive) setIds(new Set(bars.map(b => b.id))) })
      .catch(() => {})
    return () => { alive = false }
  }, [user?.id])

  const toggle = useCallback(async (barId: number) => {
    const was = ids.has(barId)
    // Acá y no en cada botón: es el único camino que tienen todos los
    // corazones —la ficha, la vista previa del mapa, la lista—, así que el
    // aviso sale una vez y desde el mismo lugar.
    fb.tap()
    setIds(cur => {
      const next = new Set(cur)
      was ? next.delete(barId) : next.add(barId)
      return next
    })
    try {
      await (was ? api.removeFavorite(barId) : api.addFavorite(barId))
    } catch {
      fb.error()
      setIds(cur => {
        const back = new Set(cur)
        was ? back.add(barId) : back.delete(barId)
        return back
      })
    }
  }, [ids])

  return { ids, toggle }
}
