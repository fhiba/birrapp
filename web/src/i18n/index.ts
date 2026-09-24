import { Fragment, createElement, type ReactNode } from 'react'
import es from './es'

/**
 * Los textos de la app salen de los archivos de `./es/`, uno por pantalla o
 * componente, y no de literales en el código (BIR-31).
 *
 * Un archivo por pantalla y no un `es.json` gigante porque sobre este repo
 * corren varios agentes a la vez: con un solo archivo, dos ramas que tocan
 * textos de pantallas distintas chocarían igual en el merge.
 *
 * Hoy hay un solo idioma y el locale es fijo. Sumar otro es copiar `./es/`,
 * traducirlo y elegir el diccionario acá según `navigator.language` — las
 * claves ya están tipadas contra `es`, así que al otro idioma le falta una y
 * no compila.
 *
 * Sin librería a propósito: interpolar `{nombre}` y elegir singular o plural
 * con `Intl.PluralRules` es todo lo que hace falta, y son veinte líneas.
 */
export const LOCALE = 'es-AR'

type Dict = typeof es

/**
 * Las claves válidas, como `'BarDetail.title'`. Un objeto con `other` es un
 * plural y cuenta como hoja: `{ one: '1 bar', other: '{count} bares' }`.
 */
type Keys<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | { other: string }
    ? `${P}${K}`
    : Keys<T[K], `${P}${K}.`>
}[keyof T & string]

export type TKey = Keys<Dict>

const plural = new Intl.PluralRules(LOCALE)

/**
 * El texto de una clave, con `{variables}` reemplazadas.
 *
 * Si la clave es un plural, la forma sale de `vars.count`. Una clave que no
 * existe devuelve la clave misma: con el tipado no debería pasar, y si pasa se
 * ve en pantalla en vez de quedar un hueco.
 */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  let v: unknown = es
  for (const part of key.split('.')) v = (v as Record<string, unknown>)?.[part]
  if (v && typeof v === 'object') {
    const forms = v as Record<string, string>
    v = forms[plural.select(Number(vars?.count ?? 0))] ?? forms.other
  }
  if (typeof v !== 'string') return key
  return vars ? v.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : v
}

/**
 * Como `t`, pero las variables pueden ser nodos: para las frases que llevan
 * un nombre en negrita en el medio, sin partir la frase en dos claves que
 * nadie puede traducir por separado.
 */
export function tx(key: TKey, vars: Record<string, ReactNode>): ReactNode {
  return t(key).split(/\{(\w+)\}/).map((part, i) =>
    createElement(Fragment, { key: i }, i % 2 ? vars[part] ?? `{${part}}` : part))
}
