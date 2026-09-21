import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as api from '../data/api'
import { clearCached, useCached } from '../data/cached'
import type { BarPin, User, UserStats } from '../data/types'
import { isModerator } from '../data/types'
import { Confirm } from '../ui/Chrome'
import { forceUpdate } from '../data/update'
import { resetTour, tourPending } from '../ui/Tour'
import { SectionLabel, Tile } from '../ui/Kit'
import { nivelDe } from '../data/nivel'
import { PriceColumn } from '../ui/Empty'

export function ProfileScreen({ user, onSession }: {
  user: User | null
  onSession: () => void
}) {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'out' | null>(null)
  const [pendingWork, setPendingWork] = useState(0)

  /*
   * Los cinco números de la grilla, en un solo pedido y pintados de entrada
   * con lo último que se supo (BIR-43).
   *
   * Eran dos viajes y el segundo era `/beers/summary`, que arma el calendario
   * del mes, las rachas, los bares top y los emblemas — la consulta más cara
   * de la pantalla, para leerle `total`. Ahora el contador de birras viene con
   * el resto de los contadores.
   *
   * Y no se arranca en blanco: `useCached` pinta lo guardado al instante y
   * pregunta igual, siempre. Ver el porqué de esa estrategia en `cached.ts`.
   */
  const { data: stats } = useCached<UserStats>(
    user ? `stats:${user.id}` : null,
    api.myStats,
  )

  useEffect(() => {
    // Sólo los números, no las listas: es un endpoint aparte para no bajarse
    // los bares pendientes y sus reportes enteros para dibujar un número.
    if (isModerator(user)) {
      api.moderationSummary()
        .then(s => setPendingWork(
          s.pendingBars + s.openFlags + s.pendingBrands + s.pendingStyles,
        ))
        .catch(() => {})
    }
  }, [user])

  /*
   * El nivel sale de las birras de los últimos 45 días, no del total.
   *
   * Mientras `stats` no llegó se dibuja el nivel de cero y no un esqueleto: es
   * el nivel real de quien todavía no anotó ninguna, así que en el peor caso
   * la barra se mueve una vez —igual que los contadores de abajo, que
   * `useCached` también pinta con lo último que supo—.
   */
  const nivel = nivelDe(stats?.beersRecent ?? 0)

  const login = async () => {
    setBusy(true); setError(null)
    try {
      const { authorizeUrl } = await api.startBrowserLogin()
      // Redirección completa, no popup: los popups se bloquean y en iOS
      // dentro de una PWA directamente no abren.
      location.href = authorizeUrl
    } catch {
      setBusy(false)
      setError('No pudimos abrir el inicio de sesión. Revisá tu conexión.')
    }
  }

  if (!user) return (
    <Wrap>
      <h1 className="ttl" style={{ fontSize: 'var(--t-8)', margin: 0 }}>birrapp</h1>
      <p style={{ color: 'var(--muted)', margin: '12px 0 24px' }}>
        Para cargar precios hace falta una cuenta. Mirar el mapa no.
      </p>
      {/* El CTA primario de la pizarra: hueso lleno, texto espresso, `--r-2` y
          52 de alto — acá el botón es la pantalla entera, así que va el alto
          grande y no el de contexto apretado.

          `.cta` es el hundido al tocar, que inline no se puede escribir: sin
          respuesta al toque, en una red lenta se aprieta dos veces y se abren
          dos inicios de sesión.

          Mientras trabaja baja a `--acento-busy` y no a `--acento-deep`, que es
          azul acero y haría virar de familia al botón justo cuando hay que
          creerle que está andando. */}
      <button onClick={login} disabled={busy} className="lbl cta" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--s-3)',
        width: '100%', minHeight: 52, borderRadius: 'var(--r-2)',
        background: busy ? 'var(--acento-busy)' : 'var(--acento)',
        color: 'var(--base)', fontSize: 'var(--t-4)',
      }}>
        {busy ? <span className="spinner" /> : <><GoogleG /> Continuar con Google</>}
      </button>
      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--t-3)', marginTop: 'var(--s-4)' }}>
          {error}
        </p>
      )}
      <Footer />
    </Wrap>
  )

  return (
    <Wrap>
      {/* El título de la pantalla, con la tuerca y el salir en su renglón.
          
          Las otras tres pestañas tienen título y ésta arrancaba con la cara;
          con la barra de abajo mostrando las cuatro etiquetas, un encabezado
          que dice dónde estás cierra el par.
          
          Los dos botones viven acá y no abajo con el nombre. Son controles de
          la PANTALLA —configurarla, salir de ella—, no datos de la persona, y
          en el renglón del nombre competían por ancho con un mail largo: la
          fila tenía 56 de foto + 44 + 44 antes de que el nombre tuviera a dónde
          ir. Arriba, a la altura del título, ocupan un renglón que estaba vacío
          y le devuelven 88px al nombre. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
        margin: '0 0 var(--s-4)', paddingBottom: 'var(--s-3)',
        borderBottom: '1px solid var(--hairline)',
      }}>
        <h1 className="ttl" style={{
          flex: 1, minWidth: 0, fontSize: 'var(--t-7)', margin: 0,
        }}>Perfil</h1>
        <BotonesDeSesion onConfig={() => nav('/config')} onSalir={() => setConfirm('out')} />
      </div>

      {/* La fila de quién sos: cara, nombre y nivel, y nada más.
          
          Antes cargaba también la tuerca y el botón de salir, o sea 88px de
          controles peleando ancho con un mail de veinte caracteres. Con esos
          dos arriba en el título, lo único que queda a la derecha es el
          emblema, que sí habla de la persona. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-3)' }}>
        {/* La foto se edita en configuración; acá sólo se ve. Un perfil sin
            cara es una lista de números con un nombre arriba.

            Cuadrado con esquina blanda y no círculo: es la forma que usa la
            dirección para los avatares —la misma de las iniciales de cada
            comentario en la ficha del bar— y el círculo era la única esquina
            redonda que quedaba en una pantalla de filetes. Sin foto, las
            iniciales van en la familia informativa, que es donde la pizarra
            manda todo lo que identifica sin ser el dato. */}
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" width={56} height={56}
            style={{ borderRadius: 'var(--r-2)', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div className="num" aria-hidden style={{
            width: 56, height: 56, borderRadius: 'var(--r-2)', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: 'var(--info-soft)', border: '1px solid var(--info-border)',
            color: 'var(--info-bright)', fontSize: 'var(--t-6)',
          }}>{(user.alias ?? user.displayName).charAt(0).toUpperCase()}</div>
        )}

        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {/* `minWidth: 0` en el contenedor deja que la columna se encoja,
              pero no impide que el TEXTO se salga: un nombre de una sola
              palabra larga no tiene dónde cortar y desborda igual. Con
              `overflowWrap: anywhere` corta donde haga falta, y el `overflow:
              hidden` de arriba es el cinturón: pase lo que pase acá adentro,
              no empuja a los botones fuera de la pantalla. */}
          {/* El alias manda sobre el nombre.

              El perfil es la pantalla donde te ves como te ve el resto, y
              afuera —en Colaboradores, en la firma de una foto— el único
              nombre que circula es el alias. Mostrar acá el de Google era
              enseñarte una identidad que nadie más ve, y de paso dejaba sin
              respuesta la única pregunta que importa del alias: cómo quedó.

              Sin alias sigue el nombre, que es lo único que hay. */}
          <h1 className="ttl" style={{
            fontSize: 'var(--t-7)', margin: 0, overflowWrap: 'anywhere',
          }}>{user.alias ?? user.displayName}</h1>
          {/* El mail va en una línea con elipsis, y ésta es la que rompía la
              fila: un mail es un token sin espacios de veinte y pico de
              caracteres, así que se salía de su columna y empujaba la tuerca y
              el botón de salir fuera del ancho de la pantalla. Se veía como
              una tuerca cortada por el borde.

              Elipsis y no corte en dos renglones porque un mail partido al
              medio no se lee mejor que uno recortado, y el dato entero está en
              Configuración. */}
          <p title={user.email} style={{
            color: 'var(--faint)', fontSize: 'var(--t-3)', margin: '4px 0 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{user.email}</p>
        </div>
        {/* El emblema, a la altura del nombre y contra el borde derecho.

            Colgaba debajo de la tuerca y el botón de salir, ocupando el aire
            del mail. Con los dos botones mudados al título ese rincón quedó
            libre, y el emblema puede estar donde corresponde: en el renglón de
            quién sos, que es de lo que habla. Antes compartía columna con dos
            controles de pantalla, o sea el nivel se leía como un tercer botón.

            `alignSelf: center` lo centra contra las dos líneas de la izquierda
            —nombre y mail— en vez de contra la primera sola. */}
        <div style={{ flexShrink: 0, alignSelf: 'center' }}>
          <Emblema nivel={nivel} />
        </div>
      </div>

      {/* El nivel, debajo del nombre y a todo el ancho.

          A lo ancho y no metido en la columna del nombre: ahí compite con un
          mail de veinte caracteres y con los botones, y una barra de progreso
          de ochenta píxeles no se lee como progreso, se lee como un renglón
          más. Acá el número de birras queda a la izquierda, lo que falta a la
          derecha, y la barra debajo cruza la pantalla. */}
      <NivelBarra nivel={nivel} />

      <SectionLabel>Lo tuyo</SectionLabel>
      {/* Cada cuadrado abre SU lista, no una pantalla común con todo apilado.
          Con una sola vista compartida, tocar "Fotos" te dejaba arriba de
          todo y había que scrollear los precios para llegar a las fotos —el
          número que tocaste no era el que te recibía.

          "Birras" es de otra naturaleza que los otros tres: no es un aporte a
          la comunidad, es tu cuenta personal. Va en la misma grilla porque es
          donde uno la busca, y se distingue por el corazón del contador, no
          por estar en otro lado. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
      }} data-tour="profile-stats">
        <Tile label="Precios" value={stats?.prices} onClick={() => nav('/mis-aportes/precios')} />
        <Tile label="Fotos" value={stats?.photos} onClick={() => nav('/mis-aportes/fotos')} />
        <Tile label="Bares" value={stats?.bars} onClick={() => nav('/mis-aportes/bares')} />
        <Tile label="Birras tomadas" value={stats?.beers}
          onClick={() => nav('/mis-birras')} />
      </div>

      <Favoritos userId={user.id} />

      {/* Sin `gap`: las filas se separan con su propio filete. Un hueco entre
          filetes deja la línea flotando y se lee como cinco tarjetas otra vez,
          que es justo lo que la pizarra saca. */}
      <div style={{ marginTop: 'var(--s-6)' }}>
        {/* El contador va acá y no sólo adentro de Moderación: si hay que
            entrar para enterarse de que hay algo que hacer, nadie entra. */}
        {isModerator(user) && (
          <Row label="Moderación" badge={pendingWork} onClick={() => nav('/moderacion')} />
        )}
        {/* Los comentarios no tienen cuadrado: `UserStats` no los cuenta y
            pedir la lista entera para dibujar un número sería traerse todos
            los aportes de la persona cada vez que abre el perfil. */}
        <Row label="Mis comentarios" onClick={() => nav('/mis-aportes/comentarios')} />
        {/* Arriba de "Cómo funcionan los precios" porque es lo que se va a
            mirar seguido, no una sola vez. */}
        <Row label="Colaboradores del mes" onClick={() => nav('/colaboradores')} />
        <Row label="Cómo funcionan los precios" onClick={() => nav('/info')} />
        {/* Se puede volver a ver. Un tutorial que se saltea de un toque y no
            se puede recuperar castiga el toque apurado. */}
        {user && (
          <Row
            label={tourPending(user.id) ? 'Ver el tutorial' : 'Ver el tutorial de nuevo'}
            onClick={() => { resetTour(user.id); nav('/') }}
          />
        )}
      </div>

      <Footer />

      {confirm === 'out' && (
        <Confirm
          title="¿Cerrar sesión?"
          body="Vas a poder seguir mirando el mapa, pero no cargar precios hasta que vuelvas a entrar."
          confirmLabel="Cerrar sesión" danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setConfirm(null); clearCached(); await api.signOut(); onSession()
          }}
        />
      )}
    </Wrap>
  )
}

/**
 * Los bares marcados, en el perfil.
 *
 * Es de la dirección: el perfil muestra los favoritos, no sólo un número que
 * lleva a otra pantalla. Y tiene sentido acá y no en otro lado — un favorito
 * es de la cuenta, no de la zona, así que ésta es la única pantalla donde la
 * lista entera cabe sin que el radio la recorte.
 *
 * Se muestran los primeros y el resto queda a un toque, en la Lista con el
 * ámbito de favoritos puesto. No es paginado: el endpoint devuelve todos, pero
 * treinta filas entre las baldosas y los destinos convierten el perfil en un
 * scroll largo, y el que quiere la lista entera quiere la Lista.
 */
const FAVS_EN_PERFIL = 5

function Favoritos({ userId }: { userId: number }) {
  const nav = useNavigate()
  // Lo mismo que la grilla de números de arriba: se pinta lo guardado al
  // instante y se pregunta igual. Es una lista corta y propia, y la sección
  // entera aparecía medio segundo tarde en cada entrada al perfil.
  const { data: bars } = useCached<BarPin[]>(`favs:${userId}`, api.favorites)

  // La primera vez, mientras no se sabe, no se dibuja nada. Un "Favoritos · 0"
  // que aparece y se corrige medio segundo después es peor que esperar.
  if (bars == null) return null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)' }}>
        <SectionLabel>{`Favoritos · ${bars.length}`}</SectionLabel>
        {bars.length > 0 && (
          <button
            onClick={() => nav('/lista?favoritos=1')}
            className="lbl"
            style={{
              marginLeft: 'auto', color: 'var(--info)', fontSize: 'var(--t-2)',
              minHeight: 44,
            }}
          >Ver en la lista</button>
        )}
      </div>

      {bars.length === 0 ? (
        <p style={{
          margin: 0, fontSize: 'var(--t-3)', color: 'var(--muted)',
          lineHeight: 1.5, textWrap: 'pretty',
        }}>
          Tocá el corazón al final de cualquier fila de la lista —o el de la
          ficha del bar— y el bar queda acá.
        </p>
      ) : bars.slice(0, FAVS_EN_PERFIL).map(b => (
        <button key={b.id} onClick={() => nav(`/bar/${b.id}`)} className="row-hover" style={{
          display: 'flex', alignItems: 'center', gap: 'var(--s-3)', width: '100%',
          padding: 'var(--s-3) 2px', textAlign: 'left',
          borderBottom: '1px solid var(--hairline)',
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden
            fill="var(--favorito)" style={{ flexShrink: 0 }}>
            <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13L12 20.3Z" />
          </svg>
          <span className="lbl" style={{
            flex: 1, minWidth: 0, fontSize: 'var(--t-4)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{b.name}</span>
          {/* La misma columna de siempre: el precio nunca sin su antigüedad. */}
          <PriceColumn
            price={b.fromPrice} currency={b.currency} ageDays={b.freshestAgeDays}
            size="var(--t-5)"
          />
        </button>
      ))}
    </>
  )
}

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    position: 'absolute', inset: 0, overflowY: 'auto',
    padding: `calc(var(--s-6) + var(--safe-top)) var(--s-5) calc(var(--s-7) + var(--s-6) + var(--nav-gap))`,
  }}><div className="desk-narrow">{children}</div></div>
)



/**
 * Un renglón que lleva a otro lado.
 *
 * Eran cinco tarjetas redondeadas apiladas con aire en el medio, y esa forma
 * decía "cada una de estas es un bloque aparte" cuando en realidad son una
 * lista de destinos. La pizarra las deja en filas con filete: mismo toque,
 * misma altura, la mitad del ruido.
 *
 * El chevrón no es adorno — es lo único que distingue "esto te lleva a otra
 * pantalla" de "esto es un dato" una vez que se fue el fondo del botón.
 */
const Row = ({ label, onClick, danger, badge }: {
  label: string; onClick: () => void; danger?: boolean; badge?: number
}) => (
  <button onClick={onClick} className="lbl row row-hover" style={{
    /* Inline queda sólo lo propio de esta fila: el alto, el cuerpo y el color.
       El flex, el gap, el padding y el filete los pone `.row`, que es la misma
       fila que usan `MyBeers`, `Settings` y `Moderation` — estaban copiadas acá
       declaración por declaración. */
    minHeight: 52, fontSize: 'var(--t-4)',
    color: danger ? 'var(--danger)' : 'var(--cream)',
  }}>
    <span style={{ flex: 1 }}>{label}</span>
    {badge != null && badge > 0 && (
      <span className="num" style={{
        minWidth: 22, height: 22, padding: '0 7px', borderRadius: 999,
        display: 'grid', placeItems: 'center', fontSize: 'var(--t-2)',
        background: 'var(--acento)', color: 'var(--base)',
      }}>{badge}</span>
    )}
    <span aria-hidden style={{ color: 'var(--faint)', fontSize: 'var(--t-5)' }}>›</span>
  </button>
)

const Footer = () => (
  <div style={{ marginTop: 'var(--s-6)' }}>
    <p style={{ color: 'var(--faint)', fontSize: 'var(--t-1)', lineHeight: 1.5, margin: 0 }}>
      birrapp {__APP_VERSION__}<br />
      datos de bares © colaboradores de OpenStreetMap
    </p>
    {/* Privacidad va en el pie y no en la lista de acciones de arriba: el pie
        es lo único que se dibuja con sesión y sin ella, y la política tiene que
        poder encontrarse sin cuenta. Al lado de "Buscar actualización", que es
        el otro enlace chico de servicio. */}
    {/* `Link` y no un `<a href>`: la app vive bajo el basename `/app`, así que
        un enlace absoluto recarga la página entera y encima apunta afuera. */}
    <Link to="/privacidad" style={{
      color: 'var(--info)', fontSize: 'var(--t-1)', textDecoration: 'underline',
      display: 'inline-block', lineHeight: '44px', marginRight: 'var(--s-4)',
    }}>Privacidad</Link>
    {/* Sin cuenta el enlace no aparece en la lista de acciones, pero la
        actualización tiene que estar igual: alguien puede quedar trabado en
        una versión vieja antes de siquiera loguearse. */}
    {/* En el tono informativo: es una acción secundaria, y en `--muted` se
        confundía con el pie de arriba, que es texto muerto. */}
    <button onClick={forceUpdate} style={{
      color: 'var(--info)', fontSize: 'var(--t-1)', minHeight: 44,
      textDecoration: 'underline',
    }}>Buscar actualización</button>
  </div>
)

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"/>
    </svg>
  )
}

/**
 * La tuerca y el botón de salir, juntos y en el renglón del título.
 *
 * Van en un bloque propio para que no se separen ni negocien su lugar por
 * separado: o entran los dos o no entra ninguno.
 */
function BotonesDeSesion({ onConfig, onSalir }: {
  onConfig: () => void
  onSalir: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 'var(--s-2)', flexShrink: 0 }}>
        {/* La tuerca, donde se la busca. Era un renglón más en la lista de
            abajo, entre "cómo funcionan los precios" y el tutorial: nadie va a
            leer una lista para encontrar la configuración, la busca arriba a
            la derecha. */}
        <button onClick={() => onConfig()} aria-label="Configuración" className="icon-btn"
          style={{ background: 'var(--film-2)', color: 'var(--muted)' }}>
          {/* La rueda se veía cortada arriba a la izquierda, y el defecto
              estaba adentro del `path`: donde el diente de esa esquina pedía
              un tramo relativo `l-1.9 3.2` había un absoluto `L1.1 8.9`. El
              trazo se iba hasta x=1,1 y volvía derecho, o sea rebanaba la
              esquina de un corte recto y dejaba el contorno asimétrico —el
              diente de abajo a la izquierda sí estaba, y por eso se leía como
              un recorte y no como un dibujo raro—.
              Un absoluto donde iba un relativo no rompe el SVG: dibuja otra
              figura, igual que los arcos del radar de la barra de abajo.
              Con el tramo corregido la silueta cierra simétrica y el `viewBox`
              vuelve a ser el de siempre. */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19.4 12.9a7.8 7.8 0 0 0 0-1.8l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.2a.5.5 0 0 0-.6-.2l-2.3.9a7.4 7.4 0 0 0-1.6-.9l-.4-2.4a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.4a7.4 7.4 0 0 0-1.6.9l-2.3-.9a.5.5 0 0 0-.6.2l-1.9 3.2a.5.5 0 0 0 .1.6l2 1.6a7.8 7.8 0 0 0 0 1.8l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.2a.5.5 0 0 0 .6.2l2.3-.9c.5.4 1 .7 1.6.9l.4 2.4a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.4-2.4c.6-.2 1.1-.5 1.6-.9l2.3.9a.5.5 0 0 0 .6-.2l1.9-3.2a.5.5 0 0 0-.1-.6l-2-1.6ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
          </svg>
        </button>

        {/* Salir arriba a la derecha, con su color: es una acción de sesión,
            no una opción más de la lista.

            Borde coral y no relleno coral, que es la única forma que la pizarra
            le da a lo destructivo —la misma de `Moderation`, `Person` y la zona
            de riesgo de `Settings`—. El relleno lo dejaba tan apretable como la
            tuerca de al lado, que no deshace nada; el borde lo distingue por
            forma y no sólo por color, o sea también con la pantalla en blanco y
            negro. */}
        <button onClick={() => onSalir()} aria-label="Cerrar sesión" className="icon-btn"
          style={{
            background: 'transparent', border: '1px solid var(--danger)',
            color: 'var(--danger)',
          }}>
          {/* Era el carácter `⇥`, y por eso se veía descentrado: un glifo de
              texto se centra por su caja de avance y por la línea base, no por
              su tinta, así que la flecha quedaba corrida y un poco arriba por
              más que el botón estuviera centrado. Un SVG con el mismo `viewBox`
              que la tuerca de al lado se centra por su geometría y además pesa
              lo mismo que ella. */}
          <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden
            fill="none" stroke="currentColor" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
            <path d="M10 8l4 4-4 4M14 12H3" />
          </svg>
        </button>
    </div>
  )
}

/**
 * El emblema del nivel: por ahora, el número.
 *
 * Es el lugar reservado para el dibujo que vaya cuando exista. Hasta entonces
 * muestra el número del nivel, que no es relleno — dice lo mismo que va a
 * decir el emblema y ya sirve para reconocerse de un vistazo.
 *
 * Va en la familia del oro de la nota (`--nota`) y no en el acento: es un
 * logro, no una acción, y el acento en heritage es el hueso del botón que
 * manda.
 */
function Emblema({ nivel }: { nivel: ReturnType<typeof nivelDe> }) {
  return (
    <div
      className="num"
      title={nivel.nombre}
      aria-label={`Nivel ${nivel.numero}: ${nivel.nombre}`}
      style={{
        width: 48, height: 48, borderRadius: 'var(--r-2)', flexShrink: 0,
        display: 'grid', placeItems: 'center',
        background: 'var(--fresh-soft)', border: '1px solid var(--nota)',
        color: 'var(--nota)', fontSize: 'var(--t-6)', lineHeight: 1,
      }}
    >{nivel.numero}</div>
  )
}

/**
 * El nombre del nivel y la barra. Nada más.
 *
 * **No dice cuánto falta para el siguiente, a propósito.** Lo decía —"te
 * faltan 3 para el 4"— y convertía el nivel en una tarea pendiente: cada vez
 * que entrabas al perfil, la app te recordaba lo que no hiciste. La barra sola
 * comunica lo mismo que hace falta, que es que hay recorrido y que vas por acá;
 * llegar al siguiente se descubre llegando, que es cuando la noticia es buena.
 *
 * Tampoco lleva el renglón que explicaba la ventana de 45 días. Esa aclaración
 * se da una vez en la bienvenida y ahí queda: repetirla en cada visita al
 * perfil es letra chica permanente para algo que se entiende una sola vez.
 */
function NivelBarra({ nivel }: { nivel: ReturnType<typeof nivelDe> }) {
  return (
    <div style={{ marginTop: 'var(--s-4)' }}>
      <span className="lbl" style={{
        display: 'block', fontSize: 'var(--t-4)', color: 'var(--cream)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{nivel.nombre}</span>

      <div aria-hidden style={{
        height: 6, marginTop: 'var(--s-2)', borderRadius: 3,
        background: 'var(--film-2)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.round(nivel.progreso * 100)}%`, height: '100%',
          background: 'var(--nota)', transition: 'width .3s ease-out',
        }} />
      </div>
    </div>
  )
}
