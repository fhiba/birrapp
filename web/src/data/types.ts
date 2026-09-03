export type Freshness = 'fresh' | 'aging' | 'stale'

export interface BarPin {
  id: number
  name: string
  lat: number
  lng: number
  fromPrice: number | null
  freshestAgeDays: number | null
  distanceMeters: number | null
}

/**
 * Una birra del bar. Puede no tener precio vigente y tener notas y fotos:
 * pasa cuando se borra el reporte de precio.
 */
export interface StylePrice {
  id: number | null
  styleSlug: string
  styleName: string
  /**
   * La marca es parte de la identidad de la birra, no un adorno: una IPA de
   * Antares y una de Juguetes Perdidos son dos cervezas con precio, nota y
   * fotos propias. Null es "sin marca", que es una birra concreta y no un
   * dato faltante.
   */
  brandSlug: string | null
  brandName: string | null
  brandCraft: boolean | null
  price: number | null
  sizeMl: number | null
  ageDays: number | null
  freshness: Freshness | null
  /** Promedio real: es el que se muestra. Null mientras nadie votó. */
  ratingRaw: number | null
  /** Con shrinkage bayesiano. Para ordenar, nunca para mostrar. */
  ratingAvg: number | null
  ratingCount: number
  /** Días desde el último voto: una nota sin su edad miente igual que un precio. */
  ratingAgeDays: number | null
}

export interface Photo {
  id: number
  styleSlug: string
  brandSlug: string | null
  url: string
  authorName: string | null
  ageDays: number
  mine: boolean
}

export interface RatingComment {
  id: number
  authorName: string
  body: string | null
  ageDays: number
  mine: boolean
  /** La nota de quien escribió, sobre esta birra. Null si comentó sin votar. */
  rating: number | null
}

export interface MyRating {
  styleSlug: string
  brandSlug: string | null
  rating: number
}

export interface Brand { slug: string; name: string; craft: boolean }

export interface BarDetail {
  id: number
  name: string
  address: string | null
  neighbourhood: string | null
  lat: number
  lng: number
  status: string
  googlePlaceId: string | null
  distanceMeters: number | null
  prices: StylePrice[]
  avgRating: number | null
  reviewCount: number
}

export interface BeerStyle { slug: string; name: string }
export interface PricePoint { price: number; sizeMl: number; at: string }
export interface Review {
  id: number; authorName: string; rating: number
  body: string | null; createdAt: string
}
export interface User {
  id: number; email: string; displayName: string
  avatarUrl: string | null; role: string
}
export interface UserStats {
  prices: number
  /** Toques de "Sigue igual". Se cuenta pero ya no se muestra. */
  confirmations: number
  bars: number
  reviews: number
  photos: number
}

export interface MyBar {
  id: number; name: string; status: string; ageDays: number
}
export interface MyPrice {
  id: number; barId: number; barName: string; styleName: string
  brandName: string | null
  price: number; sizeMl: number; ageDays: number
  isConfirmation: boolean
  /** Es el precio que la app muestra hoy para ese bar y estilo. */
  isCurrent: boolean
}
export interface MyPhoto {
  id: number; barId: number; barName: string; styleName: string
  brandName: string | null
  url: string; ageDays: number
}
export interface MyComment {
  id: number; barId: number; barName: string; styleName: string
  brandName: string | null
  body: string; ageDays: number
}
export interface MyContributions {
  bars: MyBar[]; prices: MyPrice[]; photos: MyPhoto[]; comments: MyComment[]
}
export interface Session {
  accessToken: string; refreshToken: string
  expiresInSeconds: number; user: User
}
export interface PriceAccepted { id: number; heldForReview: boolean; message: string }
export interface Flag {
  id: number; targetType: string; targetId: number; reason: string
  createdAt: string; reporterName: string | null; targetSummary: string | null
}

export const isModerator = (u: User | null) =>
  u?.role === 'moderator' || u?.role === 'admin'

export interface ModerationSummary {
  pendingBars: number
  openFlags: number
  pendingBrands: number
}

/** Una persona y lo que aportó. Sólo para el dashboard de moderación. */
export interface DashboardUser {
  id: number
  displayName: string
  email: string
  avatarUrl: string | null
  role: string
  /** Días desde que se registró. */
  ageDays: number
  banned: boolean
  prices: number
  confirmations: number
  bars: number
  photos: number
  ratings: number
  /** Días desde su último aporte. Null = nunca aportó nada. */
  lastActiveDays: number | null
  /** Aportes pesados. La fórmula vive en el backend; ver DashboardUserDto. */
  score: number
}

export interface DashboardSummary {
  users: number
  usersWeek: number
  usersMonth: number
  /** Personas distintas que aportaron algo en 30 días, no cantidad de aportes. */
  contributorsMonth: number
  pricesWeek: number
  barsWithFreshPrice: number
  bars: number
}
