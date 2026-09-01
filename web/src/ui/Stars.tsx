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
              ...(onRate ? { padding: 3, margin: -3 } : {}),
            }}
          >
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
              <defs>
                <linearGradient id={`s${n}-${pct}-${mine}`}>
                  <stop offset={`${pct}%`} stopColor={color} />
                  <stop offset={`${pct}%`} stopColor="rgba(255,255,255,.14)" />
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
