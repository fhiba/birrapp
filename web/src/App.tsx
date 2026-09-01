import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation as useRoute } from 'react-router-dom'
import { APIProvider } from '@vis.gl/react-google-maps'
import { Analytics } from '@vercel/analytics/react'
import * as api from './data/api'
import type { User } from './data/types'
import { BA_CENTER, useBars, useLocation, type Sort } from './data/useBars'
import { AndroidPrompt } from './ui/AndroidPrompt'
import { BottomNav, Toast } from './ui/Chrome'
import { PintLoader } from './ui/PintLoader'
import { MapScreen } from './screens/MapScreen'
import { ListScreen } from './screens/ListScreen'
import { BarDetailScreen } from './screens/BarDetail'
import { AddBarScreen } from './screens/AddBar'
import { ProfileScreen } from './screens/Profile'
import { InfoScreen } from './screens/Info'
import { ModerationScreen } from './screens/Moderation'
import { MyContributionsScreen } from './screens/MyContributions'

const MAPS_KEY = import.meta.env.VITE_MAPS_API_KEY ?? ''

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <APIProvider apiKey={MAPS_KEY} libraries={['places']}>
        <Shell />
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
  const [user, setUser] = useState<User | null>(api.currentUser())
  const [toast, setToast] = useState<string | null>(null)

  const { coords, request } = useLocation()
  const { bars, styles, loading, error, load, invalidate, MIN_QUERY_ZOOM } = useBars()

  const [sort, setSort] = useState<Sort>('distance')
  const [radius, setRadius] = useState(2000)
  const [styleFilter, setStyleFilter] = useState<string | undefined>()
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

  // Revalidar contra el backend: el rol pudo cambiar desde la última vez.
  useEffect(() => {
    if (api.currentUser()) api.me().then(setUser).catch(() => api.clearSession())
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
      .then(s => { api.saveSession(s); setToast(`¡Hola, ${s.user.displayName}!`) })
      .catch(() => setToast('El inicio de sesión expiró. Probá de nuevo.'))
  }, [])

  const queryPoint = simulated ?? camera?.center ?? coords

  const refresh = useCallback((force = false) => {
    if (!queryPoint) return
    load(queryPoint, radius, sort, { style: styleFilter, force, zoom: camera?.zoom })
  }, [queryPoint, radius, sort, styleFilter, camera?.zoom, load])

  useEffect(() => { refresh() }, [refresh])

  const onCamera = useCallback((center: google.maps.LatLngLiteral, zoom: number) => {
    setCamera({ center, zoom })
    setTooFar(zoom < MIN_QUERY_ZOOM)
  }, [MIN_QUERY_ZOOM])

  const afterChange = useCallback(() => { invalidate(); refresh(true) }, [invalidate, refresh])

  const showNav = ['/', '/lista', '/perfil'].includes(route.pathname)

  if (!coords && !camera) return <PintLoader message="Buscando dónde estás…" />

  return (
    <>
      <Routes>
        <Route path="/" element={
          <MapScreen
            bars={bars} styles={styles} loading={loading}
            center={coords ?? BA_CENTER} simulated={simulated}
            radius={radius} styleFilter={styleFilter}
            tooZoomedOut={tooFar} camera={camera}
            onStyle={setStyleFilter} onRadius={setRadius}
            onSimulate={setSimulated} onCamera={onCamera}
            myLocation={coords} panTo={panTo}
            onRecenter={() => {
              request()
              if (coords) {
                setSimulated(null)
                setPanTo(t => ({ target: coords, token: (t?.token ?? 0) + 1 }))
              }
            }}
          />
        } />
        <Route path="/lista" element={
          <ListScreen
            bars={bars} loading={loading} sort={sort} radius={radius}
            simulated={simulated} styleFilter={styleFilter}
            onSort={setSort} onRadius={setRadius} onClearSimulated={() => setSimulated(null)}
          />
        } />
        <Route path="/bar/:id" element={
          <BarDetailScreen user={user} center={queryPoint ?? null}
            styles={styles} onChanged={afterChange} />
        } />
        <Route path="/agregar" element={
          <AddBarScreen user={user} center={queryPoint ?? null} onAdded={afterChange} />
        } />
        <Route path="/perfil" element={
          <ProfileScreen user={user} onSession={() => setUser(api.currentUser())} />
        } />
        <Route path="/info" element={<InfoScreen />} />
        <Route path="/mis-aportes" element={<MyContributionsScreen />} />
        <Route path="/moderacion" element={<ModerationScreen onChanged={afterChange} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showNav && <AndroidPrompt />}
      {showNav && <BottomNav />}
      {error && bars.length === 0 && (
        <Toast text={error} onDone={() => {}} />
      )}
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </>
  )
}
