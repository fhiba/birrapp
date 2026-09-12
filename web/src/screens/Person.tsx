import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as api from '../data/api'
import type { Person, User } from '../data/types'
import { isModerator } from '../data/types'
import { Confirm, Toast } from '../ui/Chrome'
import { PintLoader } from '../ui/PintLoader'

/**
 * El perfil de otra persona (BIR-6).
 *
 * Cierra el caso del comentario abusivo, que hasta ahora terminaba a medias:
 * la moderación llegaba hasta la fila —bajar el comentario— y no había forma de
 * llegar desde ahí a quién lo escribió. Bajar la fila no alcanza, porque el
 * autor la vuelve a mandar; lo que corta el problema es actuar sobre la
 * persona.
 *
 * Dos herramientas distintas, y hacen falta las dos:
 *
 * - **Bloquear** lo puede hacer cualquiera y sólo decide qué ve: se dejan de
 *   ver los comentarios y las fotos, en las dos direcciones.
 * - **Suspender** lo hace un moderador y saca a esa persona de la comunidad.
 *   Aparece sólo en modo moderador.
 *
 * No se muestra el email: lo que se ve de alguien es lo que aportó, que ya está
 * firmado con su nombre en el mapa.
 */
export function PersonScreen({ user }: { user: User | null }) {
  const nav = useNavigate()
  const { id } = useParams()
  const personId = Number(id)

  const [person, setPerson] = useState<Person | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'block' | 'ban' | null>(null)

  const load = useCallback(() => {
    api.person(personId).then(p => { setPerson(p); setError(null) })
      .catch(e => setError((e as Error).message))
  }, [personId])

  useEffect(load, [load])

  const act = async (fn: () => Promise<unknown>, aviso: string) => {
    setBusy(true)
    try { await fn(); setToast(aviso); load() }
    catch (e) { setToast((e as Error).message) }
    finally { setBusy(false) }
  }

  if (error) return (
    <Wrap onBack={() => nav(-1)}>
      <p style={{ color: 'var(--danger)' }}>{error}</p>
    </Wrap>
  )
  if (!person) return <PintLoader message="Buscando…" />

  const esVos = user?.id === person.id

  return (
    <Wrap onBack={() => nav(-1)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {person.avatarUrl ? (
          <img src={person.avatarUrl} alt="" width={64} height={64}
            style={{ borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div className="num" style={{
            width: 64, height: 64, borderRadius: '50%', display: 'grid',
            placeItems: 'center', background: 'var(--elevated)',
            color: 'var(--muted)', fontSize: 24,
          }}>{person.displayName.charAt(0).toUpperCase()}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="ttl" style={{ fontSize: 24, margin: 0 }}>{person.displayName}</h1>
          <p style={{ color: 'var(--faint)', fontSize: 12.5, margin: '4px 0 0' }}>
            {person.ageDays < 1 ? 'Se sumó hoy'
              : person.ageDays === 1 ? 'Se sumó ayer'
              : `Acá desde hace ${person.ageDays} días`}
          </p>
        </div>
      </div>

      {/* Sólo un moderador ve esto: que una cuenta esté suspendida no es
          información pública, sería una lista de escarmiento. */}
      {person.banned && (
        <div style={{
          marginTop: 16, padding: '10px 13px', borderRadius: 11, fontSize: 12.5,
          background: 'rgba(255,122,102,.12)', color: 'var(--danger)',
        }}>Cuenta suspendida — no puede aportar nada</div>
      )}

      <SectionLabel>Lo que aportó</SectionLabel>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10,
      }}>
        <Stat label="Precios" value={person.prices} />
        <Stat label="Bares" value={person.bars} />
        <Stat label="Fotos" value={person.photos} />
        <Stat label="Notas" value={person.ratings} />
      </div>

      {!esVos && user && (
        <>
          <SectionLabel>Si te molesta</SectionLabel>
          <button
            disabled={busy}
            onClick={() => person.blocked
              ? act(() => api.unblockPerson(person.id), 'Desbloqueada')
              : setConfirm('block')}
            className="lbl"
            style={{
              width: '100%', padding: 15, borderRadius: 14, textAlign: 'left', fontSize: 14,
              background: person.blocked ? 'var(--elevated)' : 'rgba(255,122,102,.12)',
              color: person.blocked ? 'var(--cream)' : 'var(--danger)',
            }}
          >
            {person.blocked ? 'Desbloquear a esta persona' : 'Bloquear a esta persona'}
          </button>
          <p style={{
            color: 'var(--faint)', fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.5,
          }}>
            {person.blocked
              ? 'Ahora mismo no ven los comentarios ni las fotas del otro. Sus precios siguen en el mapa: son datos sobre bares.'
              : 'Dejan de verse los comentarios y las fotos, los dos lados. Los precios que cargó siguen en el mapa: son datos sobre bares, no sobre ella.'}
          </p>
        </>
      )}

      {isModerator(user) && !esVos && (
        <>
          <SectionLabel>Moderación</SectionLabel>
          <button
            disabled={busy}
            onClick={() => person.banned
              ? act(() => api.unbanUser(person.id), 'Suspensión levantada')
              : setConfirm('ban')}
            className="lbl"
            style={{
              width: '100%', padding: 15, borderRadius: 14, textAlign: 'left', fontSize: 14,
              background: person.banned ? 'var(--elevated)' : 'rgba(255,122,102,.12)',
              color: person.banned ? 'var(--cream)' : 'var(--danger)',
            }}
          >{person.banned ? 'Levantar la suspensión' : 'Suspender la cuenta'}</button>
          <p style={{
            color: 'var(--faint)', fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.5,
          }}>
            Suspender corta al toque: deja de poder cargar precios, comentar y
            puntuar. Lo que ya cargó queda — para bajar algo puntual, se baja
            desde el bar.
          </p>
        </>
      )}

      {confirm === 'block' && (
        <Confirm
          title={`¿Bloquear a ${person.displayName}?`}
          body="Dejan de verse los comentarios y las fotos, los dos lados. Lo podés deshacer cuando quieras."
          confirmLabel="Bloquear" danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            act(() => api.blockPerson(person.id), 'Bloqueada')
          }}
        />
      )}

      {confirm === 'ban' && (
        <Confirm
          title={`¿Suspender a ${person.displayName}?`}
          body={<>
            Deja de poder cargar precios, comentar y puntuar, desde ahora mismo.
            <br /><br />
            Lo que ya cargó queda en el mapa: son datos sobre bares. Si además
            hay que bajar algo puntual, se baja desde el bar.
          </>}
          confirmLabel="Suspender" danger requireWord="SUSPENDER"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            act(() => api.banUser(person.id), 'Cuenta suspendida')
          }}
        />
      )}

      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
      <div style={{ height: 30 }} />
    </Wrap>
  )
}

function Wrap({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(var(--safe-top) + 12px) 20px calc(24px + var(--nav-gap))`,
    }}>
      <div className="desk-narrow">
        <button onClick={onBack} style={{
          width: 38, height: 38, borderRadius: '50%', background: 'var(--elevated)',
          marginBottom: 18,
        }} aria-label="Volver">←</button>
        {children}
      </div>
    </div>
  )
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div style={{ padding: '13px 14px', borderRadius: 14, background: 'var(--raised)' }}>
    <div className="num" style={{
      fontSize: 20, color: value > 0 ? 'var(--amber)' : 'var(--faint)',
    }}>{value}</div>
    <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 3 }}>{label}</div>
  </div>
)

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h2 className="lbl" style={{
    fontSize: 10, letterSpacing: '.12em', color: 'var(--faint)', margin: '28px 0 10px',
  }}>{String(children).toUpperCase()}</h2>
)
