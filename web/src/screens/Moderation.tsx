import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { BarPin, BeerStyle, Brand, Flag } from '../data/types'

export function ModerationScreen({ onChanged }: { onChanged: () => void }) {
  const nav = useNavigate()
  const [pending, setPending] = useState<BarPin[]>([])
  const [flags, setFlags] = useState<Flag[]>([])
  const [newBrands, setNewBrands] = useState<Brand[]>([])
  const [newStyles, setNewStyles] = useState<BeerStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [p, f, b, st] = await Promise.all([
        api.pendingBars(), api.openFlags(), api.pendingBrands(), api.pendingStyles(),
      ])
      setPending(p); setFlags(f); setNewBrands(b); setNewStyles(st)
    } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); onChanged(); await load() }
    catch (e) { setError((e as Error).message) }
  }

  const total = pending.length + flags.length + newBrands.length + newStyles.length

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 0 60px`,
    }}>
      <div className="desk-narrow">
      <div style={{ padding: '0 18px' }}>
        <button onClick={() => nav(-1)} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 0' }}>
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: 0 }}>Moderación</h1>
          {!loading && total > 0 && (
            <span className="num" style={{
              minWidth: 24, height: 24, padding: '0 8px', borderRadius: 999,
              display: 'grid', placeItems: 'center', fontSize: 'var(--t-2)',
              background: 'var(--amber)', color: 'var(--base)',
            }}>{total}</span>
          )}
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>}

        {/* El dashboard vive detrás de moderación y no en el perfil: es la
            misma llave —hace falta el rol— y quien viene a moderar es quien
            quiere saber si la cuenta que cargó algo raro es de ayer. */}
        <button onClick={() => nav('/dashboard')} className="lbl" style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          marginTop: 14, padding: '12px 16px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
          background: 'var(--elevated)', color: 'var(--cream)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M3 13h4v8H3v-8Zm7-9h4v17h-4V4Zm7 5h4v12h-4V9Z" />
          </svg>
          <span style={{ flex: 1, textAlign: 'left' }}>Usuarios y aportes</span>
          <span style={{ color: 'var(--faint)' }}>›</span>
        </button>
      </div>

      {loading && <div className="spinner" style={{ margin: '30px auto' }} />}

      {!loading && pending.length === 0 && flags.length === 0
        && newBrands.length === 0 && newStyles.length === 0 && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 48 }}>
          Nada pendiente. Todo en orden.
        </p>
      )}

      {pending.length > 0 && <H>Bares pendientes · {pending.length}</H>}
      {pending.map(b => (
        <div key={b.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
          <div className="lbl">{b.name}</div>
          <div style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>
            {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Btn primary onClick={() => act(() => api.approveBar(b.id))}>Aprobar</Btn>
            <Btn onClick={() => act(() => api.rejectBar(b.id))}>Rechazar</Btn>
            <Btn danger onClick={() => act(() => api.deleteBar(b.id))}>Eliminar</Btn>
          </div>
        </div>
      ))}

      {/* Marcas nuevas.
          Van arriba de las denuncias porque son lo más barato de resolver y lo
          que más traba a quien las cargó: hasta que se apruebe, la marca la ve
          sólo esa persona. Aprobar es el caso normal —lo que falta en la lista
          es casi siempre una cervecería chica real—; rechazar es para
          duplicados y para nombres que no son una marca. */}
      {newBrands.length > 0 && <H>Marcas nuevas · {newBrands.length}</H>}
      {newBrands.map(b => (
        <div key={b.slug} style={{
          padding: '12px 16px', borderBottom: '1px solid var(--hairline)',
        }}>
          <div className="lbl">{b.name}</div>
          <div style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>
            {b.craft ? 'artesanal' : 'industrial'} · {b.slug}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Btn primary onClick={() => act(() => api.approveBrand(b.slug))}>Aprobar</Btn>
            <Btn onClick={() => act(() => api.rejectBrand(b.slug))}>Rechazar</Btn>
          </div>
        </div>
      ))}

      {/* Estilos nuevos (BIR-35). Mismo trato que las marcas y por lo mismo:
          hasta que se apruebe, el estilo lo ve sólo quien lo propuso.
          Rechazar no lo borra —puede haber precios colgando— sólo lo saca de
          la lista. */}
      {newStyles.length > 0 && <H>Estilos nuevos · {newStyles.length}</H>}
      {newStyles.map(st => (
        <div key={st.slug} style={{
          padding: '12px 16px', borderBottom: '1px solid var(--hairline)',
        }}>
          <div className="lbl">{st.name}</div>
          <div style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>{st.slug}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Btn primary onClick={() => act(() => api.approveStyle(st.slug))}>Aprobar</Btn>
            <Btn onClick={() => act(() => api.rejectStyle(st.slug))}>Rechazar</Btn>
          </div>
        </div>
      ))}

      {flags.length > 0 && <H>Denuncias abiertas · {flags.length}</H>}
      {flags.map(f => (
        <div key={f.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)' }}>
          <div className="lbl" style={{ fontSize: 'var(--t-4)' }}>{f.targetType} #{f.targetId}</div>
          <div style={{ fontSize: 'var(--t-3)' }}>{f.reason}</div>
          {f.targetSummary && (
            <div style={{ color: 'var(--faint)', fontSize: 'var(--t-2)' }}>→ {f.targetSummary}</div>
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
    </div>
  )
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="lbl" style={{
    fontSize: 'var(--t-1)', letterSpacing: '.12em', color: 'var(--faint)', padding: '24px 16px 8px', margin: 0,
  }}>{String(children).toUpperCase()}</h2>
)

const Btn = ({ children, onClick, primary, danger }: {
  children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean
}) => (
  <button onClick={onClick} className="lbl" style={{
    padding: '8px 16px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
    background: primary ? 'var(--amber)' : danger ? 'rgba(255,122,102,.14)' : 'var(--film-2)',
    color: primary ? 'var(--base)' : danger ? 'var(--danger)' : 'var(--cream)',
  }}>{children}</button>
)
