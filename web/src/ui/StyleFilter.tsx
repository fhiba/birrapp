import { useState } from 'react'
import type { BeerStyle } from '../data/types'

/**
 * Filtro de estilo, compartido por el mapa y la lista.
 *
 * Era un desplegable y no una fila de chips porque la fila scrolleaba mal
 * sobre el mapa: el gesto competía con el paneo y a veces se movía el mapa en
 * vez de la lista, además de ocupar una franja permanente de pantalla.
 *
 * `tone` es lo único que cambia entre las dos pantallas: sobre el mapa va de
 * vidrio, en la lista de sólido. El resto es idéntico, y tenerlo dos veces
 * garantizaba que se fueran separando con cada retoque.
 */
export function StyleFilter({
  styles, selected, onSelect, minRating, onMinRating,
  tone = 'glass', size = 44, tourId,
}: {
  styles: BeerStyle[]
  /** Varios a la vez: "IPA o APA" es una pregunta que la gente se hace. */
  selected: string[]
  onSelect: (s: string[]) => void
  /** Piso de estrellas, o undefined por "cualquiera". */
  minRating?: number
  onMinRating: (n?: number) => void
  tone?: 'glass' | 'plain'
  size?: number
  /** Ancla del tutorial, si esta instancia es la que se explica. */
  tourId?: string
}) {
  const [open, setOpen] = useState(false)
  const active = selected.length > 0 || minRating != null

  /*
   * La etiqueta de la píldora.
   *
   * Con un solo estilo dice el nombre; con dos o más, el número. "IPA, APA,
   * Stout" no entra en el encabezado del mapa y trunca en un lugar arbitrario,
   * y la lista completa ya está a un toque adentro del menú.
   */
  const label = selected.length === 1
    ? styles.find(s => s.slug === selected[0])?.name
    : selected.length > 1 ? `${selected.length} estilos` : null
  const etiqueta = [label, minRating != null ? `★ ${minRating}+` : null]
    .filter(Boolean).join(' · ')

  const alternar = (slug: string) => {
    onSelect(selected.includes(slug)
      ? selected.filter(x => x !== slug)
      : [...selected, slug])
  }

  if (styles.length === 0) return null

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
   * ayuda pero no alcanza — `--info` no llega a 3:1 contra ese fondo con
   * ningún brillo razonable. Así que ahí el prendido se suelta del vidrio y se
   * pinta opaco en `--info` con la etiqueta en espresso: 7,04:1, y no depende
   * del mapa.
   *
   * Apagado sí es vidrio en las dos, que es lo que lo deja flotar.
   */
  const opaco = tone === 'glass' && active
  const cascara = tone === 'glass' && !opaco ? 'lbl pill glass' : 'lbl pill'

  return (
    <div style={{ position: 'relative', flexShrink: 0 }} data-tour={tourId}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cascara}
        aria-label="Filtrar por estilo"
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          // `--pill-pad` sólo existe adentro de `.map-controls`, que aprieta
          // los controles por ancho de pantalla. En la lista no está, y sin
          // valor de reserva el botón quedaría sin aire a los costados.
          height: size, padding: '0 var(--pill-pad, 14px)',
          justifyContent: 'center', flexShrink: 0, whiteSpace: 'nowrap',
          background: opaco ? 'var(--info)'
            : active ? 'var(--info-soft)'
              : tone === 'plain' ? 'var(--film-2)' : undefined,
          border: active && !opaco ? '1px solid var(--info-border)' : undefined,
          color: opaco ? 'var(--base)'
            : active ? 'var(--info-bright)'
              // Sobre vidrio el secundario va en --sobre-vidrio y no en
              // --muted: lo que pasa por detrás del panel a veces es una
              // cápsula de precio brillante.
              : tone === 'glass' ? 'var(--sobre-vidrio)' : 'var(--muted)',
          fontSize: 'var(--t-2)',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24"
          fill="currentColor" aria-hidden>
          <path d="M4 5h16v2.2l-6 6V21l-4-2v-5.8l-6-6z" />
        </svg>
        {/* Apagado también lleva palabra.

            Antes era un cuadrado de 44px con un embudo adentro, y apoyado
            junto a los otros controles —todos del mismo vidrio— se leía como
            parte de la barra y no como algo que se toca. El ícono solo alcanza
            cuando el ícono es universal; el embudo no lo es, y encima acá
            compite con la lupa del radio, que es otro dibujo abstracto. */}
        <span>{active ? etiqueta : 'Estilos'}</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{
            position: 'absolute', left: 0, top: size + 6, zIndex: 21, minWidth: 190,
            maxHeight: 320, overflowY: 'auto',
            background: 'var(--elevated)', borderRadius: 'var(--r-3)', padding: 8,
            border: '.8px solid var(--hairline)',
            boxShadow: '0 10px 34px rgba(0,0,0,.5)',
          }}>
            {/* El menú NO se cierra al elegir un estilo: ahora se puede
                marcar más de uno, y cerrarse en el primero obligaría a
                reabrirlo por cada uno. Se cierra tocando afuera, que es el
                gesto que ya tenía. */}
            <MenuItem on={selected.length === 0} onClick={() => onSelect([])}>
              Todos los estilos
            </MenuItem>
            {styles.map(s => (
              <MenuItem key={s.slug} on={selected.includes(s.slug)}
                onClick={() => alternar(s.slug)}>
                {s.name}
              </MenuItem>
            ))}

            {/* Piso de estrellas.
                Va en el mismo menú y no en un control aparte porque es la
                misma pregunta —"qué bares quiero ver"— y porque la franja de
                arriba no tiene lugar para otro botón. */}
            <div style={{
              borderTop: '1px solid var(--hairline)', margin: '8px 0 4px', paddingTop: 8,
            }}>
              {/* La etiqueta de sección de la dirección: 11px, tracking .14em
                  y en --info. En --faint pesaba lo mismo que los estilos de
                  arriba y no se leía como "acá empieza otra pregunta". */}
              <span className="lbl" style={{
                display: 'block', padding: '0 12px 6px',
                fontSize: 'var(--t-1)', letterSpacing: '.14em', color: 'var(--info)',
              }}>NOTA MÍNIMA</span>
              <div style={{ display: 'flex', gap: 6, padding: '0 8px 4px' }}>
                {[undefined, 3, 3.5, 4, 4.5].map(n => (
                  <button
                    key={n ?? 'todas'}
                    onClick={() => onMinRating(n)}
                    aria-pressed={minRating === n}
                    className="lbl num"
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 'var(--r-1)',
                      fontSize: 'var(--t-2)',
                      background: minRating === n ? 'var(--nota)' : 'var(--film-2)',
                      color: minRating === n ? 'var(--base)' : 'var(--muted)',
                    }}
                  >{n == null ? 'Todas' : `${String(n).replace('.', ',')}+`}</button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MenuItem(
  { on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode },
) {
  return (
    // El estilo elegido es un chip informativo, no un CTA: va en --info-bright
    // sobre --info-soft. En hueso pesaba lo mismo que el nombre del bar y que
    // el botón de "Sigue igual", que son las dos cosas que sí mandan.
    <button onClick={onClick} className="lbl row-hover" style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '12px 12px', borderRadius: 'var(--r-1)', fontSize: 'var(--t-3)',
      background: on ? 'var(--info-soft)' : undefined,
      color: on ? 'var(--info-bright)' : 'var(--cream)',
    }}>{children}</button>
  )
}
