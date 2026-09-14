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
const MONEDAS: [string, string][] = [
  ['ARS', 'Peso argentino'],
  ['UYU', 'Peso uruguayo'],
  ['CLP', 'Peso chileno'],
  ['BRL', 'Real brasileño'],
  ['PYG', 'Guaraní'],
  ['BOB', 'Boliviano'],
  ['PEN', 'Sol peruano'],
  ['COP', 'Peso colombiano'],
  ['MXN', 'Peso mexicano'],
  ['USD', 'Dólar'],
  ['EUR', 'Euro'],
  ['GBP', 'Libra'],
  ['CHF', 'Franco suizo'],
  ['NOK', 'Corona noruega'],
  ['SEK', 'Corona sueca'],
  ['DKK', 'Corona danesa'],
  ['PLN', 'Złoty'],
  ['CZK', 'Corona checa'],
  ['HUF', 'Forinto'],
  ['RON', 'Leu rumano'],
  ['BGN', 'Lev'],
  ['ISK', 'Corona islandesa'],
  ['CAD', 'Dólar canadiense'],
  ['AUD', 'Dólar australiano'],
  ['NZD', 'Dólar neozelandés'],
  ['JPY', 'Yen'],
  ['KRW', 'Won'],
  ['CNY', 'Yuan'],
  ['INR', 'Rupia'],
  ['THB', 'Baht'],
  ['VND', 'Dong'],
  ['ZAR', 'Rand'],
  ['ILS', 'Séquel'],
  ['TRY', 'Lira turca'],
  ['MAD', 'Dírham'],
  ['EGP', 'Libra egipcia'],
  ['CRC', 'Colón'],
  ['GTQ', 'Quetzal'],
  ['CUP', 'Peso cubano'],
  ['DOP', 'Peso dominicano'],
]

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
        padding: '8px 12px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
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
