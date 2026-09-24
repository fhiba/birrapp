import type { ReactNode } from 'react'
import { ageColor, formatPrice, shortAge } from '../data/format'
import { t } from '../i18n'

/**
 * Una pantalla vacía es una invitación, no un cartel de "no hay nada".
 *
 * La app tenía media docena de vacíos resueltos con un renglón gris: "No hay
 * bares cargados por acá todavía", "Todavía no cargaste ningún precio". Todos
 * verdaderos y ninguno útil — quien los lee no sabe qué hacer al respecto, y el
 * momento en que alguien se topa con un vacío es justo cuando más sirve
 * decirle cuál es el paso siguiente.
 *
 * Tres partes, y sólo la primera es obligatoria: qué pasa, por qué, y el botón
 * que lo resuelve. El "por qué" existe porque en esta app muchos vacíos no son
 * culpa de nadie —una zona sin bares cargados es una zona sin bares cargados—
 * y decirlo evita que se lea como un error.
 */
export function Empty({ title, hint, action, onAction }: {
  title: string
  /**
   * La línea de ayuda: qué hacer al respecto.
   *
   * Va en 12px y apagada a propósito. El mensaje de arriba dice qué pasa y es
   * lo que se lee primero; esto es el pie que explica la salida, y ponerlo del
   * mismo tamaño haría que compitan dos renglones que se leen en orden.
   */
  hint?: string
  /** Texto del botón. Sin esto no hay botón: hay vacíos que no tienen salida. */
  action?: string
  onAction?: () => void
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', padding: 'var(--s-7) var(--s-5)', gap: 'var(--s-2)',
    }}>
      {/* Un vaso vacío, dibujado con el mismo trazo que el resto de la app y
          no un emoji, que cambia de forma y de color en cada sistema. */}
      <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden
        style={{ color: 'var(--faint)', opacity: .55, marginBottom: 4 }}>
        <path
          d="M6.5 3h11l-1.2 17.1a1 1 0 0 1-1 .9H8.7a1 1 0 0 1-1-.9L6.5 3Z"
          fill="none" stroke="currentColor" strokeWidth="1.4"
        />
      </svg>

      <p className="lbl" style={{ fontSize: 'var(--t-4)', margin: 0 }}>{title}</p>

      {hint && (
        <p style={{
          color: 'var(--faint)', fontSize: 'var(--t-2)', margin: 0, lineHeight: 1.55, maxWidth: 320,
        }}>{hint}</p>
      )}

      {/* El CTA primario de la pizarra: hueso lleno, texto espresso, --r-2 y
          46 de alto — el vacío vive adentro de una pantalla que ya tiene
          encabezado y filtros, y los 52 son para cuando el botón es la
          pantalla entera. */}
      {action && onAction && (
        <button onClick={onAction} className="lbl cta" style={{
          marginTop: 'var(--s-3)', padding: '0 var(--s-5)', borderRadius: 'var(--r-2)',
          fontSize: 'var(--t-4)', minHeight: 46,
          background: 'var(--acento)', color: 'var(--base)',
        }}>{action}</button>
      )}
    </div>
  )
}

/**
 * Lo que se muestra mientras carga una lista.
 *
 * Filas fantasma con la forma de las que vienen, en vez de una barra de un
 * pixel que sólo dice "esperá". La pantalla no salta cuando llegan los datos
 * —el alto ya estaba ocupado— y se entiende qué se está esperando.
 */
export function SkeletonRows({ rows = 6, children }: { rows?: number; children?: ReactNode }) {
  return (
    // Las medidas son las de la fila de verdad, y no parecidas: la lista pone
    // `padding: '0 var(--s-4)'` y cada fila `var(--s-3) 0` con `gap var(--s-3)`
    // (ListScreen) o `var(--s-3) var(--s-4)` (MyContributions). Con los 10/18/15
    // de antes el esqueleto medía ~6px menos por fila y con cinco o seis filas
    // eso es un salto visible justo al llegar los datos, que es exactamente lo
    // que el esqueleto viene a evitar.
    <div aria-hidden style={{ padding: 'var(--s-3) var(--s-4) 0' }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
          // El mismo filete que separa las filas de verdad: si el esqueleto se
          // dibuja con otra línea, al llegar los datos la lista cambia de
          // textura y se nota el reemplazo.
          padding: 'var(--s-3) 0', borderBottom: '1px solid var(--hairline)',
          // Se van apagando hacia abajo: dice "hay más" sin dibujar más filas.
          opacity: 1 - i * 0.13,
        }}>
          {/* La barra de frescura, en gris y sin color todavía: es la forma que
              va a ocupar el dato cuando llegue. */}
          <div className="skeleton fresh-bar" />
          {/* El alto del medio se fija a mano: dos renglones de texto de verdad
              —nombre en --t-4 y distancia en --t-2, con su interlineado— miden
              unos 42px, y dos barritas de 14 y 10 miden 32. Sin esto cada fila
              fantasma es diez píxeles más baja que la que la reemplaza. */}
          <div style={{ flex: 1, minHeight: 42 }}>
            <div className="skeleton" style={{ height: 14, width: `${55 + (i % 3) * 12}%` }} />
            <div className="skeleton" style={{ height: 10, width: '35%', marginTop: 8 }} />
          </div>
          {/* La columna del precio es dos cosas, no una: el monto y su
              antigüedad. El fantasma tiene esa forma por lo mismo que la fila
              real nunca muestra una sin la otra. */}
          <div style={{ textAlign: 'right' }}>
            <div className="skeleton" style={{ height: 18, width: 62 }} />
            <div className="skeleton" style={{ height: 9, width: 40, marginTop: 5, marginLeft: 'auto' }} />
          </div>
        </div>
      ))}
      {children}
    </div>
  )
}

/**
 * El precio arriba y su antigüedad abajo, en una columna a la derecha.
 *
 * Es la forma más repetida de la app —la lista, la hoja de elegir bar, la
 * preview del mapa, la ficha— y estaba dibujada de cuatro maneras distintas:
 * en una la edad no era tabular, en otra no había pie para cuando la edad
 * falta. Cuatro copias de la regla que no se negocia son cuatro lugares donde
 * se puede romper.
 *
 * **Por qué vive en este archivo.** No es su casa definitiva: lo suyo sería un
 * `ui/Kit.tsx`. Mientras tanto queda acá porque `SkeletonRows`, dos funciones
 * más arriba, dibuja el fantasma de exactamente esta columna — que es el
 * defecto que se acaba de arreglar: la métrica del esqueleto y la de la fila
 * real se habían separado viviendo en archivos distintos. Juntas no pueden.
 *
 * La regla del proyecto está adentro del componente y no en cada llamador:
 * ningún precio se dibuja sin su antigüedad al lado. Si no se sabe de cuándo
 * es, se dice "sin fecha" — nunca se deja el número solo.
 */
export function PriceColumn({
  price, currency, ageDays, size = 'var(--t-6)', minWidth = 72, sinPrecio = t('Empty.sinPrecio'),
}: {
  price: number | null
  currency: string
  /** Días desde el precio más fresco del bar. `null` es "no se sabe". */
  ageDays: number | null
  /**
   * Paso de la escala para el monto. La lista principal lo muestra en --t-6,
   * que es el dato de esa pantalla; una hoja secundaria no tiene por qué
   * gritarlo igual, así que se elige de afuera.
   */
  size?: string
  /**
   * El ancho mínimo es lo que arma la columna: sin él cada precio empieza
   * donde termina su nombre y comparar dos filas obliga a buscar el número en
   * cada una.
   */
  minWidth?: number
  /** Qué decir sin precio. `null` no dibuja nada, para las hojas angostas. */
  sinPrecio?: string | null
}) {
  if (price == null) {
    return sinPrecio == null ? null : (
      <span style={{
        flexShrink: 0, textAlign: 'right', minWidth,
        fontSize: 'var(--t-2)', color: 'var(--faint)',
      }}>{sinPrecio}</span>
    )
  }

  return (
    <span style={{ flexShrink: 0, textAlign: 'right', minWidth }}>
      <span className="num" style={{ display: 'block', fontSize: size, lineHeight: 1.1 }}>
        {formatPrice(price, currency)}
      </span>
      {/* La edad va en el color de su frescura —es la misma pregunta que
          contesta la barra de la izquierda de la fila— y en `.num`, que es lo
          que la deja tabular: "hace 9 d" y "hace 12 d" tienen que alinearse. */}
      <span className="num" style={{
        display: 'block', fontSize: 'var(--t-1)', color: ageColor(ageDays),
      }}>
        {ageDays != null ? shortAge(ageDays) : t('Empty.sinFecha')}
      </span>
    </span>
  )
}
