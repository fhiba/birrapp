import type { Freshness } from './types'
import { LOCALE, t } from '../i18n'

const AR = LOCALE

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
 * Un segmento que es SÓLO un código postal.
 *
 * Cubre lo que devuelve Google donde puede haber bares: el CPA argentino
 * (B1640HEM), los cuatro o cinco dígitos de media Europa y Estados Unidos, el
 * CEP brasileño (01310-100), el código británico (NW6 1NR), el canadiense
 * (M5V 3L9) y el holandés (1012 AB).
 *
 * Un segmento de calle nunca es sólo dígitos —es "Serrano 1590", no "1590"—
 * así que dar por postal un segmento de cuatro o cinco números no se lleva
 * puesta ninguna dirección.
 */
const SOLO_CODIGO_POSTAL =
  /^(?:[A-Z]\d{4}[A-Z]{3}|\d{4,5}(?:-\d{3,4})?|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|[A-Z]\d[A-Z]\s?\d[A-Z]\d|\d{4}\s?[A-Z]{2})$/i

/**
 * El CPA argentino pegado adelante de la localidad: "B1640HEM Martínez".
 *
 * Sólo esta forma, que no se confunde con nada. Sacar cuatro dígitos sueltos
 * del principio le comería la altura a las direcciones que empiezan con el
 * número —"1600 Pennsylvania Ave"— y eso es perder el dato, no limpiar ruido.
 */
const CPA_ADELANTE = /^[A-Z]\d{4}[A-Z]{3}\s+/i

/**
 * La dirección, sin el ruido: lo más parecido a calle y altura que haya.
 *
 * Google devuelve `formattedAddress` entera —"Av. Corrientes 1234, C1043AAZ
 * CABA, Argentina"— y eso, en la ficha de un bar que estás mirando porque está
 * a cuatrocientos metros, son tres datos que ya sabés ocupando el renglón del
 * que no sabés.
 *
 * No alcanza con cortar en la primera coma: hay lugares cuya dirección
 * **empieza** por el código postal ("B1640HEM, Martínez, Provincia de Buenos
 * Aires, Argentina"), y ahí cortar en la coma deja en pantalla exactamente el
 * dato más inútil de todos. Pasó con un bar de Martínez.
 *
 * Entonces: se recorren los segmentos y se devuelve el primero que no sea un
 * código postal, sacándole el CPA de adelante si lo tiene. Si el bar no tiene
 * calle, lo que queda es la localidad — peor que la calle, mejor que el
 * código postal, y es lo que de verdad sabemos.
 *
 * Se hace al mostrar y no al guardar: la dirección completa es un dato real y
 * sirve para desambiguar bares homónimos en moderación. Lo que sobra es
 * mostrarla entera, no tenerla.
 */
export function shortAddress(address: string | null | undefined): string | null {
  if (!address) return null
  for (const parte of address.split(',').map(p => p.trim()).filter(Boolean)) {
    if (SOLO_CODIGO_POSTAL.test(parte)) continue
    const limpio = parte.replace(CPA_ADELANTE, '').trim()
    if (limpio) return limpio
  }
  return null
}

export const formatDistance = (m: number | null | undefined) =>
  m == null ? null
    : m < 1000 ? t('format.distanciaM', { m: Math.round(m) })
    : t('format.distanciaKm', { km: (m / 1000).toFixed(1).replace('.0', '') })

export const formatRadius = (m: number) =>
  m >= 1000
    ? t('format.radioKm', { km: (m / 1000).toFixed(1).replace('.0', '') })
    : t('format.radioM', { m })

/*
 * Acá vivía `ageLabel(ageDays, f)`, la versión larga de la antigüedad, que
 * para un precio `stale` devolvía "hace N días · puede estar desactualizado".
 *
 * Se fue con la dirección heritage porque la columna del precio ahora es
 * angosta —el número grande a la derecha y la edad justo debajo— y ahí sólo
 * entra `shortAge`. El aviso de los 45 días no se perdió: dejó de ser un
 * sufijo de tres palabras pegado a una fecha y pasó a ser la frase que está
 * en la ficha del bar, que es donde alguien decide si le cree al precio.
 *
 * La regla no se movió: ningún precio se dibuja sin su antigüedad al lado.
 * Lo que cambió es dónde se explica qué significa esa antigüedad.
 */

export const shortAge = (d: number | null) =>
  d == null ? '' : d <= 0 ? t('format.hoy') : d === 1 ? t('format.ayer') : t('format.haceDias', { d })

export const freshnessColor = (f: Freshness) =>
  f === 'fresh' ? 'var(--fresh)' : f === 'aging' ? 'var(--aging)' : 'var(--stale)'

/**
 * Los dos cortes de frescura, que son de los pocos números de la app que
 * significan algo.
 *
 * Están acá y exportados porque ya no los usa sólo `ageColor`: el filtro de
 * "sólo frescos" del mapa pregunta por el mismo umbral, y un filtro con su
 * propio 14 sería un segundo significado de "fresco" esperando a separarse del
 * primero. Los mismos cortes viven en el backend (`freshness` en las vistas);
 * si se mueven allá, se mueven acá.
 */
export const FRESCO_DIAS = 14
export const VIEJO_DIAS = 45

export const ageColor = (d: number | null) =>
  d == null ? 'var(--stale)'
    : d < FRESCO_DIAS ? 'var(--fresh)'
      : d < VIEJO_DIAS ? 'var(--aging)'
        : 'var(--stale)'

/**
 * Color por precio, relativo a lo que hay en pantalla.
 *
 * Se toma el puesto del bar dentro de los precios visibles y no el valor
 * absoluto: con escala lineal, un solo precio disparatado aplasta a todos los
 * demás contra el extremo barato y el mapa se ve todo verde. Por puesto, la
 * mitad más barata siempre se ve barata.
 *
 * Lima → ámbar → coral, los mismos tres colores de la frescura, para no
 * inventar una paleta nueva por cada cosa que se codifica.
 */
const PRICE_STOPS = [
  [0xff, 0xfc, 0x9a], // --fresh
  [0xee, 0x9a, 0x52], // --aging
  [0xee, 0x63, 0x52], // --danger
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
