import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { AreaStats, BarPin, BeerStyle } from '../data/types'
import {
  FRESCO_DIAS, ageColor, formatDistance, formatPrice, formatRadius,
} from '../data/format'
import { PriceColumn, SkeletonRows } from '../ui/Empty'

/**
 * "Cerca" — cómo viene la zona, antes de mirar un bar.
 *
 * ## Por qué es una pantalla y no una tarjeta arriba de la lista
 *
 * El promedio de la zona vivía en `AreaStatsCard`, plegado arriba de la Lista,
 * con este argumento: "la pregunta aparece mirando precios, y una pantalla
 * aparte sería un lugar al que habría que acordarse de ir".
 *
 * El argumento era bueno y se cae por una sola razón: ahora hay una pestaña.
 * Un destino en la barra de abajo no es un lugar al que hay que acordarse de
 * ir — está a la vista todo el tiempo, igual que el mapa. Y arriba de la Lista
 * el promedio pagaba un precio caro: plegado no se leía, y desplegado empujaba
 * las filas —que son el contenido— media pantalla para abajo.
 *
 * ## Qué contesta, en orden
 *
 * 1. **Cuánto sale acá.** El típico de la zona, con el abanico entre el más
 *    barato y el más caro. Es contra lo que se lee cualquier precio después.
 * 2. **Dónde está la más barata.** Un tap y estás en el bar.
 * 3. **Qué se cargó último.** Es lo más parecido a "qué se movió" que se puede
 *    decir con lo que hay: el servidor no manda un historial de cambios de la
 *    zona, así que no se inventa uno — se ordena por antigüedad del precio, que
 *    es un dato que sí está, y se dice exactamente eso.
 * 4. **Qué falta.** Cuántos bares del radio tienen el precio viejo, con el
 *    botón para arreglarlo. Es la única pantalla donde esa cuenta significa
 *    algo: acá el ámbito es la zona.
 *
 * Todo sale de lo que ya se pidió —`bars` viene del mismo `useBars` que
 * alimenta el mapa y la lista— más `areaStats`, que era la única consulta de
 * la tarjeta vieja. No hay un pedido nuevo.
 */
export function NearbyScreen(p: {
  bars: BarPin[]
  loading: boolean
  center: google.maps.LatLngLiteral | null
  radius: number
  onRadius: (m: number) => void
  styleFilter: string[]
  styles: BeerStyle[]
  /** Desde un punto elegido a mano en el mapa, en vez de desde tu ubicación. */
  simulated: google.maps.LatLngLiteral | null
}) {
  const nav = useNavigate()
  const [stats, setStats] = useState<AreaStats | null>(null)
  const [radioAbierto, setRadioAbierto] = useState(false)

  useEffect(() => {
    const c = p.center
    if (!c) return
    let alive = true
    // El rebote es el mismo de la tarjeta vieja y por lo mismo: el radio se
    // mueve con un slider, y sin esto sería una consulta por píxel arrastrado.
    const t = setTimeout(() => {
      api.areaStats(c.lat, c.lng, p.radius, p.styleFilter)
        .then(d => { if (alive) setStats(d) })
        .catch(() => { if (alive) setStats(null) })
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [p.center?.lat, p.center?.lng, p.radius, p.styleFilter])

  const conPrecio = p.bars.filter(b => b.fromPrice != null && b.freshestAgeDays != null)
  const recientes = [...conPrecio]
    .sort((a, b) => a.freshestAgeDays! - b.freshestAgeDays!)
    .slice(0, 6)
  const viejos = conPrecio.filter(b => b.freshestAgeDays! >= FRESCO_DIAS).length

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(var(--safe-top) + var(--s-3)) 0 calc(var(--s-5) + var(--nav-gap))`,
    }}>
      <div className="desk-narrow">
        {/* El filete bajo el título es el mismo que el del Perfil: separa el
            encabezado de la pantalla del contenido que scrollea por debajo.
            Sin él, el título y el primer bloque flotaban juntos y no se sabía
            dónde terminaba uno. */}
        <header style={{
          padding: '0 var(--s-4) var(--s-3)',
          borderBottom: '1px solid var(--hairline)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--s-3)' }}>
            <h1 className="ttl" style={{ flex: 1, fontSize: 'var(--t-7)', margin: 0 }}>Cerca</h1>
            {/* El radio es el ámbito de todo lo que sigue, así que se dice en
                el encabezado y se cambia ahí mismo. Es el patrón del diseño:
                "2 km · cambiar". */}
            <button
              onClick={() => setRadioAbierto(o => !o)}
              aria-expanded={radioAbierto}
              className="lbl"
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--s-1)',
                minHeight: 44, color: 'var(--info)', fontSize: 'var(--t-3)',
              }}
            >
              <span className="num">{formatRadius(p.radius)}</span>
              <span>· cambiar</span>
            </button>
          </div>

          {p.simulated && (
            <div className="section-label" style={{ margin: 'var(--s-1) 0 0' }}>
              Desde el punto elegido
            </div>
          )}

          {radioAbierto && (
            <input
              className="range" type="range" min={300} max={15000} step={100}
              aria-label="Radio de la zona"
              value={p.radius} onChange={e => p.onRadius(Number(e.target.value))}
              style={{
                marginTop: 'var(--s-3)',
                ['--fill' as string]: `${((p.radius - 300) / (15000 - 300)) * 100}%`,
              }}
            />
          )}
        </header>

        {p.loading && p.bars.length === 0 ? <SkeletonRows /> : (
          <>
            <Benchmark stats={stats} radius={p.radius} />

            {stats?.cheapest && (
              <>
                <h2 className="section-label" style={{ padding: '0 var(--s-4)' }}>
                  MÁS BARATA CERCA
                </h2>
                <Fila
                  nombre={stats.cheapest.barName}
                  meta={[
                    stats.cheapest.brandName
                      ? `${stats.cheapest.styleName} · ${stats.cheapest.brandName}`
                      : stats.cheapest.styleName,
                    `${stats.cheapest.sizeMl} ml`,
                  ].join(' · ')}
                  price={stats.cheapest.price}
                  currency={stats.currency}
                  ageDays={stats.cheapest.ageDays}
                  onClick={() => nav(`/bar/${stats.cheapest!.barId}`)}
                />
              </>
            )}

            {recientes.length > 0 && (
              <>
                {/* El título dice lo que el dato es —lo último cargado— y no
                    "lo que se movió esta semana", que sería otra cosa: para
                    saber si un precio cambió hace falta el anterior, y eso el
                    servidor no lo manda con los pines. */}
                <h2 className="section-label" style={{ padding: '0 var(--s-4)' }}>
                  LO ÚLTIMO QUE SE CARGÓ
                </h2>
                {recientes.map(b => (
                  <Fila
                    key={b.id}
                    nombre={b.name}
                    meta={formatDistance(b.distanceMeters) ?? ''}
                    price={b.fromPrice}
                    currency={b.currency}
                    ageDays={b.freshestAgeDays}
                    onClick={() => nav(`/bar/${b.id}`)}
                  />
                ))}
              </>
            )}

            {/* La invitación, y sólo cuando hay algo concreto que pedir. Un
                cartel que dice "cargá precios" siempre es decoración; éste
                aparece con el número de los que están vencidos en TU radio, que
                es una pregunta contestable caminando una cuadra. */}
            {viejos > 0 && (
              <div style={{
                margin: 'var(--s-5) var(--s-4) 0', padding: 'var(--s-4)',
                borderRadius: 'var(--r-3)',
                background: 'var(--info-soft)', border: '1px solid var(--info-border)',
              }}>
                <div className="ttl" style={{ fontSize: 'var(--t-5)' }}>
                  ¿Viste otra pizarra hoy?
                </div>
                <p style={{
                  margin: 'var(--s-2) 0 0', fontSize: 'var(--t-3)',
                  color: 'var(--cream-soft)', lineHeight: 1.5, textWrap: 'pretty',
                }}>
                  {viejos === 1
                    ? `Un bar de tu radio tiene el precio de hace más de ${FRESCO_DIAS} días.`
                    : `${viejos} bares de tu radio tienen el precio de hace más de ${FRESCO_DIAS} días.`}
                </p>
                <button onClick={() => nav('/')} className="lbl cta" style={{
                  marginTop: 'var(--s-3)', width: '100%', height: 46,
                  borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
                  background: 'var(--acento)', color: 'var(--base)',
                }}>Cargar un precio</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * El benchmark de la zona: el típico, y el abanico en el que cae.
 *
 * Con menos de tres precios no se dibuja. Un promedio de dos no es un
 * promedio, es un precio con pretensiones, y ponerle el tamaño de letra del
 * dato principal lo vuelve una afirmación que la app no puede sostener.
 */
function Benchmark({ stats, radius }: { stats: AreaStats | null; radius: number }) {
  if (!stats || stats.samples < 3 || stats.medianPint == null) {
    return (
      <p style={{
        padding: 'var(--s-4)', margin: 0,
        fontSize: 'var(--t-3)', color: 'var(--muted)', lineHeight: 1.5,
        textWrap: 'pretty',
      }}>
        Todavía no hay precios suficientes en {formatRadius(radius)} a la
        redonda para sacar un promedio que signifique algo. Con tres alcanza.
      </p>
    )
  }

  const piso = stats.minPint
  const tope = stats.maxPint
  const rango = piso != null && tope != null && tope > piso
  const marca = rango ? ((stats.medianPint - piso!) / (tope! - piso!)) * 100 : null

  return (
    <div style={{
      margin: 'var(--s-4) var(--s-4) 0', padding: 'var(--s-4)',
      borderRadius: 'var(--r-3)',
      // De las pocas tarjetas que la pizarra deja: esto no es una fila más de
      // una lista, es el número contra el que se leen todas las demás.
      background: 'var(--raised)', border: '1px solid var(--hairline)',
    }}>
      <div className="section-label" style={{ margin: 0 }}>
        Benchmark zonal · {formatRadius(radius)}
      </div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', marginTop: 'var(--s-2)',
      }}>
        <span className="num" style={{ fontSize: 'var(--t-9)', lineHeight: 1 }}>
          {formatPrice(stats.medianPint, stats.currency)}
        </span>
        <span style={{ fontSize: 'var(--t-2)', color: 'var(--muted)' }}>
          la pinta, típico
        </span>
      </div>

      {rango && (
        <>
          <div aria-hidden style={{
            position: 'relative', height: 16, marginTop: 'var(--s-4)',
          }}>
            <div style={{
              position: 'absolute', top: 6, left: 0, right: 0, height: 4,
              borderRadius: 2, background: 'var(--info-soft)',
            }} />
            <div style={{
              position: 'absolute', top: 0, left: `${marca}%`, transform: 'translateX(-50%)',
              width: 3, height: 16, borderRadius: 2, background: 'var(--cream)',
            }} />
          </div>
          <div className="num" style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 'var(--t-1)', color: 'var(--faint)', marginTop: 'var(--s-1)',
          }}>
            <span>piso {formatPrice(piso!, stats.currency)}</span>
            <span>tope {formatPrice(tope!, stats.currency)}</span>
          </div>
        </>
      )}

      {/* El pie es parte del dato, no una nota al pie: un promedio sin su
          unidad y sin su alcance temporal es otra forma de mentir. */}
      <p className="num" style={{
        margin: 'var(--s-3) 0 0', paddingTop: 'var(--s-3)',
        borderTop: '1px solid var(--hairline)',
        fontSize: 'var(--t-1)', color: 'var(--faint)', lineHeight: 1.5,
        fontWeight: 400, letterSpacing: 0, fontFamily: 'inherit',
      }}>
        {stats.samples} precios · {stats.bars} {stats.bars === 1 ? 'bar' : 'bares'} ·
        llevados a una pinta de 473 ml, de menos de 45 días
      </p>
    </div>
  )
}

/** Una fila de bar: nombre y meta a la izquierda, precio con su edad a la derecha. */
function Fila({ nombre, meta, price, currency, ageDays, onClick }: {
  nombre: string
  meta: string
  price: number | null
  currency: string
  ageDays: number | null
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="row-hover" style={{
      display: 'flex', alignItems: 'center', gap: 'var(--s-3)', width: '100%',
      padding: 'var(--s-3) var(--s-4)', textAlign: 'left',
      borderBottom: '1px solid var(--hairline)',
    }}>
      {/* La misma barra de frescura que lleva cada fila de la Lista: es lo que
          deja leer la columna de un vistazo sin leer una sola fecha. */}
      <span className="fresh-bar" aria-hidden style={{ background: ageColor(ageDays) }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="lbl" style={{
          display: 'block', fontSize: 'var(--t-4)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{nombre}</span>
        {meta && (
          <span style={{
            display: 'block', fontSize: 'var(--t-2)', color: 'var(--info)',
            marginTop: 2,
          }}>{meta}</span>
        )}
      </span>
      <PriceColumn price={price} currency={currency} ageDays={ageDays} size="var(--t-5)" />
    </button>
  )
}
