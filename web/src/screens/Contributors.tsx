import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { Contributor, Leaderboard, PhotoOfMonth, User } from '../data/types'
import { Empty } from '../ui/Empty'
import { KARMA, KARMA_VISIBLE } from '../data/karma'

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

  /*
   * Tu fila, si estás en la tabla.
   *
   * Sale de la misma respuesta que la lista: quien no eligió alias no figura
   * —esa es la regla de privacidad de esta pantalla— así que acá tampoco, y el
   * pie de abajo ya explica cómo aparecer.
   */
  const yo = (() => {
    if (!user || !data) return null
    const i = data.contributors.findIndex(c => c.userId === user.id)
    return i < 0 ? null : { c: data.contributors[i]!, puesto: i + 1 }
  })()

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 0 60px`,
    }}>
      <div className="desk-narrow">
        <div style={{ padding: '0 var(--s-4)' }}>
          <button onClick={() => nav(-1)} className="icon-btn"
            style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: 'var(--s-4) 0 0' }}>
            Colaboradores
          </h1>
          {/* Qué son estos puntos, en la etiqueta de sección y no en otro
              renglón de párrafo: es el subtítulo del ámbito, que es justo lo
              que la etiqueta de sección nombra en toda la app. */}
          <div className="section-label" style={{ margin: 'var(--s-1) 0 0' }}>
            Puntos del mes
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--t-3)', margin: 'var(--s-2) 0 0' }}>
            Quiénes mantienen el mapa vivo. La tabla arranca de cero cada mes.
          </p>
          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>
          )}
        </div>

        {data && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--s-2)',
            padding: 'var(--s-4) var(--s-4) 0',
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

        {/* Tu karma primero: el ranking contesta "cómo viene la cosa" y esto
            contesta "cómo vengo yo", que es lo que uno abre a buscar. Sale de
            la misma tabla que ya se bajó — no hay una consulta más.

            Apagado mientras `KARMA_VISIBLE` esté en false. La tabla de abajo
            es dato real y se queda; lo que no existe todavía es el sistema que
            esta tarjeta promete —la tarifa por acción, el nivel, algo que los
            puntos hagan— y prometerlo sin que llegue es peor que no decir
            nada. El ranking sigue contestando lo mismo, sin la promesa. */}
        {KARMA_VISIBLE && yo && data && (
          <Karma
            yo={yo.c} puesto={yo.puesto} tope={data.contributors[0]!.score}
            anterior={yo.puesto > 1 ? data.contributors[yo.puesto - 2]!.score : null}
            mes={monthLabel(data.month)}
          />
        )}

        {data && data.contributors.length > 0 && (
          <ol style={{ listStyle: 'none', margin: 'var(--s-4) 0 0', padding: 0 }}>
            {data.contributors.map((c, i) => (
              <Fila
                key={c.userId} c={c} puesto={i + 1}
                tope={data.contributors[0]!.score}
                esVos={c.userId === user?.id}
                onOpen={() => nav(`/usuario/${c.userId}`)}
              />
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
            padding: 'var(--s-5) var(--s-4) 0',
          }}>
            {data.hidden === 1
              ? 'Una persona más aportó este mes sin alias puesto, así que no figura.'
              : `${data.hidden} personas más aportaron este mes sin alias puesto, así que no figuran.`}
            {' '}Aparecer acá se elige: sin alias, tu nombre no se publica.
          </p>
        )}

        {/* La foto va al final y no arriba: la pantalla es la tabla, y una
            foto de 4:3 antes de la primera fila empujaba el ranking fuera de
            la pantalla en un teléfono. Acá es el premio que se mira después
            de leer quién va ganando. */}
        {data?.photo && <FotoDelMes photo={data.photo} onOpen={() => nav(`/bar/${data.photo!.barId}`)} />}
      </div>
    </div>
  )
}

/**
 * Una fila del ranking, con su puntaje dibujado detrás.
 *
 * La barra de fondo es proporcional al puntaje y es la mitad de la tabla: con
 * las cifras solas hay que leer y restar para saber si el segundo está pegado
 * al primero o a diez cuerpos; con la barra, la distancia se ve. Va apenas
 * teñida —el tono informativo al 16%— porque tiene que quedar **debajo** del
 * texto, no competir con él.
 *
 * El contenido va en un envoltorio con `position: relative` a propósito: la
 * barra está posicionada, y lo posicionado pinta encima de lo que está en
 * flujo. Sin eso, la barra tapa el alias de los primeros puestos.
 */
function Fila({ c, puesto, tope, esVos, onOpen }: {
  c: Contributor; puesto: number
  /** El puntaje del primero: es el 100% de la barra. */
  tope: number
  esVos: boolean
  onOpen: () => void
}) {
  return (
    <li>
      <button onClick={onOpen} className="row-hover" style={{
        position: 'relative', overflow: 'hidden', width: '100%',
        padding: 'var(--s-3) 0', textAlign: 'left', minHeight: 44,
        borderBottom: '1px solid var(--hairline)',
      }}>
        <span aria-hidden style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${tope > 0 ? (c.score / tope) * 100 : 0}%`,
          background: 'var(--info-soft)',
        }} />

        <span style={{
          position: 'relative', display: 'flex', alignItems: 'center',
          gap: 'var(--s-3)', padding: '0 var(--s-4)',
        }}>
          {/* El puesto en cifras tabulares: si no, la columna baila entre el 9
              y el 10 y la lista deja de leerse como un ranking. */}
          <span className="num" style={{
            width: 22, textAlign: 'right', flexShrink: 0,
            fontSize: 'var(--t-4)',
            color: puesto <= 3 ? 'var(--cream)' : 'var(--faint)',
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
            }}>
              {c.alias}
              {/* Tu propia fila, marcada. En una tabla de cincuenta, buscarse
                  por el alias es lo primero que hace cualquiera. */}
              {esVos && (
                <span className="lbl" style={{
                  marginLeft: 'var(--s-2)', fontSize: 10, letterSpacing: '.12em',
                  textTransform: 'uppercase', color: 'var(--info)',
                }}>vos</span>
              )}
            </span>
            {/* Los bares y no los aportes: es el número que dice si alguien
                relevó la ciudad o apretó veinte veces en la esquina de su casa. */}
            <span className="num" style={{ fontSize: 'var(--t-2)', color: 'var(--faint)' }}>
              {c.bars === 1 ? '1 bar' : `${c.bars} bares`}
              {' · '}
              {c.contributions === 1 ? '1 aporte' : `${c.contributions} aportes`}
            </span>
          </span>

          <span className="num" style={{
            fontSize: 'var(--t-5)', color: 'var(--cream)', flexShrink: 0,
          }}>{c.score}</span>
        </span>
      </button>
    </li>
  )
}

/**
 * Cuánto llevás este mes, y cómo se suma.
 *
 * Es de las pocas tarjetas que quedan en la app, y se la gana por lo mismo que
 * el benchmark de zona: no es una fila más de la tabla de abajo, es el bloque
 * que habla de vos. El relleno y el borde son el tono informativo, que es el
 * que lleva todo lo analítico en esta paleta.
 *
 * La tarifa va escrita porque el ranking sin ella es un número sin reglas:
 * quien mira la tabla no tiene forma de saber si le conviene cargar un precio
 * o subir tres fotos. Los pesos son los de `CONTRIBUTION_WEIGHT`
 * (`backend/.../moderation/AnalyticsRepo.kt`), que es la única definición y la
 * que rankea de verdad — si algún día cambian allá, esta lista hay que
 * cambiarla acá, y por eso está nombrada.
 *
 * El tope de un aporte por bar y por día también se dice: es la regla que
 * evita que el ranking premie cargar veinte precios en la misma esquina, y
 * callarla hace que el puntaje parezca roto cuando no sube.
 */
function Karma({ yo, puesto, tope, anterior, mes }: {
  yo: Contributor
  puesto: number
  /** El puntaje del primero, que es el largo completo de la barra. */
  tope: number
  /** El del puesto de arriba, para decir cuánto falta. Null si vas primero. */
  anterior: number | null
  /** El mes que se está mirando, ya escrito. La tabla se puede navegar hacia
   *  atrás, así que "este mes" mentiría en cuanto se toca la flecha. */
  mes: string
}) {
  const falta = anterior == null ? null : Math.max(0, anterior - yo.score + 1)
  return (
    <div style={{
      margin: 'var(--s-5) var(--s-4) 0', padding: 'var(--s-4)',
      borderRadius: 'var(--r-3)',
      // El relleno informativo por token y no el rgba del diseño: el tono es
      // el mismo Steel Blue y tenerlo en una sola definición vale más que los
      // ocho puntos de opacidad de diferencia, que sobre espresso no se ven.
      background: 'var(--info-soft)', border: '1px solid var(--info-border)',
    }}>
      <div className="section-label" style={{ margin: 0 }}>Karma cervecero</div>

      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', marginTop: 'var(--s-2)',
      }}>
        <span className="num" style={{ fontSize: 'var(--t-8)', lineHeight: 1 }}>{yo.score}</span>
        <span style={{ fontSize: 'var(--t-2)', color: 'var(--cream-soft)' }}>
          puntos · {mes}
        </span>
      </div>

      {/* La barra de 4px: cuánto de lo que lleva el primero llevás vos. */}
      <div aria-hidden style={{
        height: 4, borderRadius: 2, marginTop: 'var(--s-4)',
        background: 'var(--film-2)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${tope > 0 ? (yo.score / tope) * 100 : 0}%`, height: '100%',
          background: 'var(--info-bright)',
        }} />
      </div>

      <div className="num" style={{
        display: 'flex', justifyContent: 'space-between', gap: 'var(--s-3)',
        marginTop: 'var(--s-2)', fontSize: 'var(--t-1)', color: 'var(--cream-soft)',
      }}>
        <span>{puesto === 1 ? 'Vas al frente' : `Puesto ${puesto}`}</span>
        {falta != null && <span>a {falta} del {puesto - 1}º</span>}
      </div>

      <div style={{
        marginTop: 'var(--s-4)', paddingTop: 'var(--s-3)',
        borderTop: '1px solid var(--hairline)',
      }}>
        {TARIFA.map(t => (
          <div key={t.que} style={{
            display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)', padding: '5px 0',
          }}>
            <span style={{ flex: 1, fontSize: 'var(--t-3)', color: 'var(--cream-soft)' }}>
              {t.que}
            </span>
            <span className="num" style={{ fontSize: 'var(--t-3)', color: 'var(--info-bright)' }}>
              +{t.pts}
            </span>
          </div>
        ))}
        <p style={{
          margin: 'var(--s-2) 0 0', fontSize: 'var(--t-1)', lineHeight: 1.5,
          color: 'var(--faint)',
        }}>
          Cuenta un aporte por bar y por día: veinte precios en el mismo bar
          valen lo mismo que uno.
        </p>
      </div>
    </div>
  )
}

/** Los pesos de verdad, los de `CONTRIBUTION_WEIGHT` en el backend. */
const TARIFA = [
  { que: 'Cargar un precio', pts: KARMA.precio },
  { que: 'Agregar un bar que falta', pts: KARMA.bar },
  { que: 'Subir una foto', pts: KARMA.foto },
  { que: 'Puntuar una birra', pts: KARMA.nota },
  { que: 'Confirmar que sigue igual', pts: KARMA.confirmar },
]

/**
 * La foto del mes (BIR-10).
 *
 * Quedó sin lugar cuando se hicieron los pulgares: en la pantalla del bar
 * competía con el precio, que es lo que la app viene a contestar. Acá no
 * compite con nada — esta página ES el reconocimiento.
 */
function FotoDelMes({ photo, onOpen }: { photo: PhotoOfMonth; onOpen: () => void }) {
  return (
    <section style={{ padding: 'var(--s-5) var(--s-4) 0' }}>
      {/* La etiqueta de sección de siempre, en vez de la quinta copia escrita
          a mano de lo mismo. */}
      <h2 className="section-label" style={{ marginTop: 0 }}>Foto del mes</h2>
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
