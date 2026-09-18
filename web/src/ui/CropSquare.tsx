import { useEffect, useRef, useState } from 'react'
import * as fb from '../data/feedback'
import { cropToSquare } from '../data/image'
import { Sheet } from './Chrome'

/** El lado del recuadro en pantalla. Sólo afecta al encuadre, no al archivo. */
const VISTA = 272
/** Cuánto se puede acercar. Más de 3× sobre una foto de teléfono ya es borroso. */
const ZOOM_MAX = 3

/**
 * Encuadrar la foto de perfil antes de subirla.
 *
 * **Por qué existe.** El avatar se muestra en un cuadrado y las fotos de
 * teléfono son verticales. Sin encuadre, `object-fit: cover` recorta por el
 * centro geométrico, que en una foto vertical cae en el pecho: subías una foto
 * tuya y salía tu remera. La decisión de qué parte de la foto sos vos no la
 * puede tomar un `object-fit`.
 *
 * Y de paso arregla el archivo: lo que se sube ya es un cuadrado de 512, así
 * que ninguna vista tiene que defenderse de una imagen de proporción rara.
 *
 * **Se arrastra para mover y hay una barra para acercar.** La barra en vez de
 * pellizcar con dos dedos porque el pellizco no existe con mouse ni con
 * teclado, y esta pantalla también se abre desde una computadora. Arrastrar sí
 * funciona igual en los dos lados, así que ese se queda como está.
 *
 * **La foto nunca puede dejar un hueco.** El zoom mínimo es el que hace que la
 * foto tape el cuadrado entero, y el desplazamiento se recorta contra los
 * bordes. Sin eso se puede encuadrar el vacío, y el resultado es un avatar con
 * una franja transparente que después nadie entiende de dónde salió.
 */
export function CropSquare({ file, onCancel, onDone }: {
  file: File
  onCancel: () => void
  onDone: (blob: Blob) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  /** Medidas naturales de la foto; hasta que carga no se puede encuadrar nada. */
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Dónde estaba el dedo y el encuadre al empezar a arrastrar. */
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  // El object URL se revoca al cerrar: si no, el archivo queda retenido en
  // memoria hasta que se recargue la página, y acá hablamos de varios MB.
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  /** Escala mínima para que la foto tape el cuadrado. */
  const base = nat ? Math.max(VISTA / nat.w, VISTA / nat.h) : 1
  const dw = nat ? nat.w * base * zoom : 0
  const dh = nat ? nat.h * base * zoom : 0

  /** El desplazamiento no puede despegar la foto de ningún borde. */
  const limitar = (x: number, y: number) => ({
    x: Math.min(0, Math.max(VISTA - dw, x)),
    y: Math.min(0, Math.max(VISTA - dh, y)),
  })

  // Al cambiar el zoom hay que reencuadrar: si estabas contra el borde derecho
  // y alejás, el límite se corre y el desplazamiento viejo deja un hueco.
  useEffect(() => { setOff(o => limitar(o.x, o.y)) }, [zoom, nat])

  // Centrado al cargar, que es el encuadre que casi siempre sirve.
  const cargar = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const w = img.naturalWidth, h = img.naturalHeight
    setNat({ w, h })
    const b = Math.max(VISTA / w, VISTA / h)
    setOff({ x: (VISTA - w * b) / 2, y: (VISTA - h * b) / 2 })
  }

  const listo = async () => {
    if (!nat) return
    setBusy(true); setError(null)
    try {
      // De píxeles de pantalla a píxeles de la foto original. `escala` es
      // cuántos píxeles de pantalla ocupa cada píxel de la foto.
      const escala = base * zoom
      onDone(await cropToSquare(file, {
        x: -off.x / escala,
        y: -off.y / escala,
        side: VISTA / escala,
      }))
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Sheet title="Encuadrá tu foto" onClose={onCancel}>
      <div
        style={{
          position: 'relative', width: VISTA, height: VISTA, margin: '0 auto',
          borderRadius: 'var(--r-2)', overflow: 'hidden',
          background: 'var(--elevated)',
          // El navegador se queda el arrastre para scrollear la hoja si no se
          // le dice que este gesto es de acá.
          touchAction: 'none', cursor: nat ? 'grab' : 'default',
        }}
        onPointerDown={e => {
          if (!nat) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }
        }}
        onPointerMove={e => {
          const d = drag.current
          if (!d) return
          setOff(limitar(d.ox + (e.clientX - d.x), d.oy + (e.clientY - d.y)))
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
      >
        {url && (
          <img
            src={url} alt="" onLoad={cargar} draggable={false}
            style={{
              position: 'absolute', left: 0, top: 0,
              width: dw || 'auto', height: dh || 'auto',
              transform: `translate3d(${off.x}px, ${off.y}px, 0)`,
              // Invisible hasta que sabemos encuadrarla: si no, aparece a
              // tamaño natural un cuadro antes de que `onLoad` la acomode.
              visibility: nat ? 'visible' : 'hidden',
              maxWidth: 'none', userSelect: 'none',
            }}
          />
        )}
      </div>

      <p style={{
        color: 'var(--faint)', fontSize: 'var(--t-2)', textAlign: 'center',
        margin: 'var(--s-3) 0 0',
      }}>Arrastrá la foto para elegir qué parte se ve.</p>

      <label className="lbl" style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
        margin: 'var(--s-4) 0 0', fontSize: 'var(--t-2)', color: 'var(--muted)',
      }}>
        Acercar
        <input
          className="range" type="range" min={1} max={ZOOM_MAX} step={0.01}
          value={zoom} disabled={!nat}
          onChange={e => { fb.paso(); setZoom(Number(e.target.value)) }}
          style={{
            flex: 1,
            ['--fill' as string]: `${((zoom - 1) / (ZOOM_MAX - 1)) * 100}%`,
          }}
        />
      </label>

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-2)', margin: 'var(--s-3) 0 0' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 'var(--s-2)', margin: 'var(--s-5) 0 0' }}>
        <button onClick={onCancel} className="lbl" style={{
          padding: 'var(--s-3) var(--s-4)', fontSize: 'var(--t-3)', color: 'var(--muted)',
        }}>Cancelar</button>
        <button
          onClick={listo} disabled={!nat || busy} className="lbl"
          style={{
            flex: 1, padding: 'var(--s-3)', borderRadius: 'var(--r-2)',
            fontSize: 'var(--t-4)',
            background: nat && !busy ? 'var(--acento)' : 'var(--elevated)',
            color: nat && !busy ? 'var(--base)' : 'var(--faint)',
          }}
        >{busy ? 'Subiendo…' : 'Usar esta foto'}</button>
      </div>
    </Sheet>
  )
}
