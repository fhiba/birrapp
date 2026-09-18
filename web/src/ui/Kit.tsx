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

/**
 * Una palabra del vocabulario: un estilo, una marca, "Sin marca".
 *
 * Es la forma que estrenó la elección de estilo y que ahora usan también las
 * marcas: texto con un filete abajo, no una cápsula rellena. La cápsula pesaba
 * lo mismo que un CTA, y acá hay treinta seguidas — la pantalla se veía como
 * una botonera. Apagado va en `--info`, la voz de lo informativo en toda la
 * app; el elegido es el único en hueso, con el filete de 2px que usa la barra
 * de pestañas para decir "estás acá".
 *
 * El filete mide siempre 2px y lo que cambia es el color: con uno de 1px
 * apagado y otro de 2px encendido, elegir movía la fila entera un pixel.
 *
 * Vive acá y no adentro de `StyleChips` porque lo usan dos pantallas. Copiado
 * en las dos, la de marcas y la de estilos iban a ir separándose con cada
 * retoque, que es exactamente lo que este archivo existe para evitar.
 */
export function Vocablo({ label, on, centrado, onClick }: {
  label: string
  on: boolean
  /** En grilla el texto va centrado; en la fila que se arrastra, a la izquierda. */
  centrado?: boolean
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="lbl" aria-pressed={on} style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      minHeight: 44, padding: 'var(--s-2) 0 0', flexShrink: 0,
      fontSize: 'var(--t-3)', whiteSpace: 'nowrap',
      textAlign: centrado ? 'center' : 'left',
      color: on ? 'var(--cream)' : 'var(--info)',
    }}>
      {label}
      <span aria-hidden style={{
        display: 'block', height: 2, marginTop: 'var(--s-2)',
        background: on ? 'var(--cream)' : 'var(--info-border)',
      }} />
    </button>
  )
}

/**
 * El botón de "lo mío no está en la lista", en estilos y en marcas.
 *
 * **Tiene que verse distinto de las palabras del vocabulario, y por eso no es
 * una.** Era un `Vocablo` más, con el mismo filete y el mismo azul, escondido
 * al final de una grilla de cuarenta: quien no encontraba su birra no tenía
 * forma de ver que había una salida, porque la salida estaba dibujada como una
 * opción más de la lista donde justamente ya había buscado y no estaba.
 *
 * Así que cambia de familia entera: cápsula con borde punteado, en ámbar, con
 * un "+" adelante. El punteado dice "acá se agrega algo que todavía no existe"
 * —es la convención de cualquier casillero de alta— y el ámbar es el mismo
 * tono con el que la app avisa que algo queda a revisión de un moderador, que
 * es exactamente lo que va a pasar con lo que se cargue acá. Prendido se
 * rellena con `--aging-soft`, igual que cualquier otro control de la app.
 */
export function AgregarOtro({ label, on, onClick }: {
  label: string
  /** El campo de alta está abierto. */
  on: boolean
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="lbl" aria-pressed={on} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      minHeight: 44, padding: '0 var(--s-3)', flexShrink: 0,
      borderRadius: 'var(--r-2)', border: '1px dashed var(--aging)',
      background: on ? 'var(--aging-soft)' : 'transparent',
      color: 'var(--aging)', fontSize: 'var(--t-3)', whiteSpace: 'nowrap',
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 5v14M5 12h14" stroke="currentColor"
          strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      {label}
    </button>
  )
}
