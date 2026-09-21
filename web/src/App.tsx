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
import * as fb from './data/feedback'
import { BottomNav, Toast } from './ui/Chrome'
import { PintLoader } from './ui/PintLoader'
import { Tour, TOUR_ANON, type TourView } from './ui/Tour'
import { MapScreen } from './screens/MapScreen'
import { ListScreen } from './screens/ListScreen'
import { NearbyScreen } from './screens/Nearby'
import { BarDetailScreen } from './screens/BarDetail'
import { AddBarScreen } from './screens/AddBar'
import { ProfileScreen } from './screens/Profile'
import { InfoScreen } from './screens/Info'
import { PrivacyScreen } from './screens/Privacy'
import { ContributorsScreen } from './screens/Contributors'
import { ModerationScreen } from './screens/Moderation'
import { DashboardScreen } from './screens/Dashboard'
import { MyContributionsScreen } from './screens/MyContributions'
import { MyBeersScreen } from './screens/MyBeers'
import { SettingsScreen } from './screens/Settings'
import { PreferencesScreen } from './screens/Preferences'
import { OnboardingScreen } from './screens/Onboarding'
import { areaKey } from './screens/Nearby'
import { prefetchCached } from './data/cached'
import { PersonScreen } from './screens/Person'
import { useFavorites } from './data/useFavorites'
import { ReportFlow, type FlowBar } from './screens/ReportFlow'
import { LogBeerSheet } from './screens/LogBeer'
import type { AddAction } from './ui/AddMenu'

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

  /**
   * Lo que se está cargando desde el "+" de la barra de pestañas.
   *
   * Vive acá y no en el mapa desde que el "+" se mudó al centro de la barra:
   * la barra se ve en las cuatro pestañas, así que el flujo tiene que poder
   * abrirse desde cualquiera de ellas y sobrevivir a que se cambie de pestaña
   * por debajo. `bar` es el que ya está elegido cuando se entra desde la vista
   * previa de un bar sin precio — una pregunta menos.
   */
  const [add, setAdd] = useState<{ action: AddAction; bar?: FlowBar } | null>(null)

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
         * Cuenta recién creada: la bienvenida.
         *
         * Se pregunta acá y no en el mapa porque es el único momento en que la
         * persona ya decidió quedarse —acaba de crear la cuenta— y todavía no
         * vino a hacer otra cosa. Interrumpirla más tarde sería cortarle algo.
         *
         * La marca de "ya la hizo" la lleva la cuenta (`onboarded`, V22) y no
         * este navegador. Antes era `localStorage`, y alcanzaba mientras la
         * pantalla sólo ofrecía birras favoritas: volver a ofrecerlas en otra
         * computadora no rompe nada. Ahora también decide el nombre público y
         * la foto, así que entrar desde otro teléfono no puede volver a
         * pedirte lo que ya elegiste.
         *
         * Al mapa en los demás casos, no a donde se había tocado "Entrar": el
         * tutorial empieza ahí y arranca explicando de qué va la app.
         */
        nav(s.user.onboarded ? '/' : '/bienvenida', { replace: true })
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

  /**
   * Se adelanta el promedio de la zona mientras mirás el mapa.
   *
   * Los bares ya son compartidos: el mapa, la lista y "Cerca" leen el mismo
   * `bars` de acá, así que cambiar de pestaña no los vuelve a pedir. El que
   * faltaba era el promedio de la zona, que sólo se pedía al abrir "Cerca" —y
   * como la clave depende de dónde está la cámara, moverse por el mapa y
   * después entrar daba siempre pantalla vacía y un viaje de espera.
   *
   * Corre 700 ms después de que el mapa se queda quieto. Antes de eso, un
   * paneo largo dispararía una consulta por cada cuadro intermedio, que son
   * zonas por las que la persona pasó sin mirar.
   *
   * No corre si ya estás en "Cerca": ahí la pantalla pide lo suyo y las dos
   * consultas competirían por la misma clave.
   */
  useEffect(() => {
    if (!queryPoint || route.pathname === '/cerca') return
    const t = setTimeout(() => {
      const { lat, lng } = queryPoint
      void prefetchCached(
        areaKey(lat, lng, radius, styleFilter),
        () => api.areaStats(lat, lng, radius, styleFilter),
      )
    }, 700)
    return () => clearTimeout(t)
  }, [queryPoint, radius, styleFilter, route.pathname])

  const onCamera = useCallback((center: google.maps.LatLngLiteral, zoom: number) => {
    setCamera({ center, zoom })
    setTooFar(zoom < MIN_QUERY_ZOOM)
  }, [MIN_QUERY_ZOOM])

  const afterChange = useCallback(() => { invalidate(); refresh(true) }, [invalidate, refresh])

  /**
   * Abrir la carga, venga del "+" o de la vista previa de un bar.
   *
   * Agregar un bar se puede sin cuenta hasta el formulario, que ya avisa. Las
   * otras dos escriben en nombre de la persona, así que sin sesión no hay nada
   * que hacer más que ofrecerle entrar. Y el alta de bar es una pantalla
   * propia con su URL, no una hoja: se navega.
   */
  const startAdd = useCallback((action: AddAction, bar?: FlowBar) => {
    if (action !== 'bar' && !api.currentUser()) { nav('/perfil'); return }
    if (action === 'bar') { nav('/agregar'); return }
    setAdd({ action, bar })
  }, [nav])

  const showNav = ['/', '/cerca', '/lista', '/perfil'].includes(route.pathname)

  // El tutorial es por pantalla, así que la ruta decide qué se enseña. Las
  // pantallas que no están acá —agregar bar, moderación, info— no tienen
  // tutorial: o son de un solo uso o ya se explican solas.
  const tourView: TourView | null =
    route.pathname === '/' ? 'map'
      // "Cerca" no tiene tutorial: es una pantalla de lectura, sin controles
      // que descubrir más allá del radio, que se explica solo.
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
            favorites={favorites.ids}
            onToggleFavorite={id => user ? favorites.toggle(id) : nav('/perfil')}
            onAddPrice={bar => startAdd('price', bar)}
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
        <Route path="/cerca" element={
          <NearbyScreen
            bars={bars} loading={loading}
            center={queryPoint ?? null} radius={radius} onRadius={setRadius}
            styleFilter={styleFilter} styles={styles}
            simulated={simulated}
          />
        } />
        <Route path="/lista" element={
          <ListScreen
            bars={bars} loading={loading} sort={sort} radius={radius}
            center={queryPoint ?? null}
            styles={styles} styleFilter={styleFilter} onStyle={setStyleFilter}
            minRating={minRating} onMinRating={setMinRating}
            simulated={simulated} favorites={favorites.ids}
            onToggleFavorite={id => user ? favorites.toggle(id) : nav('/perfil')}
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
          <OnboardingScreen
            user={user} styles={styles} brands={brands}
            onSession={() => setUser(api.currentUser())}
          />
        } />
        <Route path="/info" element={<InfoScreen />} />
        {/* La política de privacidad tiene que ser alcanzable por URL sin
            cuenta y sin pasar por ningún menú: es lo que piden Play y App
            Store, y es la dirección que se pega en la ficha de la tienda. */}
        <Route path="/privacidad" element={<PrivacyScreen />} />
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

      {showNav && <BottomNav onAdd={startAdd} />}

      {add?.action === 'beer' && (
        <LogBeerSheet
          nearby={bars} styles={styles} brands={brands}
          onBrandCreated={addBrand} onStyleCreated={addStyle}
          onClose={() => setAdd(null)}
          onDone={m => { setAdd(null); setToast(m) }}
        />
      )}

      {/* Se pregunta todo: estilo, marca y bar, y recién ahí el monto —salvo
          lo que ya se sepa, como el bar cuando se entra desde su vista previa.
          Antes esto elegía el bar y te dejaba en su ficha con el teclado
          abierto; el resto de la birra lo tenías que resolver ahí arriba,
          encima del teclado. */}
      {add?.action === 'price' && (
        <ReportFlow
          styles={styles} brands={brands} user={user}
          nearby={bars} center={coords ?? camera?.center ?? null}
          bar={add.bar}
          onStyleCreated={addStyle}
          onBrandCreated={addBrand}
          onCancel={() => setAdd(null)}
          onSubmit={async ({ bar, styleSlug, brandSlug, price, sizeMl }) => {
            setAdd(null)
            try {
              const r = await api.reportPrice({
                barId: bar.id, styleSlug, brandSlug, price, sizeMl,
              })
              fb.exito()
              setToast(r.message)
              // El pin tiene que reflejarlo al toque: es el agujero de BIR-23,
              // que se arregló en la ficha del bar y volvería a aparecer acá.
              afterChange()
            } catch (e) { fb.error(); setToast((e as Error).message) }
          }}
        />
      )}
      {error && bars.length === 0 && (
        <Toast text={error} onDone={() => {}} />
      )}
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </>
  )
}
