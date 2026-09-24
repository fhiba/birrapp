import { useEffect, useRef, useState } from 'react'
import * as fb from '../data/feedback'
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
  { user, center, onAdded, onBack, embedded = false }: {
    user: User | null
    center: google.maps.LatLngLiteral | null
    /**
     * El bar quedó elegido. Llega con el bar cuando hay uno —recién dado de
     * alta, o uno que ya estaba y se encontró buscando—; sin argumento desde
     * la pantalla suelta, donde lo único que hace falta es invalidar la caché.
     */
    onAdded: (bar?: { id: number; name: string }) => void
    /** Qué hace la flecha. Por defecto, la vuelta atrás del navegador. */
    onBack?: () => void
    /**
     * Montada adentro de otro flujo (hoy, el paso "el bar no está" de la carga
     * de precio) y no como su propia ruta.
     *
     * Cambia tres cosas, todas por lo mismo — acá el alta es un desvío y no el
     * destino: no navega a ningún lado al terminar, tocar un bar que ya existe
     * lo elige en vez de abrir su ficha, y se dibuja como una capa encima en
     * vez de ocupar el lugar de la pantalla.
     */
    embedded?: boolean
  },
) {
  const nav = useNavigate()
  const volver = onBack ?? (() => nav(-1))
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
  const [addrHits, setAddrHits] = useState<Suggestion[]>([])
  /**
   * Dónde queda la dirección que se escribió, según Google.
   *
   * Es el punto que se guarda al cargar un bar a mano. Antes ese punto era
   * `center` —el centro del mapa— y la dirección viajaba como texto al lado,
   * sin ninguna relación con él: alguien con la ubicación denegada veía el
   * mapa en el Obelisco, escribía una dirección de Madrid y el bar quedaba
   * cargado en el Obelisco. Pasó, y lo agarró la moderación.
   *
   * Null hasta que se elige una de la lista, y vuelve a null si se edita el
   * texto: la dirección y el punto tienen que salir del mismo lugar o no
   * significan nada juntos.
   */
  const [spot, setSpot] = useState<
    { lat: number; lng: number; address: string; countryCode: string | null } | null
  >(null)
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

  /**
   * Las direcciones que matchean lo que se escribió.
   *
   * Es el mismo autocompletado de Places que busca bares, con la dirección
   * como entrada: una API menos que habilitar que el Geocoding, y encima
   * muestra una lista para elegir, así que el punto lo confirma la persona y
   * no lo adivina la app.
   */
  useEffect(() => {
    if (!manual || spot || address.trim().length < 4 || !placesLib) { setAddrHits([]); return }
    let alive = true
    const t = setTimeout(async () => {
      try {
        const { suggestions: s } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: address,
            sessionToken: token.current ?? undefined,
            ...(center ? { locationBias: { center, radius: 30_000 } } : {}),
          })
        if (!alive) return
        setAddrHits(s.slice(0, 5).map(x => ({
          placeId: x.placePrediction!.placeId,
          primary: x.placePrediction!.mainText?.text ?? '',
          secondary: x.placePrediction!.secondaryText?.text ?? '',
        })))
      } catch { if (alive) setAddrHits([]) }
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [manual, address, spot, center, placesLib])

  /**
   * Fija el punto del bar en la dirección elegida.
   *
   * El `placeId` de la dirección se usa y se tira: NO viaja al servidor. Un
   * bar cargado con place_id entra aprobado sin pasar por moderación —ver
   * `BarRepo.create`— y el place_id de una calle no prueba que en esa calle
   * haya un bar. Lo único que aporta son las coordenadas y el país.
   */
  const pickAddress = async (s: Suggestion) => {
    if (!placesLib) return
    try {
      const place = new placesLib.Place({ id: s.placeId })
      await place.fetchFields({
        fields: ['formattedAddress', 'location', 'addressComponents'],
      })
      const loc = place.location
      if (!loc) throw new Error('sin ubicación')
      const dir = place.formattedAddress ?? [s.primary, s.secondary].filter(Boolean).join(', ')
      setSpot({
        lat: loc.lat(), lng: loc.lng(), address: dir,
        countryCode: place.addressComponents
          ?.find(c => c.types.includes('country'))?.shortText ?? null,
      })
      // Se guarda lo que Google devolvió y no lo que se tipeó: es la dirección
      // del punto que se está guardando, y es la que va a mirar el moderador.
      setAddress(dir)
      setAddrHits([])
      token.current = new placesLib.AutocompleteSessionToken()
    } catch { setError('No pudimos ubicar esa dirección.') }
  }

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

  // A mano hace falta la dirección ELEGIDA, no escrita: de ahí sale el punto.
  const canSend = chosen != null || (manual && spot != null)

  const submit = async () => {
    if (!chosen && !spot) return
    setSending(true); setError(null)
    try {
      const r = await api.addBar(chosen
        ? {
            name: chosen.name, lat: chosen.lat, lng: chosen.lng,
            address: chosen.address, googlePlaceId: chosen.placeId,
            countryCode: chosen.countryCode ?? undefined,
          }
        : {
            // El punto sale de la dirección, no del mapa. Sin `googlePlaceId`
            // a propósito: es el de la calle, no el del bar, y mandarlo lo
            // haría entrar aprobado sin que nadie verifique que el bar existe.
            name: query.trim(), lat: spot!.lat, lng: spot!.lng,
            address: spot!.address,
            countryCode: spot!.countryCode ?? undefined,
            // Sin lugar de Google no hay país del que deducir nada, así que
            // manda la moneda elegida en el formulario, que arranca en la de
            // tu configuración.
            currency,
          })
      // Un bar nuevo es el aporte más grande que se puede hacer y hasta acá no
      // devolvía nada: la pantalla se cerraba y listo.
      fb.exito()
      onAdded(chosen ? { id: r.id, name: chosen.name } : { id: r.id, name: query.trim() })
      // Embebida no navega: el flujo que la abrió sigue donde estaba, con el
      // bar recién creado ya elegido.
      if (!embedded) nav('/')
    } catch (e) { fb.error(); setError((e as Error).message) } finally { setSending(false) }
  }

  return (
    <div style={{
      position: embedded ? 'fixed' : 'absolute', inset: 0,
      // Por encima de la carga de precio, que es `fixed` con z-index 70.
      zIndex: embedded ? 75 : undefined,
      background: embedded ? 'var(--base)' : undefined,
      display: 'flex', flexDirection: 'column',
      paddingTop: 'var(--safe-top)',
      paddingBottom: embedded ? 'var(--safe-bottom)' : undefined,
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderBottom: '1px solid var(--hairline)',
      }}>
        <button onClick={volver} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
        <h1 className="ttl" style={{ fontSize: 'var(--t-6)', margin: 0 }}>Bar nuevo</h1>
      </header>

      {/* Con `paddingTop: 0` el borde del input queda pegado al origen del
          scroll y el contenedor se lo come: se veía cortado por arriba. */}
      <div className="desk-narrow" style={{
        flex: 1, overflowY: 'auto', padding: '6px 18px 0', width: '100%',
      }}>
        {chosen ? (
          <>
            {/* El bloque de "verificado" sí es una tarjeta: es lo único de esta
                pantalla que es un bloque aparte y no un renglón de una lista.

                Pasa del verde crudo —un hex suelto de la paleta vieja, que
                además era el color de la frescura de un precio— a `--info`, que
                es el tono de lo verificado y lo estructural. Acá no hay ningún
                precio: teñirlo del color de la frescura era prometer un dato
                que esta pantalla no tiene. */}
            <div style={{
              display: 'flex', gap: 12, padding: 'var(--s-4)', borderRadius: 'var(--r-3)',
              background: 'var(--info-soft)', border: '1px solid var(--info-border)',
            }}>
              <span style={{ color: 'var(--info-bright)' }}>✓</span>
              <div>
                <div className="lbl" style={{ fontSize: 'var(--t-4)' }}>{chosen.name}</div>
                {chosen.address && (
                  <div style={{ color: 'var(--muted)', fontSize: 'var(--t-2)' }}>{chosen.address}</div>
                )}
                <div style={{ color: 'var(--info)', fontSize: 'var(--t-1)', marginTop: 8 }}>
                  Verificado en Google Maps · se publica al instante
                </div>
              </div>
            </div>
            <button onClick={() => { setChosen(null); setQuery('') }} className="lbl" style={{
              color: 'var(--info)', fontSize: 'var(--t-3)', marginTop: 12, minHeight: 44,
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
                // El campo se apoya sobre `--raised` y no sobre el fondo: con
                // el fondo transparente, un borde de un pixel era todo lo que
                // decía que ahí se escribe.
                background: 'var(--raised)', border: '1px solid var(--hairline)',
              }}
            />
            {searching && <div className="spinner" style={{ margin: '14px auto' }} />}

            {existing.length > 0 && <SectionLabel>Ya está en birrapp</SectionLabel>}
            {/* El tilde, la distancia y el "Ver" son las tres cosas
                informativas de la fila, y van las tres en `--info`: el tilde
                decía "ya está" en el verde de la frescura, que es color de
                precio y acá no hay ninguno, y la distancia competía con el
                nombre del bar desde el gris de los metadatos. */}
            {/* Embebida, un bar que ya existe no es un desvío a su ficha: es
                justamente el bar que estabas buscando. Tocarlo lo elige y el
                flujo sigue, que era lo que venías a hacer. */}
            {existing.map(b => (
              <button
                key={b.id}
                onClick={() => embedded
                  ? onAdded({ id: b.id, name: b.name })
                  : nav(`/bar/${b.id}`)}
                style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                minHeight: 44, padding: '12px 0', textAlign: 'left',
                borderBottom: '1px solid var(--hairline)',
              }}>
                <span style={{ color: 'var(--info)' }}>✓</span>
                <span style={{ flex: 1 }}>
                  <span className="lbl" style={{ display: 'block', fontSize: 'var(--t-4)' }}>{b.name}</span>
                  <span style={{ color: 'var(--info)', fontSize: 'var(--t-2)' }}>
                    {formatDistance(b.distanceMeters)}
                  </span>
                </span>
                <span className="lbl" style={{ color: 'var(--info)', fontSize: 'var(--t-3)' }}>
                  {embedded ? 'Elegir' : 'Ver'}
                </span>
              </button>
            ))}

            {suggestions.length > 0 && <SectionLabel>Encontrados en Google</SectionLabel>}
            {suggestions.map(s => (
              <button key={s.placeId} onClick={() => pick(s)} style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                minHeight: 44, padding: '12px 0', textAlign: 'left',
                borderBottom: '1px solid var(--hairline)',
              }}>
                <span style={{ color: 'var(--info)' }}>◈</span>
                <span style={{ flex: 1 }}>
                  <span className="lbl" style={{ display: 'block', fontSize: 'var(--t-4)' }}>{s.primary}</span>
                  <span style={{ color: 'var(--faint)', fontSize: 'var(--t-2)' }}>{s.secondary}</span>
                </span>
              </button>
            ))}

            {query.trim().length >= 2 && !searching && (
              <div style={{ marginTop: 16 }}>
                {!manual ? (
                  /* Acción secundaria, con el vestido de acción secundaria: el
                     camino principal es elegir el bar de la lista, y este es el
                     de al lado. Con `--elevated` sin borde se leía como una
                     tarjeta más de la pantalla. El aviso de que lo revisa un
                     moderador va en `--aging`, que es el tono de "a revisión"
                     en toda la app. */
                  <button onClick={() => setManual(true)} style={{
                    display: 'flex', gap: 12, width: '100%', padding: 'var(--s-4)',
                    minHeight: 52, borderRadius: 'var(--r-2)', textAlign: 'left',
                    background: 'var(--info-soft)', border: '1px solid var(--info-border)',
                  }}>
                    <span style={{ color: 'var(--info-bright)' }}>+</span>
                    <span>
                      <span className="lbl" style={{
                        display: 'block', color: 'var(--info-bright)',
                      }}>Agregar “{query}”</span>
                      <span style={{ color: 'var(--aging)', fontSize: 'var(--t-1)' }}>
                        Lo revisa un moderador antes de publicarse
                      </span>
                    </span>
                  </button>
                ) : (
                  <>
                    <div className="lbl" style={{ fontSize: 'var(--t-4)' }}>Agregar “{query}”</div>
                    <input
                      value={address}
                      // Editar el texto suelta el punto: si no, queda el punto
                      // de la dirección vieja abajo de una dirección nueva, que
                      // es exactamente el bug que esto viene a arreglar.
                      onChange={e => { setAddress(e.target.value); setSpot(null) }}
                      placeholder="Calle y altura, o esquina"
                      style={{
                        width: '100%', padding: '12px 16px', borderRadius: 'var(--r-2)', marginTop: 12,
                        background: 'var(--raised)', border: '1px solid var(--hairline)',
                      }}
                    />

                    {/* Las direcciones que matchean. Elegir una es lo que fija
                        el bar en el mapa: el punto sale de acá y no de dónde
                        estaba mirando el mapa. */}
                    {addrHits.map(h => (
                      <button key={h.placeId} onClick={() => pickAddress(h)} style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                        minHeight: 44, padding: '12px 0', textAlign: 'left',
                        borderBottom: '1px solid var(--hairline)',
                      }}>
                        <span style={{ color: 'var(--info)' }}>◎</span>
                        <span style={{ flex: 1 }}>
                          <span className="lbl" style={{
                            display: 'block', fontSize: 'var(--t-3)',
                          }}>{h.primary}</span>
                          <span style={{
                            color: 'var(--faint)', fontSize: 'var(--t-2)',
                          }}>{h.secondary}</span>
                        </span>
                      </button>
                    ))}

                    {spot ? (
                      /* En `--fresh`, que es el tono de lo que ya está
                         resuelto: dice que el bar tiene dónde caerse. */
                      <p style={{ color: 'var(--fresh)', fontSize: 'var(--t-2)', lineHeight: 1.5 }}>
                        ✓ Queda en {spot.address}
                      </p>
                    ) : (
                      <p style={{ color: 'var(--faint)', fontSize: 'var(--t-1)', lineHeight: 1.5 }}>
                        Elegí la dirección de la lista: de ahí sale el punto del bar
                        en el mapa, y es con lo que un moderador verifica que existe.
                      </p>
                    )}

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
            ? 'Elegí la dirección de la lista para ubicarlo en el mapa.'
            : 'Elegí el bar de la lista, o tocá “Agregar” para cargarlo a mano.'}
        </p>
      )}

      <button disabled={!canSend || sending} onClick={submit} className="lbl" style={{
        margin: `12px 18px calc(14px + var(--nav-gap))`, padding: 16,
        borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)', minHeight: 52,
        background: canSend ? 'var(--acento)' : 'var(--elevated)',
        color: canSend ? 'var(--base)' : 'var(--faint)',
      }}>{sending ? 'Enviando…' : 'Agregar este bar'}</button>
    </div>
  )
}

