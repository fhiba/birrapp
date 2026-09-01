import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { User, UserStats } from '../data/types'
import { isModerator } from '../data/types'
import { Confirm } from '../ui/Chrome'
import { forceUpdate } from '../data/update'

export function ProfileScreen({ user, onSession }: {
  user: User | null
  onSession: () => void
}) {
  const nav = useNavigate()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'out' | 'delete' | null>(null)

  useEffect(() => {
    if (user) api.myStats().then(setStats).catch(() => {})
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
      <h1 className="ttl" style={{ fontSize: 30, margin: 0 }}>birrapp</h1>
      <p style={{ color: 'var(--muted)', margin: '10px 0 26px' }}>
        Para cargar precios hace falta una cuenta. Mirar el mapa no.
      </p>
      <button onClick={login} disabled={busy} className="lbl" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
        width: '100%', padding: 15, borderRadius: 14,
        background: 'var(--cream)', color: 'var(--base)', fontSize: 15,
      }}>
        {busy ? <span className="spinner" /> : <><GoogleG /> Continuar con Google</>}
      </button>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 16 }}>{error}</p>}
      <Footer />
    </Wrap>
  )

  return (
    <Wrap>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <h1 className="ttl" style={{ fontSize: 28, margin: 0 }}>{user.displayName}</h1>
          <p style={{ color: 'var(--faint)', fontSize: 13, margin: '4px 0 0' }}>{user.email}</p>
        </div>
        {/* Salir arriba a la derecha, con su color: es una acción de sesión,
            no una opción más de la lista. */}
        <button onClick={() => setConfirm('out')} aria-label="Cerrar sesión" style={{
          width: 42, height: 42, borderRadius: '50%',
          background: 'rgba(255,122,102,.13)', color: 'var(--danger)',
        }}>⇥</button>
      </div>

      <span className="lbl pill" style={{
        display: 'inline-block', marginTop: 14, padding: '6px 12px', fontSize: 12,
        background: isModerator(user) ? 'var(--amber-soft)' : 'rgba(255,255,255,.07)',
        color: isModerator(user) ? 'var(--amber)' : 'var(--muted)',
      }}>
        {user.role === 'admin' ? 'Admin' : user.role === 'moderator' ? 'Moderador' : 'Usuario'}
      </span>

      <SectionLabel>Tu aporte</SectionLabel>
      <div style={{ display: 'flex', gap: 10 }}>
        <Stat label="Precios" value={stats?.prices} />
        <Stat label="Confirmados" value={stats?.confirmations} />
        <Stat label="Bares" value={stats?.bars} />
      </div>

      <div style={{ marginTop: 28, display: 'grid', gap: 10 }}>
        {isModerator(user) && <Row label="Moderación" onClick={() => nav('/moderacion')} />}
        <Row label="Cómo funcionan los precios" onClick={() => nav('/info')} />
        <Row label="Buscar actualización" onClick={forceUpdate} />
      </div>

      <SectionLabel>Cuenta</SectionLabel>
      <Row label="Borrar mi cuenta" danger onClick={() => setConfirm('delete')} />

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
      {confirm === 'delete' && (
        <Confirm
          title="¿Borrar tu cuenta?"
          body={<>
            Se borra tu cuenta, tus reseñas y tu sesión. No se puede deshacer.
            <br /><br />
            Los precios que cargaste quedan en el mapa, pero sin tu nombre: son
            datos sobre bares, no sobre vos, y borrarlos dejaría peor informado
            a todo el mundo.
          </>}
          confirmLabel="Borrar cuenta" danger requireWord="BORRAR"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setConfirm(null)
            try { await api.deleteAccount(); onSession(); nav('/') }
            catch (e) { setError((e as Error).message) }
          }}
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
    fontSize: 10, letterSpacing: '.12em', color: 'var(--faint)', margin: '26px 0 12px',
  }}>{String(children).toUpperCase()}</h2>
)

const Stat = ({ label, value }: { label: string; value?: number }) => (
  <div style={{
    flex: 1, padding: '14px 0', borderRadius: 14, textAlign: 'center',
    background: 'rgba(255,255,255,.05)',
  }}>
    <div className="num" style={{
      fontSize: 19, color: (value ?? 0) > 0 ? 'var(--amber)' : 'var(--faint)',
    }}>{value ?? '—'}</div>
    <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 3 }}>{label}</div>
  </div>
)

const Row = ({ label, onClick, danger }: {
  label: string; onClick: () => void; danger?: boolean
}) => (
  <button onClick={onClick} className="lbl" style={{
    width: '100%', padding: '15px 18px', borderRadius: 14, textAlign: 'left',
    background: 'rgba(255,255,255,.06)', color: danger ? 'var(--danger)' : 'var(--cream)',
  }}>{label}</button>
)

const Footer = () => (
  <div style={{ marginTop: 34 }}>
    <p style={{ color: 'var(--faint)', fontSize: 11, lineHeight: 1.5, margin: 0 }}>
      birrapp {__APP_VERSION__}<br />
      datos de bares © colaboradores de OpenStreetMap
    </p>
    {/* Sin cuenta el enlace no aparece en la lista de acciones, pero la
        actualización tiene que estar igual: alguien puede quedar trabado en
        una versión vieja antes de siquiera loguearse. */}
    <button onClick={forceUpdate} style={{
      color: 'var(--muted)', fontSize: 11, marginTop: 10, textDecoration: 'underline',
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
