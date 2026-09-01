import type {
  BarDetail, BarPin, BeerStyle, Flag, PriceAccepted, Review, Session, User, UserStats,
} from './types'

/**
 * Cliente HTTP.
 *
 * Mismo backend que la app Android, sin un solo cambio: la API ya era HTTP y
 * JSON, así que el trabajo de portar fue cero de este lado.
 *
 * La sesión va en localStorage y no en una cookie httpOnly, que sería más
 * seguro: la PWA puede quedar servida desde otro origen que la API y las
 * cookies cross-site son un dolor. Se compensa con lo mismo que en la app:
 * access token de 30 minutos y refresh rotativo.
 */
const KEY = 'birrapp.session'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

let session: Session | null = (() => {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null }
  catch { return null }
})()

const listeners = new Set<(u: User | null) => void>()
export const onSessionChange = (fn: (u: User | null) => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
const emit = () => listeners.forEach(fn => fn(session?.user ?? null))

export const currentUser = () => session?.user ?? null

export function saveSession(s: Session) {
  session = s
  localStorage.setItem(KEY, JSON.stringify(s))
  emit()
}
export function clearSession() {
  session = null
  localStorage.removeItem(KEY)
  emit()
}

let refreshing: Promise<boolean> | null = null

/** Un solo refresh a la vez: si no, varias requests con 401 gastan cada una
 *  un refresh token distinto y se invalidan entre ellas. */
async function refresh(): Promise<boolean> {
  if (!session?.refreshToken) return false
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await fetch('/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session!.refreshToken }),
        })
        if (!r.ok) { clearSession(); return false }
        saveSession(await r.json())
        return true
      } catch { return false } finally { refreshing = null }
    })()
  }
  return refreshing
}

async function req<T>(
  method: string, path: string,
  opts: { body?: unknown; auth?: boolean; params?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const url = new URL(path, location.origin)
  Object.entries(opts.params ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  })

  const send = () => fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.auth && session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })

  let res = await send()
  if (res.status === 401 && opts.auth && await refresh()) res = await send()

  if (!res.ok) {
    let message = `Error ${res.status}`
    try { message = (await res.json()).message ?? message } catch { /* respuesta sin json */ }
    throw new ApiError(res.status, message)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

// ---------- lectura pública ----------
export const nearbyBars = (
  lat: number, lng: number, radius = 2000, sort = 'distance', style?: string, limit = 500,
) => req<BarPin[]>('GET', '/bars', { params: { lat, lng, radius, sort, style, limit } })

export const barDetail = (id: number, lat?: number, lng?: number) =>
  req<BarDetail>('GET', `/bars/${id}`, { params: { lat, lng } })

export const searchBars = (q: string, lat?: number, lng?: number) =>
  req<BarPin[]>('GET', '/bars/search', { params: { q, lat, lng } })

export const styles = () => req<BeerStyle[]>('GET', '/styles')
export const reviews = (barId: number) => req<Review[]>('GET', `/bars/${barId}/reviews`)

// ---------- aportes ----------
export const reportPrice = (b: { barId: number; styleSlug: string; price: number; sizeMl: number }) =>
  req<PriceAccepted>('POST', '/prices', { body: b, auth: true })

export const confirmPrice = (barId: number, styleSlug: string) =>
  req<PriceAccepted>('POST', `/bars/${barId}/confirm/${styleSlug}`, { auth: true })

export const addBar = (b: {
  name: string; lat: number; lng: number; address?: string | null; googlePlaceId?: string | null
}) => req<{ id: number }>('POST', '/bars', { body: b, auth: true })

export const addReview = (b: { barId: number; rating: number; body?: string | null }) =>
  req<unknown>('POST', '/reviews', { body: b, auth: true })

export const flag = (b: { targetType: string; targetId: number; reason: string }) =>
  req<unknown>('POST', '/flags', { body: b, auth: true })

// ---------- sesión ----------
/** platform=web: el backend devuelve a la PWA por URL, no por deep link. */
export const startBrowserLogin = () =>
  req<{ authorizeUrl: string }>('POST', '/auth/browser/start', { params: { platform: 'web' } })

export const redeemHandoff = (code: string) =>
  req<Session>('POST', '/auth/handoff', { body: { code } })

export const me = () => req<User>('GET', '/auth/me', { auth: true })
export const myStats = () => req<UserStats>('GET', '/auth/me/stats', { auth: true })

export async function signOut() {
  try { await req<unknown>('POST', '/auth/logout', { auth: true }) } catch { /* da igual */ }
  clearSession()
}
export async function deleteAccount() {
  await req<unknown>('DELETE', '/auth/me', { auth: true })
  clearSession()
}

// ---------- moderación ----------
export const pendingBars = () => req<BarPin[]>('GET', '/moderation/bars/pending', { auth: true })
export const openFlags = () => req<Flag[]>('GET', '/moderation/flags', { auth: true })
export const approveBar = (id: number) => req<unknown>('POST', `/moderation/bars/${id}/approve`, { auth: true })
export const rejectBar = (id: number) => req<unknown>('POST', `/moderation/bars/${id}/reject`, { auth: true })
export const deleteBar = (id: number) => req<unknown>('POST', `/moderation/bars/${id}/delete`, { auth: true })
export const resolveFlag = (id: number) => req<unknown>('POST', `/moderation/flags/${id}/resolve`, { auth: true })
export const approvePrice = (id: number) => req<unknown>('POST', `/moderation/prices/${id}/approve`, { auth: true })
export const removePrice = (id: number) => req<unknown>('POST', `/moderation/prices/${id}/remove`, { auth: true })
