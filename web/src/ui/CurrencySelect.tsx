import { LOCALE } from '../i18n'
/**
 * Selector de moneda.
 *
 * Un `<select>` nativo y no una hoja propia: son treinta opciones que nadie
 * toca más de una vez, el control del sistema ya sabe buscar escribiendo y en
 * el teléfono abre la rueda nativa, que se usa mejor que cualquier cosa que
 * dibujemos nosotros.
 *
 * La lista espeja la del servidor (`core/Currency.kt`). Está duplicada a
 * propósito y es el único caso en el proyecto: el servidor **valida** contra
 * la suya, así que si esta queda corta lo peor que pasa es que falte una
 * opción, no que entre un dato inválido.
 */
/**
 * Los nombres salen de `Intl.DisplayNames` en el idioma de la app, no de una
 * tabla nuestra: así vienen traducidos solos.
 */
const nombre = new Intl.DisplayNames(LOCALE, { type: 'currency' })
const MONEDAS: [string, string][] = [
  'ARS', 'UYU', 'CLP', 'BRL', 'PYG', 'BOB', 'PEN', 'COP', 'MXN', 'USD', 'EUR',
  'GBP', 'CHF', 'NOK', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'ISK',
  'CAD', 'AUD', 'NZD', 'JPY', 'KRW', 'CNY', 'INR', 'THB', 'VND', 'ZAR', 'ILS',
  'TRY', 'MAD', 'EGP', 'CRC', 'GTQ', 'CUP', 'DOP',
].map(c => {
  const n = nombre.of(c) ?? c
  return [c, n[0].toLocaleUpperCase(LOCALE) + n.slice(1)]
})

export function CurrencySelect({ value, onChange, id }: {
  value: string
  onChange: (v: string) => void
  id?: string
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="lbl"
      style={{
        padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-2)',
        /*
         * `--t-field` y no un paso de la escala: esto es un campo, y abajo de
         * 16px Safari en iOS acerca el viewport al enfocarlo y al volver no lo
         * aleja. Estaba en 13px — la red de seguridad de `theme.css` no lo
         * salvaba porque el tamaño inline le gana por especificidad.
         */
        fontSize: 'var(--t-field)',
        background: 'var(--elevated)', color: 'var(--cream)',
        border: '1px solid var(--hairline)',
      }}
    >
      {MONEDAS.map(([code, nombre]) => (
        <option key={code} value={code}>{code} — {nombre}</option>
      ))}
    </select>
  )
}
