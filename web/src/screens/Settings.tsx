import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { Person, User } from '../data/types'
import { formatRadius } from '../data/format'
import { AvatarPicker } from '../ui/AvatarPicker'
import { Confirm, Toast } from '../ui/Chrome'
import { CurrencySelect } from '../ui/CurrencySelect'

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
  // Quiénes están bloqueados. Acá y no en otra pantalla: es el único lugar
  // desde donde se puede deshacer, y un bloqueo que no se puede levantar es
  // una decisión que quedó para siempre por un toque.
  const [blocked, setBlocked] = useState<Person[]>([])
  const loadBlocked = () => { api.blockedPeople().then(setBlocked).catch(() => {}) }
  useEffect(loadBlocked, [])

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
        <button onClick={() => nav(-1)} style={{
          width: 38, height: 38, borderRadius: '50%', background: 'var(--elevated)',
        }} aria-label="Volver">←</button>

        <h1 className="ttl" style={{ fontSize: 26, margin: '16px 0 0' }}>Configuración</h1>

        <SectionLabel>Tu cuenta</SectionLabel>

        <AvatarPicker
          user={user}
          onChange={u => { api.updateSessionUser(u); onSession() }}
        />

        <label className="lbl" style={{
          display: 'block', fontSize: 12, color: 'var(--muted)', margin: '20px 0 6px',
        }} htmlFor="nombre">Cómo te llamás</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="nombre" value={name} onChange={e => setName(e.target.value)}
            maxLength={60}
            style={{
              flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 12,
              background: 'var(--elevated)', border: '1px solid var(--hairline)',
              fontSize: 16,
            }}
          />
          {/* Este sí lleva botón: el campo no sabe cuándo terminaste de
              escribir, y guardar por cada tecla sería una consulta por letra. */}
          <button
            disabled={name.trim() === user.displayName || name.trim().length < 2}
            onClick={() => guardar({ displayName: name.trim() }, 'Nombre cambiado')}
            className="lbl"
            style={{
              padding: '0 16px', borderRadius: 12, fontSize: 13.5,
              background: name.trim() !== user.displayName && name.trim().length >= 2
                ? 'var(--amber)' : 'var(--elevated)',
              color: name.trim() !== user.displayName && name.trim().length >= 2
                ? 'var(--base)' : 'var(--faint)',
            }}
          >Guardar</button>
        </div>
        <p style={{ color: 'var(--faint)', fontSize: 11.5, margin: '6px 0 0' }}>
          Es el nombre con el que aparecen tus aportes. {user.email} no se muestra
          en ningún lado.
        </p>

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
              padding: '9px 11px', borderRadius: 11, fontSize: 13.5,
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
            <span className="lbl" style={{ fontSize: 14 }}>Radio de búsqueda</span>
            <span className="lbl" style={{
              marginLeft: 'auto', color: 'var(--amber)', fontSize: 14,
            }}>{formatRadius(user.defaultRadiusM)}</span>
          </div>
          {/* `onChange` dispararía una consulta por pixel arrastrado; se
              guarda al soltar. */}
          <input
            className="range" type="range" min={300} max={15000} step={100}
            defaultValue={user.defaultRadiusM}
            onPointerUp={e => guardar(
              { defaultRadiusM: Number((e.target as HTMLInputElement).value) },
              'Radio cambiado',
            )}
            onChange={() => {}}
            style={{
              marginTop: 8,
              ['--fill' as string]: `${((user.defaultRadiusM - 300) / (15000 - 300)) * 100}%`,
            }}
          />
          <p style={{ color: 'var(--faint)', fontSize: 11.5, margin: '6px 0 0' }}>
            Con cuánto a la redonda abre el mapa y la lista.
          </p>
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 18 }}>{error}</p>
        )}

        {blocked.length > 0 && (
          <>
            <SectionLabel>Personas bloqueadas</SectionLabel>
            {blocked.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 2px', borderBottom: '1px solid var(--hairline)',
              }}>
                <button onClick={() => nav(`/usuario/${p.id}`)} className="lbl" style={{
                  flex: 1, minWidth: 0, textAlign: 'left', fontSize: 14,
                }}>{p.displayName}</button>
                <button
                  onClick={async () => {
                    await api.unblockPerson(p.id).catch(() => {})
                    setToast(`Desbloqueaste a ${p.displayName}`)
                    loadBlocked()
                  }}
                  className="lbl"
                  style={{ fontSize: 13, color: 'var(--amber)' }}
                >Desbloquear</button>
              </div>
            ))}
            <p style={{
              color: 'var(--faint)', fontSize: 11.5, margin: '10px 0 0', lineHeight: 1.5,
            }}>
              Con alguien bloqueado, ninguno de los dos ve los comentarios ni las
              fotos del otro. Los precios que cargó siguen en el mapa: son datos
              sobre bares.
            </p>
          </>
        )}

        <SectionLabel>Zona de riesgo</SectionLabel>
        <button onClick={() => setConfirmDelete(true)} className="lbl" style={{
          width: '100%', padding: 15, borderRadius: 14, textAlign: 'left', fontSize: 14,
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
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="lbl" style={{ flex: 1, fontSize: 14 }}>{label}</span>
        {children}
      </div>
      <p style={{
        color: 'var(--faint)', fontSize: 11.5, margin: '6px 0 0', lineHeight: 1.5,
      }}>{hint}</p>
    </div>
  )
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h2 className="lbl" style={{
    fontSize: 10, letterSpacing: '.12em', color: 'var(--faint)', margin: '30px 0 12px',
  }}>{String(children).toUpperCase()}</h2>
)
