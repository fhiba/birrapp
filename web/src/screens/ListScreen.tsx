import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { BarPin } from '../data/types'
import { ageColor, formatDistance, formatPrice, formatRadius, shortAge } from '../data/format'
import type { Sort } from '../data/useBars'

interface Props {
  bars: BarPin[]; loading: boolean
  sort: Sort; radius: number; simulated: google.maps.LatLngLiteral | null
  styleFilter?: string
  /** Desde dónde se miden las distancias de los resultados de búsqueda. */
  center: google.maps.LatLngLiteral | null
  onSort: (s: Sort) => void
  onRadius: (m: number) => void
  onClearSimulated: () => void
}

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

  const shown = isSearch ? (found ?? []) : p.bars
  const busy = isSearch ? searching : p.loading

  const pendingReset = useRef(false)
  useEffect(() => { pendingReset.current = true }, [p.sort, p.styleFilter])
  useEffect(() => {
    if (pendingReset.current && !p.loading) {
      scroller.current?.scrollTo({ top: 0 })
      pendingReset.current = false
    }
  }, [p.bars, p.loading])

  return (
    <div ref={scroller} style={{
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
        <div style={{ position: 'relative' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(['distance', 'cheapest'] as Sort[]).map(s => (
              <button key={s} onClick={() => p.onSort(s)} className="lbl pill" style={{
                padding: '8px 15px', fontSize: 13, whiteSpace: 'nowrap',
                background: p.sort === s ? 'var(--cream)' : 'rgba(255,255,255,.07)',
                color: p.sort === s ? 'var(--base)' : 'var(--muted)',
              }}>{s === 'distance' ? 'Más cerca' : 'Más barata'}</button>
            ))}
            <span className="num" style={{
              marginLeft: 'auto', fontSize: 17, color: 'var(--faint)',
            }}>{p.bars.length}</span>
          </div>
        )}
      </div>

      {/* El radio no aplica buscando: la búsqueda es sobre toda la base, no
          sobre lo que entra en el círculo. */}
      {!isSearch && <header style={{ padding: '12px 18px 0' }}>
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

      {busy && <div style={{ height: 1, background: 'var(--amber)', margin: '8px 0' }} />}

      {!busy && shown.length === 0 && (
        <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>
          {isSearch
            ? `Ningún bar se llama así. Probá con menos letras.`
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
                </span>
              </span>
              {b.fromPrice != null
                ? <span className="num" style={{ fontSize: 19 }}>{formatPrice(b.fromPrice)}</span>
                : <span style={{ fontSize: 12, color: 'var(--faint)' }}>Sin precio</span>}
            </button>
          </li>
        ))}
      </ul>
      </div>
    </div>
  )
}
