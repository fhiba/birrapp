import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import type { BeerStyle, Brand, User } from '../data/types'
import { chipStyle } from '../ui/PillRow'

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
  user, styles, brands, onSession,
}: {
  user: User | null
  styles: BeerStyle[]
  brands: Brand[]
  onSession: () => void
}) {
  const nav = useNavigate()
  const [estilos, setEstilos] = useState<string[]>(user?.favoriteStyles ?? [])
  const [marcas, setMarcas] = useState<string[]>(user?.favoriteBrands ?? [])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * Sin sesión, a Perfil — con `<Navigate>` y no llamando a `nav()` acá.
   *
   * Llamarlo durante el render es navegar mientras React está dibujando, o sea
   * pedirle al router que se actualice desde adentro del render de otro
   * componente. React lo marca en consola ("Cannot update a component while
   * rendering a different component") y el cambio de ruta queda para después
   * del commit igual, así que no se gana nada. `<Navigate>` hace lo mismo en
   * el momento correcto y sin el aviso.
   */
  if (!user) return <Navigate to="/perfil" replace />

  const alternar = (lista: string[], set: (v: string[]) => void, slug: string) => {
    if (lista.includes(slug)) set(lista.filter(s => s !== slug))
    else if (lista.length < MAX) set([...lista, slug])
  }

  /*
   * Los dos grupos son independientes, y guardar tiene que respetarlo.
   *
   * Antes esto mandaba SIEMPRE los dos campos, aunque sólo hubieras tocado
   * uno. En el servidor, un campo presente se escribe y uno ausente no se
   * toca, así que mandar `favoriteBrands: []` por no haber elegido ninguna
   * marca no era "no elegí marcas": era "borrame las marcas". Quien entraba a
   * agregar un estilo se llevaba puestas las marcas que ya tenía guardadas, y
   * desde adentro parecía que la pantalla te obligaba a configurar las dos
   * cosas juntas.
   *
   * Ahora viaja sólo lo que cambió. Elegir estilos y nada más deja las marcas
   * como estaban, y viceversa.
   */
  const mismos = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i])
  const cambioEstilos = !mismos(estilos, user.favoriteStyles)
  const cambioMarcas = !mismos(marcas, user.favoriteBrands)
  const hayCambios = cambioEstilos || cambioMarcas

  const guardar = async () => {
    // Nada tocado: salir es salir. Una consulta que no cambia nada igual
    // tarda, y mientras tanto el botón dice "Guardando…" sobre la nada.
    if (!hayCambios) return salir()
    setGuardando(true); setError(null)
    try {
      const u = await api.updateMe({
        ...(cambioEstilos ? { favoriteStyles: estilos } : {}),
        ...(cambioMarcas ? { favoriteBrands: marcas } : {}),
      })
      api.updateSessionUser(u)
      onSession()
      salir()
    } catch (e) {
      setError((e as Error).message)
      setGuardando(false)
    }
  }

  // Siempre se vuelve de donde se entró. La variante "recién logueado" se la
  // llevó la bienvenida (`Onboarding`), que es la única que llegaba sin
  // historial atrás; acá se entra desde Configuración y de ningún otro lado.
  const salir = () => nav(-1)

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(10px + var(--safe-top)) 0 calc(96px + var(--nav-gap))`,
    }}>
      <div className="desk-narrow">
        <div style={{ padding: '0 18px' }}>
          <button onClick={() => nav(-1)} className="icon-btn"
            style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>
          <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: '16px 0 0' }}>
            Tus birras
          </h1>
          <p style={{
            color: 'var(--muted)', fontSize: 'var(--t-3)', margin: '8px 0 0', lineHeight: 1.5,
          }}>
            En cada bar se muestran tres birras y el resto queda detrás del{' '}
            <span className="lbl">⋯</span>. Marcá las tuyas y van a ser esas tres.
            {' '}Podés marcar sólo estilos, sólo marcas o las dos cosas, y
            cambiarlo cuando quieras.
          </p>
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
          quedar al final de un scroll de cincuenta marcas.

          Los dos botones llevan `.cta`, el hundido compartido de theme.css: es
          lo único que acusa el tap mientras la red tarda, y sin eso "Listo" se
          toca dos veces. */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        padding: `var(--s-3) 18px calc(var(--s-3) + var(--safe-bottom))`,
        background: 'var(--base)', borderTop: '1px solid var(--hairline)',
        display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <div className="desk-narrow" style={{ width: '100%' }}>
          {/* El error va acá arriba y no al principio de la pantalla.
              Estaba debajo del título, o sea a un scroll de cincuenta marcas
              del botón que lo dispara: tocabas "Listo", no pasaba nada visible
              y el motivo quedaba arriba de todo, fuera de pantalla. */}
          {error && (
            <p role="alert" style={{
              color: 'var(--danger)', fontSize: 'var(--t-2)',
              margin: '0 0 var(--s-2)', lineHeight: 1.5,
            }}>{error}</p>
          )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
          {/* Saltear sin culpa: esto mejora la app, no la habilita. */}
          <button onClick={salir} className="lbl cta" style={{
            minHeight: 44, padding: 'var(--s-3) var(--s-4)', fontSize: 'var(--t-3)',
            color: 'var(--info)',
          }}>Cancelar</button>

          <button
            onClick={guardar} disabled={guardando} className="lbl cta"
            style={{
              flex: 1, minHeight: 46, padding: 'var(--s-3)', borderRadius: 'var(--r-2)',
              fontSize: 'var(--t-4)',
              background: guardando ? 'var(--acento-busy)' : 'var(--acento)',
              color: 'var(--base)',
            }}
          >{guardando ? 'Guardando…' : 'Listo'}</button>
        </div>
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
      <h2 className="section-label" style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-2)',
      }}>
        {titulo.toUpperCase()}
        {/* El contador va en hueso y no en el tono de la etiqueta: si los dos
            fueran `--info` el número se perdería adentro del título. La
            jerarquía queda cifra brillante sobre etiqueta apagada, que es la
            misma de una baldosa de perfil. */}
        {elegidos > 0 && (
          <span className="num" style={{ color: 'var(--cream)' }}>{elegidos}</span>
        )}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>{children}</div>
    </section>
  )
}

/**
 * Una birra que se marca o se desmarca.
 *
 * Apagado pasa de relleno a contorno. Con cincuenta marcas rellenas, la
 * pantalla era un muro de pastillas grises y lo elegido no saltaba: la única
 * diferencia entre "esta sí" y "esta no" era un gris apenas más claro. Con el
 * contorno, lo marcado es lo único que tiene relleno y el ojo lo encuentra sin
 * leer.
 *
 * El color del prendido sale de `chipStyle`, el mismo que usa la ficha del bar,
 * y no de una copia local: acá el chip se pintaba en hueso lleno y en el resto
 * de la app en la familia `--info`, así que la misma pieza decía dos cosas
 * según la pantalla. Y el hueso es el color del botón que manda —"Listo" está
 * a dos centímetros—, no el de "esto lo elegí". Acá quedan sólo la forma y el
 * alto, que sí son de esta pantalla.
 *
 * Y sube a 44px de alto. Antes medía 38 y son botones que se tocan de a diez
 * seguidos: cada fallo obliga a desmarcar y volver a marcar.
 */
/** Se exporta porque la bienvenida elige las mismas birras con las mismas
 *  pastillas: dos juegos de chips para la misma decisión se despegan solos. */
export function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} aria-pressed={on} className="lbl"
      style={{
        ...chipStyle(on),
        display: 'inline-flex', alignItems: 'center', minHeight: 44,
        padding: '0 var(--s-4)', borderRadius: 999, fontSize: 'var(--t-3)',
        transition: 'background-color .15s ease-out, color .15s ease-out',
      }}
    >{label}</button>
  )
}
