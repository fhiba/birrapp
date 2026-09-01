import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = process.env.VITE_BASE_PATH ?? '/app/'
const VERSION = '0.3.16'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'birrapp',
        short_name: 'birrapp',
        description: 'El precio de la pinta, en el mapa.',
        lang: 'es-AR',
        // standalone = sin barra del navegador cuando se agrega a la pantalla
        // de inicio. Es lo que la hace parecer una app en iOS.
        display: 'standalone',
        background_color: '#1A1410',
        theme_color: '#1A1410',
        start_url: BASE,
        scope: BASE,
        id: BASE,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Sin esto el service worker nuevo queda "en espera" hasta que se
        // cierran todas las pestañas: el usuario ve la versión anterior
        // después de cada deploy, que fue exactamente lo que pasó dos veces.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // El shell se cachea; los datos NO. Servir precios viejos desde el
        // service worker sería exactamente lo que la app existe para evitar.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        navigateFallbackDenylist: [/^\/(auth|bars|styles|prices|moderation|descargar)/],
        runtimeCaching: [],
      },
    }),
  ],
  // Se sirve bajo /app para convivir con la API en el mismo dominio.
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  base: BASE,
  build: { outDir: 'dist', sourcemap: false },
  server: {
    proxy: {
      '/bars': 'http://localhost:8090',
      '/styles': 'http://localhost:8090',
      '/auth': 'http://localhost:8090',
      '/prices': 'http://localhost:8090',
      '/moderation': 'http://localhost:8090',
    },
  },
})
