import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { RatingComment } from '../data/types'
import { Confirm } from './Chrome'
import { shortAge } from '../data/format'
import { t, tx } from '../i18n'

/** Cuántos comentarios por página. Lo que entra en una pantalla. */
const PAGE = 10

/**
 * Las iniciales de un nombre, para el cuadradito de la izquierda.
 *
 * Una o dos letras, que es lo que entra sin achicar la tipografía. No es un
 * avatar: es lo que hace que la lista tenga un borde izquierdo parejo y que
 * dos comentarios seguidos de la misma persona se vean como suyos sin leer el
 * nombre. Va en la familia de `--info` —relleno, borde y tinta— porque es
 * cromo informativo y no un dato: si fuera hueso pesaría lo mismo que la nota,
 * que sí lo es.
 */
const iniciales = (nombre: string) =>
  nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase() || '?'

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

  /**
   * Publica el comentario: primero en la lista, después en el servidor.
   *
   * El comentario aparece en el toque, con un id negativo que no puede chocar
   * con ninguno del servidor, y la recarga de atrás lo reemplaza por el de
   * verdad. Antes se esperaba la escritura y la recarga entera de la lista
   * para vaciar el campo, y en ese rato la pantalla se veía igual que antes de
   * tocar: escribiste, tocaste, y no pasó nada.
   *
   * Si falla, el comentario se saca y el texto vuelve al campo. Un comentario
   * que no salió es un contratiempo; perder lo que alguien escribió es otra
   * cosa.
   */
  const send = async () => {
    const text = body.trim()
    if (!text) return
    setError(null)
    const yo = api.currentUser()
    const provisorio: RatingComment = {
      id: -Date.now(),
      authorId: yo?.id ?? 0,
      authorName: yo?.displayName ?? '',
      body: text,
      ageDays: 0,
      mine: true,
      rating: myRating,
    }
    setItems(cur => [provisorio, ...(cur ?? [])])
    setBody('')
    try {
      await api.addComment({ barId, styleSlug, brandSlug, body: text })
      reload()
      onWrote()
    } catch (e) {
      setItems(cur => (cur ?? []).filter(x => x.id !== provisorio.id))
      setBody(text)
      setError((e as Error).message)
    }
  }

  return (
    <section>
      <h3 className="section-label">
        {t('BeerComments.titulo')}{items && items.length > 0 ? ` · ${items.length}${more ? '+' : ''}` : ''}
      </h3>

      {canWrite && (
        /* Sin caja alrededor: el campo ya tiene su filete y su radio, y una
           tarjeta con un campo adentro es una caja adentro de otra. */
        <div style={{ marginBottom: 'var(--s-4)' }}>
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder={t('BeerComments.placeholder')} rows={2} maxLength={600}
            style={{
              width: '100%', padding: 'var(--s-3)', borderRadius: 'var(--r-2)',
              background: 'transparent', border: '1px solid var(--hairline)',
              resize: 'vertical', fontFamily: 'inherit', fontSize: 'var(--t-field)',
            }}
          />
          <button disabled={!body.trim()} onClick={send} className="lbl" style={{
            width: '100%', marginTop: 'var(--s-2)', minHeight: 46,
            borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
            background: !body.trim() ? 'var(--film-2)'
              : 'var(--acento)',
            color: !body.trim() ? 'var(--faint)' : 'var(--base)',
            cursor: body.trim() ? 'pointer' : 'not-allowed',
          }}>{t('BeerComments.comentar')}</button>
        </div>
      )}

      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>}

      {items == null ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 'var(--s-5)' }}>
          <div className="spinner" />
        </div>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-4)', margin: 'var(--s-2) 0' }}>
          {t('BeerComments.nadie')}
        </p>
      ) : items.map(c => (
        <div key={c.id} style={{
          display: 'flex', gap: 'var(--s-3)',
          padding: 'var(--s-4) 0', borderBottom: '1px solid var(--hairline)',
        }}>
          {/* Cuadrado y no redondo: en esta dirección lo redondo es lo que se
              toca, y esto no se toca. El nombre de al lado sí. */}
          <span aria-hidden className="num" style={{
            width: 36, height: 36, flexShrink: 0,
            borderRadius: 'var(--r-1)', display: 'grid', placeItems: 'center',
            fontSize: 'var(--t-3)',
            background: 'var(--info-soft)', border: '1px solid var(--info-border)',
            color: 'var(--info-bright)',
          }}>{iniciales(c.mine ? t('BeerComments.vos') : c.authorName)}</span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', flexWrap: 'wrap',
            }}>
              {/* El nombre abre su perfil (BIR-6): es desde acá que hace falta
                  llegar a la persona, no desde una pantalla de moderación. El
                  propio no, que no tiene sentido ir a mirarse a uno mismo. */}
              {c.mine ? (
                <span className="lbl" style={{ fontSize: 'var(--t-4)', color: 'var(--cream)' }}>
                  {t('BeerComments.vos')}
                </span>
              ) : (
                <button
                  onClick={() => nav(`/usuario/${c.authorId}`)}
                  className="lbl"
                  style={{
                    fontSize: 'var(--t-4)', color: 'var(--cream)', textDecoration: 'underline',
                    textDecorationColor: 'var(--hairline)', textUnderlineOffset: 3,
                  }}
                >{c.authorName}</button>
              )}

              {/* La nota puede faltar: se puede comentar sin votar. Va como
                  número y no como cinco estrellas de 13px — acá compite por
                  ancho con el nombre y con la fecha, y el tono de `--nota`
                  alcanza para que se lea como la nota de quien escribió. */}
              {c.rating != null && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  color: 'var(--nota)', fontSize: 'var(--t-2)',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z" />
                  </svg>
                  <span className="num">{c.rating.toFixed(1)}</span>
                </span>
              )}

              {/* La edad va siempre pegada, igual que con los precios: un
                  comentario de hace dos años sobre una canilla que ya cambió
                  dice menos de lo que parece. */}
              <span style={{ marginLeft: 'auto', fontSize: 'var(--t-2)', color: 'var(--faint)' }}>
                {shortAge(c.ageDays)}
              </span>
            </div>

            {c.body && (
              <p style={{
                margin: 'var(--s-2) 0 0', fontSize: 'var(--t-3)', lineHeight: 1.5,
                color: 'var(--cream-soft)', textWrap: 'pretty',
              }}>{c.body}</p>
            )}

            {/* Lo propio se borra siempre, sin ser moderador: son tus palabras.
                Antes esto no existía porque la nota y el comentario eran la misma
                fila y no se podía bajar una sin la otra. */}
            {/* El id negativo es el comentario que todavía no confirmó el
                servidor: borrarlo pediría borrar algo que no existe. Dura lo
                que tarda la recarga de atrás. */}
            {(c.mine || modMode) && c.id > 0 && (
              <button onClick={() => setConfirmDelete(c)} style={{
                marginTop: 'var(--s-1)', fontSize: 'var(--t-2)', color: 'var(--danger)',
                padding: 'var(--s-2) 0',
              }}>{c.mine ? t('BeerComments.borrar') : t('BeerComments.eliminar')}</button>
            )}
          </div>
        </div>
      ))}

      {/* Abajo de todo y no un scroll infinito: los comentarios son el final
          de la ficha, y cargar solo al llegar haría que la pantalla nunca
          termine de crecer mientras se lee. */}
      {more && (
        <button
          onClick={loadMore} disabled={loadingMore} className="lbl"
          style={{
            width: '100%', marginTop: 'var(--s-3)', minHeight: 46,
            borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
            background: 'var(--info-soft)', border: '1px solid var(--info-border)',
            color: 'var(--info-bright)',
          }}
        >{loadingMore ? '…' : t('BeerComments.masViejos')}</button>
      )}

      {confirmDelete && (
        <Confirm
          title={confirmDelete.mine ? t('BeerComments.borrarTitulo') : t('BeerComments.eliminarTitulo')}
          body={confirmDelete.mine ? (
            <>
              {t('BeerComments.borrar1')}
              <br /><br />
              {t('BeerComments.noSeDeshace')}
            </>
          ) : (
            <>
              {tx('BeerComments.eliminar1', { nombre: <strong>{confirmDelete.authorName}</strong> })}
              <br /><br />
              {t('BeerComments.eliminar2')}
            </>
          )}
          confirmLabel={confirmDelete.mine ? t('BeerComments.borrar') : t('BeerComments.eliminar')} danger
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
