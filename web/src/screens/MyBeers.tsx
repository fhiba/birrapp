import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { Badge, BeerSummary } from '../data/types'
import { Empty } from '../ui/Empty'
import { PintLoader } from '../ui/PintLoader'
import { Screen, SectionLabel, Tile } from '../ui/Kit'

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
    <Screen onBack={() => nav(-1)}>
      <Empty
        title="No pudimos traer tus birras"
        hint={error}
        action="Reintentar"
        onAction={load}
      />
    </Screen>
  )
  if (!data) return <PintLoader message="Contando…" />

  const byDay = new Map(data.days.map(d => [d.day, d.qty]))
  const delDia = day ? data.logs.filter(l => l.day === day) : []

  return (
    <Screen title="Mis birras" onBack={() => nav(-1)}>

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

      {/*
        La salida a la tabla de la zona.

        Va acá arriba, pegada a los números propios, porque es la misma
        pregunta mirada de afuera: cuántas llevo y cómo me deja eso contra el
        resto. Al fondo de un calendario de treinta días nadie la encontraría.

        Lleva a "Cerca", que es donde vive la tabla: no hay pantalla propia
        porque la tabla depende de dónde estás parado, y una pantalla suelta
        tendría que volver a preguntar radio y ubicación para decir lo mismo.
      */}
      <button onClick={() => nav('/cerca')} className="lbl cta" style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-2)', width: '100%',
        minHeight: 46, marginBottom: 'var(--s-4)', padding: '0 var(--s-4)',
        borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
        background: 'var(--info-soft)', border: '1px solid var(--info-border)',
        color: 'var(--info-bright)', textAlign: 'left',
      }}>
        <span style={{ flex: 1 }}>Quién tomó más por tu zona</span>
        <span aria-hidden>›</span>
      </button>

      <div style={{ display: 'flex', gap: 12 }}>
        <Tile value={data.total} label={data.total === 1 ? 'birra' : 'birras'} />
        <Tile value={data.currentStreak} label="días seguidos"
          hint={data.bestStreak > data.currentStreak ? `tu récord: ${data.bestStreak}` : undefined} />
        <Tile value={data.distinctBars} label={data.distinctBars === 1 ? 'bar' : 'bares'} />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, margin: '24px 0 12px',
      }}>
        <Arrow dir="‹" label="Mes anterior" onClick={() => setMonth(shift(data.month, -1))} />
        <span className="lbl" style={{ flex: 1, textAlign: 'center', fontSize: 'var(--t-4)' }}>
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
        month={data.month} byDay={byDay}
        selected={day} onSelect={d => setDay(d === day ? null : d)}
      />

      {day && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>{dayLabel(day)}</SectionLabel>
          {delDia.length === 0 && (
            <p style={{ color: 'var(--faint)', fontSize: 'var(--t-3)' }}>Ese día no anotaste nada.</p>
          )}
          {delDia.map(l => (
            /* `.row` y no el mismo flex escrito a mano: es la fila con filete
               de la pizarra, definida una vez en `theme.css`. */
            <div key={l.id} className="row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="lbl" style={{ fontSize: 'var(--t-4)' }}>
                  {l.qty > 1 ? `${l.qty} · ` : ''}
                  {[l.styleName, l.brandName].filter(Boolean).join(' · ') || 'Una birra'}
                </span>
                {l.barName && (
                  /* Dónde fue es contexto, no adorno: va en el tono
                     informativo, que es el que lleva los metadatos de lugar en
                     toda la app. */
                  <span style={{ display: 'block', fontSize: 'var(--t-2)', color: 'var(--info)' }}>
                    en {l.barName}
                  </span>
                )}
              </span>
              <button onClick={() => remove(l.id)} aria-label="Borrar esta birra"
                className="icon-btn"
                style={{ color: 'var(--muted)', background: 'var(--film-2)', fontSize: 'var(--t-3)' }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {data.topBars.length > 0 && (
        <>
          <SectionLabel>Tus bares</SectionLabel>
          {data.topBars.map(b => (
            <button key={b.barId} onClick={() => nav(`/bar/${b.barId}`)}
              className="row row-hover" style={{ minHeight: 44 }}>
              <span className="lbl" style={{ flex: 1, fontSize: 'var(--t-4)' }}>{b.barName}</span>
              {/* El número a la derecha y tabular, como todo lo que se compara
                  con la fila de al lado. En `--cream` y no en el acento: en
                  heritage son el mismo hueso, y nombrarlo por lo que es —texto
                  destacado— evita que parezca un botón. */}
              <span className="num" style={{ fontSize: 'var(--t-4)', color: 'var(--cream)' }}>{b.qty}</span>
            </button>
          ))}
        </>
      )}

      <SectionLabel>Emblemas</SectionLabel>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 12,
      }}>
        {data.badges.map(b => <BadgeCard key={b.id} badge={b} />)}
      </div>

    </Screen>
  )
}

/**
 * Cuánto calor tiene un día (BIR-42).
 *
 * Los cortes son por cantidad absoluta y no por proporción del mejor día del
 * mes, que es como estaba antes. Con la proporción, un mes de dos birras
 * pintaba su mejor día tan fuerte como un mes de quince: el color decía "lo
 * más que tomaste en este mes" en vez de "cuánto tomaste", así que comparar
 * dos meses era imposible y el mapa de calor no mapeaba nada.
 *
 * Cinco niveles y no una rampa continua porque el ojo distingue escalones y
 * no distingue un 62% de opacidad de un 68%.
 */
function heatLevel(qty: number): 0 | 1 | 2 | 3 | 4 {
  if (qty <= 0) return 0
  if (qty === 1) return 1
  if (qty === 2) return 2
  if (qty <= 4) return 3
  return 4
}

/**
 * El mes, de lunes a domingo.
 *
 * Se dibujan todos los días, también los vacíos: un calendario con huecos
 * donde no tomaste nada se lee de un vistazo, y es la mitad de la gracia.
 */
function Calendar({ month, byDay, selected, onSelect }: {
  month: string
  byDay: Map<string, number>
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
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4,
      }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i} className="lbl" style={{
            textAlign: 'center', fontSize: 'var(--t-1)', color: 'var(--faint)',
          }}>{d}</span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {Array.from({ length: offset }, (_, i) => <span key={`x${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${month}-${String(i + 1).padStart(2, '0')}`
          const qty = byDay.get(iso) ?? 0
          const nivel = heatLevel(qty)
          /*
           * Los dos indicadores del día, y por qué no son un `outline`.
           *
           * 1. Van en `box-shadow: inset` y no en `outline`. El `outline`
           *    inline —que además traía un `'none'` para el resto de los días—
           *    le gana en la cascada al `:focus-visible` de `theme.css`, que no
           *    lleva `!important`: el mes entero quedaba sin anillo de foco y
           *    moverse con teclado por el calendario era moverse a ciegas. Con
           *    el `box-shadow` los dos conviven: el estado adentro, el foco
           *    afuera.
           *
           * 2. El color del anillo se da vuelta con el escalón del mapa de
           *    calor. Del 2 para arriba el fondo del día es claro —`heat-4` es
           *    Lime Cream— y un anillo hueso ahí da 1,05:1, o sea no existe.
           *    `--base` da 4,99 / 9,49 / 17,59 sobre `heat-2/3/4`, y es además
           *    el color con el que esos días ya escriben su número.
           *
           * "Hoy" y "elegido" siguen siendo dos cosas distintas —dónde estás
           * parado y qué estás mirando— pero la distinción la lleva el grosor,
           * que sobrevive a cualquier fondo, y no sólo el tono: sobre los días
           * oscuros el informativo se mantiene, sobre los claros no hay ningún
           * azul que llegue a 3:1 contra la lima.
           */
          const claro = nivel >= 2
          const anillo = selected === iso
            ? `inset 0 0 0 2px ${claro ? 'var(--base)' : 'var(--cream)'}`
            : iso === hoy
              ? `inset 0 0 0 1px ${claro ? 'var(--base)' : 'var(--info-bright)'}`
              : undefined
          return (
            <button
              key={iso} onClick={() => onSelect(iso)}
              aria-label={`${i + 1}: ${qty === 0 ? 'sin birras'
                : qty === 1 ? '1 birra' : `${qty} birras`}`}
              className={`num heat-${nivel}`}
              style={{
                aspectRatio: '1', borderRadius: 'var(--r-1)', fontSize: 'var(--t-2)',
                display: 'grid', placeItems: 'center',
                boxShadow: anillo,
              }}
            >{i + 1}</button>
          )
        })}
      </div>

      {/* La referencia. Un mapa de calor sin ella es decoración: el tono dice
          algo y no hay forma de saber qué. Va chica y a la derecha porque se
          consulta una vez y después no se vuelve a mirar.
          `aria-hidden`: cada día ya se anuncia con su cantidad en el
          `aria-label`, así que para un lector de pantalla esto es ruido. */}
      <div aria-hidden style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-1)',
        justifyContent: 'flex-end', marginTop: 'var(--s-2)',
        fontSize: 'var(--t-1)', color: 'var(--faint)',
      }}>
        <span style={{ marginRight: 2 }}>menos</span>
        {([0, 1, 2, 3, 4] as const).map(n => (
          <span key={n} className={`heat-${n}`} style={{
            width: 11, height: 11, borderRadius: 3,
          }} />
        ))}
        <span style={{ marginLeft: 2 }}>más</span>
      </div>
    </>
  )
}

/**
 * Un emblema, ganado o por ganar.
 *
 * Sigue siendo tarjeta —es una baldosa, de las pocas formas que la pizarra le
 * deja la tarjeta— pero el ganado deja de marcarse con el acento: en heritage
 * el acento es hueso, el mismo color del texto de al lado, así que el relleno
 * no distinguía nada. Se marca con el borde y el tono informativos, que es la
 * misma familia con la que se dibuja el progreso acá abajo.
 */
function BadgeCard({ badge }: { badge: Badge }) {
  const earned = badge.progress >= badge.target
  return (
    <div style={{
      padding: 'var(--s-3)', borderRadius: 'var(--r-3)',
      background: earned ? 'var(--info-soft)' : 'var(--film-1)',
      border: `1px solid ${earned ? 'var(--info-border)' : 'transparent'}`,
    }}>
      <div className="lbl" style={{
        fontSize: 'var(--t-3)', color: earned ? 'var(--info-bright)' : 'var(--muted)',
      }}>{badge.name}</div>
      <div style={{ fontSize: 'var(--t-2)', color: 'var(--faint)', marginTop: 4, lineHeight: 1.4 }}>
        {badge.detail}
      </div>
      {/* Los que faltan muestran cuánto falta. Un emblema apagado sin número
          no dice si estás cerca o lejísimos, y ahí deja de motivar. */}
      {!earned && (
        <div style={{ marginTop: 'var(--s-2)' }}>
          {/* La barra de progreso de la pizarra: 4px y en el tono informativo,
              que es el que lleva todo lo que mide algo. */}
          <div style={{
            height: 4, borderRadius: 2, background: 'var(--film-2)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${(badge.progress / badge.target) * 100}%`, height: '100%',
              background: 'var(--info)',
            }} />
          </div>
          <div className="num" style={{ fontSize: 'var(--t-1)', color: 'var(--faint)', marginTop: 4 }}>
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




function Arrow({ dir, label, onClick, disabled }: {
  dir: string; label: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="icon-btn"
      style={{
        background: 'var(--elevated)',
        color: disabled ? 'var(--faint)' : 'var(--cream)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}>{dir}</button>
  )
}
