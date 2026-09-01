import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import * as api from '../data/api'
import type { BarPin, User } from '../data/types'
import { formatDistance } from '../data/format'

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
  } | null>(null)
  const [manual, setManual] = useState(false)
  const [address, setAddress] = useState('')
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
            includedRegionCodes: ['ar'],
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
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
      const loc = place.location
      if (!loc) throw new Error('sin ubicación')
      setChosen({
        placeId: s.placeId,
        name: place.displayName ?? s.primary,
        address: place.formattedAddress ?? null,
        lat: loc.lat(), lng: loc.lng(),
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
          }
        : {
            name: query.trim(), lat: center!.lat, lng: center!.lng,
            address: address.trim(),
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
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
        <button onClick={() => nav(-1)} style={{
          width: 38, height: 38, borderRadius: '50%', background: 'var(--elevated)',
        }} aria-label="Volver">←</button>
        <h1 className="ttl" style={{ fontSize: 20, margin: 0 }}>Bar nuevo</h1>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px' }}>
        {chosen ? (
          <>
            <div style={{
              display: 'flex', gap: 10, padding: 14, borderRadius: 14,
              background: 'rgba(95,217,141,.10)',
            }}>
              <span style={{ color: 'var(--fresh)' }}>✓</span>
              <div>
                <div className="lbl" style={{ fontSize: 16 }}>{chosen.name}</div>
                {chosen.address && (
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{chosen.address}</div>
                )}
                <div style={{ color: 'var(--fresh)', fontSize: 11, marginTop: 6 }}>
                  Verificado en Google Maps · se publica al instante
                </div>
              </div>
            </div>
            <button onClick={() => { setChosen(null); setQuery('') }} style={{
              color: 'var(--amber)', fontSize: 13, marginTop: 12,
            }}>¿No es este?</button>
          </>
        ) : (
          <>
            <input
              value={query} onChange={e => { setQuery(e.target.value); setManual(false) }}
              placeholder="¿Cómo se llama?" autoFocus
              style={{
                width: '100%', padding: '14px 15px', borderRadius: 13,
                background: 'transparent', border: '1px solid var(--hairline)',
              }}
            />
            {searching && <div className="spinner" style={{ margin: '14px auto' }} />}

            {existing.length > 0 && <SectionLabel>Ya está en birrapp</SectionLabel>}
            {existing.map(b => (
              <button key={b.id} onClick={() => nav(`/bar/${b.id}`)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '12px 0', textAlign: 'left',
                borderBottom: '1px solid var(--hairline)',
              }}>
                <span style={{ color: 'var(--fresh)' }}>✓</span>
                <span style={{ flex: 1 }}>
                  <span className="lbl" style={{ display: 'block', fontSize: 16 }}>{b.name}</span>
                  <span style={{ color: 'var(--faint)', fontSize: 12 }}>
                    {formatDistance(b.distanceMeters)}
                  </span>
                </span>
                <span style={{ color: 'var(--amber)', fontSize: 13 }}>Ver</span>
              </button>
            ))}

            {suggestions.length > 0 && <SectionLabel>Encontrados en Google</SectionLabel>}
            {suggestions.map(s => (
              <button key={s.placeId} onClick={() => pick(s)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '12px 0', textAlign: 'left',
                borderBottom: '1px solid var(--hairline)',
              }}>
                <span style={{ color: 'var(--amber)' }}>◈</span>
                <span style={{ flex: 1 }}>
                  <span className="lbl" style={{ display: 'block', fontSize: 16 }}>{s.primary}</span>
                  <span style={{ color: 'var(--faint)', fontSize: 12 }}>{s.secondary}</span>
                </span>
              </button>
            ))}

            {query.trim().length >= 2 && !searching && (
              <div style={{ marginTop: 16 }}>
                {!manual ? (
                  <button onClick={() => setManual(true)} style={{
                    display: 'flex', gap: 10, width: '100%', padding: 14,
                    borderRadius: 14, background: 'var(--elevated)', textAlign: 'left',
                  }}>
                    <span style={{ color: 'var(--amber)' }}>+</span>
                    <span>
                      <span className="lbl" style={{ display: 'block' }}>Agregar “{query}”</span>
                      <span style={{ color: 'var(--faint)', fontSize: 11 }}>
                        Lo revisa un moderador antes de publicarse
                      </span>
                    </span>
                  </button>
                ) : (
                  <>
                    <div className="lbl" style={{ fontSize: 16 }}>Agregar “{query}”</div>
                    <input
                      value={address} onChange={e => setAddress(e.target.value)}
                      placeholder="Calle y altura, o esquina"
                      style={{
                        width: '100%', padding: '13px 15px', borderRadius: 13, marginTop: 10,
                        background: 'transparent', border: '1px solid var(--hairline)',
                      }}
                    />
                    <p style={{ color: 'var(--faint)', fontSize: 11, lineHeight: 1.5 }}>
                      Hace falta la dirección para que un moderador pueda verificar
                      que el bar existe.
                    </p>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      </div>

      <button disabled={!canSend || sending} onClick={submit} className="lbl" style={{
        margin: `12px 18px calc(18px + var(--safe-bottom))`, padding: 16,
        borderRadius: 16, fontSize: 15,
        background: canSend ? 'var(--amber)' : 'var(--elevated)',
        color: canSend ? 'var(--base)' : 'var(--faint)',
      }}>{sending ? '…' : 'Enviar'}</button>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="lbl" style={{
      fontSize: 10, letterSpacing: '.12em', color: 'var(--faint)', margin: '18px 0 6px',
    }}>{String(children).toUpperCase()}</h2>
  )
}
