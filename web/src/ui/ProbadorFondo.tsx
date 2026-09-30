import { useEffect, useState } from 'react'

/**
 * Probador de fondos, temporal y sólo con `?paleta` en la URL.
 *
 * Existe porque proponer un hex por escrito no sirve: ya se eligió un fondo dos
 * veces y las dos se sintió raro al verlo, que es la única prueba que vale. Esto
 * cambia `--base` y sus dos superficies en vivo, sobre la app de verdad y con
 * los datos de verdad, así que la decisión se toma mirando y no imaginando.
 *
 * **No se ve sin el parámetro en la URL**, así que no llega a nadie que abra la
 * app normalmente. Cuando el fondo esté elegido, este archivo se borra: es un
 * instrumento de medición, no una función del producto.
 *
 * Las tres superficies se mueven juntas. Elegir sólo `--base` y dejar `--raised`
 * y `--elevated` donde estaban rompe la escala de elevación —las tarjetas
 * quedarían más claras o más oscuras que su fondo por accidente— y lo que se
 * vería no sería el fondo candidato sino un error.
 */
const CANDIDATOS: { nombre: string; base: string; raised: string; elevated: string }[] = [
  // El que tenía la app antes de "heritage", y el que todavía decía el manifest.
  { nombre: 'Frío',      base: '#0F1012', raised: '#17181B', elevated: '#212328' },
  // Neutro sin tinte de ningún lado.
  { nombre: 'Neutro',    base: '#121212', raised: '#1C1C1C', elevated: '#282828' },
  // Neutro, un paso más claro: menos contraste con el texto, menos "pozo".
  { nombre: 'Gris',      base: '#1A1A1C', raised: '#242427', elevated: '#303034' },
  // Casi negro. El que más hace saltar el color del dato.
  { nombre: 'Negro',     base: '#0A0A0B', raised: '#141416', elevated: '#1E1E21' },
  // El actual: cálido.
  { nombre: 'Cálido',    base: '#17120F', raised: '#211A16', elevated: '#2E2520' },
  // El anterior: ciruela.
  { nombre: 'Ciruela',   base: '#1B0D17', raised: '#241321', elevated: '#33202D' },
]

const CLAVE = 'birrapp:probador-fondo'

export function ProbadorFondo() {
  const [visible] = useState(() => {
    try { return new URLSearchParams(location.search).has('paleta') }
    catch { return false }
  })
  const [elegido, setElegido] = useState(() => {
    try { return Number(localStorage.getItem(CLAVE) ?? '-1') } catch { return -1 }
  })

  useEffect(() => {
    if (!visible) return
    const raiz = document.documentElement
    if (elegido < 0) {
      // -1 es "como está en el código": se sacan los overrides en vez de
      // escribir el valor actual, para poder comparar contra el original de
      // verdad y no contra una copia que quedó vieja.
      for (const p of ['--base', '--raised', '--elevated']) raiz.style.removeProperty(p)
      return
    }
    const c = CANDIDATOS[elegido]
    raiz.style.setProperty('--base', c.base)
    raiz.style.setProperty('--raised', c.raised)
    raiz.style.setProperty('--elevated', c.elevated)
    try { localStorage.setItem(CLAVE, String(elegido)) } catch { /* modo privado */ }
  }, [elegido, visible])

  /*
   * El mapa no lee tokens de CSS: Google recibe un JSON con hex adentro, así
   * que hay que avisarle aparte. Sin esto, cambiar el fondo dejaba el mapa
   * ciruela y lo que se comparaba no era el fondo sino el chrome alrededor de
   * un mapa que no se movía — que es exactamente lo que hacía imposible
   * elegir.
   */
  useEffect(() => {
    if (visible) window.dispatchEvent(new Event('birrapp:paleta'))
  }, [elegido, visible])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', left: 8, right: 8, bottom: 'calc(var(--nav-h) + 8px)',
      zIndex: 90, display: 'flex', gap: 6, flexWrap: 'wrap',
      padding: 8, borderRadius: 'var(--r-2)',
      background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(8px)',
      border: '1px solid var(--film-3)',
    }}>
      <Chip label="Actual" on={elegido < 0} onClick={() => setElegido(-1)} />
      {CANDIDATOS.map((c, i) => (
        <Chip
          key={c.nombre} label={c.nombre} on={elegido === i}
          muestra={c.base} onClick={() => setElegido(i)}
        />
      ))}
    </div>
  )
}

function Chip({ label, on, muestra, onClick }: {
  label: string; on: boolean; muestra?: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} className="lbl" style={{
      display: 'flex', alignItems: 'center', gap: 6, minHeight: 34,
      padding: '0 10px', borderRadius: 999, fontSize: 'var(--t-2)', lineHeight: 1,
      background: on ? 'var(--cream)' : 'rgba(255,255,255,.08)',
      color: on ? '#000' : 'var(--cream)',
      border: '1px solid rgba(255,255,255,.18)',
    }}>
      {muestra && (
        <span aria-hidden style={{
          width: 12, height: 12, borderRadius: 3, background: muestra,
          border: '1px solid rgba(255,255,255,.28)',
        }} />
      )}
      {label}
    </button>
  )
}
