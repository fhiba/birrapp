import type {
  BarDetail, BarPin, BeerStyle, Brand, DashboardAnalytics, DashboardSummary, DashboardUser, Flag,
  ModerationSummary, MyContributions,
  MyRating, Photo, PriceAccepted, PricePoint, RatingComment, Review, Session,
  User, UserStats,
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

/**
 * Base de la API.
 *
 * Vacío = mismo origen, que es como funciona servido desde el propio backend.
 * Con el frontend en otro dominio (Vercel) acá va la URL del backend, y ahí
 * hace falta CORS del otro lado.
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

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
/**
 * Actualiza los datos del usuario dentro de la sesión guardada.
 *
 * Hace falta porque la sesión vive en localStorage con una copia del usuario
 * de cuando se inició. Sin esto, cambiar la foto de perfil se ve hasta que
 * recargás y ahí vuelve la vieja, que parece que no se guardó.
 */
export function updateSessionUser(user: User) {
  if (!session) return
  session = { ...session, user }
  localStorage.setItem(KEY, JSON.stringify(session))
  emit()
}

export function clearSession() {
  session = null
  localStorage.removeItem(KEY)
  emit()
}

/**
 * El id de cliente para contar visitas.
 *
 * Aleatorio, en localStorage, sin relación con la cuenta: sirve para no contar
 * veinte veces a quien recarga, y para nada más. Si localStorage no está
 * disponible se devuelve null y no se cuenta la visita — preferimos perder un
 * número antes que romper la app por una métrica.
 */
const CLIENT_KEY = 'birrapp.client'
function clientId(): string | null {
  try {
    let id = localStorage.getItem(CLIENT_KEY)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(CLIENT_KEY, id) }
    return id
  } catch { return null }
}

/**
 * Avisa que alguien entró. Se llama una vez por carga, no por navegación.
 *
 * Va con `auth: true` a propósito aunque el endpoint sea público: así manda el
 * token cuando hay sesión —y el backend puede contar la visita como con
 * sesión— pero no falla cuando no la hay, porque `req` sólo agrega el header
 * si `session` existe.
 *
 * Los errores se tragan: si el conteo falla, la app tiene que seguir andando.
 */
export function pingTraffic() {
  const id = clientId()
  if (!id) return
  req('POST', '/traffic', { body: { clientId: id }, auth: true }).catch(() => {})
}

/**
 * `ok` renovó · `rejected` el servidor dijo que no · `failed` no se pudo ni preguntar.
 *
 * La diferencia entre los dos últimos es la que decide si al usuario se lo
 * desloguea. Un rechazo explícito es una sesión muerta; un fallo de red no
 * dice nada sobre la sesión, sólo que ahora no se puede confirmar.
 */
type RefreshResult = 'ok' | 'rejected' | 'failed'

let refreshing: Promise<RefreshResult> | null = null

/** Un solo refresh a la vez: si no, varias requests con 401 gastan cada una
 *  un refresh token distinto y se invalidan entre ellas. */
async function refresh(): Promise<RefreshResult> {
  if (!session?.refreshToken) return 'rejected'
  if (!refreshing) {
    refreshing = (async () => {
      try {
        // Va por la misma base que el resto de las llamadas.
        //
        // Acá había un `fetch('/auth/refresh')` relativo, y ese era el motivo
        // de que la webapp deslogueara sola cada media hora. Servida desde
        // Vercel, esa URL no pega contra el backend sino contra el propio
        // frontend, y el rewrite del SPA contesta index.html con un 200. O
        // sea: `r.ok` daba true, el `.json()` explotaba contra HTML, el
        // catch devolvía false, y al vencer el access token la sesión se
        // daba por muerta sin que el backend hubiera dicho nada.
        const url = new URL(API_BASE + '/auth/refresh', API_BASE || location.origin)
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session!.refreshToken }),
        })
        // Sólo un rechazo explícito invalida la sesión. Un 500 o un backend
        // que está reiniciando no significan que el usuario deba salir.
        if (!r.ok) {
          if (r.status === 401 || r.status === 403) { clearSession(); return 'rejected' }
          return 'failed'
        }
        const next = await r.json()
        // Un 200 que no trae sesión no es un refresh: es otra cosa
        // contestando en su lugar. Guardarlo rompería la sesión de verdad.
        if (!next?.accessToken || !next?.refreshToken) return 'failed'
        saveSession(next)
        return 'ok'
      } catch { return 'failed' } finally { refreshing = null }
    })()
  }
  return refreshing
}

async function req<T>(
  method: string, path: string,
  opts: { body?: unknown; auth?: boolean; params?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const url = new URL(API_BASE + path, API_BASE || location.origin)
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
  if (res.status === 401 && opts.auth) {
    const r = await refresh()
    if (r === 'ok') res = await send()
    // No se pudo ni preguntar si la sesión sigue viva. Devolver el 401 tal
    // cual haría que la pantalla la borre, y la sesión probablemente esté
    // perfecta: lo único que pasó es que no hay red.
    else if (r === 'failed') throw new Error('No se pudo conectar. Probá de nuevo.')
  }

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

export const searchBars = (q: string, lat?: number, lng?: number, limit?: number) =>
  req<BarPin[]>('GET', '/bars/search', { params: { q, lat, lng, limit } })

export const styles = () => req<BeerStyle[]>('GET', '/styles')

/**
 * Marcas aprobadas. Vocabulario abierto, a diferencia de los estilos: cada
 * cervecería chica es una marca, así que la lista crece con moderación.
 */
export const brands = () => req<Brand[]>('GET', '/brands')

/** Alta de marca por un usuario. Queda pendiente hasta que la aprueben. */
export const createBrand = (name: string, craft: boolean) =>
  req<Brand>('POST', '/brands', { body: { name, craft }, auth: true })
export const reviews = (barId: number) => req<Review[]>('GET', `/bars/${barId}/reviews`)

// ---------- notas y fotos por birra ----------
// `auth: true` con sesión opcional del lado del servidor: sin cuenta se leen
// igual, y con token vienen marcados los propios para mostrarlos como "Vos".
export const barPhotos = (barId: number) =>
  req<Photo[]>('GET', `/bars/${barId}/photos`, { auth: true })

export const beerComments = (barId: number, styleSlug: string, brandSlug: string | null) =>
  req<RatingComment[]>('GET', `/bars/${barId}/ratings/${styleSlug}/comments`, {
    auth: true, params: { brand: brandSlug ?? undefined },
  })

export const myRatings = (barId: number) =>
  req<MyRating[]>('GET', `/bars/${barId}/my-ratings`, { auth: true })

/** La nota: una sola por persona y por birra. Volver a llamar la pisa. */
export const rateBeer = (b: {
  barId: number; styleSlug: string; brandSlug: string | null; rating: number
}) => req<unknown>('POST', '/ratings', { body: b, auth: true })

/** Un comentario más. Se pueden dejar varios sobre la misma birra. */
export const addComment = (b: {
  barId: number; styleSlug: string; brandSlug: string | null; body: string
}) => req<{ id: number }>('POST', '/comments', { body: b, auth: true })

/** Borra un comentario propio. No toca la nota: son cosas separadas. */
export const removeMyComment = (id: number) =>
  req<unknown>('POST', `/comments/${id}/remove`, { auth: true })

/**
 * Sube una foto en tres pasos: pedir permiso, subir al bucket, confirmar.
 *
 * Los bytes van del navegador a Cloudflare sin pasar por el backend. El PUT
 * es a un dominio distinto y con una URL ya firmada, así que va con `fetch`
 * pelado: meterle el header de Authorization rompería la firma.
 */
export async function uploadPhoto(
  barId: number, styleSlug: string, brandSlug: string | null, file: Blob,
) {
  const { uploadUrl, key } = await req<{ uploadUrl: string; key: string }>(
    'POST', '/photos/upload-url', { body: { barId, styleSlug, brandSlug }, auth: true },
  )
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': 'image/webp' },
  })
  if (!put.ok) throw new ApiError(put.status, 'No se pudo subir la foto')
  // La fila se escribe recién ahora: si se escribiera antes, una subida
  // abandonada dejaría una foto rota en la galería.
  return req<Photo>('POST', '/photos', {
    body: { barId, styleSlug, brandSlug, key }, auth: true,
  })
}

/** Baja la foto Y borra el objeto del bucket. Irreversible. */
export const removePhoto = (id: number) =>
  req<unknown>('POST', `/moderation/photos/${id}/remove`, { auth: true })

export const removeRating = (id: number) =>
  req<unknown>('POST', `/moderation/ratings/${id}/remove`, { auth: true })

/** Moderación: baja el comentario de cualquiera. */
export const removeComment = (id: number) =>
  req<unknown>('POST', `/moderation/comments/${id}/remove`, { auth: true })

/**
 * Histórico de una birra. Sale gratis del modelo append-only.
 *
 * Por marca y no por estilo: mezclar dos IPA distintas da una serie que sube y
 * baja porque son dos cervezas, no porque el precio se haya movido.
 */
export const priceHistory = (barId: number, style: string, brand: string | null) =>
  req<PricePoint[]>('GET', `/bars/${barId}/history`, {
    params: { style, brand: brand ?? undefined },
  })

// ---------- aportes ----------
export const reportPrice = (b: {
  barId: number; styleSlug: string; brandSlug: string | null
  price: number; sizeMl: number
}) => req<PriceAccepted>('POST', '/prices', { body: b, auth: true })

/**
 * "Sigue igual".
 *
 * Va con cuerpo y no con la marca en la URL: los slugs llevan acentos y
 * guiones, y un `peñon-del-aguila` en el path es una fuente de errores de
 * encoding que no aporta nada.
 */
export const confirmPrice = (barId: number, styleSlug: string, brandSlug: string | null) =>
  req<PriceAccepted>('POST', `/bars/${barId}/confirm`, {
    body: { styleSlug, brandSlug }, auth: true,
  })

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

/**
 * Foto de perfil propia, en los mismos tres pasos que las fotos de birra:
 * pedir permiso, subir al bucket, confirmar. Los bytes no pasan por el backend.
 */
export async function uploadAvatar(file: Blob): Promise<User> {
  const { uploadUrl, key } = await req<{ uploadUrl: string; key: string }>(
    'POST', '/auth/me/avatar/upload-url', { auth: true },
  )
  // El PUT va con `fetch` pelado: la URL ya está firmada y meterle el header
  // de Authorization rompería la firma.
  const put = await fetch(uploadUrl, {
    method: 'PUT', body: file, headers: { 'Content-Type': 'image/webp' },
  })
  if (!put.ok) throw new ApiError(put.status, 'No se pudo subir la foto')
  return req<User>('POST', '/auth/me/avatar', { body: { key }, auth: true })
}

/** Saca la foto propia. Vuelve la de Google, si la cuenta tenía. */
export const removeAvatar = () => req<User>('DELETE', '/auth/me/avatar', { auth: true })
export const myStats = () => req<UserStats>('GET', '/auth/me/stats', { auth: true })
export const myContributions = () =>
  req<MyContributions>('GET', '/auth/me/contributions', { auth: true })
export const removeMyPrice = (id: number) =>
  req<unknown>('POST', `/auth/me/prices/${id}/remove`, { auth: true })
export const removeMyPhoto = (id: number) =>
  req<unknown>('POST', `/auth/me/photos/${id}/remove`, { auth: true })

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
export const moderationSummary = () =>
  req<ModerationSummary>('GET', '/moderation/summary', { auth: true })
export const approveBar = (id: number) => req<unknown>('POST', `/moderation/bars/${id}/approve`, { auth: true })
export const rejectBar = (id: number) => req<unknown>('POST', `/moderation/bars/${id}/reject`, { auth: true })
export const deleteBar = (id: number) => req<unknown>('POST', `/moderation/bars/${id}/delete`, { auth: true })
export const resolveFlag = (id: number) => req<unknown>('POST', `/moderation/flags/${id}/resolve`, { auth: true })
export const approvePrice = (id: number) => req<unknown>('POST', `/moderation/prices/${id}/approve`, { auth: true })
export const dashboardUsers = (limit = 200) =>
  req<DashboardUser[]>('GET', '/moderation/dashboard/users', {
    auth: true, params: { limit },
  })
export const dashboardSummary = () =>
  req<DashboardSummary>('GET', '/moderation/dashboard/summary', { auth: true })
export const dashboardAnalytics = () =>
  req<DashboardAnalytics>('GET', '/moderation/dashboard/analytics', { auth: true })
export const pendingBrands = () =>
  req<Brand[]>('GET', '/moderation/brands/pending', { auth: true })
export const approveBrand = (slug: string) =>
  req<unknown>('POST', `/moderation/brands/${encodeURIComponent(slug)}/approve`, { auth: true })
export const rejectBrand = (slug: string) =>
  req<unknown>('POST', `/moderation/brands/${encodeURIComponent(slug)}/reject`, { auth: true })
export const removePrice = (id: number) => req<unknown>('POST', `/moderation/prices/${id}/remove`, { auth: true })
