import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import * as fb from '../data/feedback'
import type { Person, User } from '../data/types'
import { formatRadius } from '../data/format'
import { AvatarPicker } from '../ui/AvatarPicker'
import { Confirm, Toast } from '../ui/Chrome'
import { CurrencySelect } from '../ui/CurrencySelect'
import { SectionLabel } from '../ui/Kit'

/**
 * Configuración de la cuenta.
 *
 * Existe porque la app dejó de ser sólo de Buenos Aires: con bares de
 * cualquier parte del mundo hay que poder decir en qué moneda cobra el bar que
 * estás cargando, y una pinta no mide lo mismo acá que en el Reino Unido.
 *
 * Se lleva también el nombre, la foto y el borrado de cuenta, que vivían
 * sueltos en el perfil. El perfil pasa a ser lo que mostrás —tus aportes, tus
 * birras— y esto lo que configurás.
 *
 * Cada control guarda al tocarlo, sin botón de "guardar": son cuatro
 * preferencias sueltas, no un formulario. Un botón obligaría a acordarse de
 * apretarlo y sería la forma más fácil de perder un cambio.
 */
export function SettingsScreen({ user, onSession }: {
  user: User | null
  onSession: () => void
}) {
  const nav = useNavigate()
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState(user?.displayName ?? '')
  const [alias, setAlias] = useState(user?.alias ?? '')
  const [sonido, setSonido] = useState(fb.sonidoPrendido())
  const [vibrar, setVibrar] = useState(fb.vibrarPrendido())
  // Quiénes están bloqueados. Acá y no en otra pantalla: es el único lugar
  // desde donde se puede deshacer, y un bloqueo que no se puede levantar es
  // una decisión que quedó para siempre por un toque.
  const [blocked, setBlocked] = useState<Person[]>([])
  /**
   * El radio, mientras se arrastra.
   *
   * Hace falta estado local por dos razones: que el número de arriba se mueva
   * con el dedo —si mostrara el guardado, se queda quieto hasta soltar y
   * parece roto— y que guardar no dispare una consulta por cada pixel.
   */
  const [radius, setRadius] = useState(user?.defaultRadiusM ?? 2000)
  const loadBlocked = () => { api.blockedPeople().then(setBlocked).catch(() => {}) }
  useEffect(loadBlocked, [])

  /** El temporizador que espera a que el slider se quede quieto. */
  const guardarRadio = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(guardarRadio.current), [])

  if (!user) {
    nav('/perfil', { replace: true })
    return null
  }

  const guardar = async (
    cambio: Parameters<typeof api.updateMe>[0], aviso: string,
  ) => {
    setError(null)
    try {
      api.updateSessionUser(await api.updateMe(cambio))
      onSession()
      setToast(aviso)
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, overflowY: 'auto',
      padding: `calc(18px + var(--safe-top)) 22px calc(40px + var(--nav-gap))`,
    }}>
      <div className="desk-narrow">
        <button onClick={() => nav(-1)} className="icon-btn" style={{ background: 'var(--elevated)' }} aria-label="Volver">←</button>

        <h1 className="ttl" style={{ fontSize: 'var(--t-7)', margin: '16px 0 0' }}>Configuración</h1>

        <SectionLabel>Tu cuenta</SectionLabel>

        <AvatarPicker
          user={user}
          onChange={u => { api.updateSessionUser(u); onSession() }}
        />

        <label className="lbl" style={{
          display: 'block', fontSize: 'var(--t-2)', color: 'var(--muted)', margin: '24px 0 8px',
        }} htmlFor="nombre">Cómo te llamás</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="nombre" value={name} onChange={e => setName(e.target.value)}
            maxLength={60}
            style={{
              flex: 1, minWidth: 0, padding: '12px 16px', borderRadius: 'var(--r-2)',
              background: 'var(--elevated)', border: '1px solid var(--hairline)',
              fontSize: 'var(--t-field)',
            }}
          />
          {/* Este sí lleva botón: el campo no sabe cuándo terminaste de
              escribir, y guardar por cada tecla sería una consulta por letra. */}
          <button
            disabled={name.trim() === user.displayName || name.trim().length < 2}
            onClick={() => guardar({ displayName: name.trim() }, 'Nombre cambiado')}
            className="lbl cta"
            style={{
              padding: '0 16px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
              background: name.trim() !== user.displayName && name.trim().length >= 2
                ? 'var(--acento)' : 'var(--elevated)',
              color: name.trim() !== user.displayName && name.trim().length >= 2
                ? 'var(--base)' : 'var(--faint)',
            }}
          >Guardar</button>
        </div>
        <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '8px 0 0' }}>
          Es el nombre con el que aparecen tus aportes. {user.email} no se muestra
          en ningún lado.
        </p>

        <label className="lbl" style={{
          display: 'block', fontSize: 'var(--t-2)', color: 'var(--muted)', margin: '24px 0 8px',
        }} htmlFor="alias">Tu alias público</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="alias" value={alias} onChange={e => setAlias(e.target.value)}
            maxLength={20} placeholder="Sin alias"
            style={{
              flex: 1, minWidth: 0, padding: '12px 16px', borderRadius: 'var(--r-2)',
              background: 'var(--elevated)', border: '1px solid var(--hairline)',
              fontSize: 'var(--t-field)',
            }}
          />
          <button
            disabled={alias.trim() === (user.alias ?? '')}
            onClick={() => guardar(
              { alias: alias.trim() },
              alias.trim() ? 'Alias guardado' : 'Alias sacado',
            )}
            className="lbl cta"
            style={{
              padding: '0 16px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-3)',
              background: alias.trim() !== (user.alias ?? '') ? 'var(--acento)' : 'var(--elevated)',
              color: alias.trim() !== (user.alias ?? '') ? 'var(--base)' : 'var(--faint)',
            }}
          >Guardar</button>
        </div>
        {/*
          El texto importa tanto como el campo: esto decide si tu nombre
          aparece en una página pública, y eso tiene que quedar dicho antes de
          que alguien escriba algo, no después.
        */}
        <p style={{ color: 'var(--faint)', fontSize: 'var(--t-2)', margin: '8px 0 0', lineHeight: 1.5 }}>
          Es el único nombre que se muestra en{' '}
          <button onClick={() => nav('/colaboradores')} style={{
            color: 'var(--acento)', textDecoration: 'underline', textUnderlineOffset: 3,
          }}>Colaboradores</button>, la tabla pública del mes.{' '}
          {user.alias
            ? 'Borralo y dejás de figurar; tus aportes siguen contando igual.'
            : 'Sin alias no figurás, y tu nombre no se publica en ningún lado.'}
        </p>

        {/* Las birras favoritas viven acá y no en su propia sección: son una
            preferencia de cuenta, igual que el alias y el nombre.

            Fila con filete y no tarjeta: una tarjeta por ajuste hacía que cinco
            preferencias sueltas se leyeran como cinco bloques aparte, cuando
            son renglones de una misma lista. El filete alcanza para separarlas
            y deja el peso visual para el único bloque que sí es otra cosa, que
            es la zona de riesgo.

            El chevron pasa a `--info`: llevar a otra pantalla es acción
            secundaria, no un metadato apagado más. */}
        <div style={{
          marginTop: 'var(--s-5)', padding: 'var(--s-3) 2px',
          borderBottom: '1px solid var(--hairline)',
        }}>
          <button onClick={() => nav('/preferencias')} className="lbl" style={{
            display: 'flex', alignItems: 'center', gap: 'var(--s-3)', width: '100%',
            minHeight: 44, textAlign: 'left', fontSize: 'var(--t-4)', color: 'var(--cream)',
          }}>
            <span style={{ flex: 1 }}>Tus birras favoritas</span>
            <span className="num" style={{ color: 'var(--faint)', fontSize: 'var(--t-3)' }}>
              {user.favoriteStyles.length + user.favoriteBrands.length || '—'}
            </span>
            <span aria-hidden style={{ color: 'var(--info)' }}>›</span>
          </button>
          <p style={{
            color: 'var(--faint)', fontSize: 'var(--t-2)', margin: 'var(--s-2) 0 0',
            lineHeight: 1.5, textWrap: 'pretty',
          }}>
            Deciden cuáles son las tres birras que se ven primero en cada bar.
          </p>
        </div>

        <SectionLabel>Avisos</SectionLabel>
        {/* Los dos por separado y no un solo interruptor: en un bar con gente
            el sonido molesta y la vibración no, y quien quiera apagar uno casi
            nunca quiere apagar el otro. */}
        <Interruptor
          label="Vibración"
          hint="Un toque corto al votar, confirmar un precio o marcar un favorito."
          on={vibrar}
          onChange={v => { setVibrar(v); fb.setVibrar(v); if (v) fb.tap() }}
        />
        <Interruptor
          label="Sonido"
          hint="Lo mismo, con un tono corto. En iPhone es el único de los dos que funciona."
          on={sonido}
          onChange={v => { setSonido(v); fb.setSonido(v); if (v) fb.tap() }}
        />

        <SectionLabel>Al cargar precios</SectionLabel>

        <Field
          label="Moneda"
          hint={'La de los bares que cargues a mano. Si elegís el bar del buscador, '
            + 'la moneda sale del país y esto no se usa. Los precios se muestran '
            + 'siempre en la moneda del bar: no se convierte nada.'}
        >
          <CurrencySelect
            value={user.currency}
            onChange={v => guardar({ currency: v }, 'Moneda cambiada')}
          />
        </Field>

        <Field
          label="Tamaño del vaso"
          hint="Con qué tamaño arranca el teclado de precio. Una pinta son 473 ml acá y en Estados Unidos, y 568 en el Reino Unido."
        >
          <select
            className="lbl" value={user.defaultSizeMl}
            onChange={e => guardar(
              { defaultSizeMl: Number(e.target.value) }, 'Tamaño cambiado',
            )}
            /* `--t-field` y no un paso de la escala: abajo de 16px Safari iOS
               hace zoom al enfocar el campo y no lo devuelve. La red de
               theme.css ya lo pone, pero el `style` inline le gana por
               especificidad, así que acá hay que nombrarlo. Mismo caso que
               CurrencySelect. */
            style={{
              padding: '8px 12px', borderRadius: 'var(--r-2)', fontSize: 'var(--t-field)',
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
        </Field>

        <SectionLabel>Al abrir la app</SectionLabel>

        <div style={{
          padding: 'var(--s-3) 2px', borderBottom: '1px solid var(--hairline)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
            <span className="lbl" style={{ fontSize: 'var(--t-4)' }}>Radio de búsqueda</span>
            {/* El radio es dato informativo —de los que ahora lleva `--info`— y
                es un número que se compara con el de la última vez, así que va
                tabular. En `--acento` competía con el CTA de guardar. */}
            <span className="num" style={{
              marginLeft: 'auto', color: 'var(--info)', fontSize: 'var(--t-4)',
            }}>{formatRadius(radius)}</span>
          </div>
          {/*
            Se dibuja con cada cambio y se guarda medio segundo después de que
            se dejó de mover.
            
            Antes guardaba en `onPointerUp`, que parecía suficiente y dejaba
            afuera al teclado: con las flechas se movía el control y no se
            guardaba nunca. Y el número de arriba mostraba el valor guardado,
            así que se quedaba quieto mientras se arrastraba.
          */}
          <input
            className="range" type="range" min={300} max={15000} step={100}
            value={radius}
            onChange={e => {
              const v = Number(e.target.value)
              setRadius(v)
              clearTimeout(guardarRadio.current)
              guardarRadio.current = setTimeout(
                () => guardar({ defaultRadiusM: v }, 'Radio cambiado'), 500,
              )
            }}
            style={{
              marginTop: 'var(--s-2)',
              ['--fill' as string]: `${((radius - 300) / (15000 - 300)) * 100}%`,
            }}
          />
          <p style={{
            color: 'var(--faint)', fontSize: 'var(--t-2)', margin: 'var(--s-2) 0 0',
            textWrap: 'pretty',
          }}>
            Con cuánto a la redonda abre el mapa y la lista.
          </p>
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)', marginTop: 'var(--s-4)' }}>{error}</p>
        )}

        {blocked.length > 0 && (
          <>
            <SectionLabel>Personas bloqueadas</SectionLabel>
            {blocked.map(p => (
              <div key={p.id} className="row" style={{ minHeight: 44 }}>
                <button onClick={() => nav(`/usuario/${p.id}`)} className="lbl" style={{
                  flex: 1, minWidth: 0, textAlign: 'left', fontSize: 'var(--t-4)',
                }}>{p.displayName}</button>
                {/* Desbloquear es acción secundaria, no el CTA de la pantalla:
                    en hueso pesaba lo mismo que "Guardar". */}
                <button
                  onClick={async () => {
                    await api.unblockPerson(p.id).catch(() => {})
                    setToast(`Desbloqueaste a ${p.displayName}`)
                    loadBlocked()
                  }}
                  className="lbl"
                  style={{ fontSize: 'var(--t-3)', color: 'var(--info)' }}
                >Desbloquear</button>
              </div>
            ))}
            <p style={{
              color: 'var(--faint)', fontSize: 'var(--t-2)', margin: 'var(--s-3) 0 0',
              lineHeight: 1.5, textWrap: 'pretty',
            }}>
              Con alguien bloqueado, ninguno de los dos ve los comentarios ni las
              fotos del otro. Los precios que cargó siguen en el mapa: son datos
              sobre bares.
            </p>
          </>
        )}

        <SectionLabel>Zona de riesgo</SectionLabel>
        {/* Lo destructivo se dibuja con borde y no con relleno: el relleno
            coral era un hex suelto y además se leía como un CTA, que es
            justo lo que no tiene que parecer el botón que borra la cuenta.
            La confirmación con palabra escrita sigue igual — el borde no la
            reemplaza, la anuncia. */}
        <button onClick={() => setConfirmDelete(true)} className="lbl cta" style={{
          width: '100%', minHeight: 52, padding: 'var(--s-4)',
          borderRadius: 'var(--r-2)', border: '1px solid var(--danger)',
          textAlign: 'left', fontSize: 'var(--t-4)',
          background: 'transparent', color: 'var(--danger)',
        }}>Borrar mi cuenta</button>
      </div>

      {confirmDelete && (
        <Confirm
          title="¿Borrar tu cuenta?"
          body={<>
            Se borra tu cuenta, tus reseñas y tu sesión. No se puede deshacer.
            <br /><br />
            Los precios que cargaste quedan en el mapa, pero sin tu nombre: son
            datos sobre bares, no sobre vos, y borrarlos dejaría peor informado
            a todo el mundo.
          </>}
          confirmLabel="Borrar cuenta" danger requireWord="BORRAR"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false)
            try { await api.deleteAccount(); onSession(); nav('/') }
            catch (e) { setError((e as Error).message) }
          }}
        />
      )}

      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function Field({ label, hint, children }: {
  label: string; hint: string; children: React.ReactNode
}) {
  return (
    <div style={{
      padding: 'var(--s-3) 2px', borderBottom: '1px solid var(--hairline)',
    }}>
      {/* El filete hace de separador y de agrupador a la vez: el `marginBottom`
          suelto que había antes separaba igual, pero no decía dónde termina un
          ajuste y empieza el siguiente cuando la explicación es de tres
          renglones. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-3)', minHeight: 44,
      }}>
        <span className="lbl" style={{ flex: 1, fontSize: 'var(--t-4)' }}>{label}</span>
        {children}
      </div>
      <p style={{
        color: 'var(--faint)', fontSize: 'var(--t-2)', margin: 'var(--s-2) 0 0',
        lineHeight: 1.5, textWrap: 'pretty',
      }}>{hint}</p>
    </div>
  )
}

/** Un interruptor con su explicación, para las preferencias de a dos estados. */
function Interruptor({ label, hint, on, onChange }: {
  label: string; hint: string; on: boolean; onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch" aria-checked={on}
      className="lbl row"
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--t-4)', color: 'var(--cream)' }}>
          {label}
        </span>
        <span style={{
          display: 'block', fontSize: 'var(--t-2)', color: 'var(--muted)',
          marginTop: 2, lineHeight: 1.4, whiteSpace: 'normal', textWrap: 'pretty',
        }}>{hint}</span>
      </span>
      {/* Riel y perilla, que es lo que se reconoce como interruptor. Una tilde
          diría "elegido de una lista" y esto es prendido/apagado.

          Las medidas son las de la dirección heritage —51x31 de pista, perilla
          de 27— y no las de antes (44x26): un interruptor más chico que el del
          sistema se toca peor y encima se lee como una maqueta.

          Prendido va en `--info` y no en el acento hueso: prendido/apagado es
          un estado, y el hueso es el color de lo que se toca. Con el acento, un
          interruptor prendido y el botón "Guardar" de arriba eran el mismo
          color a dos centímetros. La perilla se queda en hueso con sombra
          porque es la pieza que se mueve y tiene que despegarse de la pista. */}
      <span aria-hidden style={{
        flexShrink: 0, width: 51, height: 31, borderRadius: 16, padding: 2,
        background: on ? 'var(--info)' : 'var(--elevated)',
        display: 'flex', alignItems: 'center',
        transition: 'background-color .2s ease-out',
      }}>
        <span style={{
          width: 27, height: 27, borderRadius: 14, background: 'var(--cream)',
          boxShadow: '0 1px 3px rgba(0,0,0,.4)',
          transform: on ? 'translateX(20px)' : 'none',
          transition: 'transform .2s ease-out',
        }} />
      </span>
    </button>
  )
}
