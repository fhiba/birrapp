import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import { HBars, KIND_COLORS, Legend, LineChart, StackedBars } from '../ui/charts/Chart'
import { Segmented } from '../ui/Segmented'
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
      const [s, u] = await Promise.all([api.dashboardSummary(), api.dashboardUsers()])
      setSummary(s); setUsers(u)
    } catch (e) { setError((e as Error).message) }
    // Las analíticas van aparte: Vercel publica la web sola y el backend se
    // sube a mano, así que el endpoint nuevo puede tirar 404 mientras el resto
    // anda. Su fallo deja `analytics` en null —el render ya lo contempla— y no
    // pisa el error que muestran las otras dos consultas.
    try {
      setAnalytics(await api.dashboardAnalytics())
    } catch { /* sin gráficos y listo */ }
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
          <button onClick={() => nav(-1)} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: '16px 0 0' }}>Dashboard</h1>
          {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>}
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
              color: 'var(--faint)', fontSize: 'var(--t-2)', lineHeight: 1.5, padding: '12px 18px 0',
            }}>
              {summary.bars > 0 && (
                <>Cobertura: {Math.round(summary.barsWithFreshPrice / summary.bars * 100)}%
                {' '}de los bares tiene al menos un precio no vencido.</>
              )}
            </p>
          </>
        )}

        {analytics && <Charts a={analytics} />}

        {/* Texto con subrayado, no dos cápsulas rellenas. Es la misma forma
            que usan el orden de la lista y la barra de pestañas: un solo
            vocabulario para "elegiste esto". Y de paso deja de usarse una
            cápsula hueso, que en heritage pesa lo mismo que un CTA. */}
        <div style={{ padding: 'var(--s-5) var(--s-4) var(--s-1)' }}>
          <Segmented
            options={[
              { value: 'nuevos', label: 'Más nuevos' },
              { value: 'aportes', label: 'Más aportes' },
            ]}
            value={sort}
            onChange={setSort}
            label={o => `Ordenar por ${o.label.toLowerCase()}`}
          />
        </div>

        {shown?.length === 0 && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 48 }}>
            Todavía no hay nadie registrado.
          </p>
        )}

        {shown?.map(u => <UserRow key={u.id} u={u} />)}
      </div>
    </div>
  )
}

/**
 * Una métrica del encabezado.
 *
 * Las dos que contestan la pregunta de la pantalla —cuánta gente se anota y
 * cuánta de esa aporta— se marcan con el borde y la etiqueta informativos, no
 * con un fondo y un número de otro color. En heritage el acento es hueso, o
 * sea el mismo tono del texto: `accent` pintaba el número del color que ya
 * tenía y el relleno no distinguía nada. El borde sí, y no le roba brillo al
 * número, que es lo que hay que leer.
 */
function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div style={{
      padding: 'var(--s-3)', borderRadius: 'var(--r-3)',
      background: 'var(--raised)',
      border: `1px solid ${accent ? 'var(--info-border)' : 'var(--hairline)'}`,
    }}>
      <div className="num" style={{
        fontSize: 'var(--t-7)', lineHeight: 1.1, color: 'var(--cream)',
      }}>{n}</div>
      <div style={{
        fontSize: 'var(--t-1)', color: accent ? 'var(--info)' : 'var(--faint)',
        marginTop: 'var(--s-1)', whiteSpace: 'pre-line',
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
      padding: 'var(--s-3) var(--s-4)', borderBottom: '1px solid var(--hairline)',
      opacity: u.banned ? 0.45 : 1,
    }}>
      {u.avatarUrl
        ? <img src={u.avatarUrl} alt="" loading="lazy" style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          }} />
        : <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: 'var(--elevated)', color: 'var(--muted)', fontSize: 'var(--t-4)',
          }}>{u.displayName.slice(0, 1).toUpperCase()}</div>}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="lbl" style={{ fontSize: 'var(--t-4)' }}>{u.displayName}</span>
          {/* El rol es información sobre la cuenta, no un logro: va en el tono
              informativo y no en el acento, que acá es hueso y hacía que la
              etiqueta pesara igual que el nombre. */}
          {u.role !== 'user' && (
            <span className="lbl" style={{
              fontSize: 'var(--t-1)', letterSpacing: '.08em', padding: '2px 8px', borderRadius: 999,
              background: 'var(--info-soft)', color: 'var(--info-bright)',
            }}>{u.role.toUpperCase()}</span>
          )}
          {u.banned && (
            <span className="lbl" style={{ fontSize: 'var(--t-1)', color: 'var(--danger)' }}>
              BLOQUEADO
            </span>
          )}
        </div>
        <div style={{
          fontSize: 'var(--t-2)', color: 'var(--faint)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {u.email} · se anotó {age}
        </div>

        {/* Los aportes desglosados. Un solo total escondería la diferencia
            entre alguien que releva precios nuevos y alguien que sólo
            confirma, que es justo lo que hay que poder distinguir. */}
        {total > 0 ? (
          <div style={{
            display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4,
            fontSize: 'var(--t-2)', color: 'var(--muted)',
          }}>
            {u.prices > 0 && <Chip n={u.prices} what="precios" />}
            {u.confirmations > 0 && <Chip n={u.confirmations} what="confirm." />}
            {u.bars > 0 && <Chip n={u.bars} what="bares" />}
            {u.photos > 0 && <Chip n={u.photos} what="fotos" />}
            {u.ratings > 0 && <Chip n={u.ratings} what="notas" />}
          </div>
        ) : (
          <div style={{ fontSize: 'var(--t-2)', color: 'var(--faint)', marginTop: 4 }}>
            Sin aportes todavía
          </div>
        )}
      </div>

      {u.lastActiveDays != null && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 'var(--t-1)', color: 'var(--faint)' }}>último</div>
          <div className="num" style={{ fontSize: 'var(--t-3)', color: 'var(--muted)' }}>
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
 * Los gráficos.
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

  /*
   * Las dos líneas: el contexto apagado y lo que importa prendido. La brecha
   * entre ellas es lo que el gráfico viene a mostrar, y para verla alcanza con
   * que una de las dos mande.
   *
   * Antes eran gris y ámbar, y el ámbar era legítimo: un color de serie, el
   * mismo `#FFB627` de `--aging` y de `PRICE_STOPS`, que por eso no pasó a
   * `--acento` con la paleta Hueso. En heritage ese tono dejó de servir acá,
   * porque sobre espresso significa "precio a medio vencer" y este gráfico
   * habla de gente, no de precios. El lugar de "esto es lo que hay que mirar"
   * lo ocupa `--fresh`, que además es el tono de más contraste de la rampa.
   */
  const trafficSeries = [
    { label: 'sin sesión', color: 'var(--faint)', points: a.traffic.map(d => d.anon) },
    { label: 'con sesión', color: 'var(--fresh)', points: a.traffic.map(d => d.authed) },
  ]

  // Mismo criterio que arriba, y armada una sola vez: estaba escrita dos
  // veces —una para el gráfico y otra para la leyenda— que es exactamente
  // donde dos colores que tienen que ser el mismo se terminan separando.
  const altasSeries = [
    { label: 'se anotaron', color: 'var(--faint)', points: a.weekly.map(w => w.signups) },
    { label: 'aportaron',   color: 'var(--fresh)', points: a.weekly.map(w => w.contributors) },
  ]

  const coverPct = a.coverage.map(d => d.bars === 0 ? 0 : (d.covered / d.bars) * 100)

  // El ranking de aportantes: el primero en `--fresh` y el resto en el
  // `--info` que pone HBars. Una barra sola no necesita destacarse de nadie;
  // en una lista ordenada, quién va primero es medio gráfico.
  const topeAportes = Math.max(0, ...a.topContributors.map(t => t.score))
  const f = a.funnel

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: 16, padding: '20px 18px 0',
    }}>
      <Card title="Aportes por día" hint="últimos 30 días">
        <StackedBars x={pulseX} series={pulseSeries} />
        <Legend series={pulseSeries} />
      </Card>

      <Card title="Altas contra aportantes" hint="por semana · 12 semanas" deskOnly>
        <LineChart
          x={a.weekly.map(w => w.week)}
          series={altasSeries}
        />
        <Legend series={altasSeries} />
      </Card>

      <Card title="Cobertura del mapa" hint="% con precio no vencido · 90 días" deskOnly>
        <LineChart
          x={a.coverage.map(d => d.day)} fill
          format={n => `${Math.round(n)}%`}
          series={[{ label: 'cobertura', color: 'var(--info)', points: coverPct }]}
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
          color: t.score === topeAportes ? 'var(--fresh)' : undefined,
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
      padding: 'var(--s-4)', borderRadius: 'var(--r-3)',
      background: 'var(--raised)', border: '1px solid var(--hairline)',
    }}>
      {/* El título del gráfico es una etiqueta de sección, la misma de toda la
          app. El margen se anula acá porque la clase trae el aire de cuando
          separa zonas de una pantalla larga, y adentro de una tarjeta el aire
          ya lo pone el padding. */}
      <div className="section-label" style={{ margin: 0 }}>{title.toUpperCase()}</div>
      {hint && (
        <div style={{
          fontSize: 'var(--t-1)', color: 'var(--faint)', margin: 'var(--s-1) 0 var(--s-3)',
        }}>{hint}</div>
      )}
      {children}
    </div>
  )
}
