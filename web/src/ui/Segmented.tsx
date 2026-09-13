import type { ReactNode } from 'react'

/**
 * Interruptor de dos o tres posiciones, con la cápsula corriéndose a la
 * opción activa.
 *
 * Salió del toggle de color del mapa (frescura / precio), donde resolvía dos
 * cosas a la vez: dejar elegir qué se mira y, al nombrar sólo el modo
 * prendido, decir qué significa lo que se ve. En la lista pasa lo mismo con el
 * orden — "más cerca" y "más barata" no son dos filtros que se suman, es uno
 * o el otro, y dos píldoras sueltas no dicen eso.
 *
 * Vive acá porque ya son dos pantallas. La tercera copia es donde empiezan a
 * separarse, como pasó con `StyleFilter`.
 */
export function Segmented<T extends string>({
  options, value, onChange, tone = 'glass', height = 38, label, tourId,
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (v: T) => void
  tone?: 'glass' | 'plain'
  height?: number
  /** Para lectores de pantalla: "Colorear por…", "Ordenar por…". */
  label?: (o: { value: T; label: string }) => string
  tourId?: string
}) {
  return (
    <div
      className={tone === 'glass' ? 'glass pill' : 'pill'}
      data-tour={tourId}
      role="group"
      style={{
        display: 'flex', padding: 4, flexShrink: 0, alignItems: 'center',
        background: tone === 'plain' ? 'var(--film-2)' : undefined,
      }}
    >
      {options.map(o => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="lbl"
            aria-pressed={on}
            aria-label={label?.(o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, height,
              // El activo respira un poco más: es lo que hace que la cápsula
              // se lea como una posición del interruptor y no como un botón
              // más de la fila.
              padding: on ? '0 12px' : '0 10px',
              borderRadius: 999, fontSize: 'var(--t-2)', whiteSpace: 'nowrap',
              background: on ? 'var(--amber)' : 'transparent',
              color: on ? 'var(--base)' : 'rgba(251,246,238,.7)',
              transition: 'background .15s',
            }}
          >
            {o.icon}
            {/* Con ícono, el apagado va sin texto: es lo que permite meter
                tres modos en el ancho de un teléfono. Sin ícono no hay nada
                que mirar, así que la etiqueta se queda siempre. */}
            {(on || !o.icon) && <span>{o.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
