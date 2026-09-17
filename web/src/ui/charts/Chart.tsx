/**
 * Tres gráficos en SVG, sin librería.
 *
 * Un gráfico de líneas es un <polyline> con los valores escalados a la caja;
 * una librería de gráficos es azúcar sobre eso. Recharts pesa ~95kb gzip
 * contra los 120kb que pesa hoy toda la app, y traía un look que no es el del
 * resto. Las estrellas de Stars.tsx ya son SVG a mano: esto es lo mismo.
 *
 * El viewBox es fijo y el ancho es 100%, así escalan solas sin medir el
 * contenedor ni escuchar resize.
 *
 * El tooltip es un <title> adentro de cada figura: es nativo del navegador,
 * accesible, y no cuesta una línea de JS. Si algún día hace falta uno que
 * siga el mouse, se agrega entonces.
 */

export type Series = { label: string; color: string; points: number[] }

/**
 * Paleta por tipo de aporte. Fondo único y oscuro.
 *
 * Validada con la skill `dataviz` (`validate_palette.js --mode dark --surface
 * #0F1012`, el espresso de heritage está a la misma profundidad). Contra esa
 * vara, la propuesta de arranque fallaba tres chequeos, así que se ajustó:
 *
 *  - `confirmations` era `#8A7B6D` (el `--faint` de entonces): croma casi
 *    nulo, el validador lo marca como "reads gray" —un color que no hace
 *    trabajo de identidad— y además colapsaba contra el verde de `bars` bajo
 *    daltonismo (ΔE 2.6 deutan). Pasó por un oro oscuro, que separaba bajo
 *    daltonismo pero quedaba en ΔE 15,6 contra el ámbar de `prices` —apenas
 *    sobre el piso, y los dos eran vecinos en la barra apilada— y de ahí a un
 *    violeta, que llevó el peor par adyacente a ΔE 20,9.
 *  - `bars` / `photos` / `ratings` eran tonos pastel demasiado claros para el
 *    fondo oscuro y `photos`↔`ratings` (azul↔violeta) eran indistinguibles
 *    bajo daltonismo (ΔE 0.8). Ahora son los pasos oscuros de aqua, azul y
 *    magenta de la paleta de referencia: el peor par adyacente bajo
 *    daltonismo queda en ΔE 15,9.
 *
 * ## Lo que cambió con la pizarra heritage
 *
 * `prices` era `#FFB627` y acá estaba escrito por qué: de los dos significados
 * que ese hex tenía —acento de marca y valor del dato— el que se queda con el
 * color es el dato, porque era el mismo ámbar de `--aging` y de `PRICE_STOPS`,
 * o sea "esto habla de precios". El argumento era bueno y por eso queda
 * anotado, pero en heritage no aplica: este gráfico no habla de la edad de un
 * precio, habla de cuántos aportes entraron por día. Y sobre espresso el ámbar
 * **es** `--aging` —un precio a medio vencer—, así que pintar con él la serie
 * protagonista de un gráfico de actividad sería decir "esto está por vencerse".
 *
 * La dirección trae un tono para cada uno de los dos papeles: `--fresh` (Lime
 * Cream) para lo que tiene que gritar, que sobre espresso es el valor de más
 * contraste de toda la rampa de datos (14,18:1), e `--info` (Steel Blue) para
 * lo analítico y de segundo orden. Entonces `prices` pasa a `--fresh` y
 * `confirmations` a `--info`, que además dice lo mismo que decía el violeta
 * —confirmar vale menos que relevar— pero con el tono que la paleta ya tiene
 * reservado para eso.
 *
 * Los otros tres siguen siendo hex, y es la única excepción del archivo: son
 * una paleta categórica de cinco vías validada aparte, y `theme.css` es la
 * paleta de doce colores que se comparte con Android, no el lugar para tres
 * tonos que viven sólo adentro de un gráfico del dashboard. El día que hagan
 * falta afuera, ahí sí van como token.
 *
 * El par que podría confundirse —el Steel Blue de `confirmations` y el azul de
 * `photos`— nunca queda pegado en la barra apilada (en el medio va `bars`,
 * verde) y son dos azules de luminosidad muy distinta.
 */
export const KIND_COLORS = {
  /** La serie protagonista: el aporte que más importa y el tono que más se ve. */
  prices:        'var(--fresh)',
  /** Confirmar es el aporte de segundo orden, que es lo que `--info` nombra. */
  confirmations: 'var(--info)',
  /* Las tres categóricas. Los hex son los mismos de siempre —la terna se
     eligió por separación para daltonismo— pero ahora viven en `theme.css`
     como el resto de la paleta. */
  bars:          'var(--serie-1)',
  photos:        'var(--serie-2)',
  ratings:       'var(--serie-3)',
} as const

/**
 * Ancho del viewBox, en unidades de usuario.
 *
 * Va cerca del ancho real al que se dibuja la tarjeta (~320px en la grilla de
 * tres columnas) y no en un número redondo grande. Con `width: 100%` el SVG
 * escala entero, texto incluido: con un viewBox de 600 dentro de una tarjeta de
 * 320 el factor es 0,53 y una fuente de 9 termina dibujada a 5px, ilegible.
 * Cerca de 1:1 el texto sale del tamaño que dice.
 */
const W = 360
const PAD = { l: 30, r: 6, t: 10, b: 20 }
const GRID = 'var(--film-2)'
const LABEL = { fontSize: 'var(--t-1)', fill: 'var(--faint)' } as const

/** Las etiquetas del eje x: primera, del medio y última. Más se amontonan. */
function xTicks(x: string[]) {
  if (x.length === 0) return []
  const idx = [0, Math.floor((x.length - 1) / 2), x.length - 1]
  return [...new Set(idx)].map(i => ({ i, label: x[i]!.slice(5) }))
}

function Grid({ max, h, fmt }: { max: number; h: number; fmt: (n: number) => string }) {
  const ih = h - PAD.t - PAD.b
  return (
    <>
      {[0, 0.5, 1].map(f => {
        const y = PAD.t + ih - f * ih
        return (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke={GRID} />
            <text x={PAD.l - 5} y={y + 3} textAnchor="end" {...LABEL}>
              {fmt(max * f)}
            </text>
          </g>
        )
      })}
    </>
  )
}

export function LineChart({
  x, series, height = 160, fill = false, format = (n: number) => String(Math.round(n)),
}: {
  x: string[]
  series: Series[]
  height?: number
  fill?: boolean
  format?: (n: number) => string
}) {
  const max = Math.max(1, ...series.flatMap(s => s.points))
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const px = (i: number) => PAD.l + (x.length <= 1 ? iw / 2 : (i / (x.length - 1)) * iw)
  const py = (v: number) => PAD.t + ih - (v / max) * ih

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }}>
      <Grid max={max} h={height} fmt={format} />
      {series.map(s => {
        const pts = s.points.map((v, i) => `${px(i)},${py(v)}`).join(' ')
        return (
          <g key={s.label}>
            {fill && (
              <polygon
                points={`${PAD.l},${PAD.t + ih} ${pts} ${px(s.points.length - 1)},${PAD.t + ih}`}
                fill={s.color} opacity={0.14}
              />
            )}
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((v, i) => (
              <circle key={i} cx={px(i)} cy={py(v)} r={6} fill="transparent">
                <title>{`${x[i]} · ${s.label}: ${format(v)}`}</title>
              </circle>
            ))}
          </g>
        )
      })}
      {xTicks(x).map(t => (
        <text key={t.i} x={px(t.i)} y={height - 6} textAnchor="middle" {...LABEL}>
          {t.label}
        </text>
      ))}
    </svg>
  )
}

export function StackedBars({
  x, series, height = 160,
}: { x: string[]; series: Series[]; height?: number }) {
  const totals = x.map((_, i) => series.reduce((a, s) => a + (s.points[i] ?? 0), 0))
  const max = Math.max(1, ...totals)
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const step = iw / Math.max(1, x.length)
  const bw = Math.max(1, step - 2)
  // Hueco entre tramos apilados: 2px del color del fondo entre uno y el
  // siguiente, para que dos tramos de tono cercano (precios y confirmaciones,
  // los dos dorados) no se lean como una barra sola. El hueco se recorta del
  // alto que se dibuja, no del acumulador que posiciona el tramo de arriba:
  // la barra entera sigue midiendo el total real. Cada tramo se ancla a su
  // base real y crece hacia arriba, así un valor chico que quedaría invertido
  // al restarle el hueco se recorta a MIN_SEG y se sigue viendo en su lugar.
  const GAP_Y = 2
  const MIN_SEG = 1

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }}>
      <Grid max={max} h={height} fmt={n => String(Math.round(n))} />
      {x.map((day, i) => {
        let acc = 0
        return (
          <g key={day}>
            {series.map(s => {
              const v = s.points[i] ?? 0
              if (v === 0) return null
              const h = (v / max) * ih
              acc += h
              const base = PAD.t + ih - (acc - h)
              const drawH = Math.max(MIN_SEG, h - GAP_Y)
              return (
                <rect key={s.label} x={PAD.l + i * step + 1} width={bw}
                  y={base - drawH} height={drawH} fill={s.color}>
                  <title>{`${day} · ${s.label}: ${v}`}</title>
                </rect>
              )
            })}
            {/* Área invisible para que el día vacío también tenga tooltip. */}
            <rect x={PAD.l + i * step} width={step} y={PAD.t} height={ih} fill="transparent">
              <title>{`${day} · ${totals[i]} aportes`}</title>
            </rect>
          </g>
        )
      })}
      {xTicks(x).map(t => (
        <text key={t.i} x={PAD.l + t.i * step + bw / 2} y={height - 6}
          textAnchor="middle" {...LABEL}>{t.label}</text>
      ))}
    </svg>
  )
}

/**
 * Barras horizontales, una por fila.
 *
 * Sin `color`, la barra va en `--info`: una serie sola es lectura analítica y
 * no tiene contra quién destacarse. Quien tenga un dato que sí manda —el
 * primero de un ranking, por ejemplo— lo pinta de `--fresh` desde afuera.
 */
export function HBars({
  rows,
}: { rows: { label: string; value: number; hint?: string; color?: string }[] }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  const rowH = 24
  const height = Math.max(rowH, rows.length * rowH)
  const labelW = 108

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }}>
      {rows.map((r, i) => {
        const y = i * rowH
        const w = (r.value / max) * (W - labelW - 52)
        return (
          <g key={r.label}>
            <text x={0} y={y + 16} {...LABEL} fontSize={11} fill="var(--muted)">
              {r.label.length > 18 ? `${r.label.slice(0, 17)}…` : r.label}
            </text>
            <rect x={labelW} y={y + 5} width={Math.max(2, w)} height={13} rx={3}
              fill={r.color ?? 'var(--info)'} opacity={0.85}>
              <title>{`${r.label}: ${r.hint ?? r.value}`}</title>
            </rect>
            <text x={labelW + Math.max(2, w) + 6} y={y + 16} {...LABEL} fontSize={11}
              fill="var(--cream)">{r.hint ?? r.value}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** La leyenda va aparte: los tres gráficos la comparten y no todos la usan. */
export function Legend({ series }: { series: Series[] }) {
  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8,
      fontSize: 'var(--t-1)', color: 'var(--faint)',
    }}>
      {series.map(s => (
        <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 9, height: 9, borderRadius: 2, background: s.color, display: 'inline-block',
          }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}
