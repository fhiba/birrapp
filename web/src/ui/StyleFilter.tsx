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

  const idle = tone === 'glass' ? 'lbl pill glass' : 'lbl pill'

  return (
    <div style={{ position: 'relative', flexShrink: 0 }} data-tour={tourId}>
      <button
        onClick={() => setOpen(o => !o)}
        className={active ? 'lbl pill' : idle}
        aria-label="Filtrar por estilo"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          height: size, padding: active ? '0 14px' : 0, width: active ? undefined : size,
          justifyContent: 'center', flexShrink: 0, whiteSpace: 'nowrap',
          background: active ? 'var(--acento)'
            : tone === 'plain' ? 'var(--film-2)' : undefined,
          color: active ? 'var(--base)' : 'var(--muted)',
          fontSize: 'var(--t-2)',
        }}
      >
        <svg width={active ? 15 : 18} height={active ? 15 : 18} viewBox="0 0 24 24"
          fill="currentColor" aria-hidden>
          <path d="M4 5h16v2.2l-6 6V21l-4-2v-5.8l-6-6z" />
        </svg>
        {active && <span>{etiqueta}</span>}
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
              <span className="lbl" style={{
                display: 'block', padding: '0 12px 6px',
                fontSize: 'var(--t-1)', letterSpacing: '.1em', color: 'var(--faint)',
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
    <button onClick={onClick} className="lbl row-hover" style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: '12px 12px', borderRadius: 'var(--r-1)', fontSize: 'var(--t-3)',
      color: on ? 'var(--acento)' : 'var(--cream)',
    }}>{children}</button>
  )
}
