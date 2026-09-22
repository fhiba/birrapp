import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as api from '../data/api'
import type { Person, User } from '../data/types'
import { isModerator } from '../data/types'
import { Confirm, Toast } from '../ui/Chrome'
import { Empty } from '../ui/Empty'
import { PintLoader } from '../ui/PintLoader'
import { Screen, SectionLabel, Tile } from '../ui/Kit'

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

  const modera = isModerator(user)

  /**
   * Abre la lista de ese tipo de aporte, o nada si no se puede.
   *
   * Devuelve `undefined` sin rol, y con eso `Tile` se dibuja como un `div` en
   * vez de un botón: una baldosa que no lleva a ningún lado no tiene que
   * anunciarse como tocable.
   */
  const abrir = (tipo: string) => modera
    ? () => nav(`/usuario/${personId}/aportes/${tipo}`)
    : undefined

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
    <Screen onBack={() => nav(-1)}>
      <Empty
        title="No pudimos abrir este perfil"
        hint={error}
        action="Reintentar"
        onAction={load}
      />
    </Screen>
  )
  if (!person) return <PintLoader message="Buscando…" />

  const esVos = user?.id === person.id

  return (
    <Screen onBack={() => nav(-1)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {person.avatarUrl ? (
          <img src={person.avatarUrl} alt="" width={64} height={64}
            style={{ borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div className="num" style={{
            width: 64, height: 64, borderRadius: '50%', display: 'grid',
            placeItems: 'center', background: 'var(--elevated)',
            color: 'var(--muted)', fontSize: 'var(--t-7)',
          }}>{person.displayName.charAt(0).toUpperCase()}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: 0 }}>{person.displayName}</h1>
          <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '4px 0 0' }}>
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
          marginTop: 'var(--s-4)', padding: 'var(--s-3)', borderRadius: 'var(--r-2)',
          fontSize: 'var(--t-2)',
          /* El coral apagado por token: en heritage el favorito y el peligro
             son el mismo coral y hay un solo relleno suave para los dos. */
          background: 'var(--favorito-soft)', color: 'var(--danger)',
        }}>Cuenta suspendida — no puede aportar nada</div>
      )}

      <SectionLabel>Lo que aportó</SectionLabel>
      {/*
        Moderando, cada número se abre.

        Antes eran cuatro números y nada más: el perfil decía "14 precios" y
        para ver cuáles había que entrar bar por bar. Un contador que no se
        puede abrir no alcanza para decidir si alguien está cargando mal o de
        mala fe, que es justo lo que hay que decidir mirando este perfil.

        Se abren las que tienen lista del otro lado. "Notas" no: las
        puntuaciones no tienen pantalla propia en ningún lado, ni siquiera para
        lo propio, así que una baldosa tocable llevaría a nada. Vale más un
        número quieto que un botón que no cumple.

        Y "Comentarios" aparece sólo moderando: es el aporte que más se revisa
        —es el único con texto libre— y el dato ya venía en la respuesta sin
        que nadie lo mostrara.
      */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
      }}>
        <Tile label="Precios" value={person.prices} onClick={abrir('precios')} />
        <Tile label="Bares" value={person.bars} onClick={abrir('bares')} />
        <Tile label="Fotos" value={person.photos} onClick={abrir('fotos')} />
        <Tile label="Notas" value={person.ratings} />
        {modera && (
          <Tile label="Comentarios" value={person.comments} onClick={abrir('comentarios')} />
        )}
      </div>

      {!esVos && user && (
        <>
          <SectionLabel>Si te molesta</SectionLabel>
          <Accion
            disabled={busy}
            danger={!person.blocked}
            onClick={() => person.blocked
              ? act(() => api.unblockPerson(person.id), 'Desbloqueada')
              : setConfirm('block')}
            label={person.blocked ? 'Desbloquear a esta persona' : 'Bloquear a esta persona'}
          />
          <p style={{
            color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '8px 0 0', lineHeight: 1.5,
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
          <Accion
            disabled={busy}
            danger={!person.banned}
            onClick={() => person.banned
              ? act(() => api.unbanUser(person.id), 'Suspensión levantada')
              : setConfirm('ban')}
            label={person.banned ? 'Levantar la suspensión' : 'Suspender la cuenta'}
          />
          <p style={{
            color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '8px 0 0', lineHeight: 1.5,
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
    </Screen>
  )
}

/**
 * El botón de las dos acciones fuertes de esta pantalla.
 *
 * Los dos —bloquear y suspender— eran el mismo bloque escrito dos veces con
 * distinto texto, y ya se habían separado en un detalle (uno tenía el texto
 * adentro del `children` y el otro no).
 *
 * La forma la fija la pizarra: lo destructivo es **un botón con borde**, no un
 * relleno de color, y la confirmación la sigue pidiendo `Confirm`. El borde es
 * lo que lo hace legible con la pantalla en blanco y negro, que es la prueba
 * de si un estado se distingue por color o por forma. Lo que deshace la acción
 * no lleva coral: deshacer no es peligroso.
 *
 * Eso decía este comentario desde el principio y el código hacía otra cosa:
 * ponía el borde coral **y además** el relleno `--favorito-soft`, que es
 * exactamente la pastilla teñida que `Moderation` dice haber abandonado y que
 * `Settings` ya no usa. Con relleno, "Suspender la cuenta" pesa igual que un
 * CTA y es el botón más fácil de apretar de la pantalla — al revés de lo que
 * tiene que ser. Queda sólo el borde, que es la forma que ya usan las otras dos
 * pantallas.
 *
 * `.cta` es el hundido al tocar: estas dos acciones salen a la red, y sin
 * respuesta al toque se aprietan dos veces.
 */
function Accion({ label, danger, disabled, onClick }: {
  label: string; danger: boolean; disabled?: boolean; onClick: () => void
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="lbl cta"
      style={{
        width: '100%', minHeight: 52, padding: 'var(--s-3) var(--s-4)',
        borderRadius: 'var(--r-2)', textAlign: 'left', fontSize: 'var(--t-4)',
        background: danger ? 'transparent' : 'var(--elevated)',
        border: `1px solid ${danger ? 'var(--danger)' : 'transparent'}`,
        color: danger ? 'var(--danger)' : 'var(--cream)',
      }}
    >{label}</button>
  )
}
