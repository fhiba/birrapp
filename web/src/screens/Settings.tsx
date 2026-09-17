import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import * as fb from '../data/feedback'
import type { Person, User } from '../data/types'
import { formatRadius } from '../data/format'
import { AvatarPicker } from '../ui/AvatarPicker'
import { Confirm, Toast } from '../ui/Chrome'
import { CurrencySelect } from '../ui/CurrencySelect'
import { SectionLabel } from '../ui/Kit'

/**
 * Configuración de la cuenta.
 *
 * Existe porque la app dejó de ser sólo de Buenos Aires: con bares de
 * cualquier parte del mundo hay que poder decir en qué moneda cobra el bar que
 * estás cargando, y una pinta no mide lo mismo acá que en el Reino Unido.
 *
 * Se lleva también el nombre, la foto y el borrado de cuenta, que vivían
 * sueltos en el perfil. El perfil pasa a ser lo que mostrás —tus aportes, tus
 * birras— y esto lo que configurás.
 *
 * Cada control guarda al tocarlo, sin botón de "guardar": son cuatro
 * preferencias sueltas, no un formulario. Un botón obligaría a acordarse de
 * apretarlo y sería la forma más fácil de perder un cambio.
 */
export function SettingsScreen({ user, onSession }: {
  user: User | null
  onSession: () => void
}) {
  const nav = useNavigate()
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState(user?.displayName ?? '')
  const [alias, setAlias] = useState(user?.alias ?? '')
  const [sonido, setSonido] = useState(fb.sonidoPrendido())
  const [vibrar, setVibrar] = useState(fb.vibrarPrendido())
  // Quiénes están bloqueados. Acá y no en otra pantalla: es el único lugar
  // desde donde se puede deshacer, y un bloqueo que no se puede levantar es
  // una decisión que quedó para siempre por un toque.
  const [blocked, setBlocked] = useState<Person[]>([])
  /**
   * El radio, mientras se arrastra.
   *
   * Hace falta estado local por dos razones: que el número de arriba se mueva
   * con el dedo —si mostrara el guardado, se queda quieto hasta soltar y
   * parece roto— y que guardar no dispare una consulta por cada pixel.
   */
  const [radius, setRadius] = useState(user?.defaultRadiusM ?? 2000)
  const loadBlocked = () => { api.blockedPeople().then(setBlocked).catch(() => {}) }
  useEffect(loadBlocked, [])

  /** El temporizador que espera a que el slider se quede quieto. */
  const guardarRadio = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(guardarRadio.current), [])

  if (!user) {
    nav('/perfil', { replace: true })
    return null
  }

  const guardar = async (
    cambio: Parameters<typeof api.updateMe>[0], aviso: string,
  ) => {
    setError(null)
    try {
      api.updateSessionUser(await api.updateMe(cambio))
      onSession()
      setToast(aviso)
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(18px + var(--safe-top)) 22px calc(40px + var(--nav-gap))`,
    }}>
      <div className="desk-narrow">
        <button onClick={() => nav(-1)} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>

        <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: '16px 0 0' }}>Configuración</h1>

        <SectionLabel>Tu cuenta</SectionLabel>

        <AvatarPicker
          user={user}
          onChange={u => { api.updateSessionUser(u); onSession() }}
        />

        <label className="lbl" style={{
          display: 'block', fontSize: 'var(--t-2)', color: 'var(--muted)', margin: '24px 0 8px',
        }} htmlFor="nombre">Cómo te llamás</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="nombre" value={name} onChange={e => setName(e.target.value)}
            maxLength={60}
            style={{
              flex: 1, minWidth: 0, padding: '12px 16px', borderRadius: 'var(--r-2)',
              background: 'var(--elevated)', border: '1px solid var(--hairline)',
              fontSize: 'var(--t-field)',
            }}
          />
          {/* Este sí lleva botón: el campo no sabe cuándo terminaste de
              escribir, y guardar por cada tecla sería una consulta por letra. */}
          <button
            disabled={name.trim() === user.displayName || name.trim().length < 2}
            onClick={() => guardar({ displayName: name.trim() }, 'Nombre cambiado')}
            className="lbl"
            style={{
              padding: '0 16px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
              background: name.trim() !== user.displayName && name.trim().length >= 2
                ? 'var(--acento)' : 'var(--elevated)',
              color: name.trim() !== user.displayName && name.trim().length >= 2
                ? 'var(--base)' : 'var(--faint)',
            }}
          >Guardar</button>
        </div>
        <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '8px 0 0' }}>
          Es el nombre con el que aparecen tus aportes. {user.email} no se muestra
          en ningún lado.
        </p>

        <label className="lbl" style={{
          display: 'block', fontSize: 'var(--t-2)', color: 'var(--muted)', margin: '24px 0 8px',
        }} htmlFor="alias">Tu alias público</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="alias" value={alias} onChange={e => setAlias(e.target.value)}
            maxLength={20} placeholder="Sin alias"
            style={{
              flex: 1, minWidth: 0, padding: '12px 16px', borderRadius: 'var(--r-2)',
              background: 'var(--elevated)', border: '1px solid var(--hairline)',
              fontSize: 'var(--t-field)',
            }}
          />
          <button
            disabled={alias.trim() === (user.alias ?? '')}
            onClick={() => guardar(
              { alias: alias.trim() },
              alias.trim() ? 'Alias guardado' : 'Alias sacado',
            )}
            className="lbl"
            style={{
              padding: '0 16px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
              background: alias.trim() !== (user.alias ?? '') ? 'var(--acento)' : 'var(--elevated)',
              color: alias.trim() !== (user.alias ?? '') ? 'var(--base)' : 'var(--faint)',
            }}
          >Guardar</button>
        </div>
        {/*
          El texto importa tanto como el campo: esto decide si tu nombre
          aparece en una página pública, y eso tiene que quedar dicho antes de
          que alguien escriba algo, no después.
        */}
        <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '8px 0 0', lineHeight: 1.5 }}>
          Es el único nombre que se muestra en{' '}
          <button onClick={() => nav('/colaboradores')} style={{
            color: 'var(--acento)', textDecoration: 'underline', textUnderlineOffset: 3,
          }}>Colaboradores</button>, la tabla pública del mes.{' '}
          {user.alias
            ? 'Borralo y dejás de figurar; tus aportes siguen contando igual.'
            : 'Sin alias no figurás, y tu nombre no se publica en ningún lado.'}
        </p>

        {/* Las birras favoritas viven acá y no en su propia sección: son una
            preferencia de cuenta, igual que el alias y el nombre. */}
        <button onClick={() => nav('/preferencias')} className="lbl" style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          marginTop: 'var(--s-5)', padding: '14px 16px', borderRadius: 'var(--r-2)',
          fontSize: 'var(--t-4)', background: 'var(--film-2)', color: 'var(--cream)',
          textAlign: 'left',
        }}>
          <span style={{ flex: 1 }}>Tus birras favoritas</span>
          <span className="num" style={{ color: 'var(--faint)', fontSize: 'var(--t-3)' }}>
            {user.favoriteStyles.length + user.favoriteBrands.length || '—'}
          </span>
          <span style={{ color: 'var(--faint)' }}>›</span>
        </button>
        <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '8px 0 0', lineHeight: 1.5 }}>
          Deciden cuáles son las tres birras que se ven primero en cada bar.
        </p>

        <SectionLabel>Avisos</SectionLabel>
        {/* Los dos por separado y no un solo interruptor: en un bar con gente
            el sonido molesta y la vibración no, y quien quiera apagar uno casi
            nunca quiere apagar el otro. */}
        <Interruptor
          label="Vibración"
          hint="Un toque corto al votar, confirmar un precio o marcar un favorito."
          on={vibrar}
          onChange={v => { setVibrar(v); fb.setVibrar(v); if (v) fb.tap() }}
        />
        <Interruptor
          label="Sonido"
          hint="Lo mismo, con un tono corto. En iPhone es el único de los dos que funciona."
          on={sonido}
          onChange={v => { setSonido(v); fb.setSonido(v); if (v) fb.tap() }}
        />

        <SectionLabel>Al cargar precios</SectionLabel>

        <Field
          label="Moneda"
          hint={'La de los bares que cargues a mano. Si elegís el bar del buscador, '
            + 'la moneda sale del país y esto no se usa. Los precios se muestran '
            + 'siempre en la moneda del bar: no se convierte nada.'}
        >
          <CurrencySelect
            value={user.currency}
            onChange={v => guardar({ currency: v }, 'Moneda cambiada')}
          />
        </Field>

        <Field
          label="Tamaño del vaso"
          hint="Con qué tamaño arranca el teclado de precio. Una pinta son 473 ml acá y en Estados Unidos, y 568 en el Reino Unido."
        >
          <select
            className="lbl" value={user.defaultSizeMl}
            onChange={e => guardar(
              { defaultSizeMl: Number(e.target.value) }, 'Tamaño cambiado',
            )}
            style={{
              padding: '8px 12px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
              background: 'var(--elevated)', color: 'var(--cream)',
              border: '1px solid var(--hairline)',
            }}
          >
            {[330, 355, 473, 500, 568, 1000].map(ml => (
              <option key={ml} value={ml}>
                {ml} ml{ml === 473 ? ' — pinta' : ml === 568 ? ' — pinta UK' : ''}
              </option>
            ))}
          </select>
        </Field>

        <SectionLabel>Al abrir la app</SectionLabel>

        <div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="lbl" style={{ fontSize: 'var(--t-4)' }}>Radio de búsqueda</span>
            <span className="lbl" style={{
              marginLeft: 'auto', color: 'var(--acento)', fontSize: 'var(--t-4)',
            }}>{formatRadius(radius)}</span>
          </div>
          {/*
            Se dibuja con cada cambio y se guarda medio segundo después de que
            se dejó de mover.
            
            Antes guardaba en `onPointerUp`, que parecía suficiente y dejaba
            afuera al teclado: con las flechas se movía el control y no se
            guardaba nunca. Y el número de arriba mostraba el valor guardado,
            así que se quedaba quieto mientras se arrastraba.
          */}
          <input
            className="range" type="range" min={300} max={15000} step={100}
            value={radius}
            onChange={e => {
              const v = Number(e.target.value)
              setRadius(v)
              clearTimeout(guardarRadio.current)
              guardarRadio.current = setTimeout(
                () => guardar({ defaultRadiusM: v }, 'Radio cambiado'), 500,
              )
            }}
            style={{
              marginTop: 8,
              ['--fill' as string]: `${((radius - 300) / (15000 - 300)) * 100}%`,
            }}
          />
          <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '8px 0 0' }}>
            Con cuánto a la redonda abre el mapa y la lista.
          </p>
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)', marginTop: 16 }}>{error}</p>
        )}

        {blocked.length > 0 && (
          <>
            <SectionLabel>Personas bloqueadas</SectionLabel>
            {blocked.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 2px', borderBottom: '1px solid var(--hairline)',
              }}>
                <button onClick={() => nav(`/usuario/${p.id}`)} className="lbl" style={{
                  flex: 1, minWidth: 0, textAlign: 'left', fontSize: 'var(--t-4)',
                }}>{p.displayName}</button>
                <button
                  onClick={async () => {
                    await api.unblockPerson(p.id).catch(() => {})
                    setToast(`Desbloqueaste a ${p.displayName}`)
                    loadBlocked()
                  }}
                  className="lbl"
                  style={{ fontSize: 'var(--t-3)', color: 'var(--acento)' }}
                >Desbloquear</button>
              </div>
            ))}
            <p style={{
              color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '12px 0 0', lineHeight: 1.5,
            }}>
              Con alguien bloqueado, ninguno de los dos ve los comentarios ni las
              fotos del otro. Los precios que cargó siguen en el mapa: son datos
              sobre bares.
            </p>
          </>
        )}

        <SectionLabel>Zona de riesgo</SectionLabel>
        <button onClick={() => setConfirmDelete(true)} className="lbl" style={{
          width: '100%', padding: 16, borderRadius: 'var(--r-3)', textAlign: 'left', fontSize: 'var(--t-4)',
          background: 'rgba(255,122,102,.12)', color: 'var(--danger)',
        }}>Borrar mi cuenta</button>
      </div>

      {confirmDelete && (
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
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false)
            try { await api.deleteAccount(); onSession(); nav('/') }
            catch (e) { setError((e as Error).message) }
          }}
        />
      )}

      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function Field({ label, hint, children }: {
  label: string; hint: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="lbl" style={{ flex: 1, fontSize: 'var(--t-4)' }}>{label}</span>
        {children}
      </div>
      <p style={{
        color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '8px 0 0', lineHeight: 1.5,
      }}>{hint}</p>
    </div>
  )
}

/** Un interruptor con su explicación, para las preferencias de a dos estados. */
function Interruptor({ label, hint, on, onChange }: {
  label: string; hint: string; on: boolean; onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch" aria-checked={on}
      className="lbl"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        marginTop: 'var(--s-2)', padding: '12px 14px', borderRadius: 'var(--r-2)',
        background: 'var(--film-2)', textAlign: 'left',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--t-4)', color: 'var(--cream)' }}>
          {label}
        </span>
        <span style={{
          display: 'block', fontSize: 'var(--t-2)', color: 'var(--faint)',
          marginTop: 2, lineHeight: 1.4, whiteSpace: 'normal',
        }}>{hint}</span>
      </span>
      {/* Riel y perilla, que es lo que se reconoce como interruptor. Una
          tilde diría "elegido de una lista" y esto es prendido/apagado. */}
      <span aria-hidden style={{
        flexShrink: 0, width: 44, height: 26, borderRadius: 999,
        background: on ? 'var(--acento)' : 'var(--film-3)',
        display: 'flex', alignItems: 'center',
        padding: 3, transition: 'background-color .16s ease-out',
      }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', background: 'var(--base)',
          transform: on ? 'translateX(18px)' : 'none',
          transition: 'transform .16s ease-out',
        }} />
      </span>
    </button>
  )
}
