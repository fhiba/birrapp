import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import * as fb from '../data/feedback'

/**
 * La cámara, para leer el QR del ticket.
 *
 * ## Dos lectores, y por qué
 *
 * Se usa `BarcodeDetector` cuando existe —está en Chrome de Android y lo
 * resuelve el sistema operativo, así que es más rápido y no baja nada— y jsQR
 * cuando no. Safari de iOS no tiene `BarcodeDetector`, y iOS es justo donde más
 * se va a usar esto: alguien parado en un bar con el ticket en la mano.
 *
 * jsQR y no una librería con WebAssembly: sólo hay que leer QR, son 40 KB de
 * JavaScript contra unos 300 de wasm, y entra por `import()` dinámico así que
 * quien nunca escanea no lo baja nunca.
 *
 * ## El cuadro no recorta, guía
 *
 * Se analiza el **cuadro entero** y no el recuadro dibujado. Recortar suena
 * prolijo y es peor: el QR de un ticket es chico, la gente lo encuadra mal, y
 * un lector que sólo mira el centro falla cuando el código está a un costado —
 * con la cámara encendida y sin decir por qué. El recuadro es una ayuda visual
 * para acercarse, no un límite.
 *
 * ## Qué hace cuando no puede
 *
 * Sin permiso, sin cámara o en un origen sin HTTPS, `getUserMedia` rechaza. No
 * se muestra un error y se cierra la puerta: se cae al campo de pegar el link,
 * que es el mismo camino del servidor. La cámara es la forma cómoda, no la
 * única.
 */
export function EscanerQR({ onLeido, onCerrar }: {
  onLeido: (texto: string) => void
  onCerrar: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let vivo = true
    let raf = 0

    const arrancar = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // La de atrás: nadie escanea un ticket con la frontal.
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch {
        if (vivo) setError('No pudimos abrir la cámara. Podés pegar el link del QR.')
        return
      }
      if (!vivo || !video.current) { stream?.getTracks().forEach(t => t.stop()); return }

      video.current.srcObject = stream
      // `playsInline` va también en el atributo: sin esto, iOS abre el video a
      // pantalla completa en su propio reproductor y se pierde la superposición.
      await video.current.play().catch(() => {})
      if (vivo) setListo(true)

      const lienzo = document.createElement('canvas')
      const ctx = lienzo.getContext('2d', { willReadFrequently: true })

      // El del sistema si está; si no, jsQR, cargado recién acá.
      type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
      const Nativo = (window as unknown as {
        BarcodeDetector?: new (o: { formats: string[] }) => Detector
      }).BarcodeDetector
      const nativo = Nativo ? new Nativo({ formats: ['qr_code'] }) : null

      const mirar = async () => {
        if (!vivo || !video.current || !ctx) return
        const v = video.current
        if (v.readyState >= 2 && v.videoWidth > 0) {
          let texto: string | null = null
          if (nativo) {
            texto = (await nativo.detect(v).catch(() => []))[0]?.rawValue ?? null
          } else {
            lienzo.width = v.videoWidth
            lienzo.height = v.videoHeight
            ctx.drawImage(v, 0, 0)
            const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height)
            texto = jsQR(img.data, img.width, img.height)?.data ?? null
          }
          if (texto && vivo) {
            fb.exito()
            onLeido(texto)
            return
          }
        }
        raf = requestAnimationFrame(() => { void mirar() })
      }
      void mirar()
    }

    void arrancar()
    return () => {
      vivo = false
      cancelAnimationFrame(raf)
      // Apagar la cámara al salir no es prolijidad: es la luz encendida del
      // teléfono y el indicador de grabación del sistema.
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [onLeido])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: '#000',
      display: 'flex', flexDirection: 'column',
    }}>
      <video
        ref={video} playsInline muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* El recuadro. Guía, no recorte: ver arriba. */}
      {listo && !error && (
        <div aria-hidden style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 'min(72vw, 300px)', aspectRatio: '1',
          transform: 'translate(-50%, -50%)',
          border: '2px solid var(--cream)', borderRadius: 'var(--r-3)',
          boxShadow: '0 0 0 100vmax rgba(0,0,0,.55)',
        }} />
      )}

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2,
        padding: `var(--s-5) var(--s-5) calc(var(--s-5) + var(--safe-bottom))`,
        textAlign: 'center',
      }}>
        <p style={{
          color: 'var(--cream)', fontSize: 'var(--t-3)', lineHeight: 1.5,
          margin: '0 0 var(--s-4)', textWrap: 'pretty',
          textShadow: '0 1px 8px rgba(0,0,0,.8)',
        }}>
          {error ?? 'Apuntá al QR de la factura. Se lee solo.'}
        </p>
        <button onClick={onCerrar} className="lbl cta" style={{
          minHeight: 46, padding: '0 var(--s-5)', borderRadius: 'var(--r-2)',
          fontSize: 'var(--t-3)', background: 'var(--cream)', color: '#000',
        }}>{error ? 'Pegar el link' : 'Cancelar'}</button>
      </div>
    </div>
  )
}
