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
