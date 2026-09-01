import type { Freshness } from './types'

const AR = 'es-AR'

/** $4.500, sin decimales: los centavos no significan nada con estos montos. */
export const formatPrice = (v: number) =>
  new Intl.NumberFormat(AR, {
    style: 'currency', currency: 'ARS',
    maximumFractionDigits: 0, minimumFractionDigits: 0,
  }).format(v)

export const groupThousands = (digits: string) => {
  const n = Number(digits)
  return Number.isFinite(n) ? new Intl.NumberFormat(AR).format(n) : digits
}

export const formatDistance = (m: number | null | undefined) =>
  m == null ? null
    : m < 1000 ? `a ${Math.round(m)} m`
    : `a ${(m / 1000).toFixed(1).replace('.0', '')} km`

export const formatRadius = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace('.0', '')} km` : `${m} m`

/** Nunca se muestra un precio sin esto al lado. */
export function ageLabel(ageDays: number, f: Freshness) {
  if (f === 'stale') return `hace ${ageDays} días · puede estar desactualizado`
  if (ageDays <= 0) return 'hoy'
  if (ageDays === 1) return 'ayer'
  return `hace ${ageDays} días`
}

export const shortAge = (d: number | null) =>
  d == null ? '' : d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} d`

export const freshnessColor = (f: Freshness) =>
  f === 'fresh' ? 'var(--fresh)' : f === 'aging' ? 'var(--aging)' : 'var(--stale)'

export const ageColor = (d: number | null) =>
  d == null ? 'var(--stale)' : d < 14 ? 'var(--fresh)' : d < 45 ? 'var(--aging)' : 'var(--stale)'

/**
 * Color por precio, relativo a lo que hay en pantalla.
 *
 * Se toma el puesto del bar dentro de los precios visibles y no el valor
 * absoluto: con escala lineal, un solo precio disparatado aplasta a todos los
 * demás contra el extremo barato y el mapa se ve todo verde. Por puesto, la
 * mitad más barata siempre se ve barata.
 *
 * Verde → ámbar → rojo, los mismos tres colores de la frescura, para no
 * inventar una paleta nueva por cada cosa que se codifica.
 */
const PRICE_STOPS = [
  [0x5f, 0xd9, 0x8d], // --fresh
  [0xff, 0xb6, 0x27], // --aging
  [0xff, 0x7a, 0x66], // --danger
]

export function priceColor(rank01: number): string {
  const t = Math.max(0, Math.min(1, rank01)) * (PRICE_STOPS.length - 1)
  const i = Math.min(PRICE_STOPS.length - 2, Math.floor(t))
  const f = t - i
  const [a, b] = [PRICE_STOPS[i], PRICE_STOPS[i + 1]]
  const ch = (n: number) => Math.round(a[n] + (b[n] - a[n]) * f)
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`
}

/**
 * Puesto de cada precio entre 0 y 1, por bar.
 *
 * Los empates comparten puesto: dos bares al mismo precio tienen que verse
 * del mismo color o el mapa miente.
 *
 * Recibe pares y no un `Map` armado por quien llama a propósito: en
 * MapScreen, `Map` es el componente de Google Maps y construir uno ahí no
 * compila.
 */
export function priceRanks(entries: [number, number][]): Map<number, number> {
  const sorted = [...new Set(entries.map(([, v]) => v))].sort((a, b) => a - b)
  const of = new Map(sorted.map((v, i) => [v, sorted.length < 2 ? 0 : i / (sorted.length - 1)]))
  return new Map(entries.map(([id, v]) => [id, of.get(v)!]))
}
