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
  url: string
  authorName: string | null
  ageDays: number
  mine: boolean
}

export interface RatingComment {
  id: number
  authorName: string
  rating: number
  body: string | null
  ageDays: number
  mine: boolean
}

export interface MyRating { styleSlug: string; rating: number }

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
  prices: number; confirmations: number; bars: number; reviews: number
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
