import { useCallback, useEffect, useState } from 'react'
import {
  BrowserRouter, Navigate, Route, Routes, useNavigate,
  useLocation as useRoute,
} from 'react-router-dom'
import { APIProvider } from '@vis.gl/react-google-maps'
import { Analytics } from '@vercel/analytics/react'
import * as api from './data/api'
import type { User } from './data/types'
import { BA_CENTER, useBars, useLocation, type Sort } from './data/useBars'
import { Crash } from './ui/Crash'
import { OfflineBanner } from './ui/Offline'
import { BottomNav, Toast } from './ui/Chrome'
import { PintLoader } from './ui/PintLoader'
import { Tour, TOUR_ANON, type TourView } from './ui/Tour'
import { MapScreen } from './screens/MapScreen'
import { ListScreen } from './screens/ListScreen'
import { BarDetailScreen } from './screens/BarDetail'
import { AddBarScreen } from './screens/AddBar'
import { ProfileScreen } from './screens/Profile'
import { InfoScreen } from './screens/Info'
import { ContributorsScreen } from './screens/Contributors'
import { ModerationScreen } from './screens/Moderation'
import { DashboardScreen } from './screens/Dashboard'
import { MyContributionsScreen } from './screens/MyContributions'
import { MyBeersScreen } from './screens/MyBeers'
import { SettingsScreen } from './screens/Settings'
import { PreferencesScreen } from './screens/Preferences'
import { PersonScreen } from './screens/Person'
import { useFavorites } from './data/useFavorites'

const MAPS_KEY = import.meta.env.VITE_MAPS_API_KEY ?? ''

export default function App() {
  // El beacon de visita: una sola vez por carga de la app. Va acá, en el
  // componente raíz, y no en `Shell` ni en una pantalla, porque esto no se
  // desmonta al navegar entre pestañas — que es justo lo que se quiere contar,
  // una visita por carga y no una por cambio de ruta.
  useEffect(() => { api.pingTraffic() }, [])

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <APIProvider apiKey={MAPS_KEY} libraries={['places']}>
        {/* Adentro del router: desde la pantalla de error se puede recargar, y
            si el error fue de una ruta puntual el resto de la app sigue. */}
        <Crash>
          <Shell />
        </Crash>
        {/*
          Analytics de Vercel. Va adentro del router para que registre cada
          cambio de ruta y no sólo la primera carga: el 90% de la navegación
          acá es client-side y sin esto se vería una sola vista por sesión.

          Se sirve desde `/_vercel/insights` en el mismo origen, así que no
          agrega un dominio de terceros ni depende de que el service worker lo
          cachee bien. Fuera de Vercel —el backend sirviendo la PWA— el script
          no existe y el componente no hace nada.
        */}
        <Analytics />
      </APIProvider>
    </BrowserRouter>
  )
}

function Shell() {
  const route = useRoute()
  const nav = useNavigate()
  const [user, setUser] = useState<User | null>(api.currentUser())
  const [toast, setToast] = useState<string | null>(null)
  // Se incrementa al tocar el "?". Un booleano no sirve: pedir el tutorial dos
  // veces seguidas no cambiaría el estado y el segundo pedido se perdería.
  const [tourToken, setTourToken] = useState(0)

  const { coords, denied, permission, request } = useLocation()
  const {
    bars, styles, brands, addBrand, addStyle, loading, error, load, invalidate, MIN_QUERY_ZOOM,
  } = useBars()
  const favorites = useFavorites(user)

  /**
   * El orden de la lista se recuerda entre sesiones.
   *
   * Va en localStorage y no en la cuenta: es una preferencia de cómo mirás, no
   * un dato tuyo, y quien usa la app sin cuenta también la tiene. Volver y
   * encontrar la lista ordenada distinto de como la dejaste es de las cosas
   * que más desorientan, sobre todo cuando el orden cambia qué bar aparece
   * primero.
   */
  const [sort, setSort] = useState<Sort>(() => {
    try {
      const v = localStorage.getItem('birrapp.sort')
      return v === 'cheapest' || v === 'rated' ? v : 'distance'
    } catch { return 'distance' }
  })
  useEffect(() => {
    try { localStorage.setItem('birrapp.sort', sort) } catch { /* modo privado */ }
  }, [sort])
  // El radio con el que abre la app sale de la configuración. `useState` sólo
  // lee el valor inicial, así que hay un efecto abajo para cuando la sesión
  // llega después del primer render — que es lo normal al abrir.
  const [radius, setRadius] = useState(user?.defaultRadiusM ?? 2000)
  // Varios estilos a la vez, y un piso de estrellas. Los dos viven acá y no
  // en cada pantalla: el mapa y la lista muestran lo mismo filtrado igual, y
  // que se desincronicen al cambiar de pestaña sería el bug obvio.
  const [styleFilter, setStyleFilter] = useState<string[]>([])
  const [minRating, setMinRating] = useState<number | undefined>()
  const [simulated, setSimulated] = useState<google.maps.LatLngLiteral | null>(null)
  // La cámara vive acá y no en la pantalla del mapa: al ir a otra pestaña el
  // componente se desmonta, y sin esto al volver arrancaba mostrando medio
  // continente antes de saltar a destino.
  const [camera, setCamera] = useState<{ center: google.maps.LatLngLiteral; zoom: number } | null>(null)
  const [tooFar, setTooFar] = useState(false)
  // Token que se incrementa en cada pedido de centrar. Un booleano no sirve:
  // dos toques seguidos en el mismo lugar no cambiarían el estado y el
  // segundo se perdería.
  const [panTo, setPanTo] = useState<{ target: google.maps.LatLngLiteral; token: number } | null>(null)

  useEffect(() => api.onSessionChange(setUser), [])

  // Al entrar (o al volver la sesión), el radio pasa a ser el configurado.
  // Sólo al cambiar de usuario: si corriera con cada cambio de `user`, mover
  // el slider y que se refresque la sesión te devolvería el radio de la
  // configuración en la cara.
  useEffect(() => {
    if (user) setRadius(user.defaultRadiusM)
  }, [user?.id])

  // Revalidar contra el backend: el rol pudo cambiar desde la última vez.
  //
  // Sólo se cierra la sesión si el servidor RECHAZA la credencial. Antes
  // cualquier error la borraba, así que un corte de red o un reinicio del
  // backend deslogueaba al usuario aunque su sesión siguiera siendo válida.
  useEffect(() => {
    if (!api.currentUser()) return
    api.me()
      .then(setUser)
      .catch((e: unknown) => {
        if (e instanceof api.ApiError && (e.status === 401 || e.status === 403)) {
          api.clearSession()
        }
        // Cualquier otro error: se conserva la sesión y se sigue con los
        // datos que ya había en local.
      })
  }, [])

  // Vuelta del login por navegador: el código de un solo uso llega por la URL.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const handoff = params.get('handoff')
    if (params.get('error')) {
      setToast('No pudimos completar el inicio de sesión.')
      history.replaceState({}, '', location.pathname)
      return
    }
    if (!handoff) return
    // Se limpia la URL primero: el código es de un solo uso y no debe quedar
    // en el historial ni volver a dispararse al recargar.
    history.replaceState({}, '', location.pathname)
    api.redeemHandoff(handoff)
      .then(s => {
        api.saveSession(s)
        setToast(`¡Hola, ${s.user.displayName}!`)
        /*
         * Recién llegado y sin birras elegidas: se ofrece elegirlas una vez.
         *
         * Se pregunta acá y no en el mapa porque es el único momento en que la
         * persona ya decidió quedarse —acaba de crear la cuenta— y todavía no
         * vino a hacer otra cosa. Interrumpirla más tarde sería cortarle algo.
         *
         * `vioBienvenida` es lo que hace que sea UNA vez y no en cada login.
         * Sin esa marca, quien decide no elegir ninguna se come la pantalla
         * cada vez que entra, que es la forma más rápida de que una pantalla
         * opcional se vuelva molesta.
         *
         * Al mapa en los demás casos, no a donde se había tocado "Entrar": el
         * tutorial empieza ahí y arranca explicando de qué va la app.
         */
        if (s.user.favoriteStyles.length === 0 && !vioBienvenida(s.user.id)) {
          marcarBienvenida(s.user.id)
          nav('/bienvenida', { replace: true })
        } else {
          nav('/', { replace: true })
        }
      })
      .catch(() => setToast('El inicio de sesión expiró. Probá de nuevo.'))
  }, [nav])

  // Vive acá y no en MapScreen porque la pantalla se desmonta al cambiar de
  // pestaña: guardado adentro, el modo se perdía cada vez que se iba a la
  // lista y se volvía.

  // El centro entra como último recurso SÓLO si ya sabemos que no vamos a
  // tener ubicación. Es de dónde consultar bares, no dónde está la persona:
  // sin esto, quien niega el permiso y abre la lista antes que el mapa no ve
  // ningún bar, porque nunca hubo cámara de la que sacar un punto.
  const queryPoint = simulated ?? camera?.center ?? coords ?? (denied ? BA_CENTER : null)

  const refresh = useCallback((force = false) => {
    if (!queryPoint) return
    load(queryPoint, radius, sort, { style: styleFilter, minRating, force, zoom: camera?.zoom })
  }, [queryPoint, radius, sort, styleFilter, minRating, camera?.zoom, load])

  useEffect(() => { refresh() }, [refresh])

  const onCamera = useCallback((center: google.maps.LatLngLiteral, zoom: number) => {
    setCamera({ center, zoom })
    setTooFar(zoom < MIN_QUERY_ZOOM)
  }, [MIN_QUERY_ZOOM])

  const afterChange = useCallback(() => { invalidate(); refresh(true) }, [invalidate, refresh])

  const showNav = ['/', '/lista', '/perfil'].includes(route.pathname)

  // El tutorial es por pantalla, así que la ruta decide qué se enseña. Las
  // pantallas que no están acá —agregar bar, moderación, info— no tienen
  // tutorial: o son de un solo uso o ya se explican solas.
  const tourView: TourView | null =
    route.pathname === '/' ? 'map'
      : route.pathname === '/lista' ? 'list'
      : route.pathname === '/perfil' ? 'profile'
      : route.pathname.startsWith('/bar/') ? 'bar'
      : null

  // `denied` corta la espera: sin él, negar el permiso dejaba a la app
  // colgada para siempre en "Buscando dónde estás…", porque `coords` ya no se
  // rellena con un valor inventado.
  if (!coords && !camera && !denied) return <PintLoader message="Buscando dónde estás…" />

  return (
    <>
      <Routes>
        <Route path="/" element={
          <MapScreen
            bars={bars} styles={styles} loading={loading}
            user={user} brands={brands} favorites={favorites.ids}
            onToggleFavorite={id => user ? favorites.toggle(id) : nav('/perfil')}
            onBrandCreated={addBrand} onStyleCreated={addStyle}
            onChanged={afterChange}
            center={coords ?? BA_CENTER} simulated={simulated}
            radius={radius} styleFilter={styleFilter}
            minRating={minRating} onMinRating={setMinRating}
            tooZoomedOut={tooFar} camera={camera}
            onStyle={setStyleFilter} onRadius={setRadius}
            onSimulate={setSimulated} onCamera={onCamera}
            myLocation={coords} panTo={panTo}
            locationUnknown={denied && !coords}
            locationBlocked={permission === 'denied'}
            onHelp={() => setTourToken(t => t + 1)}
            onRecenter={() => {
              // Con un punto secundario puesto, el botón vuelve a ese punto y
              // no al GPS. Ese punto es el que manda la consulta —el radio, la
              // lista y los precios salen de ahí—, así que "centrar" tiene que
              // devolverte a lo que estás mirando. Antes lo borraba y se iba a
              // tu ubicación: perdías el punto por querer volver a él.
              //
              // Para volver a tu ubicación se borra el punto con un toque en
              // el mapa, que es el mismo gesto con el que se puso.
              const target = simulated ?? coords
              if (!simulated) request()
              if (target) setPanTo(t => ({ target, token: (t?.token ?? 0) + 1 }))
            }}
          />
        } />
        <Route path="/lista" element={
          <ListScreen
            bars={bars} loading={loading} sort={sort} radius={radius}
            center={queryPoint ?? null}
            styles={styles} styleFilter={styleFilter} onStyle={setStyleFilter}
            minRating={minRating} onMinRating={setMinRating}
            simulated={simulated} favorites={favorites.ids}
            onSort={setSort} onRadius={setRadius} onClearSimulated={() => setSimulated(null)}
          />
        } />
        <Route path="/bar/:id" element={
          <BarDetailScreen user={user} center={queryPoint ?? null}
            styles={styles} brands={brands}
            onBrandCreated={addBrand} onStyleCreated={addStyle}
            onChanged={afterChange}
            favorites={favorites} />
        } />
        <Route path="/agregar" element={
          <AddBarScreen user={user} center={queryPoint ?? null} onAdded={afterChange} />
        } />
        <Route path="/perfil" element={
          <ProfileScreen user={user} onSession={() => setUser(api.currentUser())} />
        } />
        {/* El perfil de otra persona: se llega tocando su nombre en un
            comentario o en una foto (BIR-6). */}
        <Route path="/usuario/:id" element={<PersonScreen user={user} />} />
        <Route path="/config" element={
          <SettingsScreen user={user} onSession={() => setUser(api.currentUser())} />
        } />
        <Route path="/colaboradores" element={<ContributorsScreen user={user} />} />
        <Route path="/preferencias" element={
          <PreferencesScreen
            user={user} styles={styles} brands={brands}
            onSession={() => setUser(api.currentUser())}
          />
        } />
        {/* La misma pantalla, pero llegando recién de iniciar sesión: sin
            botón de volver —no hay a dónde— y con salida al mapa. */}
        <Route path="/bienvenida" element={
          <PreferencesScreen
            user={user} styles={styles} brands={brands}
            onSession={() => setUser(api.currentUser())}
            primeraVez
          />
        } />
        <Route path="/info" element={<InfoScreen />} />
        <Route path="/mis-birras" element={<MyBeersScreen />} />
        {/* Una pantalla por tipo de aporte. Sin `:tipo` se cae en precios,
            que es el aporte que todo el mundo tiene. */}
        <Route path="/mis-aportes" element={<Navigate to="/mis-aportes/precios" replace />} />
        <Route path="/mis-aportes/:tipo" element={
          <MyContributionsScreen onChanged={afterChange} />
        } />
        <Route path="/moderacion" element={<ModerationScreen onChanged={afterChange} />} />
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Arranca solo **sólo con sesión**: el tutorial habla de aportar
          —confirmar precios, puntuar, subir fotos— y nada de eso se puede
          hacer sin cuenta. Empujárselo a quien sólo vino a mirar precios sería
          enseñarle botones que le van a pedir que se loguee.
          Pero **se puede pedir** desde el "?" del mapa con o sin sesión: quien
          quiere entender la app antes de crear una cuenta es exactamente a
          quien más le sirve que se la expliquen. Sin sesión el avance se
          guarda con `TOUR_ANON`. */}
      {tourView && (
        <Tour
          view={tourView}
          userId={user?.id ?? TOUR_ANON}
          autoStart={user != null}
          openToken={tourToken}
        />
      )}

      <OfflineBanner />

      {showNav && <BottomNav />}
      {error && bars.length === 0 && (
        <Toast text={error} onDone={() => {}} />
      )}
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </>
  )
}

/**
 * Si a esta cuenta ya se le ofreció elegir sus birras.
 *
 * Por cuenta y no global: en un teléfono compartido, que una persona haya
 * dicho "ahora no" no puede dejar a la siguiente sin la oferta.
 *
 * En `localStorage` y no en la base porque es una preferencia de esta
 * instalación sobre una pantalla, no un dato de la persona. Si se limpia el
 * sitio y vuelve a aparecer una vez, no pasa nada.
 */
const BIENVENIDA = 'birrapp:bienvenida:'

function vioBienvenida(userId: number): boolean {
  try { return localStorage.getItem(BIENVENIDA + userId) != null }
  catch { return false }
}

function marcarBienvenida(userId: number) {
  try { localStorage.setItem(BIENVENIDA + userId, '1') }
  catch { /* modo privado: se vuelve a ofrecer, y no es grave */ }
}
