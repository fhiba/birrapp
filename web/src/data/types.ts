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

export interface StylePrice {
  id: number
  styleSlug: string
  styleName: string
  price: number
  sizeMl: number
  ageDays: number
  freshness: Freshness
}

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
