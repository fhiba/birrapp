import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import * as fb from '../data/feedback'
import { formatRadius } from '../data/format'
import type { BeerStyle, Brand, User } from '../data/types'
import { AvatarPicker } from '../ui/AvatarPicker'
import { CurrencySelect } from '../ui/CurrencySelect'
import { Chip } from './Preferences'

/** El techo del servidor para las favoritas. */
const MAX_FAVORITAS = 10
const PASOS = 4

/**
 * La bienvenida de una cuenta nueva (V22).
 *
 * ## Qué problema resuelve
 *
 * Antes de esto, crear la cuenta te dejaba directamente en el mapa. Todo lo
 * que hace que la app sea *tuya* —cómo te llamás en público, qué tomás, en qué
 * moneda cargás, cuánto a la redonda mirás— vivía en Configuración, o sea
 * detrás de una tuerca que nadie abre el primer día. El resultado era gente
 * usando la app con los valores de fábrica para siempre, sin saber que había
 * otra cosa.
 *
 * ## Por qué en tres pasos y no en una pantalla
 *
 * Porque son tres decisiones de naturaleza distinta y con costos distintos.
 * Quién sos se contesta en diez segundos; qué birras te gustan requiere leer
 * una lista larga; el radio y la moneda no significan nada hasta que usaste la
 * app un rato. Amontonadas en una sola pantalla, la larga del medio se come a
 * las otras dos y el pulgar se va al primer botón que cierre eso.
 *
 * En tres, además, cada una puede saltearse por separado: quien quiere elegir
 * su nombre pero no leer cincuenta marcas puede hacer exactamente eso.
 *
 * ## Todo es opcional, y se dice en cada paso
 *
 * Ninguno de los tres pasos habilita nada: la app funciona igual sin ellos.
 * Por eso "Saltear" está siempre a la vista y con el mismo peso visual en los
 * tres, y por eso cada paso dice que se cambia después. Un onboarding que
 * parece obligatorio para algo que no lo es se paga con gente que abandona
 * antes de ver el primer precio, que es justo a lo que vino.
 *
 * **Cada paso guarda al pasar al siguiente.** Si alguien completa el primero y
 * cierra la app en el segundo, el alias quedó. Guardar todo junto al final
 * convertiría cada abandono a mitad de camino en la pérdida de lo que ya se
 * había contestado.
 */
export function OnboardingScreen({ user, styles, brands, onSession }: {
  user: User | null
  styles: BeerStyle[]
  brands: Brand[]
  onSession: () => void
}) {
  const nav = useNavigate()
  const [paso, setPaso] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Paso 1. El alias viene ya puesto desde el servidor, derivado del nombre de
  // la cuenta: ver `aliasAutomatico` en Users.kt por qué se elige mostrarlo
  // escrito en vez de dejar el campo vacío.
  const [alias, setAlias] = useState(user?.alias ?? '')
  // Paso 2.
  const [estilos, setEstilos] = useState<string[]>(user?.favoriteStyles ?? [])
  const [marcas, setMarcas] = useState<string[]>(user?.favoriteBrands ?? [])
  // Paso 3.
  const [radio, setRadio] = useState(user?.defaultRadiusM ?? 2000)
  const [moneda, setMoneda] = useState(user?.currency ?? 'ARS')
  const [tamano, setTamano] = useState(user?.defaultSizeMl ?? 473)

  /**
   * La bienvenida se marca como vista apenas se abre, no al terminarla.
   *
   * Antes se cerraba en el último paso, y el que no llegaba hasta ahí —se fue
   * al mapa, cerró la app, tocó afuera— quedaba con la cuenta sin marcar. El
   * próximo inicio de sesión se la volvía a poner adelante, ya con el alias y
   * las birras elegidas: una pantalla que reaparece después de haberla
   * contestado se lee como que la app no guardó nada.
   *
   * Marcarla al abrirla la vuelve lo que dice ser: una oferta que se hace una
   * vez. Lo que se elige adentro se sigue guardando paso a paso, así que irse
   * a la mitad conserva lo contestado — lo único que no vuelve es la pantalla.
   *
   * Sin `await` ni spinner: no hay nada en pantalla que dependa de esto. Si
   * falla —sin señal, por ejemplo— el peor caso es el de antes.
   */
  useEffect(() => {
    if (!user || user.onboarded) return
    api.updateMe({ onboarded: true })
      .then(u => { api.updateSessionUser(u); onSession() })
      .catch(() => { /* se reintenta solo en el último paso */ })
    // A propósito sin dependencias: se corre una vez por montaje y no cada vez
    // que `user` cambia, que es en cada paso que guarda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!user) return <Navigate to="/perfil" replace />

  /**
   * Lo que guarda cada paso. Saltear manda lo mismo que no cambiar nada.
   *
   * El último no guarda: es el que explica cómo funciona la app y no tiene
   * nada que elegir. "Saltear" y "Listo" hacen exactamente lo mismo ahí, y
   * está bien que así sea — lo que se saltea es la lectura.
   */
  const cambios = (n: number): Parameters<typeof api.updateMe>[0] => {
    if (n === 0) return { alias: alias.trim() }
    if (n === 1) return { favoriteStyles: estilos, favoriteBrands: marcas }
    if (n === 2) return { defaultRadiusM: radio, currency: moneda, defaultSizeMl: tamano }
    return {}
  }

  const avanzar = async (guardar: boolean) => {
    setError(null)
    const ultimo = paso === PASOS - 1
    setGuardando(true)
    try {
      // El último paso cierra la bienvenida en el mismo pedido que guarda: dos
      // viajes separados dejan la puerta abierta a que el segundo falle y la
      // pantalla vuelva a aparecer con todo ya elegido.
      const body = {
        ...(guardar ? cambios(paso) : {}),
        ...(ultimo ? { onboarded: true } : {}),
      }
      if (Object.keys(body).length > 0) {
        api.updateSessionUser(await api.updateMe(body))
        onSession()
      }
      if (ultimo) { fb.exito(); nav('/', { replace: true }) }
      else { fb.tap(); setPaso(p => p + 1) }
    } catch (e) {
      fb.error()
      setError((e as Error).message)
    } finally { setGuardando(false) }
  }

  const alternar = (lista: string[], set: (v: string[]) => void, slug: string) => {
    if (lista.includes(slug)) set(lista.filter(s => s !== slug))
    else if (lista.length < MAX_FAVORITAS) set([...lista, slug])
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(var(--s-5) + var(--safe-top)) 0 calc(112px + var(--safe-bottom))`,
    }}>
      <div className="desk-narrow">
        <div style={{ padding: '0 18px' }}>
          <Progreso paso={paso} />

          {paso === 0 && <PasoVos
            user={user} alias={alias} onAlias={setAlias} onSession={onSession}
          />}

          {paso === 1 && (
            <>
              <Titulo
                titulo="¿Qué tomás?"
                bajada={<>
                  En cada bar se muestran tres birras y el resto queda detrás de
                  un <span className="lbl">⋯</span>. Marcá las tuyas y van a ser
                  esas tres. Podés marcar sólo estilos, sólo marcas, o ninguna.
                </>}
              />
              <Grupo titulo="Estilos" elegidos={estilos.length}>
                {styles.map(s => (
                  <Chip key={s.slug} label={s.name} on={estilos.includes(s.slug)}
                    onClick={() => alternar(estilos, setEstilos, s.slug)} />
                ))}
              </Grupo>
              <Grupo titulo="Marcas" elegidos={marcas.length}>
                {/* Las artesanales primero: son las que alguien elige a
                    propósito. Una industrial se toma porque es la que hay. */}
                {[...brands].sort((a, b) => Number(b.craft) - Number(a.craft)).map(b => (
                  <Chip key={b.slug} label={b.name} on={marcas.includes(b.slug)}
                    onClick={() => alternar(marcas, setMarcas, b.slug)} />
                ))}
              </Grupo>
            </>
          )}

          {paso === 3 && <PasoComoFunciona />}

          {paso === 2 && <PasoAjustes
            radio={radio} onRadio={setRadio}
            moneda={moneda} onMoneda={setMoneda}
            tamano={tamano} onTamano={setTamano}
          />}
        </div>
      </div>

      {/* La barra queda fija: el paso de las birras es una lista larga y el
          botón de seguir no puede vivir al final de un scroll de cincuenta
          marcas. */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        padding: `var(--s-3) 18px calc(var(--s-3) + var(--safe-bottom))`,
        background: 'var(--base)', borderTop: '1px solid var(--hairline)',
      }}>
        <div className="desk-narrow" style={{ width: '100%' }}>
          {error && (
            <p role="alert" style={{
              color: 'var(--danger)', fontSize: 'var(--t-2)',
              margin: '0 0 var(--s-2)', lineHeight: 1.5,
            }}>{error}</p>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* Saltear con el mismo peso en los tres pasos: si en uno pesara
                menos que en otro, ese pasaría a leerse como obligatorio. */}
            <button
              onClick={() => avanzar(false)} disabled={guardando}
              className="lbl cta"
              style={{
                minHeight: 44, padding: 'var(--s-3) var(--s-4)',
                fontSize: 'var(--t-3)', color: 'var(--info)',
              }}
            >Saltear</button>
            <button
              onClick={() => avanzar(true)} disabled={guardando}
              className="lbl cta"
              style={{
                flex: 1, minHeight: 46, padding: 'var(--s-3)',
                borderRadius: 'var(--r-2)', fontSize: 'var(--t-4)',
                background: guardando ? 'var(--acento-busy)' : 'var(--acento)',
                color: 'var(--base)',
              }}
            >{guardando ? 'Guardando…' : paso === PASOS - 1 ? 'Listo' : 'Seguir'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** El primer paso: cómo te va a ver el resto. */
function PasoVos({ user, alias, onAlias, onSession }: {
  user: User
  alias: string
  onAlias: (v: string) => void
  onSession: () => void
}) {
  return (
    <>
      <Titulo
        titulo="¿Cómo te ven?"
        bajada={<>
          Es el nombre con el que aparecés en la tabla pública de colaboradores
          y al pie de tus fotos. Tu nombre de Google y tu mail no se muestran en
          ningún lado.
        </>}
      />

      <div style={{ margin: 'var(--s-5) 0 0' }}>
        <AvatarPicker
          user={user}
          onChange={u => { api.updateSessionUser(u); onSession() }}
        />
      </div>

      <label className="lbl" htmlFor="alias" style={{
        display: 'block', fontSize: 'var(--t-2)', color: 'var(--muted)',
        margin: 'var(--s-5) 0 var(--s-2)',
      }}>Tu nombre de usuario</label>
      <input
        id="alias" value={alias} onChange={e => onAlias(e.target.value)}
        maxLength={20} placeholder="Sin nombre de usuario" autoComplete="off"
        style={{
          width: '100%', minWidth: 0, padding: '12px 16px',
          borderRadius: 'var(--r-2)', background: 'var(--elevated)',
          border: '1px solid var(--hairline)', fontSize: 'var(--t-field)',
        }}
      />
      {/*
        Las tres cosas que hay que saber antes de tocar el campo, y no después
        de que el servidor rechace algo.

        Que ya venga escrito es deliberado: es el alias derivado de tu nombre,
        y verlo puesto es lo que convierte el default en algo que aceptás en
        vez de algo que te enteraste más tarde. Borrarlo es salir de la tabla
        pública, y eso también tiene que estar dicho acá.
      */}
      <p style={{
        color: 'var(--faint)', fontSize: 'var(--t-2)',
        margin: 'var(--s-2) 0 0', lineHeight: 1.5,
      }}>
        Te dejamos uno armado con tu nombre. Podés cambiarlo por el que quieras
        —tiene que ser único, así que puede estar tomado— o borrarlo y no
        figurar en ningún lado. Se cambia cuando quieras desde Configuración.
      </p>
    </>
  )
}

/** El tercer paso: lo que no significa nada hasta que usaste la app un rato. */
function PasoAjustes({
  radio, onRadio, moneda, onMoneda, tamano, onTamano,
}: {
  radio: number; onRadio: (v: number) => void
  moneda: string; onMoneda: (v: string) => void
  tamano: number; onTamano: (v: number) => void
}) {
  return (
    <>
      <Titulo
        titulo="Los detalles"
        bajada={<>
          Con esto arranca la app cada vez que la abrís. Son los tres valores
          que más se tocan, y están todos en Configuración si querés cambiarlos
          más adelante.
        </>}
      />

      <div style={{ margin: 'var(--s-6) 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="lbl" style={{ fontSize: 'var(--t-4)' }}>Radio de búsqueda</span>
          <span className="lbl" style={{
            marginLeft: 'auto', color: 'var(--acento)', fontSize: 'var(--t-4)',
          }}>{formatRadius(radio)}</span>
        </div>
        <input
          className="range" type="range" min={300} max={15000} step={100}
          value={radio}
          onChange={e => { fb.paso(); onRadio(Number(e.target.value)) }}
          style={{
            marginTop: 'var(--s-2)',
            ['--fill' as string]: `${((radio - 300) / (15000 - 300)) * 100}%`,
          }}
        />
        <Ayuda>Con cuánto a la redonda abren el mapa y la lista.</Ayuda>
      </div>

      <Campo label="Moneda" htmlFor="moneda"
        ayuda={'La de los bares que cargues a mano. Si elegís el bar del '
          + 'buscador, la moneda sale del país. Los precios se muestran siempre '
          + 'en la moneda del bar: no se convierte nada.'}>
        <CurrencySelect id="moneda" value={moneda} onChange={onMoneda} />
      </Campo>

      <Campo label="Tamaño del vaso" htmlFor="tamano"
        ayuda="Con qué tamaño arranca el teclado de precio. Una pinta son 473 ml acá, y 568 en el Reino Unido.">
        <select
          id="tamano" className="lbl" value={tamano}
          onChange={e => onTamano(Number(e.target.value))}
          style={{
            padding: '8px 12px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
            background: 'var(--elevated)', color: 'var(--cream)',
            border: '1px solid var(--hairline)',
          }}
        >
          {[330, 355, 473, 500, 568, 1000].map(ml => (
            <option key={ml} value={ml}>
              {ml} ml{ml === 473 ? ' — pinta' : ml === 568 ? ' — pinta UK' : ''}
            </option>
          ))}
        </select>
      </Campo>
    </>
  )
}

/**
 * El cuarto paso: las dos cosas de la app que no se adivinan mirándola.
 *
 * **Se explican acá y en ningún otro lado.** Las dos vivían como letra chica
 * permanente en la pantalla donde aparecen —un renglón bajo la nota del bar,
 * otro bajo la barra de nivel— y eso es el peor lugar posible: se entienden
 * una vez y después son ruido para siempre, todos los días, en la pantalla que
 * más se mira. Dicho una vez acá, la pantalla queda limpia.
 *
 * Son estas tres y no más. El resto de la app se explica solo o se explica con
 * el tutorial; éstas no, porque las tres contradicen lo que uno supondría: que
 * el nivel sube y no baja, que la nota de un bar es del bar, y que anotar una
 * birra sin decir dónde cuenta igual que anotarla con bar.
 */
function PasoComoFunciona() {
  return (
    <>
      <Titulo
        titulo="Tres cosas y arrancamos"
        bajada="Lo único de la app que no se entiende mirándola."
      />

      <Punto titulo="Tu nivel puede bajar">
        Sale de las birras que anotaste en los <strong>últimos 45 días</strong>,
        no del total de siempre. Si dejás de anotar, baja. Por eso dice cómo
        venís y no cuánto acumulaste alguna vez.
      </Punto>

      <Punto titulo="Anotá dónde te la tomaste">
        Decir en qué bar es opcional, pero <strong>las birras sin bar no entran
        en la tabla de quién tomó más por la zona</strong>: sin bar no hay forma
        de ubicarlas, y esa tabla es por cercanía. Es un toque más y es lo que
        te pone en el ranking.
      </Punto>

      <Punto titulo="La nota es de las birras, no del bar">
        Se puntúa cada birra arrastrando el dedo sobre las estrellas, de a medio
        punto. La nota que ves arriba de un bar es el promedio de las notas de
        sus birras — no es una opinión sobre el lugar, la música ni la moza.
      </Punto>
    </>
  )
}

/** Un punto del último paso: título corto y un párrafo. */
function Punto({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: 'var(--s-6) 0 0' }}>
      <h2 className="lbl" style={{
        margin: 0, fontSize: 'var(--t-4)', color: 'var(--cream)',
      }}>{titulo}</h2>
      <p style={{
        margin: 'var(--s-2) 0 0', fontSize: 'var(--t-3)',
        color: 'var(--muted)', lineHeight: 1.6,
      }}>{children}</p>
    </div>
  )
}

/**
 * Tres rayitas, una por paso.
 *
 * Existe para contestar "¿cuánto falta?" antes de que la pregunta se convierta
 * en "¿esto cuándo termina?". Sin ninguna señal de largo, el segundo paso de
 * una lista larga se siente como si fueran infinitos.
 */
function Progreso({ paso }: { paso: number }) {
  return (
    <div role="group" aria-label={`Paso ${paso + 1} de ${PASOS}`}
      style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: PASOS }, (_, i) => (
        <span key={i} aria-hidden style={{
          height: 3, flex: 1, borderRadius: 2,
          background: i <= paso ? 'var(--acento)' : 'var(--film-2)',
          transition: 'background-color .2s ease-out',
        }} />
      ))}
    </div>
  )
}

function Titulo({ titulo, bajada }: { titulo: string; bajada: React.ReactNode }) {
  return (
    <>
      <h1 className="ttl" style={{
        fontSize: 'var(--t-7)', margin: 'var(--s-5) 0 0',
      }}>{titulo}</h1>
      <p style={{
        color: 'var(--muted)', fontSize: 'var(--t-3)',
        margin: 'var(--s-2) 0 0', lineHeight: 1.5,
      }}>{bajada}</p>
    </>
  )
}

function Campo({ label, htmlFor, ayuda, children }: {
  label: string; htmlFor: string; ayuda: string; children: React.ReactNode
}) {
  return (
    <div style={{ margin: 'var(--s-6) 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        <label className="lbl" htmlFor={htmlFor} style={{ fontSize: 'var(--t-4)' }}>{label}</label>
        <span style={{ marginLeft: 'auto' }}>{children}</span>
      </div>
      <Ayuda>{ayuda}</Ayuda>
    </div>
  )
}

function Ayuda({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      color: 'var(--faint)', fontSize: 'var(--t-2)',
      margin: 'var(--s-2) 0 0', lineHeight: 1.5,
    }}>{children}</p>
  )
}

function Grupo({ titulo, elegidos, children }: {
  titulo: string; elegidos: number; children: React.ReactNode
}) {
  return (
    <section style={{ margin: 'var(--s-5) 0 0' }}>
      <h2 className="section-label" style={{
        display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 var(--s-3)',
      }}>
        {titulo.toUpperCase()}
        {elegidos > 0 && (
          <span className="num" style={{ color: 'var(--acento)' }}>{elegidos}</span>
        )}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
    </section>
  )
}
