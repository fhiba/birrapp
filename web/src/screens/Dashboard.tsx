import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { DashboardSummary, DashboardUser } from '../data/types'

/**
 * Quién se anotó y qué aportó.
 *
 * La pregunta que contesta no es "cuánta gente hay" sino "de la que se anotó,
 * cuánta hizo algo". En una app comunitaria esa es la métrica que decide si el
 * mapa se mantiene solo o hay que empujarlo a mano, y es la que se pierde de
 * vista mirando el total de usuarios, que sólo sube.
 *
 * Por eso cada persona se muestra con sus aportes al lado y no en una lista
 * aparte: un nombre suelto no dice nada.
 */
export function DashboardScreen() {
  const nav = useNavigate()
  const [users, setUsers] = useState<DashboardUser[] | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<'nuevos' | 'aportes'>('nuevos')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [s, u] = await Promise.all([api.dashboardSummary(), api.dashboardUsers()])
      setSummary(s); setUsers(u)
    } catch (e) { setError((e as Error).message) }
  }, [])

  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    if (!users) return null
    return sort === 'nuevos' ? users : [...users].sort((a, b) => b.score - a.score)
  }, [users, sort])

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 0 60px`,
    }}>
      <div className="desk-narrow">
        <div style={{ padding: '0 18px' }}>
          <button onClick={() => nav(-1)} style={{
            width: 38, height: 38, borderRadius: '50%', background: 'var(--elevated)',
          }} aria-label="Volver">←</button>
          <h1 className="ttl" style={{ fontSize: 26, margin: '18px 0 0' }}>Dashboard</h1>
          {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        </div>

        {!summary && !error && <div className="spinner" style={{ margin: '30px auto' }} />}

        {summary && (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
              gap: 8, padding: '18px 18px 0',
            }}>
              <Stat n={summary.usersWeek} label="cuentas · 7 d" accent />
              <Stat n={summary.usersMonth} label="cuentas · 30 d" />
              <Stat n={summary.users} label="cuentas en total" />
              <Stat n={summary.contributorsMonth} label="aportaron · 30 d" accent />
              <Stat n={summary.pricesWeek} label="precios · 7 d" />
              <Stat n={summary.barsWithFreshPrice} label={`bares con precio\nde ${summary.bars}`} />
            </div>

            {/* La cobertura del mapa en una línea: cuántos pines contestan
                hoy la pregunta que la app viene a contestar. Un bar sin precio
                fresco está en el mapa pero no sirve para nada. */}
            <p style={{
              color: 'var(--faint)', fontSize: 11.5, lineHeight: 1.5, padding: '12px 18px 0',
            }}>
              {summary.bars > 0 && (
                <>Cobertura: {Math.round(summary.barsWithFreshPrice / summary.bars * 100)}%
                {' '}de los bares tiene al menos un precio no vencido.</>
              )}
            </p>
          </>
        )}

        <div style={{ display: 'flex', gap: 7, padding: '20px 18px 4px' }}>
          {(['nuevos', 'aportes'] as const).map(k => (
            <button key={k} onClick={() => setSort(k)} className="lbl pill" style={{
              padding: '8px 14px', fontSize: 12.5,
              background: sort === k ? 'var(--cream)' : 'var(--elevated)',
              color: sort === k ? 'var(--base)' : 'var(--muted)',
            }}>{k === 'nuevos' ? 'Más nuevos' : 'Más aportes'}</button>
          ))}
        </div>

        {shown?.length === 0 && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>
            Todavía no hay nadie registrado.
          </p>
        )}

        {shown?.map(u => <UserRow key={u.id} u={u} />)}
      </div>
    </div>
  )
}

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div style={{
      padding: '12px 12px 10px', borderRadius: 14,
      background: accent ? 'var(--amber-soft)' : 'rgba(255,255,255,.05)',
    }}>
      <div className="num" style={{
        fontSize: 24, lineHeight: 1.1, color: accent ? 'var(--amber)' : 'var(--cream)',
      }}>{n}</div>
      <div style={{
        fontSize: 10.5, color: 'var(--faint)', marginTop: 3, whiteSpace: 'pre-line',
      }}>{label}</div>
    </div>
  )
}

function UserRow({ u }: { u: DashboardUser }) {
  const total = u.prices + u.confirmations + u.bars + u.photos + u.ratings
  const age = u.ageDays <= 0 ? 'hoy' : u.ageDays === 1 ? 'ayer' : `hace ${u.ageDays} d`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.06)',
      opacity: u.banned ? 0.45 : 1,
    }}>
      {u.avatarUrl
        ? <img src={u.avatarUrl} alt="" loading="lazy" style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          }} />
        : <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: 'var(--elevated)', color: 'var(--muted)', fontSize: 14,
          }}>{u.displayName.slice(0, 1).toUpperCase()}</div>}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className="lbl" style={{ fontSize: 14.5 }}>{u.displayName}</span>
          {u.role !== 'user' && (
            <span className="lbl" style={{
              fontSize: 9.5, letterSpacing: '.08em', padding: '2px 6px', borderRadius: 999,
              background: 'var(--amber-soft)', color: 'var(--amber)',
            }}>{u.role.toUpperCase()}</span>
          )}
          {u.banned && (
            <span className="lbl" style={{ fontSize: 10, color: 'var(--danger)' }}>
              BLOQUEADO
            </span>
          )}
        </div>
        <div style={{
          fontSize: 11.5, color: 'var(--faint)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {u.email} · se anotó {age}
        </div>

        {/* Los aportes desglosados. Un solo total escondería la diferencia
            entre alguien que releva precios nuevos y alguien que sólo
            confirma, que es justo lo que hay que poder distinguir. */}
        {total > 0 ? (
          <div style={{
            display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 5,
            fontSize: 11.5, color: 'var(--muted)',
          }}>
            {u.prices > 0 && <Chip n={u.prices} what="precios" />}
            {u.confirmations > 0 && <Chip n={u.confirmations} what="confirm." />}
            {u.bars > 0 && <Chip n={u.bars} what="bares" />}
            {u.photos > 0 && <Chip n={u.photos} what="fotos" />}
            {u.ratings > 0 && <Chip n={u.ratings} what="notas" />}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 5 }}>
            Sin aportes todavía
          </div>
        )}
      </div>

      {u.lastActiveDays != null && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--faint)' }}>último</div>
          <div className="num" style={{ fontSize: 13, color: 'var(--muted)' }}>
            {u.lastActiveDays <= 0 ? 'hoy' : `${u.lastActiveDays} d`}
          </div>
        </div>
      )}
    </div>
  )
}

const Chip = ({ n, what }: { n: number; what: string }) => (
  <span><span className="num" style={{ color: 'var(--cream)' }}>{n}</span> {what}</span>
)
