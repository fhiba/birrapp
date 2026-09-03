import { useEffect, useState } from 'react'
import * as api from '../data/api'
import type { RatingComment } from '../data/types'
import { Confirm, Sheet } from './Chrome'
import { Stars } from './Stars'

/**
 * Convierte lo tecleado en un puntaje de 0 a 5 con un decimal, o null si no
 * hay nada válido. Acepta coma (3,8), redondea y recorta al rango: el backend
 * valida igual, esto es sólo para no mandarle basura.
 */
function parseRating(raw: string): number | null {
  const n = parseFloat(raw.trim().replace(',', '.'))
  if (Number.isNaN(n)) return null
  return Math.min(5, Math.max(0, Math.round(n * 10) / 10))
}

/**
 * Nota y comentarios de una birra, detrás del ícono.
 *
 * No están nunca a la vista por defecto: el contenido de la pantalla es el
 * precio y la nota. El texto es el detalle que se busca cuando ya decidiste
 * que te interesa, y sacarlo de la vista principal es lo que permite meter
 * varias birras en una sola pantalla sin que sea un muro.
 *
 * La nota y el comentario son dos acciones separadas, y eso se ve en la
 * pantalla. Las estrellas se guardan al tocarlas, sin botón: son una sola por
 * persona y por birra, así que tocarlas de nuevo corrige la anterior. El texto
 * tiene su propio botón, y cada vez que lo usás dejás un comentario más —
 * volviste seis meses después y la canilla cambió, y eso es algo nuevo que
 * decir, no una corrección de lo anterior.
 */
export function BeerComments({
  barId, styleSlug, brandSlug, title, canWrite, modMode, myRating, initialRating,
  onClose, onWrote,
}: {
  barId: number
  styleSlug: string
  /**
   * Los comentarios son de esta birra y de ninguna otra. Sin la marca, lo que
   * alguien escribió sobre la IPA de Antares aparecía debajo de la de Juguetes
   * Perdidos: la señal que más confunde, porque dice que probaste una cosa
   * cuando probaste otra.
   */
  brandSlug: string | null
  /** Estilo y marca juntos: el estilo solo ya no nombra a la birra. */
  title: string
  canWrite: boolean
  /** Modo moderador prendido: aparecen las acciones destructivas. */
  modMode: boolean
  myRating: number | null
  /** Estrella que se tocó para abrir esto, si se abrió desde las estrellas. */
  initialRating?: number
  onClose: () => void
  onWrote: () => void
}) {
  const [items, setItems] = useState<RatingComment[] | null>(null)
  const [body, setBody] = useState('')
  const [rating, setRating] = useState(myRating)
  const [busy, setBusy] = useState(false)
  const [savingStar, setSavingStar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RatingComment | null>(null)

  const reload = () =>
    api.beerComments(barId, styleSlug, brandSlug)
      .then(setItems)
      .catch(e => { setError((e as Error).message); setItems([]) })

  useEffect(() => { reload() }, [barId, styleSlug, brandSlug])   // eslint-disable-line

  // Si se abrió tocando una estrella, ese toque ya es el voto: pedirle además
  // que confirme sería agregarle un paso a la acción más barata que tiene.
  useEffect(() => {
    if (initialRating != null && initialRating !== myRating) rate(initialRating)
    // eslint-disable-next-line
  }, [])

  async function rate(n: number) {
    setRating(n); setSavingStar(true); setError(null)
    try {
      await api.rateBeer({ barId, styleSlug, brandSlug, rating: n })
      onWrote()
    } catch (e) {
      setError((e as Error).message)
      setRating(myRating)   // se vuelve a lo que había: no quedó guardado
    } finally { setSavingStar(false) }
  }

  const send = async () => {
    const text = body.trim()
    if (!text) return
    setBusy(true); setError(null)
    try {
      await api.addComment({ barId, styleSlug, brandSlug, body: text })
      setBody('')
      await reload()
      onWrote()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      {canWrite && (
        <div style={{
          padding: 12, borderRadius: 14, background: 'var(--base)', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Stars value={rating} mine={rating != null} size={26} onRate={rate} />
            {/* La estrella redondea a la entera; para un 3,8 hace falta
                teclearlo. Va sin control de React —`key` lo resetea cuando la
                nota cambia por otro lado (guardado, o rollback tras un error)—
                y confirma con Enter o al salir del campo. Acepta coma. */}
            <input
              key={rating ?? 'none'}
              type="number" inputMode="decimal" min={0} max={5} step={0.1}
              defaultValue={rating ?? ''}
              aria-label="Puntaje de 0 a 5"
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              onBlur={e => {
                const n = parseRating(e.currentTarget.value)
                if (n != null && n !== rating) rate(n)
              }}
              style={{
                width: 52, padding: '4px 6px', borderRadius: 8, fontSize: 13,
                background: 'transparent', border: '1px solid var(--hairline)',
                color: 'inherit', fontFamily: 'inherit',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--faint)' }}>
              {savingStar ? 'Guardando…'
                : rating != null ? 'Tu puntaje — tocá una estrella o escribilo'
                : 'Tu puntaje'}
            </span>
          </div>

          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="Cómo estaba (opcional)" rows={2} maxLength={600}
            style={{
              width: '100%', marginTop: 10, padding: '10px 12px', borderRadius: 11,
              background: 'transparent', border: '1px solid var(--hairline)',
              resize: 'vertical', fontFamily: 'inherit', fontSize: 14,
            }}
          />
          <button disabled={busy || !body.trim()} onClick={send} className="lbl" style={{
            width: '100%', marginTop: 8, padding: 12, borderRadius: 12, fontSize: 13.5,
            background: !body.trim() ? 'var(--elevated)'
              : busy ? 'var(--amber-deep)' : 'var(--amber)',
            color: !body.trim() ? 'var(--faint)' : 'var(--base)',
            cursor: body.trim() ? 'pointer' : 'not-allowed',
          }}>{busy ? '…' : 'Comentar'}</button>
        </div>
      )}

      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

      {items == null ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
          <div className="spinner" />
        </div>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: '8px 0' }}>
          Todavía nadie comentó esta birra.
        </p>
      ) : items.map(c => (
        <div key={c.id} style={{
          padding: '12px 0', borderTop: '1px solid rgba(255,255,255,.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* La nota puede faltar: se puede comentar sin votar. */}
            {c.rating != null && <Stars value={c.rating} mine={c.mine} size={13} />}
            <span style={{ fontSize: 13, color: c.mine ? 'var(--amber)' : 'var(--muted)' }}>
              {c.mine ? 'Vos' : c.authorName}
            </span>
            {/* La edad va siempre pegada, igual que con los precios: un
                comentario de hace dos años sobre una canilla que ya cambió
                dice menos de lo que parece. */}
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--faint)' }}>
              {c.ageDays <= 0 ? 'hoy' : c.ageDays === 1 ? 'ayer' : `hace ${c.ageDays} d`}
            </span>
          </div>
          {c.body && <p style={{ margin: '6px 0 0', fontSize: 14 }}>{c.body}</p>}

          {/* Lo propio se borra siempre, sin ser moderador: son tus palabras.
              Antes esto no existía porque la nota y el comentario eran la misma
              fila y no se podía bajar una sin la otra. */}
          {(c.mine || modMode) && (
            <button onClick={() => setConfirmDelete(c)} style={{
              marginTop: 6, fontSize: 12, color: 'var(--danger)',
            }}>{c.mine ? 'Borrar' : 'Eliminar'}</button>
          )}
        </div>
      ))}

      {confirmDelete && (
        <Confirm
          title={confirmDelete.mine ? '¿Borrar tu comentario?' : '¿Eliminar este comentario?'}
          body={confirmDelete.mine ? (
            <>
              Se borra sólo el texto. Tu puntaje de esta birra queda como está —
              borrar lo que escribiste no es retirar tu voto.
              <br /><br />
              No se puede deshacer.
            </>
          ) : (
            <>
              Se baja el comentario de <strong>{confirmDelete.authorName}</strong>.
              <br /><br />
              Su puntaje no se toca: para eso está la acción sobre la nota. Bajar
              un texto no debería cambiar el promedio de la birra.
            </>
          )}
          confirmLabel={confirmDelete.mine ? 'Borrar' : 'Eliminar'} danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const c = confirmDelete
            setConfirmDelete(null); setError(null)
            try {
              await (c.mine ? api.removeMyComment(c.id) : api.removeComment(c.id))
              await reload()
              onWrote()
            } catch (e) { setError((e as Error).message) }
          }}
        />
      )}
    </Sheet>
  )
}
