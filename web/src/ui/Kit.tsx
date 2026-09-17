import type { ReactNode } from 'react'

/**
 * Las piezas que estaban copiadas en varias pantallas.
 *
 * `SectionLabel` vivía cinco veces, con cinco combinaciones apenas distintas
 * de margen (26/30/28/26/18 arriba, 12/12/10/8/6 abajo). No eran variantes
 * con intención: era la misma pieza escrita cinco veces y separándose. La
 * baldosa de estadística, tres veces, con tres paddings y dos radios.
 *
 * El costo de eso no es el tamaño del código, es que la app se ve armada:
 * cambiás de pantalla y el mismo elemento respira distinto sin que nada lo
 * justifique.
 */

/*
 * El encabezado chico en mayúscula que separa zonas de una pantalla larga.
 *
 * Los hijos se renderizan tal cual y la mayúscula la pone `.section-label` con
 * `text-transform`. Antes iba `String(children).toUpperCase()`, que tenía dos
 * problemas: con más de un hijo `String` es `Array.prototype.toString`, que une
 * con coma y escribe «LO TUYO · ,3»; y el lector de pantalla recibía el texto
 * ya gritado, cuando `text-transform` es puro CSS y deja la palabra intacta
 * para quien la escucha.
 */
export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <h2 className="section-label">{children}</h2>
)

/**
 * Un número con su etiqueta.
 *
 * La jerarquía es la de Refactoring UI para una métrica: el dato grande, el
 * contexto chico y apagado. Es lo que hace que el perfil se lea de un vistazo
 * en vez de leerse.
 *
 * En cero el número va en `--faint` y no en el color de texto: un cero
 * destacado parece un logro y es lo contrario. Apagado dice "acá todavía no hay
 * nada", que es la verdad y además invita.
 *
 * Tenía un prop `accent` que elegía entre `--acento` y `--cream`, y en heritage
 * los dos son el mismo Floral White: el ternario pintaba el mismo color en sus
 * dos ramas y ningún llamador lo pasaba. Se va. El número queda en `--cream` y
 * nombrado por lo que es —texto destacado— que es el mismo criterio con el que
 * se resolvió la baldosa de "Tus bares" en `MyBeers`: llamarlo acento invitaba
 * a leerlo como un botón.
 */
export function Tile({ value, label, hint, onClick }: {
  /** `undefined` mientras carga: se dibuja un guión, no un cero. Un cero es un
   *  dato y "todavía no sé" no lo es. */
  value: number | string | undefined
  label: string
  hint?: string
  /** Con esto la baldosa es un botón. Sin esto, un `div`: una baldosa que no
   *  lleva a ningún lado no tiene que anunciarse como algo tocable. */
  onClick?: () => void
}) {
  const vacio = value === 0 || value === '0' || value == null
  const Caja = (onClick ? 'button' : 'div') as 'div'
  return (
    <Caja className="tile" onClick={onClick} style={{
      flex: 1, textAlign: 'left', minHeight: onClick ? 44 : undefined,
    }}>
      <div className="num" style={{
        fontSize: 'var(--t-8)', lineHeight: 1,
        color: vacio ? 'var(--faint)' : 'var(--cream)',
      }}>{value ?? '—'}</div>
      <div style={{
        fontSize: 'var(--t-2)', color: 'var(--muted)', marginTop: 'var(--s-1)',
      }}>{label}</div>
      {hint && (
        <div style={{ fontSize: 'var(--t-1)', color: 'var(--faint)', marginTop: 2 }}>
          {hint}
        </div>
      )}
    </Caja>
  )
}

/**
 * Pantalla que scrollea, con el botón de volver arriba.
 *
 * El `padding` de abajo deja lugar a la barra flotante: sin eso el último
 * elemento de cada lista quedaba tapado por la píldora de navegación, que es
 * el bug de scroll más común de una app con barra flotante.
 */
export function Screen({ title, onBack, children, wide }: {
  /** Va como `<h1>`. Todas las pantallas usan el mismo tamaño: es el título. */
  title?: string
  onBack?: () => void
  children: ReactNode
  /** El dashboard es la única que gana con más ancho. */
  wide?: boolean
}) {
  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(var(--safe-top) + var(--s-3)) var(--s-4) calc(var(--s-5) + var(--nav-gap))`,
    }}>
      <div className={wide ? 'desk-wide' : 'desk-narrow'}>
        {onBack && (
          <button onClick={onBack} className="icon-btn" aria-label="Volver"
            style={{ background: 'var(--elevated)', marginBottom: 'var(--s-3)' }}>←</button>
        )}
        {title && (
          <h1 className="ttl" style={{
            fontSize: 'var(--t-7)', margin: '0 0 var(--s-4)', lineHeight: 1.15,
          }}>{title}</h1>
        )}
        {children}
        {/* Aire final: una lista que termina justo contra el borde se lee como
            cortada, y deja dudando si había algo más abajo. */}
        <div style={{ height: 'var(--s-6)' }} />
      </div>
    </div>
  )
}
