import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { BeerStyle, Brand, User } from '../data/types'

/** El techo del servidor es 10; acá se sugiere menos porque se muestran 3. */
const MAX = 10

/**
 * Elegir tus birras (V21).
 *
 * **Para qué sirve, que es lo que decide el diseño.** La ficha de un bar
 * muestra tres estilos y tres marcas, y el resto vive detrás de un "⋯". Esto
 * es lo que decide cuáles son esos tres. Sin preferencias hay un desempate
 * razonable —las mejor puntuadas— así que esta pantalla nunca es obligatoria:
 * mejora la app, no la habilita.
 *
 * De ahí que se pueda saltear con un toque y sin culpa. Un onboarding que
 * bloquea la entrada por algo opcional es la forma más rápida de que alguien
 * cierre la app antes de ver un precio, que es a lo que vino.
 *
 * Tampoco hay orden de importancia ni "elegí exactamente tres": se marca lo
 * que gusta y listo. Pedir un ranking es pedir una decisión que nadie tiene
 * tomada, para un beneficio que la persona todavía no vio.
 */
export function PreferencesScreen({
  user, styles, brands, onSession, primeraVez = false,
}: {
  user: User | null
  styles: BeerStyle[]
  brands: Brand[]
  onSession: () => void
  /** Se llegó recién iniciando sesión: cambia el texto y el botón de salida. */
  primeraVez?: boolean
}) {
  const nav = useNavigate()
  const [estilos, setEstilos] = useState<string[]>(user?.favoriteStyles ?? [])
  const [marcas, setMarcas] = useState<string[]>(user?.favoriteBrands ?? [])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) { nav('/perfil', { replace: true }); return null }

  const alternar = (lista: string[], set: (v: string[]) => void, slug: string) => {
    if (lista.includes(slug)) set(lista.filter(s => s !== slug))
    else if (lista.length < MAX) set([...lista, slug])
  }

  const guardar = async () => {
    setGuardando(true); setError(null)
    try {
      const u = await api.updateMe({ favoriteStyles: estilos, favoriteBrands: marcas })
      api.updateSessionUser(u)
      onSession()
      salir()
    } catch (e) {
      setError((e as Error).message)
      setGuardando(false)
    }
  }

  // Recién logueado se va al mapa, que es a lo que vino; entrando desde
  // Configuración, se vuelve de donde salió.
  const salir = () => primeraVez ? nav('/', { replace: true }) : nav(-1)

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 0 calc(96px + var(--nav-gap))`,
    }}>
      <div className="desk-narrow">
        <div style={{ padding: '0 18px' }}>
          {!primeraVez && (
            <button onClick={() => nav(-1)} className="icon-btn"
              style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
          )}
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: '16px 0 0' }}>
            {primeraVez ? '¿Qué tomás?' : 'Tus birras'}
          </h1>
          <p style={{
            color: 'var(--muted)', fontSize: 'var(--t-3)', margin: '8px 0 0', lineHeight: 1.5,
          }}>
            En cada bar se muestran tres birras y el resto queda detrás del{' '}
            <span className="lbl">⋯</span>. Marcá las tuyas y van a ser esas tres.
            {' '}Se puede cambiar cuando quieras.
          </p>
          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)' }}>{error}</p>
          )}
        </div>

        <Grupo titulo="Estilos" elegidos={estilos.length}>
          {styles.map(s => (
            <Chip
              key={s.slug} label={s.name} on={estilos.includes(s.slug)}
              onClick={() => alternar(estilos, setEstilos, s.slug)}
            />
          ))}
        </Grupo>

        <Grupo titulo="Marcas" elegidos={marcas.length}>
          {/* Las artesanales primero: son las que alguien elige a propósito.
              Una industrial se toma porque es la que hay, y eso no es una
              preferencia que valga la pena declarar. */}
          {[...brands].sort((a, b) => Number(b.craft) - Number(a.craft)).map(b => (
            <Chip
              key={b.slug} label={b.name} on={marcas.includes(b.slug)}
              onClick={() => alternar(marcas, setMarcas, b.slug)}
            />
          ))}
        </Grupo>
      </div>

      {/* Barra fija abajo: la lista es larga y el botón de guardar no puede
          quedar al final de un scroll de cincuenta marcas. */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        padding: `var(--s-3) 18px calc(var(--s-3) + var(--safe-bottom))`,
        background: 'var(--base)', borderTop: '1px solid var(--film-2)',
        display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <div className="desk-narrow" style={{
          display: 'flex', gap: 10, alignItems: 'center', width: '100%',
        }}>
          {/* Saltear sin culpa: esto mejora la app, no la habilita. */}
          <button onClick={salir} className="lbl" style={{
            padding: 'var(--s-3) var(--s-4)', fontSize: 'var(--t-3)', color: 'var(--muted)',
          }}>{primeraVez ? 'Ahora no' : 'Cancelar'}</button>

          <button
            onClick={guardar} disabled={guardando} className="lbl"
            style={{
              flex: 1, padding: 'var(--s-3)', borderRadius: 'var(--r-2)',
              fontSize: 'var(--t-4)',
              background: guardando ? 'var(--acento-deep)' : 'var(--acento)',
              color: 'var(--base)',
            }}
          >{guardando ? 'Guardando…' : 'Listo'}</button>
        </div>
      </div>
    </div>
  )
}

function Grupo({ titulo, elegidos, children }: {
  titulo: string; elegidos: number; children: React.ReactNode
}) {
  return (
    <section style={{ padding: '0 18px' }}>
      <h2 className="lbl" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 'var(--t-1)', letterSpacing: '.12em', color: 'var(--faint)',
        margin: 'var(--s-5) 0 var(--s-3)',
      }}>
        {titulo.toUpperCase()}
        {elegidos > 0 && (
          <span className="num" style={{ color: 'var(--nota)' }}>{elegidos}</span>
        )}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
    </section>
  )
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} aria-pressed={on} className="lbl"
      style={{
        padding: '10px 15px', borderRadius: 999, fontSize: 'var(--t-3)',
        background: on ? 'var(--acento)' : 'var(--film-2)',
        color: on ? 'var(--base)' : 'var(--muted)',
      }}
    >{label}</button>
  )
}
