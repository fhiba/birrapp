import { useEffect, useState } from 'react'
/**
 * Cinco estrellas, en dos modos.
 *
 * Cuando ya votaste se pintan en ámbar; cuando no, en gris. Es la diferencia
 * que pediste: de un vistazo se ve dónde falta tu voto sin abrir nada. El
 * promedio de la comunidad va siempre como relleno parcial por debajo, así
 * que las dos cosas se leen juntas y no compiten.
 */
export function Stars({
  value, mine, size = 18, onRate,
}: {
  /** Promedio de la comunidad, o tu voto si `mine` es true. */
  value: number | null
  mine: boolean
  size?: number
  onRate?: (n: number) => void
}) {
  const filled = value ?? 0
  const color = mine ? 'var(--amber)' : 'var(--muted)'

  return (
    <div style={{ display: 'flex', gap: 2 }} role={onRate ? 'group' : undefined}
      aria-label={value == null ? 'Sin votos' : `${value.toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map(n => {
        // Relleno parcial: con 3,7 la cuarta estrella va al 70%. Redondear a
        // la entera más cercana convertiría un 3,4 y un 3,6 en la misma cosa.
        const pct = Math.max(0, Math.min(1, filled - (n - 1))) * 100
        return (
          <button
            key={n}
            onClick={onRate ? () => onRate(n) : undefined}
            disabled={!onRate}
            aria-label={onRate ? `Puntuar con ${n}` : undefined}
            style={{
              padding: 0, lineHeight: 0, cursor: onRate ? 'pointer' : 'default',
              // Sin esto el área tocable son los ~14px del glifo, por debajo
              // del mínimo cómodo en un teléfono.
              ...(onRate ? { padding: 4, margin: -3 } : {}),
            }}
          >
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
              <defs>
                <linearGradient id={`s${n}-${pct}-${mine}`}>
                  <stop offset={`${pct}%`} stopColor={color} />
                  <stop offset={`${pct}%`} stopColor="var(--film-3)" />
                </linearGradient>
              </defs>
              <path
                fill={`url(#s${n}-${pct}-${mine})`}
                d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z"
              />
            </svg>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Convierte lo tecleado en un puntaje de 0 a 5 con un decimal, o null si no
 * hay nada válido. Acepta coma (3,8), redondea y recorta al rango: el backend
 * valida igual, esto es sólo para no mandarle basura.
 */
function parseRating(raw: string): number | null {
  const n = parseFloat(raw.trim().replace(',', '.'))
  if (Number.isNaN(n)) return null
  return Math.min(5, Math.max(0, Math.round(n * 10) / 10))
}

/**
 * Campo para teclear la nota con decimal: la estrella sólo da enteras y para un
 * 3,8 hace falta escribirlo.
 *
 * Controlado y con su propio texto, que se resincroniza contra `rating` al
 * salir del foco. Antes iba sin control y se reseteaba con `key`, así que si
 * tecleabas "abc" —o un valor que redondea a la nota ya guardada— el campo se
 * quedaba mostrando eso y no se mandaba nada: parecía guardado y no lo estaba.
 * Confirma con Enter o al salir del foco; `parseRating` hace clamp, redondeo y
 * acepta coma.
 */
export function RatingField({ rating, onCommit }: {
  rating: number | null
  onCommit: (n: number) => void
}) {
  const real = rating != null ? String(rating) : ''
  const [text, setText] = useState(real)
  useEffect(() => { setText(real) }, [real])

  return (
    <input
      // `type="text"` y NO `number`, aunque lo que se teclea sea un número.
      //
      // Con `type="number"`, el navegador saneá el valor antes de que llegue a
      // nuestro código: cualquier cosa que no sea un número con punto se
      // convierte en cadena vacía. O sea que al escribir "3,5" —la forma
      // natural de escribir un decimal en castellano, y la que ofrece el
      // teclado del teléfono— `value` llegaba vacío y no se guardaba nada.
      // `parseRating` siempre supo aceptar la coma; nunca la veía.
      //
      // `inputMode="decimal"` conserva el teclado numérico en el teléfono, que
      // es lo único que `type="number"` aportaba acá.
      type="text" inputMode="decimal"
      pattern="[0-9]*[.,]?[0-9]*"
      value={text}
      aria-label="Puntaje de 0 a 5"
      onChange={e => setText(e.currentTarget.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      onBlur={() => {
        const n = parseRating(text)
        if (n != null && n !== rating) onCommit(n)
        setText(n != null ? String(n) : real)
      }}
      style={{
        width: 56, padding: '4px 8px', borderRadius: 'var(--r-1)', fontSize: 'var(--t-field)',
        background: 'transparent', border: '1px solid var(--hairline)',
        color: 'inherit', fontFamily: 'inherit',
      }}
    />
  )
}
