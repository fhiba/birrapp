import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import * as fb from '../data/feedback'
import { useContador } from '../data/contador'
import type { Beneficio, Canje, Saldo, User } from '../data/types'
import { Empty, SkeletonRows } from '../ui/Empty'
import { Screen, SectionLabel, Tile } from '../ui/Kit'
import { EscanerQR } from '../ui/EscanerQR'

/** Qué decir por cada motivo de rechazo. El código viene del servidor. */
const MOTIVOS: Record<string, string> = {
  ya_reclamado: 'Ese ticket ya se usó. Cada comprobante suma una sola vez.',
  bar_no_afiliado: 'Ese bar todavía no está en el programa.',
  tope_diario: 'Llegaste al tope de puntos del día. Mañana sigue.',
  importe_sin_puntos: 'Ese importe no alcanza para un punto.',
  arca_rechazo: 'ARCA no reconoce ese comprobante.',
  arca_sin_respuesta: 'ARCA no está respondiendo. Probá de nuevo en un rato.',
}

/**
 * Los puntos de la persona: cuántos tiene, qué puede canjear y cómo suma.
 *
 * ## Por qué el código de canje ocupa la pantalla entera
 *
 * Cuando aparece, lo que hay que hacer es mostrárselo a alguien que está
 * parado al lado. Un número chico en una tarjeta obliga a girar el teléfono y
 * acercarlo; a este tamaño se lee de frente y a un metro. Y el reloj no es
 * decoración: el código vive cinco minutos y saber cuánto falta es la
 * diferencia entre esperar tranquilo y volver a pedirlo.
 *
 * ## El ticket se pega, todavía no se escanea
 *
 * La cámara necesita una librería de lectura de QR y es su propia tarea. Para
 * la prueba de concepto se pega la URL del comprobante, que ejercita exactamente
 * el mismo camino del servidor: parsear, constatar, acreditar.
 */
export function PuntosScreen({ user }: { user: User | null }) {
  const nav = useNavigate()
  const [saldo, setSaldo] = useState<Saldo | null>(null)
  const [beneficios, setBeneficios] = useState<Beneficio[] | null>(null)
  const [canje, setCanje] = useState<Canje | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false)
  /** La cámara abierta. Es la forma normal de sumar; pegar el link es el respaldo. */
  const [escaneando, setEscaneando] = useState(false)
  /*
   * Acá arriba y no en el JSX donde se usa.
   *
   * Allá quedaba adentro de una rama del ternario de `user`, o sea una llamada
   * condicional a un hook: al entrar o salir de la sesión, React se encuentra
   * con otra cantidad de hooks que en el render anterior y rompe. El error no
   * aparece al escribirlo —la pantalla anda mientras el usuario no cambie— y
   * por eso conviene la regla y no el criterio.
   */
  const balanceContado = useContador(saldo?.balance)

  const cargar = () => {
    api.loyaltyBeneficios().then(setBeneficios).catch(() => setBeneficios([]))
    if (user) api.loyaltySaldo().then(setSaldo).catch(() => {})
  }
  useEffect(cargar, [user])

  const escanear = async (texto = qr) => {
    if (!texto.trim()) return
    setBusy(true); setError(null); setAviso(null)
    try {
      const r = await api.loyaltyEscanear(texto.trim())
      fb.exito()
      setAviso(`Sumaste ${r.puntos} puntos.`)
      setQr('')
      cargar()
    } catch (e) {
      fb.error()
      const err = e as api.ApiError & { code?: string }
      // El motivo viaja en el cuerpo; si no llegó, queda el mensaje del error.
      setError(MOTIVOS[err.code ?? ''] ?? (e as Error).message)
    } finally { setBusy(false) }
  }

  const reservar = async (b: Beneficio) => {
    setBusy(true); setError(null)
    try {
      setCanje(await api.loyaltyReservar(b.id))
      fb.exito()
      cargar()
    } catch (e) { fb.error(); setError((e as Error).message) }
    finally { setBusy(false) }
  }

  if (canje) return <CodigoEnPantalla canje={canje} onCerrar={() => { setCanje(null); cargar() }} />

  if (escaneando) return (
    <EscanerQR
      onLeido={texto => { setEscaneando(false); void escanear(texto) }}
      onCerrar={() => setEscaneando(false)}
    />
  )

  return (
    <Screen title="Puntos" onBack={() => nav(-1)}>
      {!user ? (
        <Empty
          title="Los puntos son de tu cuenta"
          hint="Se suman escaneando el ticket del bar y se canjean por beneficios. Hace falta entrar."
          action="Entrar"
          onAction={() => nav('/perfil')}
        />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12 }}>
            {/* El saldo cuenta hasta el valor nuevo: es el instante en que el
                ticket se convierte en puntos, y saltando de golpe se pierde. */}
            <Tile value={balanceContado} label="puntos" />
            {/* Sólo si hay algo por vencer: un cero acá sería un recordatorio
                de nada, y el punto de este número es que apura. */}
            {saldo != null && saldo.venceEnBreve > 0 && (
              <Tile
                value={saldo.venceEnBreve} label="vencen pronto"
                hint="en los próximos 7 días"
              />
            )}
          </div>

          <SectionLabel>Sumar con un ticket</SectionLabel>
          <p style={{
            color: 'var(--faint)', fontSize: 'var(--t-2)', lineHeight: 1.5,
            margin: '0 0 var(--s-3)', textWrap: 'pretty',
          }}>
            Pedí la factura y pegá acá el link de su QR. Suma por el total del
            consumo, y cada comprobante vale una vez.
          </p>
          {/* La cámara primero y el campo abajo: escanear es lo que se hace
              parado en el bar con una mano, pegar un link es lo que se hace
              cuando la cámara no anda. El orden dice cuál es cuál. */}
          <button
            onClick={() => setEscaneando(true)} disabled={busy} className="lbl cta"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--s-2)',
              width: '100%', minHeight: 52, marginBottom: 'var(--s-3)',
              borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
              background: 'var(--acento)', color: 'var(--base)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
              <rect x="7" y="7" width="4" height="4" /><rect x="13" y="7" width="4" height="4" />
              <rect x="7" y="13" width="4" height="4" /><rect x="13" y="13" width="4" height="4" />
            </svg>
            Escanear el ticket
          </button>

          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            <input
              value={qr} onChange={e => setQr(e.target.value)}
              placeholder="https://www.arca.gob.ar/fe/qr/?p=…"
              autoComplete="off" spellCheck={false}
              style={{
                flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 'var(--r-2)',
                background: 'var(--raised)', border: '1px solid var(--hairline)',
                fontSize: 'var(--t-field)',
              }}
            />
            <button
              onClick={() => escanear()} disabled={busy || !qr.trim()} className="lbl cta"
              style={{
                padding: '0 var(--s-4)', minHeight: 46, borderRadius: 'var(--r-2)',
                fontSize: 'var(--t-3)',
                background: busy || !qr.trim() ? 'var(--elevated)' : 'var(--acento)',
                color: busy || !qr.trim() ? 'var(--faint)' : 'var(--base)',
              }}
            >{busy ? '…' : 'Sumar'}</button>
          </div>

          {aviso && (
            <p role="status" style={{
              color: 'var(--fresh)', fontSize: 'var(--t-3)', margin: 'var(--s-3) 0 0',
            }}>{aviso}</p>
          )}
          {error && (
            <p role="alert" style={{
              color: 'var(--danger)', fontSize: 'var(--t-3)', margin: 'var(--s-3) 0 0',
              lineHeight: 1.5,
            }}>{error}</p>
          )}
        </>
      )}

      <SectionLabel>Para canjear</SectionLabel>
      {beneficios == null ? <SkeletonRows rows={3} /> : beneficios.length === 0 ? (
        <p style={{
          color: 'var(--faint)', fontSize: 'var(--t-2)', lineHeight: 1.5, textWrap: 'pretty',
        }}>
          Todavía no hay beneficios publicados. Los publica cada bar del
          programa, y se pueden canjear en cualquiera de ellos.
        </p>
      ) : beneficios.map(b => {
        const alcanza = (saldo?.balance ?? 0) >= b.costPoints
        return (
          <div key={b.id} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
            padding: 'var(--s-3) 0', borderBottom: '1px solid var(--hairline)',
          }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="lbl" style={{
                display: 'block', fontSize: 'var(--t-4)', color: 'var(--cream)',
              }}>{b.title}</span>
              <span style={{ display: 'block', fontSize: 'var(--t-2)', color: 'var(--faint)' }}>
                {b.barName}{b.detail ? ` · ${b.detail}` : ''}
              </span>
            </span>
            {/* El costo con el color del dato, y el botón sólo si alcanza:
                ofrecer un canje que va a rebotar es peor que no ofrecerlo. */}
            <span className="num" style={{
              flexShrink: 0, fontSize: 'var(--t-4)',
              color: alcanza ? 'var(--cream)' : 'var(--faint)',
            }}>{b.costPoints}</span>
            <button
              onClick={() => reservar(b)}
              disabled={!user || !alcanza || busy}
              className="lbl cta"
              style={{
                flexShrink: 0, minHeight: 38, padding: '0 var(--s-3)',
                borderRadius: 'var(--r-2)', fontSize: 'var(--t-2)',
                background: alcanza ? 'var(--info-soft)' : 'transparent',
                border: `1px solid ${alcanza ? 'var(--info-border)' : 'var(--hairline)'}`,
                color: alcanza ? 'var(--info-bright)' : 'var(--faint)',
              }}
            >{alcanza ? 'Canjear' : 'Te falta'}</button>
          </div>
        )
      })}
    </Screen>
  )
}

/**
 * El código, a pantalla completa y con el reloj.
 *
 * Ocupa todo porque lo que hay que hacer con él es mostrárselo a alguien que
 * está al lado. Y el reloj corre en serio: cuando llega a cero el código no
 * sirve más y los puntos vuelven solos, así que dejarlo sin contador sería
 * hacer esperar sin decir cuánto.
 */
function CodigoEnPantalla({ canje, onCerrar }: { canje: Canje; onCerrar: () => void }) {
  const [restante, setRestante] = useState(() => faltan(canje.expiresAt))

  useEffect(() => {
    const t = setInterval(() => setRestante(faltan(canje.expiresAt)), 1000)
    return () => clearInterval(t)
  }, [canje.expiresAt])

  const vencido = restante <= 0

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 'var(--s-4)',
      padding: 'var(--s-5)', textAlign: 'center',
    }}>
      <span className="section-label">{vencido ? 'CÓDIGO VENCIDO' : 'MOSTRALE ESTO AL MOZO'}</span>

      <span className="num" style={{
        fontSize: 'clamp(44px, 18vw, 76px)', letterSpacing: '.12em', lineHeight: 1,
        color: vencido ? 'var(--faint)' : 'var(--cream)',
      }}>{vencido ? '——————' : canje.code}</span>

      <span className="lbl" style={{ fontSize: 'var(--t-4)', color: 'var(--cream)' }}>
        {canje.benefitTitle}
      </span>
      <span style={{ fontSize: 'var(--t-3)', color: 'var(--muted)' }}>{canje.barName}</span>

      <span className="num" style={{
        fontSize: 'var(--t-5)', color: vencido ? 'var(--danger)' : 'var(--acento)',
      }}>
        {vencido ? 'Te devolvimos los puntos' : reloj(restante)}
      </span>

      <button onClick={onCerrar} className="lbl cta" style={{
        marginTop: 'var(--s-4)', minHeight: 46, padding: '0 var(--s-5)',
        borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
        background: 'var(--film-1)', color: 'var(--info)',
      }}>{vencido ? 'Volver' : 'Listo'}</button>
    </div>
  )
}

const faltan = (iso: string) => Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 1000))

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
