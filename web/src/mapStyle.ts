// Mismo estilo que la app Android: el mapa es contexto, los pines son el
// contenido. Se copia en vez de compartirse por build porque son 19 reglas
// y un paso de build compartido no se justifica.
//
// Los hex van escritos a mano y es la única excepción del repo junto con
// `PRICE_STOPS`: esto es la API de Google Maps, que recibe un JSON y no sabe
// nada de custom properties. Los valores son los mismos de theme.css cuando
// coinciden, y la lista completa vive en el spec de la dirección.
//
// ---------- Pizarra heritage ----------
//
// El basemap pasa del marrón cálido (#221b16 y familia) al espresso. No es
// un cambio de gusto: el marrón viejo y el ámbar de los precios eran la
// misma familia, así que una cápsula de precio medio sobre una avenida se
// leía como parte del mapa. Sobre espresso —que es violáceo, no anaranjado—
// los tres colores del dato (lima, ámbar, coral) quedan afuera de la paleta
// del fondo y se despegan solos.
//
// La rampa de calles conserva el orden que ya tenía —local < genérica <
// arterial < autopista— y cada escalón se corre al tono heritage
// equivalente: #251324, #32202E, #3E2839, #4A3145. La autopista se queda con
// el tono más claro porque en el diseño es la única vía que además lleva
// línea propia; acá esa línea no se puede dibujar sin agregar una regla de
// `geometry.stroke`, así que el peso lo hace el tono.
//
// El agua deja el gris azulado y pasa al azul acero de `--info`: es el único
// elemento del mapa que es información estructural y no relleno. El cuerpo
// va en el extremo oscuro (#1B2C3D) porque el Río de la Plata ocupa media
// pantalla y no puede gritar; la etiqueta, en el claro.
//
// Esa etiqueta es texto, así que le corre WCAG 1.4.3 contra la geometría que
// tiene debajo, y no contra el fondo de la app. En #2A4560 sobre el cuerpo de
// agua #1B2C3D daba 1,44:1 — un nombre de río escrito en un azul apenas más
// claro que el río. Con `--info` #85A1C1 da 5,34:1 sobre el agua y 7,04:1
// sobre el espresso, o sea que cumple también donde la etiqueta se pasa de la
// costa. Es además el token que el resto de la app usa para lo informativo,
// así que el mapa deja de tener un azul propio.
//
// El parque pierde el verde. Era el único tono frío-vegetal de la pantalla y
// sobre espresso quedaba como una mancha pegada: acá es una parcela más.
export const MAP_STYLE: google.maps.MapTypeStyle[] = [
  {
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#1B0D17"
      }
    ]
  },
  {
    "elementType": "labels.icon",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#9C8A90"
      }
    ]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#1B0D17"
      }
    ]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "administrative.locality",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#B6A2A8"
      }
    ]
  },
  {
    "featureType": "administrative.neighborhood",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#B6A2A8"
      }
    ]
  },
  {
    "featureType": "poi",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#26131F"
      },
      {
        "visibility": "on"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#32202E"
      }
    ]
  },
  {
    "featureType": "road",
    "elementType": "labels",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "road.arterial",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#3E2839"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#4A3145"
      }
    ]
  },
  {
    "featureType": "road.local",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#251324"
      }
    ]
  },
  {
    "featureType": "transit",
    "stylers": [
      {
        "visibility": "off"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#1B2C3D"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#85A1C1"
      }
    ]
  }
]

/**
 * A partir de qué zoom aparecen los nombres de las calles.
 *
 * 17 es más o menos "una cuadra ocupa buena parte de la pantalla". Más lejos
 * los nombres no entran y Google los apila unos sobre otros; y más lejos
 * tampoco sirven, porque a esa distancia lo que se mira es dónde hay bares
 * baratos, no por qué calle caminar.
 */
export const CALLES_DESDE_ZOOM = 17

/**
 * El mismo estilo, con los nombres de calle prendidos.
 *
 * El estilo base los apaga: el mapa es contexto y los pines son el contenido,
 * y a zoom de barrio los carteles de calle compiten con las cápsulas de
 * precio, que es justo lo que hay que leer. Pero una vez que estás encima de
 * una manzana la pregunta cambia —ya elegiste el bar, ahora querés llegar— y
 * ahí no saber en qué calle estás es una molestia gratuita.
 *
 * Google no soporta condiciones de zoom adentro del JSON, así que son dos
 * arrays y el componente elige. Constantes de módulo y no una función: así la
 * identidad del array no cambia entre renders, y pasarle a `<Map>` un array
 * nuevo lo hace re-estilar entero.
 */
export const MAP_STYLE_CON_CALLES: google.maps.MapTypeStyle[] = [
  ...MAP_STYLE,
  // Van después, así pisan la regla de `road / labels: off` del estilo base.
  // Sólo el texto: los iconos de la calzada siguen apagados.
  { featureType: 'road', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  // Apagado a propósito: tiene que alcanzar para leer el nombre, no para
  // competir con una cápsula de precio. Pero "apagado" tiene un piso, y es el
  // de WCAG 1.4.3 para texto chico: 4,5:1 contra lo que tiene debajo.
  //
  // Debajo no está el fondo de la app: está la calzada, que es lo más claro
  // del mapa. En #7E6E74 —el tono que la paleta declara "ícono, no texto"—
  // los ratios medidos eran 3,65 sobre road.local, 3,16 sobre la calle
  // genérica, 2,79 sobre la arterial y 2,41 sobre la autopista. O sea que el
  // nombre se desvanecía justo en las vías más anchas, que son las que más
  // nombre tienen.
  //
  // `--muted` #B6A2A8 es el primer paso de la rampa que pasa el piso en los
  // cuatro escalones de calzada: 7,29 / 6,31 / 5,56 / 4,80. `--faint`
  // #9C8A90 no alcanza —4,12 en la arterial y 3,55 en la autopista—, así que
  // no sirve por más que sea el tono del `labels.text.fill` genérico.
  //
  // Queda al mismo peso que los nombres de ciudad, que ya estaban en
  // `--muted`. El susurro lo sigue haciendo el zoom: estos nombres no
  // aparecen hasta CALLES_DESDE_ZOOM.
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#B6A2A8' }] },
  // El contorno del color del mapa es lo que hace legible un texto claro sobre
  // una calzada clara.
  {
    featureType: 'road',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#1B0D17' }, { weight: 3 }],
  },
]
