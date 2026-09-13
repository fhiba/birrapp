import type { Freshness } from './types'

const AR = 'es-AR'

/**
 * Monedas que no usan decimales.
 *
 * En pesos los centavos no significan nada —una pinta son cuatro mil y pico— y
 * mostrar "$ 4.500,00" es ruido. En libras o euros, en cambio, £5,80 y £5 son
 * precios distintos y comerse los decimales es perder el dato.
 *
 * La lista es de monedas donde el valor de una unidad es chico o que
 * directamente no tienen subdivisión.
 */
const SIN_DECIMALES = new Set([
  'ARS', 'CLP', 'COP', 'PYG', 'UYU', 'JPY', 'KRW', 'VND', 'ISK', 'HUF', 'CRC',
])

/**
 * Un precio con su moneda. `$ 4.500` en Buenos Aires, `£5,80` en Londres.
 *
 * La moneda es obligatoria: un monto sin unidad es un número, no un precio, y
 * desde que se pueden cargar bares de cualquier parte del mundo el default de
 * pesos dejó de ser una simplificación razonable para pasar a ser una etiqueta
 * equivocada.
 *
 * El idioma del formato sigue siendo el de acá: es la app de alguien que lee
 * en castellano, y lo que cambia entre países es la moneda, no cómo se
 * escriben los miles.
 */
export const formatPrice = (v: number, currency: string) => {
  const cero = SIN_DECIMALES.has(currency)
  return new Intl.NumberFormat(AR, {
    style: 'currency', currency,
    maximumFractionDigits: cero ? 0 : 2, minimumFractionDigits: cero ? 0 : 2,
  }).format(v)
}

/**
 * El símbolo de una moneda, solo. Para el teclado de carga, donde el monto se
 * arma dígito a dígito y no se puede formatear todavía.
 *
 * Sale de `Intl`, no de una tabla nuestra: formatea un cero y le saca lo que
 * no sea el símbolo. Una tabla de cuarenta símbolos escrita a mano es una
 * tabla de cuarenta símbolos que mantener.
 *
 * A propósito NO se usa `currencyDisplay: 'narrowSymbol'`, que daría "£" y
 * "€" en vez de "GBP" y "EUR": con símbolos angostos, pesos argentinos,
 * dólares y pesos chilenos son los tres "$". Entre un símbolo lindo y saber
 * de qué moneda se está hablando, gana lo segundo — es la misma razón por la
 * que ningún precio se muestra sin su antigüedad.
 */
export const currencyPrefix = (currency: string) =>
  new Intl.NumberFormat(AR, { style: 'currency', currency, maximumFractionDigits: 0 })
    .format(0).replace(/[\d\s.,]/g, '')

export const groupThousands = (digits: string) => {
  const n = Number(digits)
  return Number.isFinite(n) ? new Intl.NumberFormat(AR).format(n) : digits
}

/**
 * La dirección, sin el ruido: calle y altura y nada más.
 *
 * Google devuelve `formattedAddress` entera — "Av. Corrientes 1234, C1043AAZ
 * CABA, Argentina" — y eso, en la ficha de un bar que estás mirando porque
 * está a cuatrocientos metros, es tres datos que ya sabés ocupando el renglón
 * del que no sabés. El código postal, la ciudad, la provincia y el país no le
 * dicen nada a nadie que esté parado ahí.
 *
 * Se corta en la primera coma, que es donde Google separa la calle del resto.
 * Los bares cargados a mano piden "calle y altura, o esquina", así que ya
 * vienen cortos y esto no los toca.
 *
 * Se hace al mostrar y no al guardar: la dirección completa es un dato real y
 * sirve para desambiguar bares homónimos en moderación. Lo que sobra es
 * mostrarla entera, no tenerla.
 */
export const shortAddress = (address: string | null | undefined) =>
  address?.split(',')[0]?.trim() || null

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
