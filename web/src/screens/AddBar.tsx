import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CurrencySelect } from '../ui/CurrencySelect'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import * as api from '../data/api'
import type { BarPin, User } from '../data/types'
import { formatDistance } from '../data/format'
import { SectionLabel } from '../ui/Kit'

interface Suggestion { placeId: string; primary: string; secondary: string }

/**
 * Alta de bar, en tres capas y en este orden:
 *
 *  1. Lo que ya está cargado — si existe, el usuario lo ve y sigue de largo.
 *     Es la defensa más barata contra el mismo bar cargado cinco veces.
 *  2. Google — completa los datos y prueba que el lugar existe, así que esos
 *     entran aprobados.
 *  3. A mano, siempre disponible. Pide dirección: sin ella un moderador no
 *     tiene con qué verificar nada.
 */
export function AddBarScreen(
  { user, center, onAdded }: {
    user: User | null
    center: google.maps.LatLngLiteral | null
    onAdded: () => void
  },
) {
  const nav = useNavigate()
  const placesLib = useMapsLibrary('places')

  const [query, setQuery] = useState('')
  const [existing, setExisting] = useState<BarPin[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [chosen, setChosen] = useState<{
    placeId: string; name: string; address: string | null
    lat: number; lng: number
    /** ISO-3166-1 alfa-2. De acá deduce el servidor la moneda del bar. */
    countryCode: string | null
  } | null>(null)
  const [manual, setManual] = useState(false)
  const [address, setAddress] = useState('')
  // Sólo para el alta a mano: sin lugar de Google no hay país que mirar.
  // Arranca en la moneda de la persona, que es la del lugar donde está.
  const [currency, setCurrency] = useState(user?.currency ?? 'ARS')
  const [searching, setSearching] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  useEffect(() => {
    if (placesLib) token.current = new placesLib.AutocompleteSessionToken()
  }, [placesLib])

  useEffect(() => {
    if (!user) nav('/perfil')
  }, [user, nav])

  useEffect(() => {
    if (chosen || query.trim().length < 2) { setExisting([]); setSuggestions([]); return }
    let alive = true
    setSearching(true)
    // Se espera a que deje de tipear: cada búsqueda de Google es una llamada
    // facturada, y disparar por tecla multiplica el costo sin mejorar nada.
    const t = setTimeout(async () => {
      // La base propia primero: es gratis e instantánea, y no espera a Google.
      const mine = await api.searchBars(query, center?.lat, center?.lng).catch(() => [])
      if (!alive) return
      setExisting(mine); setSearching(false)

      if (!placesLib) return
      try {
        const { suggestions: s } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: query,
            // Sin `includedRegionCodes`. Era la única cosa en toda la app que
            // ataba birrapp a Argentina: el backend siempre aceptó
            // coordenadas de todo el globo. `locationBias` sigue ordenando por
            // cercanía, así que parado en Buenos Aires ves lo de acá primero.
            sessionToken: token.current ?? undefined,
            ...(center ? {
              locationBias: { center, radius: 30_000 },
            } : {}),
          })
        if (!alive) return
        setSuggestions(s.slice(0, 6).map(x => ({
          placeId: x.placePrediction!.placeId,
          primary: x.placePrediction!.mainText?.text ?? '',
          secondary: x.placePrediction!.secondaryText?.text ?? '',
        })))
      } catch { if (alive) setSuggestions([]) }
    }, 350)
    return () => { alive = false; clearTimeout(t); setSearching(false) }
  }, [query, chosen, center, placesLib])

  const pick = async (s: Suggestion) => {
    if (!placesLib) return
    try {
      const place = new placesLib.Place({ id: s.placeId })
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'],
      })
      const loc = place.location
      if (!loc) throw new Error('sin ubicación')
      // El país sale de los componentes de la dirección. Es de donde el
      // servidor deduce la moneda del bar: un pub de Londres cobra en libras
      // y nadie tiene que elegir eso a mano.
      const country = place.addressComponents
        ?.find(c => c.types.includes('country'))?.shortText ?? null
      setChosen({
        placeId: s.placeId,
        name: place.displayName ?? s.primary,
        address: place.formattedAddress ?? null,
        lat: loc.lat(), lng: loc.lng(),
        countryCode: country,
      })
      token.current = new placesLib.AutocompleteSessionToken()
    } catch { setError('No pudimos obtener la ubicación de ese lugar.') }
  }

  const canSend = chosen != null || (manual && address.trim() !== '')

  const submit = async () => {
    if (!center && !chosen) return
    setSending(true); setError(null)
    try {
      await api.addBar(chosen
        ? {
            name: chosen.name, lat: chosen.lat, lng: chosen.lng,
            address: chosen.address, googlePlaceId: chosen.placeId,
            countryCode: chosen.countryCode ?? undefined,
          }
        : {
            name: query.trim(), lat: center!.lat, lng: center!.lng,
            address: address.trim(),
            // Sin lugar de Google no hay país del que deducir nada, así que
            // manda la moneda elegida en el formulario, que arranca en la de
            // tu configuración.
            currency,
          })
      onAdded()
      nav('/')
    } catch (e) { setError((e as Error).message) } finally { setSending(false) }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      paddingTop: 'var(--safe-top)',
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
        <button onClick={() => nav(-1)} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
        <h1 className="ttl" style={{ fontSize: 'var(--t-6)', margin: 0 }}>Bar nuevo</h1>
      </header>

      {/* Con `paddingTop: 0` el borde del input queda pegado al origen del
          scroll y el contenedor se lo come: se veía cortado por arriba. */}
      <div className="desk-narrow" style={{
        flex: 1, overflowY: 'auto', padding: '6px 18px 0', width: '100%',
      }}>
        {chosen ? (
          <>
            <div style={{
              display: 'flex', gap: 12, padding: 16, borderRadius: 'var(--r-3)',
              background: 'rgba(95,217,141,.10)',
            }}>
              <span style={{ color: 'var(--fresh)' }}>✓</span>
              <div>
                <div className="lbl" style={{ fontSize: 'var(--t-4)' }}>{chosen.name}</div>
                {chosen.address && (
                  <div style={{ color: 'var(--muted)', fontSize: 'var(--t-2)' }}>{chosen.address}</div>
                )}
                <div style={{ color: 'var(--fresh)', fontSize: 'var(--t-1)', marginTop: 8 }}>
                  Verificado en Google Maps · se publica al instante
                </div>
              </div>
            </div>
            <button onClick={() => { setChosen(null); setQuery('') }} style={{
              color: 'var(--acento)', fontSize: 'var(--t-3)', marginTop: 12,
            }}>¿No es este?</button>
          </>
        ) : (
          <>
            <input
              value={query} onChange={e => { setQuery(e.target.value); setManual(false) }}
              // Enter abre el alta a mano con lo escrito. Sin esto, quien
              // escribe un bar que Google no conoce teclea el nombre, aprieta
              // Enter, no pasa nada y el botón de enviar sigue apagado: hay
              // que darse cuenta de que el camino es el botón "Agregar" de más
              // abajo. Lo tecleado no se pierde, pero parece que sí.
              onKeyDown={e => {
                if (e.key === 'Enter' && query.trim().length >= 2 && !chosen) {
                  setManual(true)
                }
              }}
              placeholder="¿Cómo se llama?" autoFocus
              style={{
                width: '100%', padding: '16px 16px', borderRadius: 'var(--r-2)',
                background: 'transparent', border: '1px solid var(--hairline)',
              }}
            />
            {searching && <div className="spinner" style={{ margin: '14px auto' }} />}

            {existing.length > 0 && <SectionLabel>Ya está en birrapp</SectionLabel>}
            {existing.map(b => (
              <button key={b.id} onClick={() => nav(`/bar/${b.id}`)} style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '12px 0', textAlign: 'left',
                borderBottom: '1px solid var(--hairline)',
              }}>
                <span style={{ color: 'var(--fresh)' }}>✓</span>
                <span style={{ flex: 1 }}>
                  <span className="lbl" style={{ display: 'block', fontSize: 'var(--t-4)' }}>{b.name}</span>
                  <span style={{ color: 'var(--faint)', fontSize: 'var(--t-2)' }}>
                    {formatDistance(b.distanceMeters)}
                  </span>
                </span>
                <span style={{ color: 'var(--acento)', fontSize: 'var(--t-3)' }}>Ver</span>
              </button>
            ))}

            {suggestions.length > 0 && <SectionLabel>Encontrados en Google</SectionLabel>}
            {suggestions.map(s => (
              <button key={s.placeId} onClick={() => pick(s)} style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '12px 0', textAlign: 'left',
                borderBottom: '1px solid var(--hairline)',
              }}>
                <span style={{ color: 'var(--acento)' }}>◈</span>
                <span style={{ flex: 1 }}>
                  <span className="lbl" style={{ display: 'block', fontSize: 'var(--t-4)' }}>{s.primary}</span>
                  <span style={{ color: 'var(--faint)', fontSize: 'var(--t-2)' }}>{s.secondary}</span>
                </span>
              </button>
            ))}

            {query.trim().length >= 2 && !searching && (
              <div style={{ marginTop: 16 }}>
                {!manual ? (
                  <button onClick={() => setManual(true)} style={{
                    display: 'flex', gap: 12, width: '100%', padding: 16,
                    borderRadius: 'var(--r-3)', background: 'var(--elevated)', textAlign: 'left',
                  }}>
                    <span style={{ color: 'var(--acento)' }}>+</span>
                    <span>
                      <span className="lbl" style={{ display: 'block' }}>Agregar “{query}”</span>
                      <span style={{ color: 'var(--faint)', fontSize: 'var(--t-1)' }}>
                        Lo revisa un moderador antes de publicarse
                      </span>
                    </span>
                  </button>
                ) : (
                  <>
                    <div className="lbl" style={{ fontSize: 'var(--t-4)' }}>Agregar “{query}”</div>
                    <input
                      value={address} onChange={e => setAddress(e.target.value)}
                      placeholder="Calle y altura, o esquina"
                      style={{
                        width: '100%', padding: '12px 16px', borderRadius: 'var(--r-2)', marginTop: 12,
                        background: 'transparent', border: '1px solid var(--hairline)',
                      }}
                    />
                    <p style={{ color: 'var(--faint)', fontSize: 'var(--t-1)', lineHeight: 1.5 }}>
                      Hace falta la dirección para que un moderador pueda verificar
                      que el bar existe.
                    </p>

                    {/* Elegido del buscador, el país lo dice Google y la
                        moneda sale sola. Cargado a mano no hay de dónde
                        sacarla, así que se pregunta — con la de tu
                        configuración puesta, que es la del lugar donde
                        probablemente estés parado. */}
                    <label className="lbl" style={{
                      display: 'flex', alignItems: 'center', gap: 12, marginTop: 16,
                      fontSize: 'var(--t-3)', color: 'var(--muted)',
                    }}>
                      En qué moneda cobra
                      <CurrencySelect value={currency} onChange={setCurrency} />
                    </label>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>}
      </div>

      {/* Un botón apagado sin explicación es un callejón: la persona escribió
          el nombre, ve el botón gris y no sabe qué le falta. Esto lo dice. */}
      {!canSend && query.trim().length >= 2 && (
        <p style={{
          color: 'var(--faint)', fontSize: 'var(--t-2)', textAlign: 'center',
          margin: '0 16px', lineHeight: 1.5,
        }}>
          {manual
            ? 'Falta la dirección para poder verificarlo.'
            : 'Elegí el bar de la lista, o tocá “Agregar” para cargarlo a mano.'}
        </p>
      )}

      <button disabled={!canSend || sending} onClick={submit} className="lbl" style={{
        margin: `12px 18px calc(14px + var(--nav-gap))`, padding: 16,
        borderRadius: 'var(--r-3)', fontSize: 'var(--t-4)', minHeight: 52,
        background: canSend ? 'var(--acento)' : 'var(--elevated)',
        color: canSend ? 'var(--base)' : 'var(--faint)',
      }}>{sending ? 'Enviando…' : 'Agregar este bar'}</button>
    </div>
  )
}

