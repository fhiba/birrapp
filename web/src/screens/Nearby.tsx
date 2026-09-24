import { useState } from 'react'
import * as fb from '../data/feedback'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { AreaStats, BarPin, BeerRank, BeerStyle } from '../data/types'
import {
  FRESCO_DIAS, ageColor, formatDistance, formatPrice, formatRadius,
} from '../data/format'
import { PriceColumn, SkeletonRows } from '../ui/Empty'
import { useCached } from '../data/cached'
import { t } from '../i18n'

/**
 * La clave de caché del promedio de la zona.
 *
 * Se exporta porque el mapa la calienta antes de que nadie entre acá (ver
 * `prefetchCached`). Si cada uno armara la suya, la del mapa y la de esta
 * pantalla se despegarían al primer cambio y el prefetch dejaría de servir sin
 * que nadie se entere: no rompe nada, simplemente vuelve el segundo en blanco.
 */
/**
 * La clave de caché de la tabla de birras de la zona.
 *
 * Mismo redondeo a dos decimales que `areaKey` y por lo mismo: con las
 * coordenadas enteras la clave cambia con cada paneo y la caché no sirve de
 * nada. Sin los estilos, que a la tabla de birras no la filtran.
 */
/** Cuántos bares recientes se muestran plegado, y cuántos como mucho. */
const RECIENTES_PLEGADO = 3
const MAX_RECIENTES = 8

export const birrasKey = (lat: number, lng: number, radius: number) =>
  `birras:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}`

export const areaKey = (
  lat: number, lng: number, radius: number, styles: string[],
) => `area:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}:${styles.join(',')}`

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
  const [radioAbierto, setRadioAbierto] = useState(false)

  /*
   * El promedio de la zona, pintado con lo último que se supo mientras se
   * vuelve a preguntar.
   *
   * Antes arrancaba en `null` en cada entrada a la pestaña —la pantalla se
   * desmonta al cambiar de pestaña— y encima el rebote de 350 ms corría
   * también en el primer render: abrir "Cerca" costaba un tercio de segundo de
   * nada antes de que la consulta saliera, más el viaje. Lo primero que se ve
   * de la pantalla es justo lo que más tarda.
   *
   * **La clave redondea la posición a dos decimales**, o sea a un kilómetro y
   * pico. Con las coordenadas enteras la caché no serviría para nada: la
   * cámara cambia con cada paneo del mapa y nunca se repetiría una clave. A
   * esta escala, volver al mismo barrio vuelve a la misma entrada, y cruzar la
   * ciudad estrena una — que es exactamente cuándo el número tiene que cambiar.
   *
   * El rebote se queda, ahora adentro de `useCached`: el radio se mueve con un
   * slider y sin él sería una consulta por píxel arrastrado.
   */
  const c = p.center
  const { data: stats } = useCached<AreaStats>(
    c ? areaKey(c.lat, c.lng, p.radius, p.styleFilter) : null,
    () => api.areaStats(c!.lat, c!.lng, p.radius, p.styleFilter),
    350,
  )

  // La tabla de birras, con la misma caché que el promedio: se pinta lo último
  // que se supo y se pregunta de nuevo en segundo plano. Mismo rebote, porque
  // la clave también cambia arrastrando el radio.
  const { data: ranking } = useCached<BeerRank[]>(
    c ? birrasKey(c.lat, c.lng, p.radius) : null,
    () => api.beerLeaderboard(c!.lat, c!.lng, p.radius),
    350,
  )

  const conPrecio = p.bars.filter(b => b.fromPrice != null && b.freshestAgeDays != null)
  const recientes = [...conPrecio]
    .sort((a, b) => a.freshestAgeDays! - b.freshestAgeDays!)
    .slice(0, MAX_RECIENTES)
  const viejos = conPrecio.filter(b => b.freshestAgeDays! >= FRESCO_DIAS).length

  /**
   * De entrada se ven tres, y el resto se despliega.
   *
   * Eran seis fijos, y seis filas empujan la tabla de birras tan abajo que hay
   * que scrollear a propósito para encontrarla — o sea que para quien abre la
   * pestaña no existe. Tres alcanzan para contestar "qué se cargó último por
   * acá"; el cuarto y el quinto ya son la misma respuesta con más detalle, y
   * eso puede pedirse.
   *
   * Se despliega en el lugar y no navega a otro lado: es la misma lista, más
   * larga.
   */
  const [todos, setTodos] = useState(false)
  const visibles = todos ? recientes : recientes.slice(0, RECIENTES_PLEGADO)

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(var(--safe-top) + var(--s-3)) 0 calc(var(--nav-h) + var(--s-5))`,
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
            <h1 className="ttl" style={{ flex: 1, fontSize: 'var(--t-7)', margin: 0 }}>{t('Nearby.titulo')}</h1>
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
              <span>{t('Nearby.cambiar')}</span>
            </button>
          </div>

          {p.simulated && (
            <div className="section-label" style={{ margin: 'var(--s-1) 0 0' }}>
              {t('Nearby.desdePunto')}
            </div>
          )}

          {radioAbierto && (
            <input
              className="range" type="range" min={300} max={15000} step={100}
              aria-label={t('Nearby.radioAria')}
              value={p.radius}
              onChange={e => { fb.paso(); p.onRadius(Number(e.target.value)) }}
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
                  {t('Nearby.masBarata')}
                </h2>
                <Fila
                  nombre={stats.cheapest.barName}
                  meta={[
                    stats.cheapest.brandName
                      ? `${stats.cheapest.styleName} · ${stats.cheapest.brandName}`
                      : stats.cheapest.styleName,
                    t('Nearby.ml', { n: stats.cheapest.sizeMl }),
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
                  {t('Nearby.ultimo')}
                </h2>
                {visibles.map(b => (
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

                {/* Sólo si hay algo que desplegar, y sin botón para volver a
                    plegar: una vez que pediste ver más, esconderlas de nuevo no
                    es algo que nadie quiera hacer. */}
                {!todos && recientes.length > RECIENTES_PLEGADO && (
                  <button
                    onClick={() => { fb.tap(); setTodos(true) }}
                    className="lbl cta"
                    style={{
                      display: 'block', width: 'calc(100% - var(--s-4) * 2)',
                      margin: 'var(--s-3) var(--s-4) 0', minHeight: 40,
                      borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
                      background: 'var(--film-1)', color: 'var(--info)',
                    }}
                  >{t('Nearby.verMas', { n: recientes.length - RECIENTES_PLEGADO })}</button>
                )}
              </>
            )}

            {/*
              La tabla de birras de la zona, debajo de lo último que se cargó.

              Acá abajo y no arriba: "Cerca" contesta cuánto sale la pinta por
              acá, y eso manda. Esto es lo otro que se puede saber de una zona
              —quiénes la están tomando— y es una razón para volver, no la
              razón para entrar.

              **Se dibuja aunque esté vacía.** Una tabla vacía dice algo cierto
              y divertido: por acá todavía no anotó nadie. Esconderla haría que
              la sección aparezca y desaparezca según el barrio, que se lee como
              que la app se rompió.
            */}
            <Ranking filas={ranking} onAbrir={id => nav(`/usuario/${id}`)} />

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
                  {t('Nearby.otroBar')}
                </div>
                <p style={{
                  margin: 'var(--s-2) 0 0', fontSize: 'var(--t-3)',
                  color: 'var(--cream-soft)', lineHeight: 1.5, textWrap: 'pretty',
                }}>
                  {t('Nearby.viejos', { count: viejos, dias: FRESCO_DIAS })}
                </p>
                <button onClick={() => nav('/')} className="lbl cta" style={{
                  marginTop: 'var(--s-3)', width: '100%', height: 46,
                  borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
                  background: 'var(--acento)', color: 'var(--base)',
                }}>{t('AddMenu.precio')}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Cómo viene la zona: el precio típico, y el abanico en el que cae.
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
        {t('Nearby.sinDatos', { radio: formatRadius(radius) })}
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
      {/* "Cómo viene la zona" y no "Benchmark zonal": es la frase que alguien
          usaría parado en la vereda, que es donde se lee esto. El préstamo
          sonaba a reporte de oficina en la única pantalla que contesta la
          pregunta más de bar que tiene la app. */}
      <div className="section-label" style={{ margin: 0 }}>
        {t('Nearby.comoViene', { radio: formatRadius(radius) })}
      </div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', marginTop: 'var(--s-2)',
      }}>
        <span className="num" style={{ fontSize: 'var(--t-9)', lineHeight: 1 }}>
          {formatPrice(stats.medianPint, stats.currency)}
        </span>
        <span style={{ fontSize: 'var(--t-2)', color: 'var(--muted)' }}>
          {t('AreaStatsCard.pintaTipico')}
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
            <span>{t('AreaStatsCard.piso', { precio: formatPrice(piso!, stats.currency) })}</span>
            <span>{t('AreaStatsCard.tope', { precio: formatPrice(tope!, stats.currency) })}</span>
          </div>
        </>
      )}

      {/* El pie dice de cuánto sale el promedio, y nada más.
          Traía además la normalización y la ventana —"llevados a una pinta de
          473 ml, de menos de 45 días"—, dos renglones de letra chica que
          nadie leía y que empujaban la tarjeta. La unidad no se pierde: el
          titular ya dice "la pinta, típico" al lado del número. */}
      <p style={{
        margin: 'var(--s-3) 0 0', paddingTop: 'var(--s-3)',
        borderTop: '1px solid var(--hairline)',
        fontSize: 'var(--t-1)', color: 'var(--faint)', lineHeight: 1.5,
      }}>
        {t('Nearby.muestras', { count: stats.bars, precios: stats.samples })}
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


/**
 * Quiénes más tomaron entre los bares de esta zona, últimos 30 días.
 *
 * **Sólo cuenta lo que se anotó con bar.** Una birra sin bar no se puede
 * ubicar, así que no compite en un ranking por cercanía; se avisa en la
 * bienvenida y se repite acá abajo, porque quien mire la tabla y no se vea va a
 * preguntarse exactamente eso.
 *
 * El tope de quince por día lo pone el servidor, al anotar y otra vez al
 * contar. Sin él la tabla la gana quien tenga más paciencia tocando un botón.
 *
 * Y sólo figura quien tiene alias, la misma regla que la tabla de
 * colaboradores: el nombre de Google no se publica en ningún lado.
 */
function Ranking({ filas, onAbrir }: {
  filas: BeerRank[] | null
  onAbrir: (userId: number) => void
}) {
  return (
    <section style={{ marginTop: 'var(--s-5)' }}>
      <h2 className="section-label" style={{ padding: '0 var(--s-4)' }}>
        {t('Nearby.quienTomo')}
      </h2>

      {filas == null ? (
        <SkeletonRows rows={3} />
      ) : filas.length === 0 ? (
        <p style={{
          color: 'var(--faint)', fontSize: 'var(--t-2)', lineHeight: 1.5,
          padding: '0 var(--s-4)', textWrap: 'pretty',
        }}>
          {t('Nearby.nadie')}
        </p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {filas.map((f, i) => (
            <li key={f.userId}>
              <button onClick={() => onAbrir(f.userId)} className="row-hover" style={{
                display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
                width: '100%', padding: 'var(--s-3) var(--s-4)', textAlign: 'left',
                borderBottom: '1px solid var(--hairline)',
              }}>
                {/* El puesto en cifras tabulares, igual que en colaboradores:
                    si no, la columna baila entre el 9 y el 10 y la lista deja
                    de leerse como un ranking. */}
                <span className="num" style={{
                  width: 20, textAlign: 'right', flexShrink: 0, fontSize: 'var(--t-3)',
                  color: i < 3 ? 'var(--acento)' : 'var(--faint)',
                }}>{i + 1}</span>

                {f.avatarUrl
                  ? <img src={f.avatarUrl} alt="" width={30} height={30} loading="lazy"
                      style={{
                        width: 30, height: 30, borderRadius: 'var(--r-1)',
                        objectFit: 'cover', flexShrink: 0,
                      }} />
                  : <span aria-hidden style={{
                      width: 30, height: 30, borderRadius: 'var(--r-1)', flexShrink: 0,
                      background: 'var(--elevated)',
                    }} />}

                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="lbl" style={{
                    display: 'block', fontSize: 'var(--t-3)', color: 'var(--cream)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{f.alias}</span>
                  {/* En cuántos días: veinte birras en dos noches y veinte en
                      quince no son la misma historia. */}
                  <span style={{ fontSize: 'var(--t-1)', color: 'var(--faint)' }}>
                    {t('Nearby.enDias', { count: f.days })}
                  </span>
                </span>

                <span className="num" style={{
                  flexShrink: 0, fontSize: 'var(--t-5)', color: 'var(--cream)',
                }}>{f.beers}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
