import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { BarPin, Flag } from '../data/types'

export function ModerationScreen({ onChanged }: { onChanged: () => void }) {
  const nav = useNavigate()
  const [pending, setPending] = useState<BarPin[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [p, f] = await Promise.all([api.pendingBars(), api.openFlags()])
      setPending(p); setFlags(f)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); onChanged(); await load() }
    catch (e) { setError((e as Error).message) }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 0 60px`,
    }}>
      <div style={{ padding: '0 18px' }}>
        <button onClick={() => nav(-1)} style={{
          width: 38, height: 38, borderRadius: '50%', background: 'var(--elevated)',
        }} aria-label="Volver">←</button>
        <h1 className="ttl" style={{ fontSize: 26, margin: '18px 0 0' }}>Moderación</h1>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      </div>

      {loading && <div className="spinner" style={{ margin: '30px auto' }} />}

      {!loading && pending.length === 0 && flags.length === 0 && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>
          Nada pendiente. Todo en orden.
        </p>
      )}

      {pending.length > 0 && <H>Bares pendientes</H>}
      {pending.map(b => (
        <div key={b.id} style={{ padding: '10px 18px', borderBottom: '1px solid var(--hairline)' }}>
          <div className="lbl">{b.name}</div>
          <div style={{ color: 'var(--faint)', fontSize: 11 }}>
            {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Btn primary onClick={() => act(() => api.approveBar(b.id))}>Aprobar</Btn>
            <Btn onClick={() => act(() => api.rejectBar(b.id))}>Rechazar</Btn>
            <Btn danger onClick={() => act(() => api.deleteBar(b.id))}>Eliminar</Btn>
          </div>
        </div>
      ))}

      {flags.length > 0 && <H>Denuncias abiertas</H>}
      {flags.map(f => (
        <div key={f.id} style={{ padding: '10px 18px', borderBottom: '1px solid var(--hairline)' }}>
          <div className="lbl" style={{ fontSize: 14 }}>{f.targetType} #{f.targetId}</div>
          <div style={{ fontSize: 13 }}>{f.reason}</div>
          {f.targetSummary && (
            <div style={{ color: 'var(--faint)', fontSize: 12 }}>→ {f.targetSummary}</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {f.targetType === 'price' ? (
              <>
                <Btn primary onClick={() => act(async () => {
                  await api.approvePrice(f.targetId); await api.resolveFlag(f.id)
                })}>Publicar</Btn>
                <Btn onClick={() => act(async () => {
                  await api.removePrice(f.targetId); await api.resolveFlag(f.id)
                })}>Descartar</Btn>
              </>
            ) : (
              <Btn primary onClick={() => act(() => api.resolveFlag(f.id))}>Resolver</Btn>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="lbl" style={{
    fontSize: 10, letterSpacing: '.12em', color: 'var(--faint)', padding: '22px 18px 8px', margin: 0,
  }}>{String(children).toUpperCase()}</h2>
)

const Btn = ({ children, onClick, primary, danger }: {
  children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean
}) => (
  <button onClick={onClick} className="lbl" style={{
    padding: '9px 15px', borderRadius: 11, fontSize: 13,
    background: primary ? 'var(--amber)' : danger ? 'rgba(255,122,102,.14)' : 'rgba(255,255,255,.07)',
    color: primary ? 'var(--base)' : danger ? 'var(--danger)' : 'var(--cream)',
  }}>{children}</button>
)
