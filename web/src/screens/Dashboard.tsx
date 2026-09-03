import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import { HBars, KIND_COLORS, Legend, LineChart, StackedBars } from '../ui/charts/Chart'
import type { DashboardAnalytics, DashboardSummary, DashboardUser } from '../data/types'

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
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<'nuevos' | 'aportes'>('nuevos')

  const load = useCallback(async () => {
    setError(null)
    try {
      const [s, u, a] = await Promise.all([
        api.dashboardSummary(), api.dashboardUsers(), api.dashboardAnalytics(),
      ])
      setSummary(s); setUsers(u); setAnalytics(a)
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
      <div className="desk-wide">
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

        {analytics && <Charts a={analytics} />}

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

/**
 * Los cinco gráficos.
 *
 * En mobile queda sólo el pulso: en un teléfono el dashboard tiene que
 * contestar rápido, no ser un tablero. El resto va detrás de `.desk-only`.
 */
function Charts({ a }: { a: DashboardAnalytics }) {
  const pulseSeries = [
    { label: 'precios',  color: KIND_COLORS.prices,        points: a.pulse.map(d => d.prices) },
    { label: 'confirm.', color: KIND_COLORS.confirmations, points: a.pulse.map(d => d.confirmations) },
    { label: 'bares',    color: KIND_COLORS.bars,          points: a.pulse.map(d => d.bars) },
    { label: 'fotos',    color: KIND_COLORS.photos,        points: a.pulse.map(d => d.photos) },
    { label: 'notas',    color: KIND_COLORS.ratings,       points: a.pulse.map(d => d.ratings) },
  ]
  const pulseX = a.pulse.map(d => d.day)

  // Los que entran sin sesión van en gris y los que la tienen en ámbar: la
  // brecha entre las dos líneas es lo que el gráfico viene a mostrar.
  const trafficSeries = [
    { label: 'sin sesión', color: '#8A7B6D', points: a.traffic.map(d => d.anon) },
    { label: 'con sesión', color: '#FFB627', points: a.traffic.map(d => d.authed) },
  ]

  const coverPct = a.coverage.map(d => d.bars === 0 ? 0 : (d.covered / d.bars) * 100)
  const f = a.funnel

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: 14, padding: '20px 18px 0',
    }}>
      <Card title="Aportes por día" hint="últimos 30 días">
        <StackedBars x={pulseX} series={pulseSeries} />
        <Legend series={pulseSeries} />
      </Card>

      <Card title="Altas contra aportantes" hint="por semana · 12 semanas" deskOnly>
        <LineChart
          x={a.weekly.map(w => w.week)}
          series={[
            { label: 'se anotaron', color: '#8A7B6D', points: a.weekly.map(w => w.signups) },
            { label: 'aportaron',   color: '#FFB627', points: a.weekly.map(w => w.contributors) },
          ]}
        />
        <Legend series={[
          { label: 'se anotaron', color: '#8A7B6D', points: [] },
          { label: 'aportaron',   color: '#FFB627', points: [] },
        ]} />
      </Card>

      <Card title="Cobertura del mapa" hint="% con precio no vencido · 90 días" deskOnly>
        <LineChart
          x={a.coverage.map(d => d.day)} fill
          format={n => `${Math.round(n)}%`}
          series={[{ label: 'cobertura', color: '#6BC4A6', points: coverPct }]}
        />
      </Card>

      <Card title="Quién entra" hint="visitantes por día · 30 días" deskOnly>
        <LineChart
          x={a.traffic.map(d => d.day)}
          series={trafficSeries}
        />
        <Legend series={trafficSeries} />
      </Card>

      <Card
        title="Quiénes sostienen esto"
        hint={`el top 5 concentra el ${Math.round(a.top5Share * 100)}% de los aportes`}
        deskOnly
      >
        <HBars rows={a.topContributors.map(t => ({
          label: t.displayName, value: t.score, hint: String(t.score),
        }))} />
      </Card>

      {/* El escalón de visitantes sólo mide la PWA: la app de Android no manda
          el beacon. Va dicho en el hint para que nadie lea el número como si
          fuera todo el tráfico. */}
      <Card title="Activación" hint="dónde se cae la gente · visitantes sólo de la web" deskOnly>
        <HBars rows={[
          { label: 'visitantes',     value: f.visitors30 },
          { label: 'cuentas',        value: f.accounts },
          { label: 'aportó alguna',  value: f.everContributed },
          { label: 'aportó 5 o más', value: f.fiveOrMore },
          { label: 'activo · 30 d',  value: f.activeMonth },
        ]} />
      </Card>
    </div>
  )
}

function Card({ title, hint, deskOnly, children }: {
  title: string; hint?: string; deskOnly?: boolean; children: ReactNode
}) {
  return (
    <div className={deskOnly ? 'desk-only' : undefined} style={{
      padding: 14, borderRadius: 14, background: 'rgba(255,255,255,.04)',
    }}>
      <div className="lbl" style={{ fontSize: 12.5 }}>{title}</div>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--faint)', margin: '2px 0 10px' }}>{hint}</div>
      )}
      {children}
    </div>
  )
}
