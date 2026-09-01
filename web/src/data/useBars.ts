import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import type { BarPin, BeerStyle } from './types'

export const BA_CENTER = { lat: -34.6037, lng: -58.3816 }
const OVER_FETCH = 2.5
const MAX_AGE_MS = 5 * 60_000
const MIN_QUERY_ZOOM = 12

export type Sort = 'distance' | 'cheapest'

function haversine(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral) {
  const R = 6_371_000, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Caché por región, igual que en Android.
 *
 * Se trae un área 2,5 veces más grande que la pantalla y mientras el usuario
 * se mueva dentro de ella todo sale de memoria. Las distancias se recalculan
 * en el cliente, así que ordenar por cercanía sigue siendo correcto desde
 * cualquier punto sin volver a consultar.
 *
 * Se cachea dónde están los bares, que casi no cambia — no cuánto salen, que
 * sí. El detalle siempre se pide fresco.
 */
export function useBars() {
  const [bars, setBars] = useState<BarPin[]>([])
  const [styles, setStyles] = useState<BeerStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const known = useRef(new Map<number, BarPin>())
  const covered = useRef<{ center: google.maps.LatLngLiteral; radius: number; at: number } | null>(null)
  const seq = useRef(0)

  useEffect(() => { api.styles().then(setStyles).catch(() => {}) }, [])

  const covers = (c: google.maps.LatLngLiteral, radius: number) => {
    const cur = covered.current
    if (!cur) return false
    if (Date.now() - cur.at > MAX_AGE_MS) return false
    return haversine(cur.center, c) + radius <= cur.radius
  }

  const project = useCallback((
    c: google.maps.LatLngLiteral, radius: number, sort: Sort, style?: string,
  ): BarPin[] => {
    const out = [...known.current.values()]
      .map(b => ({ ...b, distanceMeters: haversine(c, { lat: b.lat, lng: b.lng }) }))
      .filter(b => b.distanceMeters! <= radius)
      .filter(b => !style || b.fromPrice != null)
    out.sort(sort === 'cheapest'
      // NULLS LAST igual que el servidor: un bar sin precio fresco no puede
      // encabezar el ranking de más barata.
      ? (a, b) => (a.fromPrice ?? Infinity) - (b.fromPrice ?? Infinity)
      : (a, b) => a.distanceMeters! - b.distanceMeters!)
    return out.slice(0, 400)
  }, [])

  const load = useCallback(async (
    c: google.maps.LatLngLiteral, radius: number, sort: Sort,
    opts: { style?: string; force?: boolean; zoom?: number } = {},
  ) => {
    if (opts.zoom !== undefined && opts.zoom < MIN_QUERY_ZOOM) { setLoading(false); return }

    if (!opts.force && covers(c, radius)) {
      setBars(project(c, radius, sort, opts.style)); setLoading(false); return
    }

    const mine = ++seq.current
    setLoading(true); setError(null)
    try {
      const big = Math.min(50_000, Math.max(1000, Math.round(radius * OVER_FETCH)))
      const fresh = await api.nearbyBars(c.lat, c.lng, big, 'distance', undefined, 500)
      if (mine !== seq.current) return   // llegó una respuesta vieja, se descarta
      known.current = new Map(fresh.map(b => [b.id, b]))
      covered.current = { center: c, radius: big, at: Date.now() }
      setBars(project(c, radius, sort, opts.style))
    } catch (e) {
      if (mine !== seq.current) return
      // Con datos en pantalla no se molesta con un cartel: sigue siendo
      // usable, sólo que sin refrescar.
      if (known.current.size === 0) setError((e as Error).message)
      else setBars(project(c, radius, sort, opts.style))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [project])

  const invalidate = useCallback(() => { covered.current = null }, [])

  return { bars, styles, loading, error, load, invalidate, MIN_QUERY_ZOOM }
}

/** Ubicación del navegador. Igual que en la app: nunca bloquea la primera pintura. */
export function useLocation() {
  const [coords, setCoords] = useState<google.maps.LatLngLiteral | null>(null)
  const [denied, setDenied] = useState(false)

  const request = useCallback(() => {
    if (!navigator.geolocation) { setDenied(true); return }
    navigator.geolocation.getCurrentPosition(
      p => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { setDenied(true); setCoords(BA_CENTER) },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    )
  }, [])

  useEffect(request, [request])
  return { coords, denied, request }
}
