import { useEffect, useState, type ReactNode } from 'react'

export type AddAction = 'beer' | 'price' | 'bar'

/**
 * El "+" del mapa, que pasó de hacer una sola cosa a preguntar cuál (BIR-36).
 *
 * Es un desplegable chico anclado al botón, no una pantalla: elegir qué vas a
 * cargar es un paso de tránsito y una vista entera lo convertiría en un
 * trámite. Tres renglones, el ancho justo, y el mapa sigue visible detrás.
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
    <>
      {/*
        Capa que se come el toque de afuera. Va debajo del menú y por encima
        del mapa: sin ella, tocar el mapa para cerrar movería la cámara al
        mismo tiempo.
      */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 19 }}
          aria-hidden
        />
      )}

      {open && (
        <div
          role="menu"
          className="glass"
          style={{
            position: 'absolute', right: 14, zIndex: 20,
            bottom: `calc(72px + var(--nav-gap) + 60px)`,
            borderRadius: 16, padding: 6, minWidth: 208,
            display: 'flex', flexDirection: 'column',
            // Nace desde el botón, que es de donde viene.
            transformOrigin: 'bottom right',
            animation: 'addmenu-in .13s ease-out',
          }}
        >
          <Item icon={<Pint />} label="Me tomé una birra" onClick={() => pick('beer')} />
          <Item icon={<Tag />} label="Cargar un precio" onClick={() => pick('price')} />
          <Item icon={<Pin />} label="Agregar un bar" onClick={() => pick('bar')} />
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Cerrar el menú de agregar' : 'Agregar'}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          position: 'absolute', right: 14, bottom: `calc(72px + var(--nav-gap))`,
          width: 52, height: 52, borderRadius: '50%', background: 'var(--amber)',
          zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 22px rgba(0,0,0,.4)', padding: 0,
          transition: 'transform .13s ease-out',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >
        {/* Dibujado y no un glifo: un "+" de fuente se posiciona por baseline
            y nunca queda centrado en un círculo. */}
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 4.5v15M4.5 12h15" stroke="var(--base)"
            strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </button>

      <style>{`
        @keyframes addmenu-in {
          from { opacity: 0; transform: scale(.88) translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </>
  )
}

function Item({ icon, label, onClick }: {
  icon: ReactNode; label: string; onClick: () => void
}) {
  return (
    <button role="menuitem" onClick={onClick} className="lbl" style={{
      display: 'flex', alignItems: 'center', gap: 11,
      padding: '11px 12px', borderRadius: 11, fontSize: 14.5,
      textAlign: 'left', width: '100%', color: 'var(--cream)',
    }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 20, color: 'var(--amber)' }}>
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
