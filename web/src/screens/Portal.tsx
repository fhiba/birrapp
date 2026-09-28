import { useEffect, useState } from 'react'
import * as api from '../data/api'
import * as fb from '../data/feedback'
import type { Beneficio, CanjeConfirmado, CanjeDelBar, SesionPortal, StaffPortal } from '../data/types'
import { SectionLabel } from '../ui/Kit'
import { Segmented } from '../ui/Segmented'

/**
 * El portal del bar.
 *
 * ## Por qué está acá y no en otro proyecto
 *
 * Comparte el build, los tokens de diseño y el cliente HTTP con la app, así que
 * un proyecto aparte serían dos despliegues y dos paletas para mantener. Lo que
 * **no** comparte es la sesión: el token del portal vive en su propia clave de
 * `localStorage` y lleva su propio `scope`, así que el mozo en el celular del
 * bar y el dueño con su cuenta de usuario abierta en la misma computadora no se
 * pisan. Cerrar una sesión no cierra la otra.
 *
 * Tampoco comparte el chrome: no hay barra de pestañas ni "+" flotante. Un mozo
 * no tiene por qué poder caer en el mapa desde acá, ni al revés.
 *
 * ## La pantalla es el campo del código
 *
 * Lo que un mozo hace acá noventa y nueve veces de cada cien es tipear seis
 * dígitos. Todo lo demás —beneficios, canjes, personal— vive detrás de las
 * solapas, porque se usa una vez por semana.
 */
export function PortalScreen() {
  const [sesion, setSesion] = useState<SesionPortal | null>(api.portalSesion())

  if (!sesion) return <Login onEntro={setSesion} />
  return <Adentro sesion={sesion} onSalir={() => { api.portalGuardar(null); setSesion(null) }} />
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(var(--s-6) + var(--safe-top)) var(--s-5) calc(var(--s-6) + var(--safe-bottom))`,
    }}>
      <div className="desk-narrow">{children}</div>
    </div>
  )
}

function Login({ onEntro }: { onEntro: (s: SesionPortal) => void }) {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const entrar = async () => {
    setBusy(true); setError(null)
    try { onEntro(await api.portalLogin(email, clave)) }
    catch (e) { fb.error(); setError((e as Error).message); setBusy(false) }
  }

  return (
    <Marco>
      <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: 0 }}>birrapp · bares</h1>
      <p style={{
        color: 'var(--muted)', fontSize: 'var(--t-3)', margin: 'var(--s-2) 0 var(--s-6)',
        lineHeight: 1.5,
      }}>
        Entrá con la cuenta que te dio el bar. Es distinta de la de la app.
      </p>

      <Campo label="Mail" value={email} onChange={setEmail} type="email" />
      <Campo
        label="Clave" value={clave} onChange={setClave} type="password"
        onEnter={entrar}
      />

      {error && (
        <p role="alert" style={{
          color: 'var(--danger)', fontSize: 'var(--t-3)', margin: 'var(--s-3) 0 0',
        }}>{error}</p>
      )}

      <button
        onClick={entrar} disabled={busy || !email || !clave} className="lbl cta"
        style={{
          width: '100%', marginTop: 'var(--s-5)', minHeight: 52,
          borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
          background: busy ? 'var(--acento-busy)' : 'var(--acento)', color: 'var(--base)',
        }}
      >{busy ? 'Entrando…' : 'Entrar'}</button>
    </Marco>
  )
}

type Solapa = 'canjear' | 'beneficios' | 'movimientos' | 'equipo'

function Adentro({ sesion, onSalir }: { sesion: SesionPortal; onSalir: () => void }) {
  const [solapa, setSolapa] = useState<Solapa>('canjear')
  const staff = sesion.staff

  return (
    <Marco>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)' }}>
        <h1 className="ttl" style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-6)', margin: 0 }}>
          {staff.barName}
        </h1>
        <button onClick={onSalir} className="lbl" style={{
          fontSize: 'var(--t-2)', color: 'var(--muted)', minHeight: 44,
        }}>Salir</button>
      </div>
      <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '2px 0 var(--s-5)' }}>
        {staff.displayName} · {staff.role === 'owner' ? 'dueño' : 'mozo'}
      </p>

      <Segmented<Solapa>
        options={[
          { value: 'canjear', label: 'Canjear' },
          { value: 'beneficios', label: 'Beneficios' },
          { value: 'movimientos', label: 'Canjes' },
          ...(staff.role === 'owner'
            ? [{ value: 'equipo' as Solapa, label: 'Equipo' }]
            : []),
        ]}
        value={solapa} onChange={setSolapa}
        label={o => `Ver ${o.label.toLowerCase()}`}
      />

      <div style={{ marginTop: 'var(--s-5)' }}>
        {solapa === 'canjear' && <Canjear />}
        {solapa === 'beneficios' && <Beneficios esDueño={staff.role === 'owner'} />}
        {solapa === 'movimientos' && <Movimientos />}
        {solapa === 'equipo' && <Equipo />}
      </div>
    </Marco>
  )
}

/**
 * Lo que hace un mozo el 99% de las veces: tipear seis dígitos.
 *
 * El campo arranca con foco y sólo acepta números, porque se usa con una mano y
 * mirando a la mesa. Y al confirmar se muestra **qué** beneficio y **de quién**:
 * el mozo tiene que poder decir en voz alta lo que está por dar.
 */
function Canjear() {
  const [codigo, setCodigo] = useState('')
  const [ok, setOk] = useState<CanjeConfirmado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const confirmar = async () => {
    if (codigo.length !== 6) return
    setBusy(true); setError(null); setOk(null)
    try {
      setOk(await api.portalConfirmar(codigo))
      fb.exito()
      setCodigo('')
    } catch (e) { fb.error(); setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <>
      <SectionLabel>Código del cliente</SectionLabel>
      <input
        value={codigo}
        onChange={e => { setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6)); setOk(null) }}
        onKeyDown={e => { if (e.key === 'Enter') confirmar() }}
        inputMode="numeric" autoComplete="off" autoFocus
        placeholder="——————"
        className="num"
        style={{
          width: '100%', padding: 'var(--s-4)', borderRadius: 'var(--r-2)',
          background: 'var(--raised)', border: '1px solid var(--hairline)',
          fontSize: 'clamp(30px, 11vw, 44px)', letterSpacing: '.18em',
          textAlign: 'center', color: 'var(--cream)',
        }}
      />

      <button
        onClick={confirmar} disabled={busy || codigo.length !== 6} className="lbl cta"
        style={{
          width: '100%', marginTop: 'var(--s-4)', minHeight: 52,
          borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
          background: codigo.length === 6 && !busy ? 'var(--acento)' : 'var(--elevated)',
          color: codigo.length === 6 && !busy ? 'var(--base)' : 'var(--faint)',
        }}
      >{busy ? '…' : 'Confirmar'}</button>

      {ok && (
        <div role="status" style={{
          marginTop: 'var(--s-5)', padding: 'var(--s-4)', borderRadius: 'var(--r-3)',
          background: 'var(--info-soft)', border: '1px solid var(--info-border)',
        }}>
          <div className="ttl" style={{ fontSize: 'var(--t-5)', color: 'var(--cream)' }}>
            {ok.benefitTitle}
          </div>
          <div style={{ fontSize: 'var(--t-3)', color: 'var(--muted)', marginTop: 4 }}>
            Para {ok.userName} · {ok.costPoints} puntos
          </div>
          <p style={{
            fontSize: 'var(--t-2)', color: 'var(--faint)', margin: 'var(--s-3) 0 0',
            lineHeight: 1.5,
          }}>
            Aplicalo en la caja como cualquier promo. Queda registrado a tu nombre.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" style={{
          color: 'var(--danger)', fontSize: 'var(--t-3)', margin: 'var(--s-4) 0 0',
          lineHeight: 1.5,
        }}>{error}</p>
      )}
    </>
  )
}

function Beneficios({ esDueño }: { esDueño: boolean }) {
  const [lista, setLista] = useState<Beneficio[] | null>(null)
  const [titulo, setTitulo] = useState('')
  const [costo, setCosto] = useState('')
  const [error, setError] = useState<string | null>(null)

  const cargar = () => { api.portalBeneficios().then(setLista).catch(() => setLista([])) }
  useEffect(cargar, [])

  const crear = async () => {
    setError(null)
    try {
      await api.portalCrearBeneficio({ title: titulo.trim(), costPoints: Number(costo) })
      fb.exito(); setTitulo(''); setCosto(''); cargar()
    } catch (e) { fb.error(); setError((e as Error).message) }
  }

  return (
    <>
      {esDueño && (
        <>
          <SectionLabel>Publicar uno nuevo</SectionLabel>
          <Campo label="Qué das" value={titulo} onChange={setTitulo} />
          <Campo label="Cuántos puntos cuesta" value={costo} onChange={setCosto} type="number" />
          {error && (
            <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>
          )}
          <button
            onClick={crear}
            disabled={titulo.trim().length < 3 || !Number(costo)}
            className="lbl cta"
            style={{
              width: '100%', marginTop: 'var(--s-3)', minHeight: 46,
              borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
              background: 'var(--info-soft)', border: '1px solid var(--info-border)',
              color: 'var(--info-bright)',
            }}
          >Publicar</button>
        </>
      )}

      <SectionLabel>Los tuyos</SectionLabel>
      {lista == null ? <p style={{ color: 'var(--faint)' }}>…</p>
        : lista.length === 0 ? (
          <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', lineHeight: 1.5 }}>
            Todavía no publicaste ninguno. Lo que publiques se puede canjear acá,
            con puntos que la gente sumó en cualquier bar del programa.
          </p>
        ) : lista.map(b => (
          <Fila
            key={b.id} titulo={b.title}
            sub={b.stock == null ? 'sin tope' : `quedan ${b.stock}`}
            derecha={`${b.costPoints}`}
          />
        ))}
    </>
  )
}

function Movimientos() {
  const [lista, setLista] = useState<CanjeDelBar[] | null>(null)
  useEffect(() => { api.portalCanjes().then(setLista).catch(() => setLista([])) }, [])

  if (lista == null) return <p style={{ color: 'var(--faint)' }}>…</p>
  if (lista.length === 0) return (
    <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', lineHeight: 1.5 }}>
      Todavía no hubo canjes.
    </p>
  )
  return (
    <>
      <SectionLabel>Últimos canjes</SectionLabel>
      {lista.map(c => (
        <Fila
          key={c.id} titulo={c.benefitTitle}
          sub={`${c.userName}${c.redeemedBy ? ` · lo dio ${c.redeemedBy}` : ''}`}
          derecha={c.status === 'redeemed' ? `${c.costPoints}` : ESTADO[c.status] ?? c.status}
          apagado={c.status !== 'redeemed'}
        />
      ))}
    </>
  )
}

const ESTADO: Record<string, string> = {
  pending: 'esperando', expired: 'venció', cancelled: 'cancelado',
}

function Equipo() {
  const [lista, setLista] = useState<StaffPortal[] | null>(null)
  const [mail, setMail] = useState('')
  const [clave, setClave] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)

  const cargar = () => { api.portalStaff().then(setLista).catch(() => setLista([])) }
  useEffect(cargar, [])

  const crear = async () => {
    setError(null)
    try {
      await api.portalCrearStaff({ email: mail, password: clave, displayName: nombre })
      fb.exito(); setMail(''); setClave(''); setNombre(''); cargar()
    } catch (e) { fb.error(); setError((e as Error).message) }
  }

  return (
    <>
      <SectionLabel>Sumar un mozo</SectionLabel>
      <p style={{
        color: 'var(--faint)', fontSize: 'var(--t-2)', lineHeight: 1.5,
        margin: '0 0 var(--s-3)', textWrap: 'pretty',
      }}>
        Cada uno con su cuenta, para que cada canje quede a nombre de quien lo
        dio. La clave se la pasás vos.
      </p>
      <Campo label="Nombre" value={nombre} onChange={setNombre} />
      <Campo label="Mail" value={mail} onChange={setMail} type="email" />
      <Campo label="Clave" value={clave} onChange={setClave} type="password" />
      {error && (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>
      )}
      <button
        onClick={crear} disabled={!mail || clave.length < 8} className="lbl cta"
        style={{
          width: '100%', marginTop: 'var(--s-3)', minHeight: 46,
          borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
          background: 'var(--info-soft)', border: '1px solid var(--info-border)',
          color: 'var(--info-bright)',
        }}
      >Crear la cuenta</button>

      <SectionLabel>El equipo</SectionLabel>
      {(lista ?? []).map(s => (
        <Fila
          key={s.id} titulo={s.displayName} sub={s.email}
          derecha={s.role === 'owner' ? 'dueño' : 'mozo'} apagado
        />
      ))}
    </>
  )
}

// ---------- piezas ----------

function Campo({ label, value, onChange, type = 'text', onEnter }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; onEnter?: () => void
}) {
  return (
    <label style={{ display: 'block', marginBottom: 'var(--s-3)' }}>
      <span className="lbl" style={{
        display: 'block', fontSize: 'var(--t-2)', color: 'var(--muted)',
        marginBottom: 'var(--s-2)',
      }}>{label}</span>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
        autoComplete={type === 'password' ? 'current-password' : 'off'}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 'var(--r-2)',
          background: 'var(--raised)', border: '1px solid var(--hairline)',
          fontSize: 'var(--t-field)',
        }}
      />
    </label>
  )
}

function Fila({ titulo, sub, derecha, apagado }: {
  titulo: string; sub: string; derecha: string; apagado?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
      padding: 'var(--s-3) 0', borderBottom: '1px solid var(--hairline)',
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="lbl" style={{
          display: 'block', fontSize: 'var(--t-3)', color: 'var(--cream)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{titulo}</span>
        <span style={{ display: 'block', fontSize: 'var(--t-1)', color: 'var(--faint)' }}>
          {sub}
        </span>
      </span>
      <span className={apagado ? undefined : 'num'} style={{
        flexShrink: 0, fontSize: 'var(--t-3)',
        color: apagado ? 'var(--faint)' : 'var(--cream)',
      }}>{derecha}</span>
    </div>
  )
}
