import type { ReactNode } from 'react'

/**
 * Interruptor de dos o tres posiciones.
 *
 * Salió del toggle de color del mapa (frescura / precio), donde resolvía dos
 * cosas a la vez: dejar elegir qué se mira y, al nombrar sólo el modo
 * prendido, decir qué significa lo que se ve. En la lista pasa lo mismo con el
 * orden — "más cerca" y "más barata" no son dos filtros que se suman, es uno
 * o el otro, y dos píldoras sueltas no dicen eso.
 *
 * Vive acá porque ya son dos pantallas. La tercera copia es donde empiezan a
 * separarse, como pasó con `StyleFilter`.
 *
 * ## Una sola forma
 *
 * Texto con una barra de 2px abajo (`.tab-underline`), que es la que trae la
 * dirección "pizarra". La cápsula rellena que había antes pesaba lo mismo que
 * un CTA y competía con el precio, que es el dato de la pantalla; el subrayado
 * dice "elegiste esto" sin gritar. Es además el mismo vocabulario que la barra
 * de pestañas de abajo: una sola forma para "posición activa" en toda la app.
 *
 * Acá vivían también las ramas `glass` y `plain` —la cápsula que se corre a la
 * opción activa— "para lo que flota sobre el mapa". Se fueron con el
 * repintado: el mapa dejó de usarlas y quedaron sin un solo llamador, con el
 * agravante de que eran el valor por omisión del prop `tone`. O sea que quien
 * agregara un segmentado sin pensarlo recibía en silencio exactamente la forma
 * que la dirección vino a sacar. Código muerto que además tira para el lado
 * equivocado.
 */
export function Segmented<T extends string>({
  options, value, onChange, height = 38, label, tourId,
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (v: T) => void
  height?: number
  /** Para lectores de pantalla: "Colorear por…", "Ordenar por…". */
  label?: (o: { value: T; label: string }) => string
  tourId?: string
}) {
  return (
    <div
      data-tour={tourId}
      role="group"
      style={{
        display: 'flex', alignItems: 'flex-end', gap: 'var(--s-4)', flexShrink: 0,
      }}
    >
      {options.map(o => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="tab-underline"
            aria-pressed={on}
            aria-label={label?.(o)}
            style={{
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              minHeight: height, whiteSpace: 'nowrap',
            }}
          >
            {/* El rótulo va siempre, incluso con ícono: sin cápsula que
                rellenar, una opción apagada sin texto es un ícono suelto que
                hay que adivinar. Es la mitad del punto de esta forma. */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              {o.icon}
              <span>{o.label}</span>
            </span>
            {/* La barra de 2px. Va como hijo directo porque el CSS la pinta
                desde el estado del botón (`.tab-underline > .tab-rule`). */}
            <span className="tab-rule" />
          </button>
        )
      })}
    </div>
  )
}
