import { Component, type ErrorInfo, type ReactNode } from 'react'

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
        alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: 32, textAlign: 'center',
      }}>
        <h1 className="ttl" style={{ fontSize: 'var(--t-6)', margin: 0 }}>Se nos rompió algo</h1>
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-4)', margin: 0, lineHeight: 1.55 }}>
          No es tu conexión ni algo que hayas hecho mal. Recargá y seguí;
          si vuelve a pasar, contanos qué estabas haciendo.
        </p>
        <button onClick={() => location.reload()} className="lbl" style={{
          marginTop: 8, padding: '12px 24px', borderRadius: 'var(--r-3)', fontSize: 'var(--t-4)',
          minHeight: 44, background: 'var(--acento)', color: 'var(--base)',
        }}>Recargar</button>
      </div>
    )
  }
}
