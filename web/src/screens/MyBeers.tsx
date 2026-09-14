import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { Badge, BeerSummary } from '../data/types'
import { Empty } from '../ui/Empty'
import { PintLoader } from '../ui/PintLoader'

/**
 * El calendario de birras (BIR-34).
 *
 * Muestra tres cosas y en este orden: cuántas llevás, cuándo las tomaste y
 * qué emblemas ganaste. El mes entero entra en una pantalla porque la
 * pregunta que se hace acá no es "¿qué tomé el 14?" sino "¿cómo vengo?".
 *
 * Los días salen del servidor ya resueltos en hora de Buenos Aires. Armar el
 * calendario con la zona del navegador haría que la misma birra caiga en dos
 * días distintos según dónde esté el teléfono, y las rachas se cortarían
 * solas al cruzar la medianoche.
 */
export function MyBeersScreen() {
  const nav = useNavigate()
  const [month, setMonth] = useState<string | undefined>()
  const [data, setData] = useState<BeerSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [day, setDay] = useState<string | null>(null)

  const load = () => {
    api.beerSummary(month).then(d => { setData(d); setError(null) })
      .catch(e => setError((e as Error).message))
  }
  useEffect(load, [month])

  const remove = async (id: number) => {
    await api.removeBeerLog(id).catch(() => {})
    load()
  }

  if (error) return (
    <Wrap onBack={() => nav(-1)}>
      <Empty
        title="No pudimos traer tus birras"
        hint={error}
        action="Reintentar"
        onAction={load}
      />
    </Wrap>
  )
  if (!data) return <PintLoader message="Contando…" />

  const byDay = new Map(data.days.map(d => [d.day, d.qty]))
  const top = Math.max(1, ...data.days.map(d => d.qty))
  const delDia = day ? data.logs.filter(l => l.day === day) : []

  return (
    <Wrap onBack={() => nav(-1)}>
      <h1 className="ttl" style={{ fontSize: 28, margin: '0 0 18px' }}>Mis birras</h1>

      {/* Sin una sola birra anotada, el calendario vacío y seis emblemas en
          cero no dicen nada: lo que hace falta es contar para qué sirve esto
          y dónde se anota la primera. */}
      {data.total === 0 && (
        <Empty
          title="Anotá tu primera birra"
          hint="Desde el “+” del mapa, en “Me tomé una birra”. Se anota de un toque: el bar donde estás viene puesto y el resto es opcional."
          action="Ir al mapa"
          onAction={() => nav('/')}
        />
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <Big value={data.total} label={data.total === 1 ? 'birra' : 'birras'} />
        <Big value={data.currentStreak} label="días seguidos"
          hint={data.bestStreak > data.currentStreak ? `tu récord: ${data.bestStreak}` : undefined} />
        <Big value={data.distinctBars} label={data.distinctBars === 1 ? 'bar' : 'bares'} />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, margin: '26px 0 10px',
      }}>
        <Arrow dir="‹" label="Mes anterior" onClick={() => setMonth(shift(data.month, -1))} />
        <span className="lbl" style={{ flex: 1, textAlign: 'center', fontSize: 14 }}>
          {monthLabel(data.month)}
          <span style={{ color: 'var(--faint)' }}>
            {' · '}{data.monthTotal}
          </span>
        </span>
        {/* No se puede ir al futuro: un mes que todavía no pasó siempre va a
            estar vacío y el botón sólo sirve para perderse. */}
        <Arrow dir="›" label="Mes siguiente" onClick={() => setMonth(shift(data.month, 1))}
          disabled={data.month >= thisMonth()} />
      </div>

      <Calendar
        month={data.month} byDay={byDay} top={top}
        selected={day} onSelect={d => setDay(d === day ? null : d)}
      />

      {day && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>{dayLabel(day)}</SectionLabel>
          {delDia.length === 0 && (
            <p style={{ color: 'var(--faint)', fontSize: 13 }}>Ese día no anotaste nada.</p>
          )}
          {delDia.map(l => (
            <div key={l.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 2px',
              borderBottom: '1px solid var(--hairline)',
            }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="lbl" style={{ fontSize: 14 }}>
                  {l.qty > 1 ? `${l.qty} · ` : ''}
                  {[l.styleName, l.brandName].filter(Boolean).join(' · ') || 'Una birra'}
                </span>
                {l.barName && (
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--faint)' }}>
                    en {l.barName}
                  </span>
                )}
              </span>
              <button onClick={() => remove(l.id)} aria-label="Borrar esta birra"
                className="icon-btn"
                style={{ color: 'var(--muted)', background: 'rgba(255,255,255,.06)', fontSize: 13 }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {data.topBars.length > 0 && (
        <>
          <SectionLabel>Tus bares</SectionLabel>
          {data.topBars.map(b => (
            <button key={b.barId} onClick={() => nav(`/bar/${b.barId}`)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '11px 2px', textAlign: 'left',
              borderBottom: '1px solid var(--hairline)',
            }}>
              <span className="lbl" style={{ flex: 1, fontSize: 14 }}>{b.barName}</span>
              <span className="num" style={{ fontSize: 15, color: 'var(--amber)' }}>{b.qty}</span>
            </button>
          ))}
        </>
      )}

      <SectionLabel>Emblemas</SectionLabel>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10,
      }}>
        {data.badges.map(b => <BadgeCard key={b.id} badge={b} />)}
      </div>

      <div style={{ height: 30 }} />
    </Wrap>
  )
}

/**
 * El mes, de lunes a domingo.
 *
 * Se dibujan todos los días, también los vacíos: un calendario con huecos
 * donde no tomaste nada se lee de un vistazo, y es la mitad de la gracia.
 */
function Calendar({ month, byDay, top, selected, onSelect }: {
  month: string
  byDay: Map<string, number>
  top: number
  selected: string | null
  onSelect: (day: string) => void
}) {
  const [y, m] = month.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  // getDay() da 0 para domingo; acá la semana empieza el lunes.
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const hoy = todayInBA()

  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 5,
      }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i} className="lbl" style={{
            textAlign: 'center', fontSize: 10, color: 'var(--faint)',
          }}>{d}</span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
        {Array.from({ length: offset }, (_, i) => <span key={`x${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${month}-${String(i + 1).padStart(2, '0')}`
          const qty = byDay.get(iso) ?? 0
          // La intensidad es relativa al mejor día del mes: en absoluto, un
          // mes tranquilo se ve todo apagado y no se distingue nada.
          const strength = qty === 0 ? 0 : 0.25 + 0.6 * (qty / top)
          return (
            <button
              key={iso} onClick={() => onSelect(iso)}
              aria-label={`${i + 1}: ${qty === 0 ? 'sin birras' : `${qty} birras`}`}
              className="num"
              style={{
                aspectRatio: '1', borderRadius: 9, fontSize: 12.5,
                display: 'grid', placeItems: 'center',
                background: qty > 0
                  ? `rgba(255,182,39,${strength})`
                  : 'rgba(255,255,255,.045)',
                color: qty > 0 ? 'var(--base)' : 'var(--faint)',
                outline: selected === iso ? '2px solid var(--cream)'
                  : iso === hoy ? '1px solid var(--muted)' : 'none',
                outlineOffset: -1,
              }}
            >{i + 1}</button>
          )
        })}
      </div>
    </>
  )
}

function BadgeCard({ badge }: { badge: Badge }) {
  const earned = badge.progress >= badge.target
  return (
    <div style={{
      padding: '12px 13px', borderRadius: 14,
      background: earned ? 'var(--amber-soft)' : 'rgba(255,255,255,.045)',
      border: `1px solid ${earned ? 'rgba(255,182,39,.35)' : 'transparent'}`,
    }}>
      <div className="lbl" style={{
        fontSize: 13.5, color: earned ? 'var(--amber)' : 'var(--muted)',
      }}>{badge.name}</div>
      <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 3, lineHeight: 1.4 }}>
        {badge.detail}
      </div>
      {/* Los que faltan muestran cuánto falta. Un emblema apagado sin número
          no dice si estás cerca o lejísimos, y ahí deja de motivar. */}
      {!earned && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            height: 4, borderRadius: 2, background: 'rgba(255,255,255,.08)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${(badge.progress / badge.target) * 100}%`, height: '100%',
              background: 'var(--amber-deep)',
            }} />
          </div>
          <div className="num" style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 4 }}>
            {badge.progress} / {badge.target}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- fechas ----------

/** Hoy en Buenos Aires, `YYYY-MM-DD`. La zona la fija el servidor; acá se espeja. */
function todayInBA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

const thisMonth = () => todayInBA().slice(0, 7)

function shift(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const monthLabel = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  const name = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long' })
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`
}

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
    .toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ---------- piezas ----------

function Wrap({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(var(--safe-top) + 12px) 18px calc(24px + var(--nav-gap))`,
    }}>
      <button onClick={onBack} className="icon-btn"
        style={{ background: 'var(--elevated)', marginBottom: 12 }}
        aria-label="Volver">←</button>
      {children}
    </div>
  )
}

function Big({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div style={{
      flex: 1, padding: '13px 12px', borderRadius: 15, background: 'var(--raised)',
    }}>
      <div className="num" style={{ fontSize: 26, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5 }}>{label}</div>
      {hint && (
        <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 2 }}>{hint}</div>
      )}
    </div>
  )
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h2 className="lbl" style={{
    fontSize: 10, letterSpacing: '.12em', color: 'var(--faint)', margin: '26px 0 8px',
  }}>{String(children).toUpperCase()}</h2>
)

function Arrow({ dir, label, onClick, disabled }: {
  dir: string; label: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} style={{
      width: 34, height: 34, borderRadius: '50%', background: 'var(--elevated)',
      color: disabled ? 'var(--faint)' : 'var(--cream)',
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}>{dir}</button>
  )
}
