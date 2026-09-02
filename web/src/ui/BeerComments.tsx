import { useEffect, useState } from 'react'
import * as api from '../data/api'
import type { RatingComment } from '../data/types'
import { Confirm, Sheet } from './Chrome'
import { Stars } from './Stars'

/**
 * Comentarios de una birra, detrás del ícono.
 *
 * No están nunca a la vista por defecto: el contenido de la pantalla es el
 * precio y la nota. El texto es el detalle que se busca cuando ya decidiste
 * que te interesa, y sacarlo de la vista principal es lo que permite meter
 * varias birras en una sola pantalla sin que sea un muro.
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
  const [rating, setRating] = useState(initialRating ?? myRating ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RatingComment | null>(null)

  useEffect(() => {
    api.beerComments(barId, styleSlug, brandSlug)
      .then(setItems)
      .catch(e => { setError((e as Error).message); setItems([]) })
  }, [barId, styleSlug, brandSlug])

  const send = async () => {
    if (rating < 1) { setError('Elegí cuántas estrellas antes de comentar'); return }
    setBusy(true); setError(null)
    try {
      await api.rateBeer({ barId, styleSlug, brandSlug, rating, body: body.trim() || null })
      setBody('')
      setItems(await api.beerComments(barId, styleSlug, brandSlug))
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Stars value={rating || null} mine size={26} onRate={setRating} />
            <span style={{ fontSize: 12, color: 'var(--faint)' }}>
              {myRating != null ? 'Ya la puntuaste — podés cambiarlo' : 'Tu puntaje'}
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
          <button disabled={busy} onClick={send} className="lbl" style={{
            width: '100%', marginTop: 8, padding: 12, borderRadius: 12, fontSize: 13.5,
            background: busy ? 'var(--amber-deep)' : 'var(--amber)', color: 'var(--base)',
          }}>{busy ? '…' : myRating != null ? 'Actualizar mi puntaje' : 'Puntuar'}</button>
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
            <Stars value={c.rating} mine={c.mine} size={13} />
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

          {modMode && (
            <button onClick={() => setConfirmDelete(c)} style={{
              marginTop: 6, fontSize: 12, color: 'var(--danger)',
            }}>Eliminar</button>
          )}
        </div>
      ))}

      {confirmDelete && (
        <Confirm
          title="¿Eliminar este comentario?"
          body={<>
            Se baja el voto de <strong>{confirmDelete.authorName}</strong> y su
            comentario. Deja de contar para el promedio de la birra.
            <br /><br />
            Si el problema es sólo el texto, tené en cuenta que esto también borra
            la nota: no se puede bajar una cosa sin la otra.
          </>}
          confirmLabel="Eliminar" danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const c = confirmDelete
            setConfirmDelete(null); setError(null)
            try {
              await api.removeRating(c.id)
              setItems(await api.beerComments(barId, styleSlug, brandSlug))
              onWrote()
            } catch (e) { setError((e as Error).message) }
          }}
        />
      )}
    </Sheet>
  )
}
