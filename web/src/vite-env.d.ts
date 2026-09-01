/// <reference types="vite/client" />
declare const __APP_VERSION__: string
interface ImportMetaEnv {
  readonly VITE_MAPS_API_KEY: string
  /** Vacío = mismo origen. Con el front en otro dominio, la URL del backend. */
  readonly VITE_API_BASE?: string
  /** '/app/' servido desde el backend, '/' en Vercel. */
  readonly VITE_BASE_PATH?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
