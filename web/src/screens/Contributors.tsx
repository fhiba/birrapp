import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { Contributor, Leaderboard, PhotoOfMonth, User } from '../data/types'
import { Empty } from '../ui/Empty'

/**
 * Los que más aportaron este mes (BIR-9).
 *
 * La app agradece los aportes en privado —"Mis aportes" lo ve sólo quien lo
 * cargó— y no había nada que devolviera estatus en público. En una app que
 * depende de que la gente releve precios gratis, esto es la palanca de
 * retención más barata que quedaba sin usar.
 *
 * El mes corre y se reinicia. Una tabla histórica la gana siempre el mismo, y
 * al que llega nuevo le dice que no tiene sentido empezar.
 */
export function ContributorsScreen({ user }: { user: User | null }) {
  const nav = useNavigate()
  const [data, setData] = useState<Leaderboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState<string | undefined>()

  useEffect(() => {
    let alive = true
    setData(null)
    api.leaderboard(month)
      .then(d => { if (alive) { setData(d); setError(null) } })
      .catch(e => { if (alive) setError((e as Error).message) })
    return () => { alive = false }
  }, [month])

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 0 60px`,
    }}>
      <div className="desk-narrow">
        <div style={{ padding: '0 18px' }}>
          <button onClick={() => nav(-1)} className="icon-btn"
            style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: '16px 0 0' }}>
            Colaboradores
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-3)', margin: '6px 0 0' }}>
            Quiénes mantienen el mapa vivo. La tabla arranca de cero cada mes.
          </p>
          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>
          )}
        </div>

        {data && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '18px 18px 0',
          }}>
            <Arrow dir="‹" label="Mes anterior" onClick={() => setMonth(shift(data.month, -1))} />
            <span className="lbl" style={{ flex: 1, textAlign: 'center', fontSize: 'var(--t-3)' }}>
              {monthLabel(data.month)}
            </span>
            {/* Al futuro no se va: un mes que no pasó siempre está vacío. */}
            <Arrow dir="›" label="Mes siguiente" onClick={() => setMonth(shift(data.month, 1))}
              disabled={data.month >= thisMonth()} />
          </div>
        )}

        {!data && !error && <div className="spinner" style={{ margin: '30px auto' }} />}

        {data?.photo && <FotoDelMes photo={data.photo} onOpen={() => nav(`/bar/${data.photo!.barId}`)} />}

        {data && data.contributors.length === 0 && (
          <Empty
            title="Todavía nadie con alias este mes"
            hint={user
              ? 'Elegí un alias en Configuración y tus aportes del mes aparecen acá.'
              : 'Los aportes cuentan igual; para figurar hace falta una cuenta y un alias.'}
            action={user ? 'Elegir mi alias' : 'Entrar'}
            onAction={() => nav(user ? '/config' : '/perfil')}
          />
        )}

        {data && data.contributors.length > 0 && (
          <ol style={{ listStyle: 'none', margin: '18px 0 0', padding: 0 }}>
            {data.contributors.map((c, i) => (
              <Fila key={c.userId} c={c} puesto={i + 1} onOpen={() => nav(`/usuario/${c.userId}`)} />
            ))}
          </ol>
        )}

        {/*
          Los que aportaron sin alias.
          Va porque si no la página miente: una tabla de tres cuando aportaron
          cuarenta cuenta una historia falsa sobre cuánta gente sostiene esto.
          Y de paso es la invitación más honesta a ponerse uno.
        */}
        {data && data.hidden > 0 && (
          <p style={{
            color: 'var(--faint)', fontSize: 'var(--t-2)', lineHeight: 1.5,
            padding: '20px 18px 0',
          }}>
            {data.hidden === 1
              ? 'Una persona más aportó este mes sin alias puesto, así que no figura.'
              : `${data.hidden} personas más aportaron este mes sin alias puesto, así que no figuran.`}
            {' '}Aparecer acá se elige: sin alias, tu nombre no se publica.
          </p>
        )}
      </div>
    </div>
  )
}

function Fila({ c, puesto, onOpen }: {
  c: Contributor; puesto: number; onOpen: () => void
}) {
  return (
    <li>
      <button onClick={onOpen} className="row-hover" style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%',
        padding: '13px 18px', textAlign: 'left',
        borderBottom: '1px solid var(--film-2)',
      }}>
        {/* El puesto en cifras tabulares: si no, la columna baila entre el 9
            y el 10 y la lista deja de leerse como un ranking. */}
        <span className="num" style={{
          width: 22, textAlign: 'right', flexShrink: 0,
          fontSize: 'var(--t-4)',
          color: puesto <= 3 ? 'var(--acento)' : 'var(--faint)',
        }}>{puesto}</span>

        {c.avatarUrl
          ? <img src={c.avatarUrl} alt="" width={34} height={34} loading="lazy" style={{
              borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
            }} />
          : <span aria-hidden style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'var(--elevated)',
            }} />}

        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="lbl" style={{
            display: 'block', fontSize: 'var(--t-4)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{c.alias}</span>
          {/* Los bares y no los aportes: es el número que dice si alguien
              relevó la ciudad o apretó veinte veces en la esquina de su casa. */}
          <span style={{ fontSize: 'var(--t-2)', color: 'var(--faint)' }}>
            {c.bars === 1 ? '1 bar' : `${c.bars} bares`}
            {' · '}
            {c.contributions === 1 ? '1 aporte' : `${c.contributions} aportes`}
          </span>
        </span>

        <span className="num" style={{
          fontSize: 'var(--t-5)', color: 'var(--cream)', flexShrink: 0,
        }}>{c.score}</span>
      </button>
    </li>
  )
}

/**
 * La foto del mes (BIR-10).
 *
 * Quedó sin lugar cuando se hicieron los pulgares: en la pantalla del bar
 * competía con el precio, que es lo que la app viene a contestar. Acá no
 * compite con nada — esta página ES el reconocimiento.
 */
function FotoDelMes({ photo, onOpen }: { photo: PhotoOfMonth; onOpen: () => void }) {
  return (
    <section style={{ padding: '20px 18px 0' }}>
      <h2 className="lbl" style={{
        fontSize: 'var(--t-1)', letterSpacing: '.12em', color: 'var(--faint)', margin: '0 0 10px',
      }}>FOTO DEL MES</h2>
      <button onClick={onOpen} style={{
        display: 'block', padding: 0, width: '100%',
        borderRadius: 'var(--r-3)', overflow: 'hidden', position: 'relative',
        background: 'var(--elevated)',
      }}>
        <img src={photo.url} alt={photo.beerName} style={{
          width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block',
        }} />
        <span className="foto-velo" aria-hidden />
        <span style={{
          position: 'absolute', left: 'var(--s-3)', right: 'var(--s-3)',
          bottom: 'var(--s-3)', textAlign: 'left',
        }}>
          <span className="lbl" style={{
            display: 'block', color: 'var(--cream)', fontSize: 'var(--t-4)',
          }}>{photo.beerName} · {photo.barName}</span>
          <span style={{ display: 'block', color: 'var(--cream)', fontSize: 'var(--t-2)', opacity: .85 }}>
            {/* Sin alias la foto se muestra igual, pero sin firma: la misma
                regla que la tabla. */}
            {photo.authorAlias ? `de ${photo.authorAlias} · ` : ''}
            {photo.votes === 1 ? '1 me gusta' : `${photo.votes} me gusta`}
          </span>
        </span>
      </button>
    </section>
  )
}

function Arrow({ dir, label, onClick, disabled }: {
  dir: string; label: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="icon-btn" style={{
      background: 'var(--elevated)',
      color: disabled ? 'var(--faint)' : 'var(--cream)',
      cursor: disabled ? 'default' : 'pointer',
    }}>{dir}</button>
  )
}

// ---------- meses ----------
// Mismo criterio que el calendario de birras: el mes lo fija el servidor en
// hora de Buenos Aires y acá sólo se espeja, para que no cambie según dónde
// esté el teléfono.

const thisMonth = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit',
}).format(new Date()).slice(0, 7)

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
