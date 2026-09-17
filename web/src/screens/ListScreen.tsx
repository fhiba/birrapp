import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { BarPin, BeerStyle } from '../data/types'
import { ageColor, formatDistance, formatRadius } from '../data/format'
import type { Sort } from '../data/useBars'
import { StyleFilter } from '../ui/StyleFilter'
import { AreaStatsCard } from '../ui/AreaStatsCard'
import { Empty, PriceColumn, SkeletonRows } from '../ui/Empty'
import { Segmented } from '../ui/Segmented'

interface Props {
  bars: BarPin[]; loading: boolean
  sort: Sort; radius: number; simulated: google.maps.LatLngLiteral | null
  styleFilter: string[]
  minRating?: number
  onMinRating: (n?: number) => void
  styles: BeerStyle[]
  /** Desde dónde se miden las distancias de los resultados de búsqueda. */
  center: google.maps.LatLngLiteral | null
  onSort: (s: Sort) => void
  onStyle: (s: string[]) => void
  onRadius: (m: number) => void
  onClearSimulated: () => void
  /** Ids favoritos, para el filtro. Vacío sin sesión. */
  favorites: Set<number>
  /**
   * Marcar y desmarcar desde la propia fila.
   *
   * Es opcional a propósito: el corazón sólo se dibuja si hay a quién
   * avisarle. Un corazón que no guarda nada es peor que no tener corazón, y
   * así la pantalla sigue compilando mientras quien la usa no lo pase.
   */
  onToggleFavorite?: (barId: number) => void
}

/**
 * Los dos órdenes, en el mismo orden en que se ven las pestañas.
 *
 * El swipe se apoya en esta lista: arrastrar a la izquierda va al siguiente,
 * a la derecha al anterior. Si el array y las pestañas se desordenaran entre
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
 *
 * Con la dirección heritage la fila se termina de volver pizarra: filete de
 * 1px en vez de caja, barra de frescura a la izquierda, y el precio a la
 * derecha con la edad debajo. Las tres cosas apuntan a lo mismo — que la lista
 * se lea de un vistazo, en vertical, sin leer una sola fecha.
 */
export function ListScreen(p: Props) {
  const nav = useNavigate()
  const scroller = useRef<HTMLDivElement>(null)
  const toggleFav = p.onToggleFavorite

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
    api.favorites(p.center?.lat, p.center?.lng, p.sort, p.styleFilter, p.minRating)
      .then(r => { if (alive) setFavBars(r) })
      .catch(() => { if (alive) setFavBars([]) })
      .finally(() => { if (alive) setFavBusy(false) })
    return () => { alive = false }
    // `sort` y `styleFilter` en las dependencias: son los que hacían que
    // tocar la píldora de estilo o cambiar el orden no hiciera nada con el
    // filtro de favoritos puesto. Y `center` ya estaba, que es lo que mueve
    // la lista cuando se elige un punto secundario en el mapa.
  }, [favOnly, p.center?.lat, p.center?.lng, p.sort, p.styleFilter, p.minRating, p.favorites.size])

  const shown = isSearch ? (found ?? []) : favOnly ? (favBars ?? []) : p.bars
  const busy = isSearch ? searching : favOnly ? favBusy : p.loading

  /*
   * El encabezado cuenta el ámbito, no el total. Y cuenta sólo eso: cuántos.
   *
   * Con el filtro de favoritos puesto, decir "18 bares" mientras se ven 2 es
   * mentir sobre lo que hay en pantalla, así que el número tiene que ser el de
   * lo que se está mirando. Eso se queda.
   *
   * Lo que se fue es el "· promedio $ X" que acompañaba a los favoritos, por
   * dos motivos que se suman:
   *
   * 1. **Era un precio sin su antigüedad al lado**, que es la única regla que
   *    esta app no negocia. Cada fila de abajo cumple —monto grande y la edad
   *    justo debajo—, pero el número del encabezado se leía solo: nadie podía
   *    saber si promediaba precios de ayer o de hace tres meses.
   * 2. **Ya había otro promedio en la misma pantalla, y el bueno.** A unos
   *    píxeles de acá está `AreaStatsCard` con `avgPint`, normalizado a 473 ml
   *    y con su alcance temporal. Éste promediaba `fromPrice`, el más barato
   *    de cada bar sin normalizar por tamaño: una pinta contra un porrón de
   *    330 dan el mismo peso. Dos promedios distintos del mismo radio en la
   *    misma pantalla no se leen como dos métricas, se leen como un error.
   */
  // Mientras carga y todavía no hay nada, no se dice nada: un "0 bares" que
  // dura medio segundo y se contradice solo es peor que el esqueleto.
  const resumen = busy && shown.length === 0 ? null
    : favOnly
      ? shown.length === 0 ? 'Sin favoritos marcados'
        : `${shown.length} ${shown.length === 1 ? 'favorito' : 'favoritos'}`
      : `${shown.length} ${shown.length === 1 ? 'bar' : 'bares'}`

  /*
   * Swipe horizontal para cambiar de orden.
   *
   * Las pestañas siguen estando: el gesto es el atajo, no el único camino.
   * Con el teléfono en una mano y una birra en la otra, apuntarle a una
   * etiqueta de 13px cuesta más que barrer la pantalla.
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
    // por cercanía y las pestañas ni se muestran.
    if (isSearch || e.touches.length !== 1) return
    // El slider del radio y el campo de búsqueda usan el eje horizontal para
    // lo suyo. Un swipe que arranca ahí es de ellos.
    if ((e.target as HTMLElement).closest('input')) return
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
        un renglón. El ámbito, que sí es dato, queda arriba de las pestañas.

        Sin padding abajo: las pestañas son lo último y su subrayado tiene que
        apoyarse contra el filete del encabezado. Eso es lo que hace que se
        lean como pestañas y no como tres textos con una rayita.
      */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        padding: `calc(14px + var(--safe-top)) 18px 0`,
        background: 'var(--base)',
        borderBottom: '1px solid var(--hairline)',
        display: 'flex', flexDirection: 'column', gap: 'var(--s-3)',
      }}>
        {/*
          Los dos filtros flanquean la búsqueda, y no viven en la franja de
          abajo. El de favoritos estaba al final de una fila que scrollea: con
          tres controles antes, quedaba fuera de pantalla y había que descubrir
          que se podía arrastrar para encontrarlo. Un filtro que no se ve es un
          filtro que no existe.

          El estilo a la izquierda y favoritos a la derecha: los dos acotan
          QUÉ bares se ven, mientras que lo de abajo decide en qué ORDEN.
        */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
          <StyleFilter
            styles={p.styles} selected={p.styleFilter} onSelect={p.onStyle}
            minRating={p.minRating} onMinRating={p.onMinRating}
            tone="plain" size={38} tourId="list-style"
          />

          <div style={{ position: 'relative', flex: 1, minWidth: 0 }} data-tour="list-search">
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar un bar" type="search"
              style={{
                width: '100%', padding: '12px 32px 12px 12px', borderRadius: 'var(--r-2)',
                background: 'var(--raised)', border: '1px solid var(--hairline)',
                // Ver --t-field: abajo de 16px iOS acerca la pantalla al enfocar.
                fontSize: 'var(--t-field)',
              }}
            />
            {query !== '' && (
              <button onClick={() => setQuery('')} aria-label="Limpiar" style={{
                position: 'absolute', right: 2, top: 0, bottom: 0, width: 44,
                color: 'var(--faint)', fontSize: 'var(--t-5)',
              }}>×</button>
            )}
          </div>

          {/* Sin favoritos marcados no aparece: un filtro que siempre devuelve
              una lista vacía sólo ocupa lugar.

              Prendido va en coral y no en hueso: el corazón es un dato —"es
              mío"— y en esta paleta el dato tiene color propio. En hueso
              pesaba lo mismo que un botón de acción. */}
          {(p.favorites.size > 0 || favOnly) && (
            <button
              onClick={() => setFavOnly(f => !f)}
              aria-pressed={favOnly}
              aria-label={favOnly ? 'Ver todos los bares' : 'Ver sólo mis favoritos'}
              className="icon-btn"
              style={{
                background: favOnly ? 'var(--favorito-soft)' : 'var(--film-2)',
                color: favOnly ? 'var(--favorito)' : 'var(--faint)',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden
                fill={favOnly ? 'currentColor' : 'none'}
                stroke="currentColor" strokeWidth={favOnly ? 0 : 1.9}>
                <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z" />
              </svg>
            </button>
          )}
        </div>

        {/* Buscando, el orden no aplica: los resultados vienen del servidor
            ordenados por cercanía y no por lo que digan las pestañas.
            Mostrarlas igual sería ofrecer un control que no hace nada. */}
        {isSearch ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--s-2)',
            fontSize: 'var(--t-3)', paddingBottom: 'var(--s-3)',
          }}>
            <span style={{ color: 'var(--muted)' }}>
              {searching ? 'Buscando…'
                : shown.length === 0 ? 'Sin resultados'
                : shown.length === 1 ? '1 resultado' : `${shown.length} resultados`}
            </span>
            {/* Acción de texto secundaria: va en el informativo, que es donde
                heritage manda todo lo que no es el dato principal. */}
            <button onClick={() => setQuery('')} className="lbl" style={{
              marginLeft: 'auto', color: 'var(--info)', fontSize: 'var(--t-3)',
            }}>Volver a la lista</button>
          </div>
        ) : (
          <>
            {/* Qué se está mirando, antes de en qué orden. */}
            {resumen && (
              <div style={{
                fontSize: 'var(--t-1)', color: 'var(--info)',
                fontVariantNumeric: 'tabular-nums',
              }}>{resumen}</div>
            )}

            {/* El orden, como pestañas de texto con subrayado de 2px.
                Eran cápsulas rellenas: pesaban lo mismo que un CTA y competían
                con el precio, que es el dato de la pantalla. El subrayado dice
                "elegiste esto" sin gritar, y es el mismo vocabulario de
                "posición activa" que usa la barra de abajo.

                Se recorre `SORTS`, que es la misma lista que usa el swipe: lo
                que se ve y lo que hace el gesto no se pueden separar. */}
            <Segmented<Sort>
              options={SORTS.map(s => ({ value: s, label: SORT_LABEL[s] }))}
              value={p.sort} onChange={p.onSort}
              label={o => `Ordenar por ${o.label.toLowerCase()}`}
              tourId="list-sort"
            />
          </>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
          {p.simulated ? (
            // Acá sí conviene el aviso: en la lista no se ve el mapa, así que
            // sin esto no hay forma de saber desde dónde se mide. Es una
            // acción secundaria, así que lleva el tratamiento del informativo
            // y no el relleno de un CTA.
            <button onClick={p.onClearSimulated} className="section-label cta" style={{
              margin: 0, padding: 'var(--s-2) var(--s-3)', borderRadius: 'var(--r-1)',
              background: 'var(--info-soft)', border: '1px solid var(--info-border)',
              color: 'var(--info-bright)',
            }}>Desde el punto elegido ✕</button>
          ) : (
            <span className="section-label" style={{ margin: 0 }}>Desde tu ubicación</span>
          )}
          {/* El radio es dato informativo —de los que heritage manda al
              Steel Blue— y es una cifra, así que va tabular. */}
          <span className="num" style={{
            marginLeft: 'auto', color: 'var(--info)', fontSize: 'var(--t-3)',
          }}>
            {formatRadius(p.radius)}
          </span>
        </div>
        {/* Mismo aspecto que el del mapa: era el único `range` que quedaba
            con la pista gruesa por defecto del navegador. */}
        <input
          className="range" type="range" min={300} max={15000} step={100}
          value={p.radius} onChange={e => p.onRadius(Number(e.target.value))}
          style={{
            marginTop: 8,
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
      {/* Esqueleto sólo en la primera carga: con filas en pantalla, cambiarlas
          por fantasmas cada vez que se mueve el radio sería un parpadeo
          constante. Ahí basta con que la lista se actualice sola. */}
      {busy && shown.length === 0 && <SkeletonRows />}

      {busy && shown.length > 0 && (
        <div className="skeleton" style={{ height: 2, margin: '8px 16px' }} />
      )}

      {!busy && shown.length === 0 && (
        isSearch ? (
          <Empty
            title="Ningún bar se llama así"
            hint="Probá con menos letras: busca por parte del nombre y no hace falta poner las tildes."
            action="Agregar este bar"
            onAction={() => nav('/agregar')}
          />
        ) : favOnly ? (
          // El vacío explica el gesto, que ahora está acá mismo: el corazón
          // al final de cada fila. Un vacío que no dice cómo salir de él es
          // un cartel de "no hay nada".
          <Empty
            title="Todavía no marcaste ningún favorito"
            hint="Tocá el corazón al final de cualquier fila —o el de la ficha del bar— y el bar queda acá. Se guardan en tu cuenta, así que los ves desde cualquier teléfono."
            action="Ver todos los bares"
            onAction={() => setFavOnly(false)}
          />
        ) : (
          <Empty
            title="Por acá todavía no hay bares"
            hint="El mapa lo hacemos entre todos: si conocés uno en esta zona, cargalo y queda para el resto."
            action="Agregar un bar"
            onAction={() => nav('/agregar')}
          />
        )
      )}

      <ul style={{ listStyle: 'none', margin: 'var(--s-3) 0 0', padding: '0 var(--s-4)' }}>
        {shown.map(b => {
          const esFav = p.favorites.has(b.id)
          // La barra de frescura toma el color de la edad del precio. Sin
          // precio no hay frescura que mostrar: queda el filete apagado, que
          // dice "de este bar no sabemos" sin inventar un estado.
          const tinta = b.fromPrice != null ? ageColor(b.freshestAgeDays) : 'var(--hairline)'
          return (
          <li key={b.id} className="row-hover" style={{
            display: 'flex', alignItems: 'center',
            borderBottom: '1px solid var(--hairline)',
          }}>
            {/* El corazón es hermano del botón de la fila y no hijo: un botón
                adentro de otro no es HTML válido y el navegador lo desarma
                donde se le canta. */}
            <button onClick={() => nav(`/bar/${b.id}`)} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
              flex: 1, minWidth: 0, padding: 'var(--s-3) 0', textAlign: 'left',
            }}>
              {/* Barra de frescura: se escanea en vertical sin leer nada. */}
              <span className="fresh-bar" style={{ background: tinta }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                {/* La nota sube al renglón del nombre.
                    Estaba tercera en la línea de metadatos, después de la
                    distancia y de la antigüedad, y en ese renglón todo pesa
                    igual: para saber si un bar es bueno había que leer una
                    lista de datos sueltos. Es el segundo criterio después del
                    precio, así que va donde se lo busca — pegada al nombre y
                    en el tono de la nota, no en el hueso de todo lo demás.
                    El conteo de votos al lado por lo mismo que los precios van
                    con su antigüedad: un 5,0 de un voto no es un 5,0. */}
                <span style={{
                  display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', minWidth: 0,
                }}>
                  <span className="lbl" style={{
                    fontSize: 'var(--t-4)', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                  }}>{b.name}</span>
                  {b.rating != null && (
                    <span className="num" style={{
                      flexShrink: 0, fontSize: 'var(--t-2)', color: 'var(--nota)',
                    }}>
                      ★ {b.rating.toFixed(1).replace('.', ',')}
                      <span style={{ color: 'var(--faint)' }}> ({b.ratingCount})</span>
                    </span>
                  )}
                </span>
                {/* La distancia se queda sola en el renglón: la antigüedad se
                    mudó abajo del precio, que es de donde nunca se tendría que
                    haber despegado. Y va en el informativo —"a 450 m" es el
                    caso que le da nombre al token— para que deje de competir
                    con el nombre del bar. */}
                {formatDistance(b.distanceMeters) && (
                  <span style={{
                    display: 'block', marginTop: 2,
                    fontSize: 'var(--t-2)', color: 'var(--info)',
                  }}>
                    {formatDistance(b.distanceMeters)}
                  </span>
                )}
              </span>
              {/* El precio en su propia columna, con la edad justo debajo y en
                  el color de la frescura. Nunca uno sin el otro: un precio sin
                  fecha es un precio que no se sabe si sigue siendo el precio.

                  Es `PriceColumn` y no el markup escrito acá porque esta misma
                  columna se dibuja en media app y se había desincronizado
                  —una copia sin pie para cuando falta la fecha, otra con la
                  edad sin cifras tabulares—. La regla vive en un solo lugar. */}
              <PriceColumn
                price={b.fromPrice} currency={b.currency} ageDays={b.freshestAgeDays}
              />
            </button>

            {/* Marcar sin entrar al bar: es el gesto de "este me sirve, seguí
                mirando". El margen negativo alinea el ícono con el borde del
                contenido sin achicar los 44px que se tocan. */}
            {toggleFav && (
              <button
                onClick={() => toggleFav(b.id)}
                aria-pressed={esFav}
                aria-label={`${esFav ? 'Sacar de favoritos' : 'Guardar en favoritos'}: ${b.name}`}
                className="icon-btn"
                style={{ marginRight: -12, color: esFav ? 'var(--favorito)' : 'var(--faint)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden
                  fill={esFav ? 'currentColor' : 'none'}
                  stroke="currentColor" strokeWidth={esFav ? 0 : 1.9}>
                  <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z" />
                </svg>
              </button>
            )}
          </li>
          )
        })}
      </ul>
      </div>
      </div>
    </div>
  )
}
