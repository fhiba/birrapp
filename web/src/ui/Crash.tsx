import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../i18n'

/**
 * La red de seguridad.
 *
 * Sin esto, cualquier error al dibujar deja la pantalla en blanco: React
 * desmonta el árbol entero y no queda ni un botón. Es la peor falla posible
 * —no dice qué pasó, no ofrece salida, y en una PWA instalada ni siquiera hay
 * barra de direcciones para recargar—.
 *
 * No intenta recuperarse sola: si el estado quedó roto, volver a dibujar lo
 * mismo falla otra vez. Ofrece recargar, que es lo único honesto que se puede
 * hacer desde acá.
 */
export class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Queda en la consola para poder diagnosticarlo con el teléfono conectado.
    console.error('birrapp se rompió:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 'var(--s-3)',
        padding: 'var(--s-6)', textAlign: 'center',
      }}>
        <h1 className="ttl" style={{ fontSize: 'var(--t-6)', margin: 0 }}>{t('Crash.titulo')}</h1>
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-4)', margin: 0, lineHeight: 1.55 }}>
          {t('Crash.texto')}
        </p>
        {/* El CTA primario de la pizarra: hueso lleno sobre espresso, --r-2
            y 52 de alto. Acá el botón es lo único que hay en la pantalla, así
            que va el tamaño grande y no el de contexto apretado. */}
        <button onClick={() => location.reload()} className="lbl" style={{
          marginTop: 'var(--s-2)', padding: '0 var(--s-5)', borderRadius: 'var(--r-2)',
          fontSize: 'var(--t-4)', minHeight: 52,
          background: 'var(--acento)', color: 'var(--base)',
        }}>{t('Crash.recargar')}</button>
      </div>
    )
  }
}
