import { Fragment, createElement, type ReactNode } from 'react'
import es from './es'
import en from './en'
import pt from './pt'
import de from './de'
import fr from './fr'

/**
 * Los textos de la app salen de los archivos de `./es/`, uno por pantalla o
 * componente, y no de literales en el código (BIR-31).
 *
 * Un archivo por pantalla y no un `es.json` gigante porque sobre este repo
 * corren varios agentes a la vez: con un solo archivo, dos ramas que tocan
 * textos de pantallas distintas chocarían igual en el merge.
 *
 * El idioma es el que se eligió en el perfil (`setIdioma`), y si no hay uno
 * elegido, el de `navigator.language`: castellano, inglés, portugués, alemán o
 * francés, y cualquier otro cae en castellano. Sumar uno es copiar
 * `./es/`, traducirlo y agregarlo a `DICTS` — están tipados contra `es`, así
 * que si a un idioma le falta una clave no compila.
 *
 * Sin librería a propósito: interpolar `{nombre}` y elegir singular o plural
 * con `Intl.PluralRules` es todo lo que hace falta, y son veinte líneas.
 */
type Dict = typeof es

const DICTS: Record<string, Dict> = { es, en, pt, de, fr }

const IDIOMA_KEY = 'birrapp.idioma'

/** Los idiomas que hay, en el orden en que se ofrecen. */
export const IDIOMAS = Object.keys(DICTS)

const navLang = typeof navigator === 'undefined' ? 'es' : navigator.language
const elegido = (() => {
  try { return localStorage.getItem(IDIOMA_KEY) } catch { return null }
})()

/** El idioma en uso: el que se eligió en el perfil, o si no, el del navegador. */
export const LANG = elegido && elegido in DICTS ? elegido
  : navLang.slice(0, 2).toLowerCase() in DICTS ? navLang.slice(0, 2).toLowerCase() : 'es'
const dict = DICTS[LANG]

/**
 * Para `Intl`: el castellano es el rioplatense; los demás, la variante del
 * navegador si es del mismo idioma ("en-GB"), o el idioma a secas.
 */
export const LOCALE = LANG === 'es' ? 'es-AR'
  : navLang.toLowerCase().startsWith(LANG) ? navLang : LANG

/**
 * Cambia el idioma y recarga. Recargar y no re-renderizar a propósito: hay
 * textos que se resuelven una sola vez al cargar el módulo (niveles, tarifas
 * del karma, nombres de moneda) y un cambio en caliente los dejaría a medias.
 */
export function setIdioma(lang: string) {
  try { localStorage.setItem(IDIOMA_KEY, lang) } catch { /* modo privado: dura esta carga */ }
  location.reload()
}

/** El nombre de un idioma en ese mismo idioma: "English", "Deutsch". */
export const nombreIdioma = (lang: string) => {
  const n = new Intl.DisplayNames(lang, { type: 'language' }).of(lang) ?? lang
  return n[0].toLocaleUpperCase(lang) + n.slice(1)
}

if (typeof document !== 'undefined') document.documentElement.lang = LOCALE

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
  let v: unknown = dict
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
