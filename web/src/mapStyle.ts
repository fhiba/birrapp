// Mismo estilo que la app Android: el mapa es contexto, los pines son el
// contenido. Se copia en vez de compartirse por build porque son 19 reglas
// y un paso de build compartido no se justifica.
export const MAP_STYLE: google.maps.MapTypeStyle[] = [
  {
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#221b16"
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
        "color": "#8a8078"
      }
    ]
  },
  {
    "elementType": "labels.text.stroke",
    "stylers": [
      {
        "color": "#221b16"
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
        "color": "#a2988c"
      }
    ]
  },
  {
    "featureType": "administrative.neighborhood",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#6e655c"
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
        "color": "#243020"
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
        "color": "#3a2f26"
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
        "color": "#453729"
      }
    ]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#54412a"
      }
    ]
  },
  {
    "featureType": "road.local",
    "elementType": "geometry",
    "stylers": [
      {
        "color": "#332920"
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
        "color": "#161d24"
      }
    ]
  },
  {
    "featureType": "water",
    "elementType": "labels.text.fill",
    "stylers": [
      {
        "color": "#3d4a52"
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
  // competir con una cápsula de precio.
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9C8E82' }] },
  // El contorno del color del mapa es lo que hace legible un texto claro sobre
  // una calzada clara.
  {
    featureType: 'road',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#221b16' }, { weight: 3 }],
  },
]
