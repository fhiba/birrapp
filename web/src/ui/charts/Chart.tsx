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
 * Paleta por tipo de aporte. Fondo único y oscuro (`--base: #1A1410`).
 *
 * Validada con la skill `dataviz` sobre ese fondo (`validate_palette.js
 * --mode dark --surface #1A1410`). Contra esa vara, la propuesta de arranque
 * fallaba tres chequeos, así que se ajustó:
 *
 *  - `confirmations` era `#8A7B6D` (el token `--faint`): croma casi nulo, el
 *    validador lo marca como "reads gray" —un color que no hace trabajo de
 *    identidad— y además colapsaba contra el verde de `bars` bajo daltonismo
 *    (ΔE 2.6 deutan, piso 15 de visión normal sin pasar). Ahora es el paso
 *    oscuro de amarillo de la paleta de referencia: sigue siendo el más
 *    apagado de los cinco (bajo en la escala de valor, misma familia que el
 *    ámbar de `prices`), pero ya separa bajo daltonismo. Va apagado a
 *    propósito: confirmar mantiene fresco un precio que ya existe, que vale,
 *    pero menos que relevar uno nuevo. El color lo dice sin leyenda.
 *  - `bars` / `photos` / `ratings` eran tonos pastel demasiado claros para el
 *    fondo oscuro y `photos`↔`ratings` (azul↔violeta) eran indistinguibles
 *    bajo daltonismo (ΔE 0.8). Ahora son los pasos oscuros de aqua, azul y
 *    magenta de la paleta de referencia: el par peor ya queda en ΔE 8.4.
 *
 * `prices` conserva el ámbar de la marca (`--amber: #FFB627`) a pesar de que
 * su luminosidad queda por encima de la banda que pide la skill: es el token
 * de acento, es la serie que debe gritar más (el aporte que más importa) y es
 * un tono cálido único que ningún tipo de daltonismo confunde con los otros
 * cuatro. Pasa el chequeo de contraste; el de banda existe para que ninguna
 * serie eclipse al resto y acá esa jerarquía es deliberada.
 */
export const KIND_COLORS = {
  prices:        '#FFB627', // ámbar de la marca (--amber): la serie protagonista
  confirmations: '#c98500', // oro oscuro: presente pero recesivo, sin leyenda
  bars:          '#199e70',
  photos:        '#3987e5',
  ratings:       '#d55181',
} as const

const W = 600
const PAD = { l: 34, r: 8, t: 10, b: 20 }
const GRID = 'rgba(255,255,255,.08)'
const LABEL = { fontSize: 9, fill: '#8A7B6D' } as const

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

export function HBars({
  rows,
}: { rows: { label: string; value: number; hint?: string; color?: string }[] }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  const rowH = 26
  const height = Math.max(rowH, rows.length * rowH)
  const labelW = 118

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }}>
      {rows.map((r, i) => {
        const y = i * rowH
        const w = (r.value / max) * (W - labelW - 52)
        return (
          <g key={r.label}>
            <text x={0} y={y + 16} {...LABEL} fontSize={11} fill="#B6A899">
              {r.label.length > 18 ? `${r.label.slice(0, 17)}…` : r.label}
            </text>
            <rect x={labelW} y={y + 5} width={Math.max(2, w)} height={13} rx={3}
              fill={r.color ?? '#FFB627'} opacity={0.85}>
              <title>{`${r.label}: ${r.hint ?? r.value}`}</title>
            </rect>
            <text x={labelW + Math.max(2, w) + 6} y={y + 16} {...LABEL} fontSize={11}
              fill="#FBF6EE">{r.hint ?? r.value}</text>
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
      display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6,
      fontSize: 11, color: 'var(--faint)',
    }}>
      {series.map(s => (
        <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 9, height: 9, borderRadius: 2, background: s.color, display: 'inline-block',
          }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}
