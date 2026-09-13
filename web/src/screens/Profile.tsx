import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { User, UserStats } from '../data/types'
import { isModerator } from '../data/types'
import { Confirm } from '../ui/Chrome'
import { forceUpdate } from '../data/update'
import { resetTour, tourPending } from '../ui/Tour'

export function ProfileScreen({ user, onSession }: {
  user: User | null
  onSession: () => void
}) {
  const nav = useNavigate()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'out' | null>(null)
  const [pendingWork, setPendingWork] = useState(0)
  /** Cuántas birras llevás anotadas. Es el número que trae de vuelta acá. */
  const [beers, setBeers] = useState<number | null>(null)

  useEffect(() => {
    if (user) api.myStats().then(setStats).catch(() => {})
    if (user) api.beerSummary().then(s => setBeers(s.total)).catch(() => {})
    // Sólo los números, no las listas: es un endpoint aparte para no bajarse
    // los bares pendientes y sus reportes enteros para dibujar un número.
    if (isModerator(user)) {
      api.moderationSummary()
        .then(s => setPendingWork(
          s.pendingBars + s.openFlags + s.pendingBrands + s.pendingStyles,
        ))
        .catch(() => {})
    }
  }, [user])

  const login = async () => {
    setBusy(true); setError(null)
    try {
      const { authorizeUrl } = await api.startBrowserLogin()
      // Redirección completa, no popup: los popups se bloquean y en iOS
      // dentro de una PWA directamente no abren.
      location.href = authorizeUrl
    } catch {
      setBusy(false)
      setError('No pudimos abrir el inicio de sesión. Revisá tu conexión.')
    }
  }

  if (!user) return (
    <Wrap>
      <h1 className="ttl" style={{ fontSize: 'var(--t-8)', margin: 0 }}>birrapp</h1>
      <p style={{ color: 'var(--muted)', margin: '10px 0 26px' }}>
        Para cargar precios hace falta una cuenta. Mirar el mapa no.
      </p>
      <button onClick={login} disabled={busy} className="lbl" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        width: '100%', padding: 16, borderRadius: 'var(--r-3)',
        background: 'var(--cream)', color: 'var(--base)', fontSize: 'var(--t-4)',
      }}>
        {busy ? <span className="spinner" /> : <><GoogleG /> Continuar con Google</>}
      </button>
      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)', marginTop: 16 }}>{error}</p>}
      <Footer />
    </Wrap>
  )

  return (
    <Wrap>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* La foto se edita en configuración; acá sólo se ve. Un perfil sin
            cara es una lista de números con un nombre arriba. */}
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" width={56} height={56}
            style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div className="num" aria-hidden style={{
            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: 'var(--elevated)', color: 'var(--muted)', fontSize: 'var(--t-6)',
          }}>{user.displayName.charAt(0).toUpperCase()}</div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: 0 }}>{user.displayName}</h1>
          <p style={{ color: 'var(--faint)', fontSize: 'var(--t-3)', margin: '4px 0 0' }}>{user.email}</p>
        </div>
        {/* La tuerca, donde se la busca. Era un renglón más en la lista de
            abajo, entre "cómo funcionan los precios" y el tutorial: nadie va a
            leer una lista para encontrar la configuración, la busca arriba a
            la derecha. */}
        <button onClick={() => nav('/config')} aria-label="Configuración" style={{
          width: 42, height: 42, borderRadius: '50%', marginRight: 8,
          display: 'grid', placeItems: 'center',
          background: 'var(--film-2)', color: 'var(--muted)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19.4 12.9a7.8 7.8 0 0 0 0-1.8l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.2a.5.5 0 0 0-.6-.2l-2.3.9a7.4 7.4 0 0 0-1.6-.9l-.4-2.4a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.4a7.4 7.4 0 0 0-1.6.9l-2.3-.9a.5.5 0 0 0-.6.2L1.1 8.9a.5.5 0 0 0 .1.6l2 1.6a7.8 7.8 0 0 0 0 1.8l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.2a.5.5 0 0 0 .6.2l2.3-.9c.5.4 1 .7 1.6.9l.4 2.4a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.4-2.4c.6-.2 1.1-.5 1.6-.9l2.3.9a.5.5 0 0 0 .6-.2l1.9-3.2a.5.5 0 0 0-.1-.6l-2-1.6ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
          </svg>
        </button>

        {/* Salir arriba a la derecha, con su color: es una acción de sesión,
            no una opción más de la lista. */}
        <button onClick={() => setConfirm('out')} aria-label="Cerrar sesión" style={{
          width: 42, height: 42, borderRadius: '50%',
          background: 'rgba(255,122,102,.13)', color: 'var(--danger)',
        }}>⇥</button>
      </div>

      <span className="lbl pill" style={{
        display: 'inline-block', marginTop: 18, padding: '8px 12px', fontSize: 'var(--t-2)',
        background: isModerator(user) ? 'var(--amber-soft)' : 'var(--film-2)',
        color: isModerator(user) ? 'var(--amber)' : 'var(--muted)',
      }}>
        {user.role === 'admin' ? 'Admin' : user.role === 'moderator' ? 'Moderador' : 'Usuario'}
      </span>

      <SectionLabel>Lo tuyo</SectionLabel>
      {/* Cada cuadrado abre SU lista, no una pantalla común con todo apilado.
          Con una sola vista compartida, tocar "Fotos" te dejaba arriba de
          todo y había que scrollear los precios para llegar a las fotos —el
          número que tocaste no era el que te recibía.

          "Birras" es de otra naturaleza que los otros tres: no es un aporte a
          la comunidad, es tu cuenta personal. Va en la misma grilla porque es
          donde uno la busca, y se distingue por el corazón del contador, no
          por estar en otro lado. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
      }} data-tour="profile-stats">
        <Stat label="Precios" value={stats?.prices} onClick={() => nav('/mis-aportes/precios')} />
        <Stat label="Fotos" value={stats?.photos} onClick={() => nav('/mis-aportes/fotos')} />
        <Stat label="Bares" value={stats?.bars} onClick={() => nav('/mis-aportes/bares')} />
        <Stat label="Birras tomadas" value={beers ?? undefined}
          onClick={() => nav('/mis-birras')} />
      </div>

      <div style={{ marginTop: 28, display: 'grid', gap: 12 }}>
        {/* El contador va acá y no sólo adentro de Moderación: si hay que
            entrar para enterarse de que hay algo que hacer, nadie entra. */}
        {isModerator(user) && (
          <Row label="Moderación" badge={pendingWork} onClick={() => nav('/moderacion')} />
        )}
        {/* Los comentarios no tienen cuadrado: `UserStats` no los cuenta y
            pedir la lista entera para dibujar un número sería traerse todos
            los aportes de la persona cada vez que abre el perfil. */}
        <Row label="Mis comentarios" onClick={() => nav('/mis-aportes/comentarios')} />
        <Row label="Cómo funcionan los precios" onClick={() => nav('/info')} />
        {/* Se puede volver a ver. Un tutorial que se saltea de un toque y no
            se puede recuperar castiga el toque apurado. */}
        {user && (
          <Row
            label={tourPending(user.id) ? 'Ver el tutorial' : 'Ver el tutorial de nuevo'}
            onClick={() => { resetTour(user.id); nav('/') }}
          />
        )}
      </div>

      <Footer />

      {confirm === 'out' && (
        <Confirm
          title="¿Cerrar sesión?"
          body="Vas a poder seguir mirando el mapa, pero no cargar precios hasta que vuelvas a entrar."
          confirmLabel="Cerrar sesión" danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => { setConfirm(null); await api.signOut(); onSession() }}
        />
      )}
    </Wrap>
  )
}

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    position: 'absolute', inset: 0, overflowY: 'auto',
    padding: `calc(28px + var(--safe-top)) 22px calc(108px + var(--nav-gap))`,
  }}><div className="desk-narrow">{children}</div></div>
)

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h2 className="lbl" style={{
    fontSize: 'var(--t-1)', letterSpacing: '.12em', color: 'var(--faint)', margin: '26px 0 12px',
  }}>{String(children).toUpperCase()}</h2>
)

const Stat = ({ label, value, onClick }: {
  label: string; value?: number; onClick: () => void
}) => (
  <button onClick={onClick} style={{
    flex: 1, padding: '14px 0', borderRadius: 'var(--r-3)', textAlign: 'center',
    background: 'var(--film-1)',
  }}>
    <div className="num" style={{
      fontSize: 'var(--t-5)', color: (value ?? 0) > 0 ? 'var(--amber)' : 'var(--faint)',
    }}>{value ?? '—'}</div>
    <div style={{ fontSize: 'var(--t-1)', color: 'var(--faint)', marginTop: 3 }}>{label}</div>
  </button>
)

const Row = ({ label, onClick, danger, badge }: {
  label: string; onClick: () => void; danger?: boolean; badge?: number
}) => (
  <button onClick={onClick} className="lbl" style={{
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', padding: '16px 16px', borderRadius: 'var(--r-3)', textAlign: 'left',
    background: 'var(--film-2)', color: danger ? 'var(--danger)' : 'var(--cream)',
  }}>
    <span style={{ flex: 1 }}>{label}</span>
    {badge != null && badge > 0 && (
      <span className="num" style={{
        minWidth: 22, height: 22, padding: '0 7px', borderRadius: 999,
        display: 'grid', placeItems: 'center', fontSize: 'var(--t-2)',
        background: 'var(--amber)', color: 'var(--base)',
      }}>{badge}</span>
    )}
  </button>
)

const Footer = () => (
  <div style={{ marginTop: 34 }}>
    <p style={{ color: 'var(--faint)', fontSize: 'var(--t-1)', lineHeight: 1.5, margin: 0 }}>
      birrapp {__APP_VERSION__}<br />
      datos de bares © colaboradores de OpenStreetMap
    </p>
    {/* Sin cuenta el enlace no aparece en la lista de acciones, pero la
        actualización tiene que estar igual: alguien puede quedar trabado en
        una versión vieja antes de siquiera loguearse. */}
    <button onClick={forceUpdate} style={{
      color: 'var(--muted)', fontSize: 'var(--t-1)', marginTop: 10, textDecoration: 'underline',
    }}>Buscar actualización</button>
  </div>
)

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"/>
    </svg>
  )
}
