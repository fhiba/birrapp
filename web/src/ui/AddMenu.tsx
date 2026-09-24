import { useEffect, useState, type ReactNode } from 'react'
import { t } from '../i18n'

export type AddAction = 'beer' | 'price' | 'bar'

/**
 * El "+" de la app, que pasó de hacer una sola cosa a preguntar cuál (BIR-36).
 *
 * **Vive en el centro de la barra de pestañas**, y no flotando en la esquina
 * del mapa. Flotando tenía dos problemas. Uno: sólo existía en el mapa, aunque
 * "me tomé una birra" o "cargar un precio" no son acciones del mapa sino de la
 * app — desde la lista o desde Cerca no había por dónde entrar. Dos: en la
 * esquina de abajo a la derecha competía con el pulgar que panea el mapa, y
 * quedaba a la misma altura que el botón de centrar, o sea dos círculos
 * flotantes diciendo cosas de familias distintas.
 *
 * En el centro de la barra queda donde el pulgar llega solo, aparece en las
 * cuatro pantallas, y el resto de la barra sigue siendo navegación: esto es lo
 * único que *hace* algo, y por eso es lo único que no es una pestaña.
 *
 * Se dibuja más grande que los íconos de las pestañas y apenas por encima del
 * filete, asomando arriba de la barra. Las dos cosas dicen lo mismo: no es una
 * pestaña más, es la acción. El aro de `--base` alrededor es lo que lo despega
 * —sin él, el círculo apoyado sobre el filete se lee como pegado a la barra—.
 *
 * El menú es un desplegable chico anclado al botón, no una pantalla: elegir
 * qué vas a cargar es un paso de tránsito y una vista entera lo convertiría en
 * un trámite. Tres renglones, el ancho justo, y lo de atrás sigue visible.
 *
 * El "+" gira 45° y se vuelve una cruz mientras está abierto: el mismo botón
 * abre y cierra, así que tiene que decir en qué estado está.
 */
export function AddMenu({ onPick }: { onPick: (a: AddAction) => void }) {
  const [open, setOpen] = useState(false)

  // Escape cierra. En escritorio es el reflejo para salir de cualquier capa
  // flotante, y acá no cuesta nada.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  const pick = (a: AddAction) => { setOpen(false); onPick(a) }

  return (
    <div style={{
      // Ancho fijo y no `flex: 1`: las cuatro pestañas se reparten lo que
      // queda, y si esto creciera con ellas el círculo dejaría de estar en el
      // centro exacto de la barra en cuanto una etiqueta fuera más larga.
      width: 72, flexShrink: 0,
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
    }}>
      {/*
        Capa que se come el toque de afuera. `fixed` y no `absolute`: la barra
        de pestañas es angosta y baja, así que un overlay medido contra ella no
        cubriría nada. Va debajo del menú y por encima de todo lo demás —sin
        ella, tocar el mapa para cerrar movería la cámara al mismo tiempo.
      */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 59 }}
          aria-hidden
        />
      )}

      {open && (
        <div
          // `group` y no `menu`: el patrón ARIA de menú promete flechas, Home
          // y End, y acá se navega con Tab como en cualquier grupo de botones.
          // Declarar un menú que no se comporta como un menú es peor que no
          // declarar nada.
          role="group"
          aria-label={t('AddMenu.queAgregar')}
          className="glass"
          style={{
            position: 'fixed', zIndex: 60,
            left: '50%', transform: 'translateX(-50%)',
            bottom: `calc(74px + var(--nav-gap))`,
            borderRadius: 'var(--r-3)', padding: 'var(--s-2)', minWidth: 216,
            display: 'flex', flexDirection: 'column',
            // Nace desde el botón, que es de donde viene.
            transformOrigin: 'bottom center',
            animation: 'addmenu-in .13s ease-out',
          }}
        >
          <Item icon={<Pint />} label={t('AddMenu.birra')} onClick={() => pick('beer')} />
          <Item icon={<Tag />} label={t('AddMenu.precio')} onClick={() => pick('price')} />
          <Item icon={<Pin />} label={t('AddMenu.bar')} onClick={() => pick('bar')} />
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? t('AddMenu.cerrar') : t('comun.agregar')}
        aria-expanded={open}
        style={{
          width: 56, height: 56, borderRadius: '50%', background: 'var(--acento)',
          // Lo sube por encima del filete de la barra. El aro del mismo color
          // que el fondo es lo que lo recorta contra ella.
          marginTop: -16, border: '4px solid var(--base)',
          position: 'relative', zIndex: 61,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, flexShrink: 0,
          boxShadow: '0 6px 22px rgba(0,0,0,.4)',
          transition: 'transform .13s ease-out',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >
        {/* Dibujado y no un glifo: un "+" de fuente se posiciona por baseline
            y nunca queda centrado en un círculo. */}
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 4.5v15M4.5 12h15" stroke="var(--base)"
            strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </button>

      <style>{`
        @keyframes addmenu-in {
          from { opacity: 0; transform: translateX(-50%) scale(.88) translateY(6px); }
          to   { opacity: 1; transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}

function Item({ icon, label, onClick }: {
  icon: ReactNode; label: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} className="lbl" style={{
      display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
      padding: 'var(--s-3)', borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
      textAlign: 'left', width: '100%', color: 'var(--cream)',
    }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 20, color: 'var(--acento)' }}>
        {icon}
      </span>
      {label}
    </button>
  )
}

const Pint = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M6 3h12l-1.3 17.2a1 1 0 0 1-1 .8H8.3a1 1 0 0 1-1-.8L6 3Zm1.8 5 .9 11.5h6.6L16.2 8H7.8Z" />
  </svg>
)

const Tag = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M3 3h8.2l9.3 9.3a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0L3 11.2V3Zm4 2.6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z" />
  </svg>
)

const Pin = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2a7 7 0 0 0-7 7c0 5 7 12 7 12s7-7 7-12a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
  </svg>
)
