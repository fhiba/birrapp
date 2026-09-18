import { useState, type CSSProperties, type ReactNode } from 'react'
import type { BeerStyle } from '../data/types'

/**
 * Los dos filtros de "qué bares quiero ver", cada uno en su propia píldora.
 *
 * Vivían juntos adentro de un solo desplegable: la lista de estilos arriba y,
 * separado por un filete, el piso de estrellas. Son dos preguntas distintas
 * —de qué birra, y qué tan bien puntuada— y meterlas en el mismo menú tenía
 * dos costos. Uno, la píldora tenía que resumir las dos en una etiqueta
 * ("IPA · ★ 4+"), que crece hasta no entrar. Dos, y peor: con el menú cerrado
 * no había forma de sacar el piso de estrellas sin volver a abrirlo y bajar
 * hasta el final, o sea que el filtro más fácil de poner sin querer era el más
 * caro de deshacer.
 *
 * Separados, cada píldora dice lo suyo y se apaga sola.
 *
 * `tone` es lo único que cambia entre el mapa y la lista: sobre el mapa van de
 * vidrio, en la lista de sólido. El resto es idéntico, y tenerlo dos veces
 * garantizaba que se fueran separando con cada retoque.
 */

/*
 * Prendido sobre el mapa = opaco; prendido sobre la lista = tinte.
 *
 * En la lista el filtro puesto usa la gramática de acción secundaria de la
 * dirección —`--info-soft` + `--info-border` + `--info-bright`—, que es más
 * tranquila que el relleno hueso pleno que había antes y no compite con los
 * precios, que son el contenido.
 *
 * Sobre el mapa ese mismo tinte no se puede: el fondo es translúcido, o sea
 * que el contraste queda a merced de lo que pase por debajo, y medido contra
 * una cápsula de precio clara da 2,58:1. El `backdrop-filter` de `.glass`
 * ayuda pero no alcanza — `--info` no llega a 3:1 contra ese fondo con ningún
 * brillo razonable. Así que ahí el prendido se suelta del vidrio y se pinta
 * opaco en `--info` con la etiqueta en espresso: 7,04:1, y no depende del
 * mapa.
 *
 * Apagado sí es vidrio en las dos, que es lo que lo deja flotar.
 */
function pillLook(tone: 'glass' | 'plain', active: boolean): {
  className: string; style: CSSProperties
} {
  const opaco = tone === 'glass' && active
  return {
    className: tone === 'glass' && !opaco ? 'lbl pill glass' : 'lbl pill',
    style: {
      background: opaco ? 'var(--info)'
        : active ? 'var(--info-soft)'
          : tone === 'plain' ? 'var(--film-2)' : undefined,
      border: active && !opaco ? '1px solid var(--info-border)' : undefined,
      color: opaco ? 'var(--base)'
        : active ? 'var(--info-bright)'
          // Sobre vidrio el secundario va en --sobre-vidrio y no en --muted:
          // lo que pasa por detrás del panel a veces es una cápsula de precio
          // brillante.
          : tone === 'glass' ? 'var(--sobre-vidrio)' : 'var(--muted)',
    },
  }
}

/** La cáscara común: la píldora que abre, el fondo que cierra, y el menú. */
function FilterPill({
  label, icon, active, tone, size, tourId, menuWidth = 190, children,
}: {
  label: string
  icon: ReactNode
  active: boolean
  tone: 'glass' | 'plain'
  size: number
  tourId?: string
  menuWidth?: number
  /** Se le pasa `cerrar` para que cada menú decida si un toque lo cierra. */
  children: (cerrar: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const look = pillLook(tone, active)

  return (
    <div style={{ position: 'relative', flexShrink: 0 }} data-tour={tourId}>
      <button
        onClick={() => setOpen(o => !o)}
        className={look.className}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          // `--pill-pad` sólo existe adentro de `.map-controls`, que aprieta
          // los controles por ancho de pantalla. En la lista no está, y sin
          // valor de reserva el botón quedaría sin aire a los costados.
          height: size, padding: '0 var(--pill-pad, 14px)',
          justifyContent: 'center', flexShrink: 0, whiteSpace: 'nowrap',
          fontSize: 'var(--t-2)',
          ...look.style,
        }}
      >
        {icon}
        {/* Apagado también lleva palabra.

            Antes era un cuadrado de 44px con un ícono adentro y nada más, y
            apoyado junto a los otros controles —todos del mismo vidrio— se
            leía como parte de la barra y no como algo que se toca. El ícono
            solo alcanza cuando el ícono es universal; el embudo no lo es, y
            encima acá compite con la lupa del radio, que es otro dibujo
            abstracto. */}
        <span>{label}</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{
            position: 'absolute', left: 0, top: size + 6, zIndex: 21, minWidth: menuWidth,
            maxHeight: 320, overflowY: 'auto',
            background: 'var(--elevated)', borderRadius: 'var(--r-3)', padding: 8,
            border: '.8px solid var(--hairline)',
            boxShadow: '0 10px 34px rgba(0,0,0,.5)',
          }}>
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  )
}

/** Filtro por tipo de birra. Varios a la vez: "IPA o APA" es una pregunta que
 *  la gente se hace. */
export function StyleFilter({
  styles, selected, onSelect, tone = 'glass', size = 44, tourId,
}: {
  styles: BeerStyle[]
  selected: string[]
  onSelect: (s: string[]) => void
  tone?: 'glass' | 'plain'
  size?: number
  /** Ancla del tutorial, si esta instancia es la que se explica. */
  tourId?: string
}) {
  if (styles.length === 0) return null

  /*
   * La etiqueta de la píldora.
   *
   * Con un solo estilo dice el nombre; con dos o más, el número. "IPA, APA,
   * Stout" no entra en el encabezado del mapa y trunca en un lugar arbitrario,
   * y la lista completa ya está a un toque adentro del menú.
   */
  const label = selected.length === 1
    ? styles.find(s => s.slug === selected[0])?.name ?? 'Estilos'
    : selected.length > 1 ? `${selected.length} estilos` : 'Estilos'

  const alternar = (slug: string) => {
    onSelect(selected.includes(slug)
      ? selected.filter(x => x !== slug)
      : [...selected, slug])
  }

  return (
    <FilterPill
      label={label} active={selected.length > 0} tone={tone} size={size} tourId={tourId}
      icon={
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M4 5h16v2.2l-6 6V21l-4-2v-5.8l-6-6z" />
        </svg>
      }
    >
      {() => (
        <>
          {/* El menú NO se cierra al elegir un estilo: se puede marcar más de
              uno, y cerrarse en el primero obligaría a reabrirlo por cada uno.
              Se cierra tocando afuera, que es el gesto que ya tenía. */}
          <MenuItem on={selected.length === 0} onClick={() => onSelect([])}>
            Todos los estilos
          </MenuItem>
          {styles.map(s => (
            <MenuItem key={s.slug} on={selected.includes(s.slug)}
              onClick={() => alternar(s.slug)}>
              {s.name}
            </MenuItem>
          ))}
        </>
      )}
    </FilterPill>
  )
}

/**
 * Filtro por nota mínima.
 *
 * Píldora propia, al lado de la de estilos. El piso de estrellas es la otra
 * mitad de "qué bares quiero ver" y merece poder prenderse y apagarse solo.
 */
export function RatingFilter({
  minRating, onMinRating, tone = 'glass', size = 44, tourId,
}: {
  /** Piso de estrellas, o undefined por "cualquiera". */
  minRating?: number
  onMinRating: (n?: number) => void
  tone?: 'glass' | 'plain'
  size?: number
  tourId?: string
}) {
  const active = minRating != null

  return (
    <FilterPill
      label={active ? `${String(minRating).replace('.', ',')}+` : 'Nota'}
      active={active} tone={tone} size={size} tourId={tourId} menuWidth={168}
      icon={
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="m12 3.6 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.6Z" />
        </svg>
      }
    >
      {cerrar => (
        <>
          {/* Acá sí se cierra al elegir: es una sola respuesta, no una lista
              de marcados. Dejarlo abierto obligaría a un toque de más para
              volver al mapa. */}
          {[undefined, 3, 3.5, 4, 4.5].map(n => (
            <MenuItem
              key={n ?? 'todas'} on={minRating === n}
              onClick={() => { onMinRating(n); cerrar() }}
            >
              {n == null ? 'Cualquier nota' : `★ ${String(n).replace('.', ',')} o más`}
            </MenuItem>
          ))}
        </>
      )}
    </FilterPill>
  )
}

function MenuItem(
  { on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode },
) {
  return (
    // Lo elegido es un chip informativo, no un CTA: va en --info-bright sobre
    // --info-soft. En hueso pesaba lo mismo que el nombre del bar y que el
    // botón de "Sigue igual", que son las dos cosas que sí mandan.
    <button onClick={onClick} className="lbl row-hover" style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '12px 12px', borderRadius: 'var(--r-1)', fontSize: 'var(--t-3)',
      background: on ? 'var(--info-soft)' : undefined,
      color: on ? 'var(--info-bright)' : 'var(--cream)',
    }}>{children}</button>
  )
}
