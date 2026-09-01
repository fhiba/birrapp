import { useState } from 'react'

const KEY = 'birrapp.apkPromptDismissed'

/**
 * Ofrece el APK cuando se entra desde Android.
 *
 * En Android la app nativa anda mejor que la web —mapa más fluido, ubicación
 * en segundo plano, ícono propio— así que conviene ofrecerla. En iOS no se
 * muestra: ahí la PWA *es* la única opción y ofrecer un APK sería ruido.
 *
 * Se puede descartar, y la decisión se recuerda: insistir con un cartel que
 * el usuario ya cerró es la forma más rápida de que deje de usar la app.
 */
export function AndroidPrompt() {
  const isAndroid = /Android/i.test(navigator.userAgent)
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })

  if (!isAndroid || hidden) return null

  const dismiss = () => {
    setHidden(true)
    try { localStorage.setItem(KEY, '1') } catch { /* modo privado */ }
  }

  return (
    <div className="glass" style={{
      position: 'fixed', left: 12, right: 12,
      bottom: `calc(84px + var(--safe-bottom))`, zIndex: 45,
      borderRadius: 16, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--fresh)" aria-hidden>
        <path d="M6 18a1 1 0 0 0 1 1h1v3.5a1.5 1.5 0 0 0 3 0V19h2v3.5a1.5 1.5 0 0 0 3 0V19h1a1 1 0 0 0 1-1V8H6v10ZM3.5 8A1.5 1.5 0 0 0 2 9.5v6a1.5 1.5 0 0 0 3 0v-6A1.5 1.5 0 0 0 3.5 8Zm17 0A1.5 1.5 0 0 0 19 9.5v6a1.5 1.5 0 0 0 3 0v-6A1.5 1.5 0 0 0 20.5 8ZM15.5 3.6l1-1.8a.3.3 0 0 0-.5-.3l-1 1.9a6.9 6.9 0 0 0-6 0l-1-1.9a.3.3 0 0 0-.5.3l1 1.8A6 6 0 0 0 6 7h12a6 6 0 0 0-2.5-3.4ZM9.5 5.2a.6.6 0 1 1 0-1.2.6.6 0 0 1 0 1.2Zm5 0a.6.6 0 1 1 0-1.2.6.6 0 0 1 0 1.2Z"/>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lbl" style={{ fontSize: 13.5 }}>Estás en Android</div>
        <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>
          La app anda más fluida que la web
        </div>
      </div>
      <a href="/descargar" className="lbl pill" style={{
        background: 'var(--amber)', color: 'var(--base)', textDecoration: 'none',
        padding: '9px 15px', fontSize: 13, whiteSpace: 'nowrap',
      }}>Descargar</a>
      <button onClick={dismiss} aria-label="Cerrar" style={{
        color: 'var(--faint)', fontSize: 17, padding: '0 2px',
      }}>✕</button>
    </div>
  )
}
