import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { BarPin, BeerStyle } from '../data/types'
import { ageColor, formatDistance, formatPrice, formatRadius, shortAge } from '../data/format'
import type { Sort } from '../data/useBars'
import { StyleFilter } from '../ui/StyleFilter'
import { AreaStatsCard } from '../ui/AreaStatsCard'
import { Segmented } from '../ui/Segmented'

interface Props {
  bars: BarPin[]; loading: boolean
  sort: Sort; radius: number; simulated: google.maps.LatLngLiteral | null
  styleFilter?: string
  styles: BeerStyle[]
  /** Desde dónde se miden las distancias de los resultados de búsqueda. */
  center: google.maps.LatLngLiteral | null
  onSort: (s: Sort) => void
  onStyle: (s?: string) => void
  onRadius: (m: number) => void
  onClearSimulated: () => void
  /** Ids favoritos, para el filtro. Vacío sin sesión. */
  favorites: Set<number>
}

/**
 * Los dos órdenes, en el mismo orden en que se ven las píldoras.
 *
 * El swipe se apoya en esta lista: arrastrar a la izquierda va al siguiente,
 * a la derecha al anterior. Si el array y las píldoras se desordenaran entre
 * sí, el gesto llevaría al modo contrario del que muestra la pantalla.
 */
const SORTS: Sort[] = ['distance', 'cheapest', 'rated']

const SORT_LABEL: Record<Sort, string> = {
  distance: 'Más cerca',
  cheapest: 'Más barata',
  // "Mejor puntuada" y no "mejor": la nota es de las birras del bar, que es
  // lo único que esta app sabe puntuar. El bar puede ser un antro con una IPA
  // excelente.
  rated: 'Mejor puntuada',
}

/** Cuánto hay que arrastrar para que el gesto cuente, en píxeles. */
const COMMIT = 55

/**
 * La misma data del mapa, en lista. Sin tarjetas: una por bar mete dos bordes
 * y una sombra por fila y convierte una lista de precios en un muro de cajas.
 * Lo que tiene que saltar es el número.
 */
export function ListScreen(p: Props) {
  const nav = useNavigate()
  const scroller = useRef<HTMLDivElement>(null)

  // Al cambiar el orden o el filtro la lista es otra: quedarse a mitad de
  // scroll deja al usuario mirando el bar 40 de un ranking nuevo.
  //
  // No alcanza con scrollear al cambiar el orden: en ese instante la lista
  // vieja sigue en pantalla y el navegador restaura la posición cuando llega
  // la nueva. Hay que esperar a los datos.
  // Búsqueda por nombre.
  //
  // Va contra el servidor y no filtrando `p.bars` en memoria: la lista sólo
  // trae lo que entra en el radio, así que buscar un bar de otro barrio no
  // daría nada y parecería que no existe. El índice ya está hecho para esto
  // —trigramas sobre el nombre sin tildes, V4__search.sql—.
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<BarPin[] | null>(null)
  const [searching, setSearching] = useState(false)
  const searchingFor = query.trim()
  const isSearch = searchingFor.length >= 2

  useEffect(() => {
    if (!isSearch) { setFound(null); setSearching(false); return }
    let alive = true
    setSearching(true)
    // Se espera a que deje de tipear: una consulta por tecla es una consulta
    // por tecla, y con trigramas no son gratis.
    const t = setTimeout(async () => {
      try {
        const r = await api.searchBars(searchingFor, p.center?.lat, p.center?.lng, 50)
        if (alive) setFound(r)
      } catch { if (alive) setFound([]) }
      finally { if (alive) setSearching(false) }
    }, 300)
    return () => { alive = false; clearTimeout(t) }
  }, [searchingFor, isSearch, p.center])

  /*
   * Filtro de favoritos (BIR-37 / BIR-5).
   *
   * Se piden al servidor en vez de filtrar `p.bars`: la lista sólo tiene lo
   * que entra en el radio, y el favorito que se quiere ver casi siempre está
   * en otro barrio —es de ahí que uno se acuerda—. Filtrando en memoria, un
   * favorito lejos simplemente no aparecería y parecería que se perdió.
   */
  const [favOnly, setFavOnly] = useState(false)
  const [favBars, setFavBars] = useState<BarPin[] | null>(null)
  const [favBusy, setFavBusy] = useState(false)

  useEffect(() => {
    if (!favOnly) return
    let alive = true
    setFavBusy(true)
    api.favorites(p.center?.lat, p.center?.lng)
      .then(r => { if (alive) setFavBars(r) })
      .catch(() => { if (alive) setFavBars([]) })
      .finally(() => { if (alive) setFavBusy(false) })
    return () => { alive = false }
  }, [favOnly, p.center?.lat, p.center?.lng, p.favorites.size])

  const shown = isSearch ? (found ?? []) : favOnly ? (favBars ?? []) : p.bars
  const busy = isSearch ? searching : favOnly ? favBusy : p.loading

  /*
   * Swipe horizontal para cambiar de orden.
   *
   * Las píldoras siguen estando: el gesto es el atajo, no el único camino.
   * Con el teléfono en una mano y una birra en la otra, apuntarle a una
   * píldora de 34px cuesta más que barrer la pantalla.
   *
   * Tres cosas que lo hacen convivir con el scroll vertical, que es el gesto
   * dominante de esta pantalla:
   *
   * 1. El eje se decide una sola vez por gesto, a los 10px de recorrido, y no
   *    se revisa más. Decidiéndolo en cada frame, un scroll con la mano un
   *    poco torcida cambiaba de orden a mitad de camino.
   * 2. Pide que el movimiento horizontal supere al vertical por 1.4x. Un
   *    pulgar nunca traza una recta: sin el margen, cualquier scroll pasaba
   *    por swipe.
   * 3. No llama a `preventDefault` en ningún momento. No hace falta: no hay
   *    desbordamiento horizontal que scrollear, así que el gesto no compite
   *    con nada del navegador. Y como React escucha `touchmove` en modo
   *    pasivo, un `preventDefault` acá sería una excepción en consola y nada
   *    más.
   *
   * El arrastre se dibuja sobre `deck` de forma imperativa. Pasarlo por
   * estado sería un re-render de la lista entera —hasta 400 filas— por cada
   * frame de un dedo moviéndose.
   */
  const deck = useRef<HTMLDivElement>(null)
  const swipe = useRef<{ x: number; y: number; dx: number; axis: 'none' | 'x' | 'y' } | null>(null)

  const paint = (dx: number, snap: boolean) => {
    const el = deck.current
    if (!el) return
    el.style.transition = snap ? 'transform .2s ease-out, opacity .2s ease-out' : 'none'
    el.style.transform = dx === 0 ? '' : `translateX(${dx}px)`
    el.style.opacity = dx === 0 ? '' : String(1 - Math.min(Math.abs(dx), 110) / 320)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    // Buscando no hay orden que cambiar: los resultados vienen del servidor
    // por cercanía y las píldoras ni se muestran.
    if (isSearch || e.touches.length !== 1) return
    // El slider del radio y el campo de búsqueda usan el eje horizontal para
    // lo suyo. Un swipe que arranca ahí es de ellos. Lo mismo la franja de
    // filtros, que scrollea en horizontal desde que entró la píldora de
    // favoritos: sin esto, arrastrarla para ver el último filtro cambiaba el
    // orden de la lista al mismo tiempo.
    const from = e.target as HTMLElement
    if (from.closest('input') || from.closest('[data-hscroll]')) return
    const t = e.touches[0]
    swipe.current = { x: t.clientX, y: t.clientY, dx: 0, axis: 'none' }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const s = swipe.current
    if (!s) return
    const t = e.touches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y

    if (s.axis === 'none') {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      s.axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'x' : 'y'
    }
    if (s.axis !== 'x') return

    s.dx = dx
    // En los extremos la lista se resiste en vez de moverse: no hay a dónde
    // ir, y decirlo con el gesto es más claro que no reaccionar.
    const i = SORTS.indexOf(p.sort)
    const edge = (dx < 0 && i === SORTS.length - 1) || (dx > 0 && i === 0)
    paint(Math.max(-110, Math.min(110, edge ? dx / 5 : dx)), false)
  }

  const onTouchEnd = () => {
    const s = swipe.current
    swipe.current = null
    paint(0, true)
    if (!s || s.axis !== 'x' || Math.abs(s.dx) < COMMIT) return
    const next = SORTS[SORTS.indexOf(p.sort) + (s.dx < 0 ? 1 : -1)]
    if (next) p.onSort(next)
  }

  const pendingReset = useRef(false)
  useEffect(() => { pendingReset.current = true }, [p.sort, p.styleFilter])
  useEffect(() => {
    if (pendingReset.current && !p.loading) {
      scroller.current?.scrollTo({ top: 0 })
      pendingReset.current = false
    }
  }, [p.bars, p.loading])

  return (
    <div
      ref={scroller}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
      style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      // Sin padding arriba: lo lleva el propio encabezado pegajoso. Si el
      // padding viviera acá, `top: 0` pegaría el selector contra el borde de
      // la pantalla, debajo del notch.
      paddingBottom: `calc(108px + var(--nav-gap))`,
    }}>
      <div className="desk-narrow">
      {/*
        La barra pegajosa va acá, hermana de la lista, y NO adentro del
        <header>. Un elemento `sticky` sólo se pega dentro de la caja de su
        padre: metido en el header —que mide unos 90px— se despegaba apenas
        el header salía de pantalla, que es exactamente lo que se quería
        evitar. Colgada de `.desk-narrow`, que contiene también el <ul>, se
        mantiene mientras haya lista.

        Había además un <h1> que decía "Más baratas" justo encima de una
        píldora que decía "Más barata": el título no agregaba nada y se comía
        un renglón. El conteo, que sí es dato, queda al lado del selector.
      */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        padding: `calc(14px + var(--safe-top)) 18px 10px`,
        background: 'var(--base)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ position: 'relative' }} data-tour="list-search">
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Buscar un bar" type="search"
            style={{
              width: '100%', padding: '10px 34px 10px 13px', borderRadius: 12,
              background: 'rgba(255,255,255,.06)', border: '1px solid var(--hairline)',
              fontSize: 14,
            }}
          />
          {query !== '' && (
            <button onClick={() => setQuery('')} aria-label="Limpiar" style={{
              position: 'absolute', right: 4, top: 0, bottom: 0, width: 30,
              color: 'var(--faint)', fontSize: 16,
            }}>×</button>
          )}
        </div>

        {/* Buscando, el orden no aplica: los resultados vienen del servidor
            ordenados por cercanía y no por lo que diga esta píldora. Mostrarla
            igual sería ofrecer un control que no hace nada. */}
        {isSearch ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--muted)' }}>
              {searching ? 'Buscando…'
                : shown.length === 0 ? 'Sin resultados'
                : shown.length === 1 ? '1 resultado' : `${shown.length} resultados`}
            </span>
            <button onClick={() => setQuery('')} className="lbl" style={{
              marginLeft: 'auto', color: 'var(--amber)', fontSize: 13,
            }}>Volver a la lista</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {/*
              Los controles scrollean; el conteo no.

              Antes era una fila sola con `marginLeft: auto` en el número. Al
              sumarse la píldora de favoritos dejó de entrar en un teléfono
              angosto, y lo que se salía de pantalla era justamente el número
              de bares — el dato, no el cromo. Ahora los filtros viven en una
              franja que se arrastra y el conteo queda anclado afuera.
            */}
            <div
              data-tour="list-sort"
              data-hscroll
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                overflowX: 'auto', scrollbarWidth: 'none', flex: 1, minWidth: 0,
                // Un poco de aire vertical: sin esto, el anillo de foco de una
                // píldora a medio entrar queda recortado contra el scroller.
                padding: '2px 0',
              }}
            >
              {/* El mismo componente que el mapa, en sólido en vez de vidrio.
                  Acá el filtro importa más todavía: la lista muestra el precio
                  de cada bar, y sin filtrar cada fila puede ser un estilo
                  distinto, así que la columna de precios no compara nada. */}
              <StyleFilter
                styles={p.styles} selected={p.styleFilter} onSelect={p.onStyle}
                tone="plain" size={34}
              />

              {/* Un interruptor y no dos píldoras sueltas: el orden es uno o
                  el otro, nunca los dos, y es el mismo gesto que el toggle de
                  color del mapa. Se recorre `SORTS`, que es la misma lista que
                  usa el swipe: lo que se ve y lo que hace el gesto no se
                  pueden separar. */}
              <Segmented<Sort>
                options={SORTS.map(s => ({ value: s, label: SORT_LABEL[s] }))}
                value={p.sort} onChange={p.onSort}
                tone="plain" height={28}
                label={o => `Ordenar por ${o.label.toLowerCase()}`}
              />

              {/* Sin favoritos marcados no aparece: una píldora que siempre
                  devuelve una lista vacía sólo ocupa lugar. */}
              {(p.favorites.size > 0 || favOnly) && (
                <button onClick={() => setFavOnly(f => !f)} className="lbl pill"
                  aria-pressed={favOnly} style={{
                    padding: '8px 13px', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: favOnly ? 'var(--amber)' : 'rgba(255,255,255,.07)',
                    color: favOnly ? 'var(--base)' : 'var(--muted)',
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z" />
                  </svg>
                  Favoritos
                </button>
              )}
            </div>

            {/* Fuera del scroller y sin encogerse: es el dato de la pantalla,
                no un control. Cifras tabulares para que no baile al pasar de
                9 a 10. */}
            <span className="num" style={{
              flexShrink: 0, fontSize: 17, color: 'var(--faint)',
              fontVariantNumeric: 'tabular-nums',
            }}>{shown.length}</span>
          </div>
        )}
      </div>

      {/* El radio no aplica buscando: la búsqueda es sobre toda la base, no
          sobre lo que entra en el círculo. */}
      {/* Las stats de la zona van con el radio, que es lo que definen. Con
          el filtro de favoritos puesto no hay zona: la lista es de bares
          sueltos de toda la ciudad. */}
      {!isSearch && !favOnly && (
        <AreaStatsCard
          center={p.center} radius={p.radius}
          styleFilter={p.styleFilter} styles={p.styles}
        />
      )}

      {!isSearch && !favOnly && <header style={{ padding: '12px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {p.simulated ? (
            // Acá sí conviene el aviso: en la lista no se ve el mapa, así que
            // sin esto no hay forma de saber desde dónde se mide.
            <button onClick={p.onClearSimulated} className="pill" style={{
              background: 'var(--amber-soft)', color: 'var(--amber)',
              padding: '5px 10px', fontSize: 12,
            }}>Desde el punto elegido ✕</button>
          ) : (
            <span style={{ color: 'var(--faint)', fontSize: 12 }}>Desde tu ubicación</span>
          )}
          <span className="lbl" style={{ marginLeft: 'auto', color: 'var(--amber)', fontSize: 13 }}>
            {formatRadius(p.radius)}
          </span>
        </div>
        {/* Mismo aspecto que el del mapa: era el único `range` que quedaba
            con la pista gruesa por defecto del navegador. */}
        <input
          className="range" type="range" min={300} max={15000} step={100}
          value={p.radius} onChange={e => p.onRadius(Number(e.target.value))}
          style={{
            marginTop: 6,
            ['--fill' as string]: `${((p.radius - 300) / (15000 - 300)) * 100}%`,
          }}
        />
      </header>}

      {/* El `deck` es lo único que se mueve con el swipe: el encabezado
          pegajoso queda afuera a propósito. Un `transform` en un ancestro
          rompe el `position: sticky` de lo que tenga adentro, y la barra de
          búsqueda y orden es justamente lo que tiene que quedarse quieto
          mientras la lista se corre. */}
      <div ref={deck} style={{ willChange: 'transform' }}>
      {busy && <div style={{ height: 1, background: 'var(--amber)', margin: '8px 0' }} />}

      {!busy && shown.length === 0 && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>
          {isSearch
            ? `Ningún bar se llama así. Probá con menos letras.`
            : favOnly ? 'Todavía no marcaste ningún bar como favorito.'
            : 'No hay bares cargados por acá todavía.'}
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
        {shown.map(b => (
          <li key={b.id}>
            <button className="row-hover" onClick={() => nav(`/bar/${b.id}`)} style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%',
              padding: '15px 18px', textAlign: 'left',
              borderBottom: '1px solid rgba(255,255,255,.06)',
            }}>
              {/* Barra de frescura: se escanea en vertical sin leer nada. */}
              <span style={{
                width: 3, height: 34, borderRadius: 999, flexShrink: 0,
                background: b.fromPrice != null
                  ? ageColor(b.freshestAgeDays) : 'rgba(255,255,255,.12)',
              }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="lbl" style={{
                  display: 'block', fontSize: 16, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{b.name}</span>
                <span style={{ fontSize: 12, color: 'var(--faint)' }}>
                  {formatDistance(b.distanceMeters)}
                  {b.freshestAgeDays != null && (
                    <> · <span style={{ color: ageColor(b.freshestAgeDays) }}>
                      {shortAge(b.freshestAgeDays)}
                    </span></>
                  )}
                  {/* La nota se ve siempre, no sólo ordenando por ella:
                      ordenar por algo invisible es pedir que se confíe en un
                      ranking sin mostrar de dónde sale. Va con la cantidad de
                      votos al lado por lo mismo que los precios van con su
                      antigüedad — un 5,0 de un voto no es un 5,0. */}
                  {b.rating != null && (
                    <> · <span style={{ color: 'var(--amber)' }}>
                      ★ {b.rating.toFixed(1).replace('.', ',')}
                    </span>
                    <span style={{ opacity: .8 }}> ({b.ratingCount})</span></>
                  )}
                </span>
              </span>
              {b.fromPrice != null
                ? <span className="num" style={{ fontSize: 19 }}>{formatPrice(b.fromPrice, b.currency)}</span>
                : <span style={{ fontSize: 12, color: 'var(--faint)' }}>Sin precio</span>}
            </button>
          </li>
        ))}
      </ul>
      </div>
      </div>
    </div>
  )
}
