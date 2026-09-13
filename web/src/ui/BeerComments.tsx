import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { RatingComment } from '../data/types'
import { Confirm } from './Chrome'
import { Stars } from './Stars'

/** Cuántos comentarios por página. Lo que entra en una pantalla. */
const PAGE = 10

/**
 * Los comentarios de una birra, abajo de sus fotos.
 *
 * Estaban detrás de un ícono, en una hoja que había que abrir. El argumento
 * era no convertir la pantalla en un muro, pero el efecto real es que nadie
 * los lee: lo que no se ve no existe, y un comentario que nadie lee tampoco lo
 * escribe nadie. Ahora están en la página, después de las fotos, que es el
 * orden en que se mira una birra — cuánto sale, cómo se ve, qué dijeron.
 *
 * Se muestran de a diez, del más nuevo al más viejo, con el resto detrás de un
 * botón: así una birra con historia no alarga la ficha sin fin.
 *
 * La nota NO está acá: vive con la birra, arriba, donde están las estrellas.
 * Son dos acciones distintas —puntuar es una sola por persona, comentar son
 * todas las que quieras— y tenerlas juntas en la misma caja era lo que hacía
 * que puntuar pareciera parte de escribir.
 */
export function BeerComments({
  barId, styleSlug, brandSlug, canWrite, modMode, myRating,
  onWrote,
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
  canWrite: boolean
  /** Modo moderador prendido: aparecen las acciones destructivas. */
  modMode: boolean
  /** Sólo para saber si ya puntuó, al pie del cuadro de escribir. */
  myRating: number | null
  onWrote: () => void
}) {
  const nav = useNavigate()
  const [items, setItems] = useState<RatingComment[] | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RatingComment | null>(null)
  /** Quedan más abajo. Se sabe porque la página vino llena. */
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  /**
   * De a diez, del más nuevo al más viejo.
   *
   * Antes se traían cien de una y se dibujaban todos: en una birra con
   * historia, eso es una hoja que no termina y una lista que tarda en
   * aparecer. Diez es lo que entra en una pantalla, y lo que sigue se pide
   * cuando alguien lo pide.
   */
  const reload = () =>
    api.beerComments(barId, styleSlug, brandSlug, { limit: PAGE })
      .then(r => { setItems(r); setMore(r.length === PAGE) })
      .catch(e => { setError((e as Error).message); setItems([]); setMore(false) })

  const loadMore = async () => {
    if (!items) return
    setLoadingMore(true)
    try {
      const r = await api.beerComments(barId, styleSlug, brandSlug, {
        limit: PAGE, offset: items.length,
      })
      setItems([...items, ...r])
      setMore(r.length === PAGE)
    } catch (e) { setError((e as Error).message) } finally { setLoadingMore(false) }
  }

  useEffect(() => { reload() }, [barId, styleSlug, brandSlug])   // eslint-disable-line

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
    <section style={{ marginTop: 18 }}>
      <h3 className="lbl" style={{
        fontSize: 'var(--t-1)', letterSpacing: '.12em', color: 'var(--faint)', margin: '0 0 10px',
      }}>
        COMENTARIOS{items && items.length > 0 ? ` · ${items.length}${more ? '+' : ''}` : ''}
      </h3>
      {canWrite && (
        <div style={{
          padding: 12, borderRadius: 'var(--r-3)', background: 'var(--base)', marginBottom: 16,
        }}>
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="Cómo estaba (opcional)" rows={2} maxLength={600}
            style={{
              width: '100%', marginTop: 10, padding: '12px 12px', borderRadius: 'var(--r-2)',
              background: 'transparent', border: '1px solid var(--hairline)',
              resize: 'vertical', fontFamily: 'inherit', fontSize: 'var(--t-4)',
            }}
          />
          <button disabled={busy || !body.trim()} onClick={send} className="lbl" style={{
            width: '100%', marginTop: 8, padding: 12, borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
            background: !body.trim() ? 'var(--elevated)'
              : busy ? 'var(--amber-deep)' : 'var(--amber)',
            color: !body.trim() ? 'var(--faint)' : 'var(--base)',
            cursor: body.trim() ? 'pointer' : 'not-allowed',
          }}>{busy ? '…' : 'Comentar'}</button>
        </div>
      )}

      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>}

      {items == null ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
          <div className="spinner" />
        </div>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-4)', margin: '8px 0' }}>
          Todavía nadie comentó esta birra.
        </p>
      ) : items.map(c => (
        <div key={c.id} style={{
          padding: '12px 0', borderTop: '1px solid var(--film-2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* La nota puede faltar: se puede comentar sin votar. */}
            {c.rating != null && <Stars value={c.rating} mine={c.mine} size={13} />}
            {/* El nombre abre su perfil (BIR-6): es desde acá que hace falta
                llegar a la persona, no desde una pantalla de moderación. El
                propio no, que no tiene sentido ir a mirarse a uno mismo. */}
            {c.mine ? (
              <span style={{ fontSize: 'var(--t-3)', color: 'var(--amber)' }}>Vos</span>
            ) : (
              <button
                onClick={() => nav(`/usuario/${c.authorId}`)}
                className="lbl"
                style={{
                  fontSize: 'var(--t-3)', color: 'var(--muted)', textDecoration: 'underline',
                  textDecorationColor: 'var(--film-4)', textUnderlineOffset: 3,
                }}
              >{c.authorName}</button>
            )}
            {/* La edad va siempre pegada, igual que con los precios: un
                comentario de hace dos años sobre una canilla que ya cambió
                dice menos de lo que parece. */}
            <span style={{ marginLeft: 'auto', fontSize: 'var(--t-2)', color: 'var(--faint)' }}>
              {c.ageDays <= 0 ? 'hoy' : c.ageDays === 1 ? 'ayer' : `hace ${c.ageDays} d`}
            </span>
          </div>
          {c.body && <p style={{ margin: '6px 0 0', fontSize: 'var(--t-4)' }}>{c.body}</p>}

          {/* Lo propio se borra siempre, sin ser moderador: son tus palabras.
              Antes esto no existía porque la nota y el comentario eran la misma
              fila y no se podía bajar una sin la otra. */}
          {(c.mine || modMode) && (
            <button onClick={() => setConfirmDelete(c)} style={{
              marginTop: 6, fontSize: 'var(--t-2)', color: 'var(--danger)',
            }}>{c.mine ? 'Borrar' : 'Eliminar'}</button>
          )}
        </div>
      ))}

      {/* Abajo de todo y no un scroll infinito: los comentarios son el final
          de la ficha, y cargar solo al llegar haría que la pantalla nunca
          termine de crecer mientras se lee. */}
      {more && (
        <button
          onClick={loadMore} disabled={loadingMore} className="lbl"
          style={{
            width: '100%', marginTop: 12, padding: 12, borderRadius: 'var(--r-2)',
            fontSize: 'var(--t-3)', background: 'var(--film-2)', color: 'var(--muted)',
          }}
        >{loadingMore ? '…' : 'Ver comentarios más viejos'}</button>
      )}

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
    </section>
  )
}
