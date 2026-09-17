import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { AreaStats, BeerStyle } from '../data/types'
import { ageColor, formatPrice, formatRadius, shortAge } from '../data/format'

/**
 * "¿Cómo viene la zona?" — el promedio de la pinta en el radio (BIR-33).
 *
 * Va arriba de la lista y no en una pantalla propia: la pregunta aparece
 * mirando precios, y una pantalla aparte sería un lugar al que habría que
 * acordarse de ir.
 *
 * Los montos están normalizados a una pinta de 473 ml. Sin eso, un schop de
 * 330 y una pinta de 473 se promedian como si fueran lo mismo y el número
 * baja cuando lo que cambió fue el tamaño del vaso. Lo dice el pie de la
 * tarjeta, porque un promedio sin su unidad es otra forma de mentir.
 */
export function AreaStatsCard({ center, radius, styleFilter, styles }: {
  center: google.maps.LatLngLiteral | null
  radius: number
  /** Varios estilos; las stats de la zona son de todos ellos juntos. */
  styleFilter: string[]
  styles: BeerStyle[]
}) {
  const nav = useNavigate()
  const [data, setData] = useState<AreaStats | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!center) return
    let alive = true
    // Se espera un poco: el radio se mueve con un slider y sin rebote sería
    // una consulta por cada pixel que se arrastra.
    const t = setTimeout(() => {
      api.areaStats(center.lat, center.lng, radius, styleFilter)
        .then(d => { if (alive) setData(d) })
        .catch(() => { if (alive) setData(null) })
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [center?.lat, center?.lng, radius, styleFilter])

  // Con menos de tres precios un promedio no es un promedio, es un precio con
  // pretensiones. Mejor no mostrar nada que mostrar un número que no
  // significa nada.
  if (!data || data.samples < 3 || data.medianPint == null) return null

  // Con un estilo va su nombre; con varios, el número. La tarjeta dice de qué
  // es el promedio, y "IPA, APA, Stout · 2 km a la redonda" no entra.
  const styleName = styleFilter.length === 1
    ? styles.find(s => s.slug === styleFilter[0])?.name
    : styleFilter.length > 1 ? `${styleFilter.length} estilos` : null

  // Dónde cae el típico dentro del rango de la zona. Sin piso y techo
  // distintos no hay rango que dibujar y la barra no se pinta: con un solo
  // precio en dos puntas, una marca al 50% sería un adorno que miente.
  const piso = data.minPint
  const tope = data.maxPint
  const rango = piso != null && tope != null && tope > piso
  const marca = rango ? ((data.medianPint - piso!) / (tope! - piso!)) * 100 : null

  return (
    <div style={{
      margin: 'var(--s-3) var(--s-4) 0', borderRadius: 'var(--r-3)',
      // Sigue siendo tarjeta cuando el resto de las listas dejó de serlo, y es
      // a propósito: la pizarra reserva la tarjeta para lo que de verdad es un
      // bloque aparte, y esto no es una fila más de la lista sino el promedio
      // contra el que se leen todas las demás.
      background: 'var(--raised)', border: '1px solid var(--hairline)',
    }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-3)', width: '100%',
        padding: 'var(--s-3) var(--s-4)', textAlign: 'left',
      }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          {/* La etiqueta de sección de siempre, ahora en el tono informativo:
              dice de qué es el promedio, y en `--faint` competía con los
              metadatos de las filas de abajo, que son del mismo tamaño. */}
          <span className="section-label" style={{ margin: 0, display: 'block' }}>
            {styleName ? `${styleName} · ` : ''}{formatRadius(radius)} a la redonda
          </span>
          <span style={{
            display: 'flex', alignItems: 'baseline', gap: 'var(--s-2)', marginTop: 'var(--s-1)',
          }}>
            <span className="num" style={{ fontSize: 'var(--t-7)', lineHeight: 1.1 }}>
              {formatPrice(data.medianPint, data.currency)}
            </span>
            <span style={{ fontSize: 'var(--t-2)', color: 'var(--muted)' }}>
              la pinta, típico
            </span>
          </span>
        </span>
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden style={{
          color: 'var(--info)', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
        }}>
          <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor"
            strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: '0 var(--s-4) var(--s-4)' }}>
          {/*
            El rango de la zona, dibujado.
            El número de arriba dice cuánto sale la pinta; esto dice qué tan
            lejos está el bar más barato del más caro, que es la otra mitad de
            "cómo viene la zona". Los dos montos estaban —"la más barata" era
            una celda suelta— pero puestos uno al lado del otro no contaban que
            entre ellos hay un abanico, y dónde cae el típico adentro de ese
            abanico es el dato que dice si conviene caminar dos cuadras.
          */}
          {rango && (
            <>
              <div aria-hidden style={{
                position: 'relative', height: 16, marginBottom: 'var(--s-1)',
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
                fontSize: 'var(--t-1)', color: 'var(--faint)', marginBottom: 'var(--s-3)',
              }}>
                <span>piso {formatPrice(piso!, data.currency)}</span>
                <span>tope {formatPrice(tope!, data.currency)}</span>
              </div>
            </>
          )}

          {/* Dos celdas y no tres: "la más barata" ahora es el piso de la
              barra de arriba, y cuántos precios lo sostienen ya lo dice el pie.
              Repetir un número en dos lugares de la misma tarjeta es ruido. */}
          <div style={{ display: 'flex', gap: 'var(--s-3)', marginBottom: 'var(--s-3)' }}>
            <Cell label="Promedio" value={formatPrice(data.avgPint!, data.currency)} />
            <Cell label="Bares" value={String(data.bars)} />
          </div>

          {data.bestValue && (
            <Pick
              title="El mejor de la zona"
              why={`${data.bestValue.ratingRaw?.toFixed(1)} ★ con ${data.bestValue.ratingCount} ${
                data.bestValue.ratingCount === 1 ? 'voto' : 'votos'}, a ${
                formatPrice(data.bestValue.price, data.currency)}`}
              name={data.bestValue.barName}
              beer={beerLabel(data.bestValue.styleName, data.bestValue.brandName)}
              age={data.bestValue.ageDays}
              onClick={() => nav(`/bar/${data.bestValue!.barId}`)}
            />
          )}

          {data.cheapest && (
            <Pick
              title="La más barata"
              why={`${formatPrice(data.cheapest.price, data.currency)} los ${data.cheapest.sizeMl} ml`}
              name={data.cheapest.barName}
              beer={beerLabel(data.cheapest.styleName, data.cheapest.brandName)}
              age={data.cheapest.ageDays}
              onClick={() => nav(`/bar/${data.cheapest!.barId}`)}
            />
          )}

          <p style={{
            fontSize: 'var(--t-1)', color: 'var(--faint)',
            margin: 'var(--s-3) 0 0', lineHeight: 1.5,
          }}>
            Todo llevado a una pinta de 473 ml, sobre {data.samples} precios de
            menos de 45 días. Los más viejos no entran.
          </p>
        </div>
      )}
    </div>
  )
}

const beerLabel = (style: string, brand: string | null) =>
  brand ? `${style} · ${brand}` : style

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div className="num" style={{ fontSize: 'var(--t-4)' }}>{value}</div>
      <div style={{ fontSize: 'var(--t-1)', color: 'var(--faint)', marginTop: 2 }}>{label}</div>
    </div>
  )
}



function Pick({ title, why, name, beer, age, onClick }: {
  title: string; why: string; name: string; beer: string; age: number; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 'var(--s-3)', width: '100%',
      padding: 'var(--s-2) 0', minHeight: 44, textAlign: 'left',
      borderTop: '1px solid var(--hairline)',
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="section-label" style={{ margin: 0, display: 'block' }}>
          {title.toUpperCase()}
        </span>
        <span className="lbl" style={{
          display: 'block', fontSize: 'var(--t-4)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{name}</span>
        <span style={{ fontSize: 'var(--t-2)', color: 'var(--muted)' }}>
          {beer} — {why}
        </span>
      </span>
      {/* Ningún precio sin su antigüedad al lado, tampoco en un ranking. Y la
          antigüedad va en el color de la frescura, que es el que ya usa cada
          fila de la lista: si el mejor de la zona lo es con un precio de hace
          cuarenta días, eso tiene que verse sin leer la fecha. */}
      <span className="num" style={{
        fontSize: 'var(--t-1)', color: ageColor(age), flexShrink: 0,
      }}>
        {shortAge(age)}
      </span>
    </button>
  )
}
