import { useRef, useState } from 'react'
import * as api from '../data/api'
import type { User } from '../data/types'
import { compressImage } from '../data/image'
import { Confirm } from './Chrome'

/**
 * Foto de perfil.
 *
 * La de Google se sigue usando como punto de partida, y la propia la pisa. Se
 * guardan las dos por separado del lado del servidor, así que sacar la propia
 * devuelve la de Google en vez de dejar a la persona sin nada — que es lo que
 * pasaría si hubiera una sola columna y la pisáramos.
 *
 * La imagen se recomprime en el navegador antes de subir, igual que las fotos
 * de birra. No es sólo por tamaño: volver a codificarla en un canvas borra el
 * EXIF, y ahí viven las coordenadas GPS de dónde se sacó. Una foto de perfil
 * subida tal cual publicaría la casa de quien la sacó en una URL abierta.
 */
export function AvatarPicker({
  user, onChange,
}: { user: User; onChange: (u: User) => void }) {
  const picker = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const take = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Se limpia el input o elegir la misma foto dos veces no dispara `change`.
    e.target.value = ''
    if (!file) return
    setError(null); setBusy(true)
    try { onChange(await api.uploadAvatar(await compressImage(file))) }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  const initial = user.displayName.trim().slice(0, 1).toUpperCase() || '?'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <button
        onClick={() => picker.current?.click()}
        disabled={busy}
        aria-label="Cambiar tu foto de perfil"
        style={{
          position: 'relative', width: 64, height: 64, borderRadius: '50%',
          flexShrink: 0, padding: 0, overflow: 'hidden',
          background: 'var(--elevated)',
        }}
      >
        {user.avatarUrl
          ? <img src={user.avatarUrl} alt="" style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            }} />
          : <span className="ttl" style={{ fontSize: 24, color: 'var(--muted)' }}>
              {initial}
            </span>}

        {/* El lápiz encima y no un botón al lado: la foto ES el control, y en
            un teléfono ese es el objetivo más fácil de acertar. */}
        <span style={{
          position: 'absolute', right: 0, bottom: 0,
          width: 22, height: 22, borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          background: 'var(--amber)', color: 'var(--base)',
          border: '2px solid var(--base)',
        }}>
          {busy
            ? <span className="spinner" style={{ width: 10, height: 10 }} />
            : <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
              </svg>}
        </span>
      </button>

      <input
        ref={picker} type="file" accept="image/*" hidden onChange={take}
      />

      <div style={{ minWidth: 0 }}>
        <button
          onClick={() => picker.current?.click()} disabled={busy}
          className="lbl" style={{ fontSize: 13, color: 'var(--amber)', padding: 0 }}
        >{busy ? 'Subiendo…' : user.avatarUrl ? 'Cambiar foto' : 'Poner una foto'}</button>

        {/* Sólo si hay algo propio que sacar. Con la de Google no aplica: no es
            nuestra para borrarla. */}
        {user.avatarUrl?.includes('/avatar/') && (
          <>
            <span style={{ color: 'var(--faint)', margin: '0 7px' }}>·</span>
            <button
              onClick={() => setConfirmRemove(true)} disabled={busy}
              style={{ fontSize: 13, color: 'var(--muted)', padding: 0 }}
            >Sacarla</button>
          </>
        )}

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 12, margin: '4px 0 0' }}>{error}</p>
        )}
      </div>

      {confirmRemove && (
        <Confirm
          title="¿Sacar tu foto?"
          body={<>
            Se borra el archivo, no sólo de la vista. Vuelve la foto de tu cuenta
            de Google.
            <br /><br />
            No se puede deshacer, pero podés subir otra cuando quieras.
          </>}
          confirmLabel="Sacarla" danger
          onCancel={() => setConfirmRemove(false)}
          onConfirm={async () => {
            setConfirmRemove(false); setError(null); setBusy(true)
            try { onChange(await api.removeAvatar()) }
            catch (e) { setError((e as Error).message) }
            finally { setBusy(false) }
          }}
        />
      )}
    </div>
  )
}
