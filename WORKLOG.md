# WORKLOG — birrapp

Append-only. Entrada nueva por sesión de trabajo, con timestamp. Nunca reescribir historia.

---

## 2026-08-31 — Scaffold inicial (Fase A)

Arranque del proyecto. Investigación de mercado previa:

- **Competencia local:** BrewerMap (2017) y GPS Birra mapean cervecerías con promos/eventos.
  GPS Birra lista precios como un atributo más, no como eje. Pinta Libre es suscripción
  (una pinta gratis por día), otro negocio. **Nadie tiene el mapa de precios en CABA.**
- **Precedente afuera:** Beer Me (AU), Pint Prices / Pintly (UK), Tap Map (Edimburgo),
  What's the Beer (dice "worldwide", cobertura BA nula). El modelo está probado.

Decisiones tomadas y su por qué → `docs/DECISIONS.md`.

Trabajo hecho:
- Estructura del repo, .gitignore, docs.
- docker-compose con PostGIS 16.
- Migraciones Flyway con el esquema completo.
- Vocabulario de estilos sembrado.

Pendiente de input del usuario (Fase B): credenciales de Google Cloud, teléfono por USB.

## 2026-08-31 (cont.) — Fase A terminada

Backend completo y andando; app compilando a APK.

Hecho:
- SDK de Android instalado headless (cmdline-tools + platform-tools + API 36/37).
  Nota: el paquete de API 37 se llama `platforms;android-37.0`, no `android-37`.
- Debug keystore generado. SHA-1 listo para pegar en Google Cloud → docs/SETUP.md.
- PostGIS 16 en Docker (puerto 5433; el 5432 ya tiene un Postgres 15 local).
- Esquema completo vía Flyway. Índice GiST verificado con EXPLAIN.
- 592 bares reales de CABA desde Overpass/OSM.
- API Ktor: mapa, detalle, precios, confirmación, reseñas, denuncias, moderación,
  roles, rate limit, detección de outliers.
- App Android: 7 pantallas, Compose + Material 3, mapa con pines de precio,
  Credential Manager, textos en castellano rioplatense.
- 18 tests contra PostGIS real. Todos verdes.

Desvíos del plan, con motivo (detalle en docs/DECISIONS.md):
- Sin Exposed: Flyway es dueño del esquema y las queries clave son SQL crudo igual.
- Sin Room: KSP va una versión de Kotlin atrás y ataría todo el proyecto; además
  un caché persistente de precios mostraría datos viejos sin avisar.
- Puerto 8090 en vez de 8080 (ocupado en esta máquina).
- compileSdk 37: lo exige todo el stack de AndroidX actual.
- El backend arranca sin credenciales de Google, con login deshabilitado y aviso,
  para no bloquear el trabajo en el resto.

Decisión del usuario (2026-08-31): no cargar datos de cervezas masivamente. Los
precios los carga la comunidad desde la app. Se borraron los precios de prueba
que se habían usado para validar la lógica de frescura — eran inventados sobre
bares reales.

Pendiente de Fase B: credenciales de Google Cloud y un teléfono por USB.

## 2026-08-31 (cont.) — Rename de package: se saca todo rastro de "inkan"

El package original era `news.inkan.birrapp`, deducido del dominio del mail del
usuario. Mala inferencia: inkan no tiene nada que ver con este proyecto y el
package brandeaba la app como producto de esa organización.

Cambiado a **`com.birrapp`** — neutral, sin reclamar ninguna organización. La
marca definitiva está sin decidir; cuando se decida, este es el momento barato
para volver a cambiarlo (antes de publicar en Play, después es caro).

- Árboles de fuentes movidos: `news/inkan/birrapp` → `com/birrapp` (app, backend, tests).
- 44 archivos actualizados (imports, namespace, applicationId, group, mainClass, proguard, docs).
- `.env.example` tenía el mail del usuario hardcodeado → ahora es `REPLACE_ME`.
- `backend/bin/` (basura de build de un IDE) agregado a .gitignore.
- Verificado: 18 tests verdes, APK reconstruido como `com.birrapp`, sin la cadena
  "inkan" dentro del dex.

Ojo: el package registrado en Google Cloud tiene que ser `com.birrapp`
(docs/SETUP.md ya actualizado).

## 2026-09-01 — Rediseño de UI + primera corrida real en dispositivo

El usuario reportó que la UI se veía anticuada y pidió algo moderno, con
estética de vidrio tipo iOS y evitando los clichés visuales de siempre.

Dirección tomada:
- Paleta oscura cálida fija (no sigue el tema del sistema). Acento ámbar,
  sin violetas ni gradientes de moda. La app se usa de noche en un bar.
- Bricolage Grotesque para números y títulos; el sistema para texto corrido.
  Los precios son el contenido, no texto de formulario.
- Vidrio real con Haze: blur de lo que está DETRÁS + reflejo especular en el
  borde + tinte. `Modifier.blur()` no sirve, difumina el propio composable.
  Debajo de API 31 no hay RenderEffect: cae a superficie opaca.
- Estilo de mapa oscuro y desaturado (res/raw/map_style_night.json). El mapa
  es contexto; los pines son el contenido.
- NavigationBar de Material reemplazada por píldora flotante.

Bugs encontrados corriendo en el teléfono, no en teoría:
1. Mapa en blanco. Causa: la API key tenía cargado sólo el SHA-1 del keystore
   de release del usuario, y el APK es debug. Resuelto cargando ambos.
2. La barra flotante tapaba los botones de acción. Los botones ahora despejan
   la barra y "Agregar un bar" pasó a ser circular.
3. La fila de estilos se cortaba contra el borde → ancho completo con
   contentPadding.
4. Los pines de precio se pisaban y quedaban ilegibles. zIndex sólo decide
   quién gana, no evita la colisión. Se agregó descarte de etiquetas: se
   recorren del más barato al más caro y sólo recibe etiqueta el que no cae
   sobre una ya colocada; el resto queda como punto de color. Además, por
   debajo de zoom 14.5 todo colapsa a punto.
5. Direcciones de OSM con altura pero sin calle mostraban "1417, Ciudad
   Autónoma...". Corregido en el seed y limpiado en la base (6 filas).

Estado: corriendo en un Huawei P30 Pro (VOG-L29, Android 10, GMS presente).
Mapa con tiles, 592 bares, 8 precios de prueba cargados por SQL.

Sobre publicar (consultado por el usuario):
- Play: US$25 únicos, pero cuentas personales creadas después del 13/11/2023
  necesitan 12 testers reales con opt-in continuo por 14 días.
- App Store: US$99/año y **requiere una Mac** (o build en la nube).
- Faltantes de compliance en ambas: borrado de cuenta in-app (rechazo seguro),
  política de privacidad, declaración de datos. En iOS además Sign in with Apple.
- Port: el backend se reusa entero; con Compose Multiplatform porta ~60% de la
  app, pero mapa, auth y ubicación necesitan implementación nativa.
  Recomendación: no portear hasta validar que la gente carga precios.

## 2026-09-01 (cont.) — Lista verificada en dispositivo

Pantalla de lista funcionando: barra de frescura por fila, distancia + edad,
precio a la derecha. La barra flotante cortaba en seco la última fila, así que
se agregó un degradado detrás: ahora el contenido se desvanece por debajo en
vez de quedar tajeado.

Verificado en el teléfono: mapa con tiles, pines sin superposición, detalle de
bar con precios y edades, estado vacío ("Todavía nadie cargó precios acá"),
lista ordenable.

NO verificado: que al acercar el zoom aparezcan más etiquetas de precio. La
lógica es correcta por construcción (la separación mínima se divide a la mitad
por nivel de zoom), pero no se pudo comprobar por adb: con 592 bares en pantalla
casi cualquier tap cae sobre un marcador en vez de hacer zoom. Queda para
comprobar a mano.

## 2026-09-01 (cont.) — Deploy fuera de la máquina y arreglos de la web

Primera vez que la app corre entera fuera de la Debian: base en Neon (AWS São
Paulo), backend en Railway, PWA en Vercel. Cinco cosas fallaron, y ninguna
estaba anotada en DEPLOY.md. Ahora sí.

**Neon.** La cadena que da el panel apunta al host del pooler (PgBouncer en
modo transacción) y trae `channel_binding=require`. Ninguna de las dos sirve
acá: Flyway toma un lock de sesión para migrar y no sobrevive al pooler, y
`channel_binding` es de libpq — el driver JDBC lo ignora. Va el host directo,
sin `-pooler`.

**Railway, dos veces.** Primero con el root directory en la raíz del repo:
Railpack no reconoce nada y el build ni arranca. Después, con el root ya en
`backend`, Railpack sí encontró el proyecto Gradle y lo construyó a su manera
—`gradle build` en vez de `buildFatJar`— arrancando con
`java -jar $(ls */build/libs/*jar)`. Ese glob no matchea nada porque el jar
queda en `build/libs/`, y el deploy muere con `-jar requires jar file
specification`. Se fija el builder con `backend/railway.json`.

**El bug que importa: V4 fallaba en Postgres nuevo.** `V4__search.sql` creaba
el índice GIN llamando a `unaccent` sin calificar el esquema. Desde Postgres
16.5 y 17, las operaciones de mantenimiento (`CREATE INDEX` entre ellas) corren
con `search_path` restringido a `pg_catalog, pg_temp` — fue un parche de
seguridad. Al inlinear `bar_search_key`, la función no se resuelve y la
migración se cae.

Lo peligroso es que la base local es **16.4**, justo anterior al parche, y Neon
es 18.6: el bug era invisible en desarrollo y sólo aparecía al desplegar. Se
calificó todo con `public.` (incluido el opclass `gin_trgm_ops`) y se reparó el
checksum del historial local con `Flyway.repair()`.

**Migración de datos.** El comando de DEPLOY.md exportaba `beer_styles`, que
Flyway ya siembra en V2 — el import reventaba con clave duplicada. Se saca de
la lista. Además el `pg_dump` del sistema es 15 contra un servidor 16, así que
va por `docker exec`. Migrados 740 bares, 12 precios, 1 usuario; verificado
contra la API en vivo.

### Arreglos de la web reportados desde el teléfono

1. **Slider del radio demasiado alto, y mal ubicado.** El `input[type=range]`
   nativo trae la pista gruesa de cada navegador, y en iOS bastante más. Se le
   da la forma del `Slider` de Material que ya usa Android: pista de 4px,
   pulgar redondo de 18px. El relleno activo va por degradado con el porcentaje
   inyectado desde React, porque WebKit no expone pseudo-elemento para esa
   parte (Firefox sí).

   Además el panel pasó de estar al pie a colgar de la barra de arriba, pegado
   al botón que lo abre. Al pie quedaba lejos de su control y compitiendo con
   los dos botones flotantes y la barra de navegación.

2. **No se podían dejar puntos desde el iPhone.** `LongPress` escuchaba sólo
   el evento `contextmenu` del mapa, que cubre el clic derecho y Chrome de
   Android pero **Safari de iOS no emite nunca**. Se agregó detección táctil
   propia sobre el div del mapa, con la proyección de un `OverlayView` para
   pasar de píxel a coordenada. Dos trampas: en Android se disparaban los dos
   caminos por el mismo gesto (sello de tiempo), y al soltar el dedo el mapa
   emite igual un `click` que borraba el punto en el mismo gesto que lo ponía.

3. **Controles de arriba aplastados en pantalla angosta.** La fila no tenía
   `wrap`: los tres controles no entran en un teléfono, flex los encoge y las
   etiquetas se parten dentro de píldoras de un solo renglón. El usuario lo
   atribuyó al locale del teléfono, pero no hay nada en el código que dependa
   del idioma — `es-AR` está hardcodeado en los cuatro lugares donde se
   formatea. Es sólo ancho.

   El primer intento fue `flexWrap`, y el remedio fue tan feo como la
   enfermedad: el botón de radio bajaba de renglón, y encima *mientras
   arrastrabas*, porque la etiqueta cambia de ancho entre "1.5 km" y "15 km".
   La versión final aprieta el padding por ancho de pantalla (variables CSS en
   `.map-controls`, cortes en 420px y 350px) y le fija ancho al valor del radio
   para que la fila no cambie de tamaño. El `wrap` queda sólo de red de
   seguridad para pantallas donde nada entra en una fila.

   De paso, la franja de controles ahora es `pointer-events: none` con los
   controles en `auto`: ocupaba todo el ancho de la pantalla y se comía el
   paneo del mapa en esa zona, incluido el aire entre botones. Con el slider
   colgado ahí, la franja es más alta y el problema se habría notado más.

NO verificado: el long-press táctil no se pudo probar en un dispositivo real,
sólo por construcción — es el arreglo con más partes móviles de los tres. Los
anchos de la fila de controles tampoco se midieron: no hay navegador headless
en esta máquina, así que los cortes de 420px y 350px salieron de calcular a
mano y hay que confirmarlos en el teléfono.

Pendiente: `/descargar` quedó vacío en Railway — los APK viven en
`/home/jaiba/birrapp-deploy/apk`, que no existe en el contenedor. Y la
contraseña de Neon conviene rotarla, se pegó en un chat.

## 2026-09-01 (cont.) — Nota por birra y fotos en R2

Se implementa lo decidido en el backlog: la nota va por `(bar, estilo)` —la
misma clave que el precio— y las fotos a Cloudflare R2.

**Base (V5).** `beer_ratings` con `UNIQUE (bar_id, style_id, user_id)`: a
diferencia de los precios esto NO es append-only, el voto se pisa. `bar_photos`
guarda sólo la llave del objeto; los bytes nunca tocan el backend. Y
`v_style_ratings` agrega por birra.

El promedio bayesiano tenía un bug que sólo apareció con datos cargados: con un
solo voto de 5 devolvía 5,00. La media global se calculaba sobre `beer_ratings`,
que en ese momento era esa única fila — el voto se encogía hacia sí mismo. Se
usa un prior fijo de 3,5 hasta los 50 votos; ahora un único 5 muestra 3,75 y un
único 4 muestra 3,58.

**Firmado S3 a mano, sin el SDK de AWS.** Son ~15 MB de dependencias
transitivas en el fat jar para dos operaciones. SigV4 son 80 líneas con
`HmacSHA256`; mismo criterio que con el ORM. El algoritmo se validó contra R2
real —PUT 200, lectura pública 200, DELETE 204— antes de escribir el Kotlin, y
después se congeló con un test contra vector de oro. Sin ese test, un cambio en
el escapado rompe las subidas sin que falle nada visible en el build.

Detalles que importan: R2 usa la región literal `auto` y estilo de ruta; el
escapado de AWS no es el de `URLEncoder` (espacio a `%20`, `~` sin tocar).

**Fotos.** Tres pasos: pedir URL firmada, subir del navegador al bucket,
confirmar. La fila se escribe recién al confirmar — al revés, cada subida
abandonada dejaría una foto rota en la galería. La llave la genera el servidor
con un UUID y se valida el prefijo al confirmar: aceptar una llave arbitraria
dejaría apuntar una fila a cualquier objeto del bucket.

**Moderar una foto borra el objeto, no sólo la fila.** Precios y reseñas se
sirven desde el backend, así que cambiarles el estado los saca de circulación;
las fotos se sirven desde una URL pública del bucket y mientras el objeto exista
cualquiera con el link las ve. Verificado: tras moderar, la URL pública da 404.

**Compresión en el cliente.** 1280px y WebP q80 dejan una foto de teléfono en
~200 KB. El efecto que más importa no es el tamaño: volver a codificar en un
canvas **borra el EXIF**, o sea las coordenadas GPS de dónde se sacó. Subir el
original publicaría la ubicación de quien la sacó.

**Pantalla.** Una pestaña por birra: con cinco estilos, precio + nota + fotos de
cada uno era una pantalla interminable. El promedio del bar no se guarda, sale
de sus birras ponderado por votos — guardarlo aparte daría dos números que con
el tiempo se contradicen. Estrellas en ámbar si votaste vos, grises si no.
Comentarios detrás de un ícono, nunca a la vista por defecto.

Dos defectos que sólo aparecieron corriéndolo contra el servidor:

1. `mine` venía siempre en `false`: las rutas de fotos y comentarios eran
   públicas y pasaban `viewerId = null`. Pasaron a sesión opcional.
2. `ratingAvg` no aparecía en el JSON cuando era null. kotlinx no serializa un
   campo que vale su default, así que el frontend recibía `undefined` donde el
   tipo promete `number | null`. Se les sacó el default.

Verificado de punta a punta contra R2 real y la base local: votar, comentar,
subir, listar, servir por URL pública, moderar y confirmar que el objeto
desapareció. Más el rechazo de una llave forjada con `../`.

22 tests verdes, `FreshnessTest` y `PriceReportTest` incluidos.

**Corrección sobre la marcha (0.3.9).** El botón ancho de abajo decía "Cargar
precio" incluso en bares que ya tenían precio. No era sólo la etiqueta: ese
botón abre `ReportPrice` **sin estilo preseleccionado**, o sea que no carga *el*
precio, agrega otra birra. Se mudó al final de la fila de pestañas como
"+ Otra birra" —última posición de una lista es donde se agrega otra, como las
solapas de un navegador— y la fila pasa a mostrarse aunque haya una sola birra,
porque un control que aparece y desaparece según cuántas haya es un control que
no se encuentra cuando hace falta. Se descartó llamarlo "producto": en toda la
app son birras y estilos, nunca productos.

**Corrección sobre la marcha (0.3.10).** El botón de agregar foto abría un menú
propio con "sacar una foto" y "elegir de la galería". Probado en el teléfono
resultó redundante: el selector del sistema ya ofrece esas dos opciones, así que
eran dos pasos para llegar al mismo lugar. Queda un único `input file` sin
`capture` —que forzaría la cámara y sacaría la galería del menú nativo—. El
componente bajó de 130 a 91 líneas.

NO verificado: nada de esto se probó en un teléfono. La cámara (`capture`), el
carrusel y el modal quedan pendientes de prueba en dispositivo.

## 2026-09-01 (cont.) — Diez correcciones de la prueba en teléfono

Todo lo de abajo salió de usar la app en un teléfono, no de leer el código.

**El bug que importa: borrar un precio escondía las fotos y las notas.** Las
pestañas salían de `v_current_prices`, así que sin precio vigente la birra
desaparecía de la pantalla y se llevaba puestos sus votos y sus fotos, que
seguían en la base sin ninguna forma de llegar a ellas. Ahora la consulta parte
de `beer_styles` y conserva la birra si tiene precio, nota **o** foto; la fila
sin precio muestra "no tiene precio cargado" y un botón para cargarlo. Por eso
`price`, `sizeMl`, `ageDays`, `freshness` e `id` pasaron a ser nullable: la
lista dejó de ser "los precios del bar" para ser "las birras del bar".

**El puntaje mostraba 3,8 con un único voto de 5.** La matemática estaba bien
—es el shrinkage— pero el número parecía roto, y con razón. El promedio
bayesiano sirve para *ordenar*, no para mostrar: un 5,0 con un voto no puede
ganarle a un 4,6 con cuarenta, pero a quien acaba de poner cinco estrellas hay
que mostrarle 5,0. Se agregó `ratingRaw` para la pantalla y `ratingAvg` queda
para rankear.

**El texto de la reseña era negro sobre negro.** La regla de `theme.css` cubría
`input` pero no `textarea`, así que el textarea usaba el color por defecto del
navegador. Una línea.

El resto:

- La foto abría la URL del bucket en otra pestaña: se salía de la app y volvía
  con el botón de atrás. Ahora amplía en un modal.
- Las estrellas eran decorativas; puntuar obligaba a encontrar el ícono de
  comentarios, que es el último lugar donde alguien lo busca. Ahora tocarlas
  abre el modal con esa estrella ya elegida.
- Borrar un precio no pedía confirmación, siendo irreversible. Ahora sí, y el
  texto aclara que las notas y las fotos no se tocan.
- El botón de buscar actualización estaba dos veces en Perfil. Queda el del pie.
- "Cómo llegar" pasó al lado del nombre del bar: abajo quedaba separando el
  nombre de las birras, que es lo que se viene a mirar.
- El nombre del estilo se repetía en la pestaña y en la fila de precio.
- En "bar nuevo", el input de arriba se veía cortado: el contenedor que
  scrollea no tenía padding superior y se comía el borde.

Verificado contra la base local: votar, borrar el precio, comprobar que la
birra sigue listada con su nota y ordenada después de las que sí tienen precio,
y restaurar. 22 tests verdes.

**Y una más (0.3.12).** La lista tenía un `<h1>` que decía "Más baratas" justo
encima de una píldora que decía "Más barata". El título no agregaba nada que el
selector no dijera ya y se comía un renglón entero. Queda el selector, con el
conteo —que sí es dato— corrido a la derecha.

## 2026-09-01 (cont.) — Moderación de fotos y comentarios, y swipe en el visor

Los endpoints de moderación de fotos y votos existían desde 0.3.8 pero no había
forma de llegar a ellos desde la app. Ahora cuelgan del **modo moderador**, no
del rol: prendido aparecen las acciones destructivas, apagado un moderador ve
exactamente lo mismo que cualquiera. Es el criterio que ya tenía la pantalla.

Borrar una foto avisa que se borra el archivo del bucket y no sólo la fila —es
lo que la distingue de bajar un precio— y borrar un comentario avisa que también
se lleva la nota, porque no se puede bajar una sin la otra.

El visor de fotos pasa a recibir la lista y un índice en vez de una sola foto:
swipe horizontal en teléfono, flechas y teclado en escritorio. El swipe compara
el desplazamiento horizontal contra el vertical, porque sin eso un arrastre
diagonal para cerrar cambiaba de foto sin querer. Las flechas van tras una regla
`(hover: hover) and (pointer: fine)`: en un teléfono el gesto es el swipe y dos
botones encima de la foto son dos botones de más.

Sobre el `upsert` que revive un voto bajado por un moderador: al principio se
anotó como agujero del modelo, pero el encuadre estaba mal. No se puede impedir
que alguien vuelva a comentar reenviando una fila —siempre puede mandar otra—,
así que perseguir filas no cierra el caso. Lo que lo cierra es sacarle a esa
persona la posibilidad de aportar, y para eso el ban **ya existe y se hace
cumplir**: `isBanned` se chequea en el login y en cada refresh. Lo que falta es
la pantalla para llegar a esa persona desde su comentario. Queda anotado como
punto 5 del backlog.

Verificado contra la base local: votar, moderar el voto, comprobar que el
comentario desaparece y la nota vuelve a cero votos.

## 2026-09-01 (cont.) — Sacar el selector de orden del mapa

Preguntado por el usuario: qué ordena ese selector en el mapa. La respuesta es
que nada visible. Los pines se dibujan todos, y el descarte de etiquetas
superpuestas se reordena por precio por su cuenta dentro de `Pins`, así que el
orden con el que llega la lista es irrelevante.

Lo único que hacía era decidir **cuáles 400 bares** sobreviven al
`out.slice(0, 400)` de `project()` cuando hay más que eso en el radio: con "más
cerca" los 400 más cercanos, con "más barata" otros 400. Cambiaba el contenido
del mapa sin ninguna señal de que lo estaba haciendo. Peor que inútil.

El orden queda sólo en la lista, que es la pantalla donde el orden ES el
contenido. Efecto lateral: la fila de controles del mapa pierde su elemento más
ancho (~200px), que era el que provocaba el amontonamiento en teléfonos
angostos de 0.3.7.

Y apareció una dependencia escondida entre pantallas: el umbral de separación
de etiquetas se calculaba con `bars[0].lat`, o sea la latitud de un bar
cualquiera, que cambiaba según el orden elegido en la pantalla de lista. Pasa a
tomar la latitud del centro del mapa. En Buenos Aires la diferencia numérica es
de milésimas; lo que se corrige es que una pantalla dejara de influir en otra
por un camino que no estaba a la vista.

## 2026-09-01 (cont.) — Analytics, encabezado fijo y contador de moderación

**Vercel Analytics.** `<Analytics />` va adentro del router: si fuera afuera
registraría sólo la primera carga, y acá casi toda la navegación es
client-side. Se sirve desde `/_vercel/insights` en el mismo origen, así que no
suma un dominio de terceros; fuera de Vercel el script no existe y el
componente no hace nada.

Nota para cuando toque la declaración de datos: esto es medición de visitantes
y aunque no use cookies, cuenta como recolección. Va en la lista de requisitos
para publicar, que ya tiene pendiente la política de privacidad.

**Encabezado fijo en la lista.** Scrolleando cien bares se perdía de vista con
cuál de los dos órdenes se estaba mirando. El `paddingTop` se mudó del
contenedor que scrollea al propio encabezado: si viviera en el contenedor,
`top: 0` pegaría el selector contra el borde de la pantalla, debajo del notch.
Y el margen negativo con el padding compensado hace que el fondo tape de borde
a borde, o las filas se ven pasar por los costados.

**Contador de moderación.** El número va en Perfil y no sólo dentro de la
pantalla de Moderación: si hay que entrar para enterarse de que hay algo que
hacer, nadie entra. Se agregó `GET /moderation/summary`, que devuelve sólo los
dos números, en vez de reusar las listas: bajarse los bares pendientes y sus
denuncias enteras para dibujar un "3" sería absurdo. Adentro de la pantalla,
cada sección lleva su cuenta en el título.

Verificado contra la base local: el endpoint devuelve `{"pendingBars":1,
"openFlags":0}`, que coincide con lo que hay, y sin token da 401.

## 2026-09-01 (cont.) — Mis aportes, y "Confirmados" pasa a ser "Fotos"

Los tres contadores de Perfil ahora llevan a **Mis aportes**: precios, fotos y
bares propios en una sola pantalla, con el borrado ahí mismo. Hasta ahora, para
encontrar algo propio mal cargado había que acordarse en qué bar fue y navegar
hasta ahí; con veinte aportes eso deja de funcionar.

**"Confirmados" se cambió por "Fotos".** Eran los toques de "Sigue igual", y el
propio autor de la app no reconoció qué contaba. Un número que no se entiende no
sirve de nada. El dato se sigue guardando y viaja en `UserStats`, sólo dejó de
mostrarse.

Decisiones que quedaron en el código:

- **Los bares no se borran desde ahí.** Un bar que creaste puede tener precios y
  fotos de otra gente: borrarlo no deshace tu aporte, borra el de terceros. Se
  explica en la pantalla y se deja la denuncia como camino.
- **La pertenencia se chequea en el `WHERE` del `UPDATE`, no antes.** Si se
  comprobara primero y se actualizara después, entre las dos consultas hay una
  carrera. Un id ajeno simplemente no afecta ninguna fila.
- **`isCurrent` viaja en la respuesta** cruzando con `v_current_prices`: sirve
  para que la confirmación diga si borrar ese reporte cambia lo que ve todo el
  mundo o sólo saca una fila del historial. No es lo mismo y el texto lo dice.
- Borrar un precio propio sigue siendo `UPDATE` de `status`, nunca de `price`:
  la regla de append-only sigue en pie.

Verificado contra la base local: borrar un precio ajeno da 404 **y la fila queda
intacta**; un id inexistente, 404; sin sesión, 401; el propio, 200 y pasa a
`removed`. 22 tests verdes.

## 2026-09-01 (cont.) — El encabezado fijo, ahora sí

El de 0.3.15 no funcionaba y el error es el clásico de `position: sticky`: un
elemento pegajoso sólo se pega **dentro de la caja de su padre**. Estaba adentro
del `<header>`, que mide unos 90px, así que se despegaba apenas el header salía
de pantalla — o sea, exactamente cuando empezaba a hacer falta. Con pocos bares
no se notaba; con la lista filtrada y larga, sí.

Ahora cuelga de `.desk-narrow`, hermano del `<ul>`, así que su padre abarca toda
la lista y se mantiene mientras haya algo que scrollear.

De paso, el slider del radio de la lista era el único `range` que quedaba con la
pista gruesa por defecto del navegador: pasa a usar la clase `.range`, la misma
del mapa.

## 2026-09-01 (cont.) — Buscador en la lista y color del mapa a elección

**Buscador.** Va contra el servidor y no filtrando la lista en memoria: la
lista sólo trae lo que entra en el radio, así que buscar un bar de otro barrio
no daría nada y parecería que no existe. El índice ya estaba —trigramas sobre
el nombre sin tildes, `V4__search.sql`—; lo único que hizo falta fue un `limit`
en el endpoint, porque el default de 8 era para el autocompletado de "bar
nuevo" y en una lista queda corto. Se acota a 50: sin tope, una `q` de una
letra devuelve la base entera.

Buscando se esconden el selector de orden y el radio. El orden lo pone el
servidor por cercanía, así que dejar la píldora sería ofrecer un control que no
hace nada; y el radio no aplica porque la búsqueda es sobre toda la base.

**Color del mapa a elección.** Sale de la pregunta del usuario, que leyó verde
como "barato" cuando siempre significó "reciente". El toggle resuelve las dos
mitades: deja elegir qué mirar, y al nombrar el modo activo —con los tres
colores en miniatura al lado— dice qué significan.

El color por precio va por **puesto y no por valor**: con escala lineal, un
solo precio disparatado aplasta a todos los demás contra el extremo barato y el
mapa se ve todo verde. Comprobado con cuatro casos: reparto parejo, empates que
comparten color, un outlier que no aplasta al resto (0 / 0,33 / 0,67 en vez de
todos cerca de 0), y un único bar sin dividir por cero.

La escala se calcula sobre lo que hay en pantalla y se reajusta al moverse: en
Palermo lo barato es otro número que en Liniers.

El modo vive en `App` y no en `MapScreen` porque la pantalla se desmonta al
cambiar de pestaña: guardado adentro, se perdía al ir a la lista y volver.

Una trampa encontrada al escribirlo: en `MapScreen`, `Map` es el componente de
Google Maps, así que `new Map()` no compila. `priceRanks` recibe pares por eso.

El onboarding queda anotado como punto 6 del backlog.

## 2026-09-01 (cont.) — La nota del bar sube al lado del nombre

Estaba debajo de la dirección, o sea a tres renglones del título. Ahora va a la
altura del nombre, alineada a la derecha.

Cambia de forma al mudarse: una sola estrella con el número, no las cinco.
Arriba compite por ancho con el nombre del bar y con el enlace al mapa, y cinco
estrellas de 16px se comen media línea en un teléfono. El desglose de cinco
estrellas sigue estando en cada birra, que es donde se puntúa y donde hace
falta ver cuánto falta para el próximo escalón.

## 2026-09-01 (cont.) — El promedio del bar usaba el número equivocado

Preguntado por el usuario: por qué un único voto de 5 daba 3,8 de promedio del
bar. Dos cosas distintas, y sólo una era un problema.

**Las birras sin nota ya estaban bien excluidas.** El filtro las saca antes de
promediar, así que una birra sin votos no cuenta como cero. Es la distinción
que importa: ausencia de dato no es un cero, y tratarla como tal hundiría el
promedio de un bar por tener una birra que nadie probó todavía.

**El 3,8 sí era un bug.** El agregado usaba `ratingAvg` —el promedio con
shrinkage bayesiano— en vez de `ratingRaw`. La cuenta era
`(1×5 + 5×3,5) / 6 = 3,75`: el voto no se estaba promediando contra un cero
fantasma sino contra el prior de 3,5 de la fórmula.

Es exactamente el mismo error que se corrigió en 0.3.11 para la nota de cada
birra, en un lugar que quedó sin tocar. El valor con shrinkage sigue viajando
en la respuesta para cuando haga falta ordenar, pero ya no lo muestra ninguna
pantalla.

Reproducido y verificado contra la base local con el caso del usuario —dos
birras, una con un 5 y la otra sin votos—: antes 3,8, ahora 5,0.

## 2026-09-01 (cont.) — Onboarding progresivo

No es un carrusel de bienvenida: cada pantalla enseña lo suyo la primera vez que
se abre. Contar el mapa mientras alguien mira el perfil no sirve — para cuando
llega al mapa ya se olvidó.

**Anclado a controles reales**, marcados con `data-tour`, con recorte de luz
alrededor. Un cartel centrado que dice "el botón de arriba a la izquierda"
obliga a traducir palabras a píxeles, que es justo el trabajo que el tutorial
tendría que ahorrar. Los pasos que explican un gesto y no un botón —mantener
apretado el mapa— van sin ancla, centrados.

Once pasos repartidos en cuatro pantallas. Los que más importan son los dos que
nadie descubre solo: el long-press para dejar un punto, y "Sigue igual", que es
el gesto del que depende que el dataset no envejezca.

Decisiones:

- **Sólo con sesión iniciada.** Todo lo que enseña son cosas de aportar. A quien
  sólo mira precios se le estarían mostrando botones que le van a pedir que se
  loguee.
- **En `localStorage`, por usuario, no en la base.** Un tutorial visto no es
  dato del negocio, y guardarlo en el servidor cuesta una migración, dos
  endpoints y una escritura por paso. Se paga con que en otro teléfono se ve de
  nuevo, que para un tutorial está bien. La clave lleva el id de usuario para
  que dos cuentas en el mismo teléfono no se pisen.
- **Un paso sin ancla en pantalla se saltea solo.** Un bar sin precios no tiene
  botón de "Sigue igual", y hablar de un botón que no está es peor que callarse.
- **El fondo avanza al tocarlo** y el control se trae a la vista con
  `scrollIntoView` si está más abajo del pliegue: sin eso, el recorte de luz
  queda fuera de pantalla y el cartel señala la nada.
- **Se puede volver a ver desde Perfil.** Un tutorial que se saltea de un toque
  y no se recupera castiga el toque apurado.
- Los textos van en porteño, a pedido del usuario. "Dale" para seguir.

Verificado con once comprobaciones de la máquina de estados fuera del navegador:
que una pantalla vista no se repita, que saltear corte todas, que dos cuentas en
el mismo teléfono no se pisen y que el reset desde Perfil devuelva todo.

## 2026-09-01 (cont.) — Ajustes del onboarding con el usuario delante

**Intro primero.** No hay que dar por sentado que quien abre la app sabe qué se
bajó. El primer paso dice qué es birrapp, que los precios los carga la gente y
por qué cada uno viene con su fecha — que es la regla del proyecto, dicha en
una oración y no en una pantalla de ayuda que nadie abre.

**El login manda al mapa.** Volvía a la pantalla desde donde se había tocado
"Entrar", casi siempre Perfil, así que el tutorial arrancaba por el paso de
Perfil. Ahora `redeemHandoff` navega a `/`.

**El paso del punto secundario se rehizo.** Era el que peor se entendía: hablaba
de un gesto sin señalar dónde hacerlo. Ahora hay un blanco invisible en el
centro del mapa —un div sin eventos, puesto sólo para que el tutorial tenga qué
medir— y el recorte de luz sale redondo alrededor de esa zona. Se partió en dos
pasos: cómo dejar la marca y cómo sacarla.

Y se corrigió una contradicción: el cartel decía "probá" mientras el overlay se
comía los toques, así que no se podía probar nada. Los pasos que enseñan un
gesto ahora dejan pasar los toques a la app; el overlay queda de puro dibujo y
sólo avanza el botón. En esos pasos se pierde el avance tocando el fondo, pero
tocar el fondo es justamente lo que se está enseñando.

**Textos repasados.** Varios estaban en tercera persona o daban vueltas: "busca
en todos los bares" pasó a "te busca entre todos los bares", "no te puede
encabezar el ranking" a "no le gana a uno fresco", y la pinta se explica
diciendo quién carga los precios en vez de describir la interfaz.

## 2026-09-01 (cont.) — El filtro de estilo no filtraba

Reportado por el usuario: filtrando por un estilo, el mapa muestra precios de
otros. Al mirarlo eran dos bugs encadenados y el filtro no filtraba por estilo
en ninguna de las dos puntas.

**Backend.** Con `style`, el `EXISTS` elegía qué bares aparecían pero el precio
seguía saliendo de `v_bar_headline`, que es el más barato de *cualquier*
estilo. Filtrando IPA se veía el precio de la rubia. Ahora es un JOIN contra
`v_current_prices` —hace falta la fila para leerle el precio, no sólo saber que
existe— y el pin trae el precio y la edad del estilo filtrado. El orden "más
barata" también pasa a usar ese precio.

**Frontend.** Peor: el estilo nunca llegaba al servidor. `useBars` pedía
siempre con `undefined` y después "filtraba" en memoria con
`b => !style || b.fromPrice != null`, que descarta los bares sin precio y no
mira el estilo por ningún lado. La caché era una sola para todos los filtros,
lo cual era coherente con no mandar nunca el filtro.

Ahora hay **una caché por estilo**: con filtro el servidor devuelve otro precio
para el mismo bar, así que son datos distintos y no pueden convivir en la misma
tabla. `invalidate` las limpia todas, porque un precio nuevo puede cambiar
cualquiera.

**Filtro de estilo también en la lista**, pedido junto con lo anterior. Ahí
importa incluso más: la lista muestra una columna de precios, y sin filtrar
cada fila puede ser un estilo distinto, con lo cual la columna no compara nada.

El componente se extrajo a `ui/StyleFilter.tsx` y lo usan las dos pantallas.
Sólo cambia el `tone` —vidrio sobre el mapa, sólido en la lista—; duplicarlo
garantizaba que se fueran separando con cada retoque.

Verificado contra la base local con un bar que tiene rubia a 7.200 e IPA a
9.900: sin filtro el pin dice 7.200, con IPA dice 9.900 y con rubia 7.200. Los
seis bares con rubia no-stale de la base son los seis que devuelve, y el orden
"más barata" ordena por el precio del estilo filtrado.

## 2026-09-02 — v0.4.0: la marca de la cerveza, y un dashboard

Salida del caso concreto que trajo Felipe: un bar con dos IPA a precios
distintos. Con la clave del precio en (bar, estilo), una pisaba a la otra y el
mapa mostraba un número que no correspondía a ninguna de las dos.

**La birra pasó a ser (estilo, marca).** No sólo el precio: también la nota,
los comentarios, las fotos y el historial. Una IPA de Antares y una de Juguetes
Perdidos son dos cervezas, y darles una sola nota es la señal que más confunde
porque dice que probaste una cosa cuando probaste otra.

`brand_id` es nullable en todas las tablas y "sin marca" es un valor legítimo,
no un dato faltante: hay bares donde la birra no tiene marca declarada, y todos
los precios y votos que ya existían son exactamente ese caso.

Cuatro cosas que costaron:

- **La unicidad del voto va por índice parcial**, no por `UNIQUE`: con
  `brand_id` NULL, `UNIQUE` no compara, así que la misma persona podía votar
  dos veces la birra sin marca.
- **`v_current_prices` hubo que recrearla**, no reemplazarla: las columnas
  nuevas van en el medio y Postgres no deja reordenar columnas de una vista.
  Eso arrastra `v_bar_headline`.
- **El cooldown de 6 horas pasó a ser por marca.** Si no, cargabas la primera
  IPA y la segunda quedaba bloqueada — justo el caso que motivó todo esto.
- **En los tests, `TRUNCATE users CASCADE` se lleva puesta `brands`** porque la
  referencia. Fallaban con "marca desconocida", que no decía nada de la causa.

**Tres bugs que la migración dejó y los tests no cubrían.** Los tres eran el
mismo error: cruzar por estilo cuando la clave ya era (estilo, marca). Con una
marca por estilo daban el resultado correcto de casualidad; con dos, producto
cartesiano. El detalle del bar devolvía cuatro filas para dos birras y colgaba
la nota de una sobre el precio de la otra; "Mis aportes" duplicaba cada reporte
y marcaba como vigente el de otra marca; el historial mezclaba las dos IPA en
una serie que sube y baja porque son dos cervezas, no porque el precio se haya
movido. `BarDetailTest` los cubre ahora.

**La UI, igual en las dos plataformas:** dos filas de solapas, el estilo arriba
y sus marcas abajo, una birra por vez. Cada una con su rótulo "IPA · Antares"
sobre el precio — cuando el estilo era toda la identidad eso lo decía la
solapa, pero un número suelto no dice de cuál de las dos IPA es. La carga de
precio suma un desplegable de marca debajo del estilo, opcional, con alta de
marcas que falten (queda pendiente de moderación).

**Dashboard de usuarios y aportes**, en `/dashboard`, detrás del rol de
moderador. Contesta "de los que se anotan, cuántos aportan": en una app que
depende de que la gente releve precios gratis, esa es la métrica que decide si
el mapa se mantiene solo, y es la que se pierde mirando el total de cuentas.
Los precios se cuentan separando carga manual de "Sigue igual", y "aportaron en
30 días" cuenta personas y no aportes.

**Cambio de proceso:** desde ahora, una rama por feature, todas salen de `dev`,
y a `main` se mergea cada tanto. Felipe corre varios agentes en paralelo sobre
el repo y ya se pisaron: aparecieron cambios ajenos en el árbol de trabajo a
mitad de esta feature. Queda escrito en `AGENTS.md`.

37 tests en verde.

## 2026-09-03 — La nota se puede cargar con un decimal (BIR-19)

Hasta acá la nota de una birra se movía sólo con la estrella, y la estrella da
enteros. Si querías ponerle un 3,8 no había cómo. El promedio de la comunidad
ya se mostraba con decimales y `<Stars>` ya sabía pintar fracciones —lo único
que faltaba era poder *ingresar* uno.

**El piso baja de 1 a 0.** El 1 era piso sólo porque no se puede "tocar cero
estrellas"; con carga numérica el 0 es un voto legítimo —"estuvo pésima"— y no
se confunde con "no voté", que es la ausencia de fila, no un 0.

**Backend:** `beer_ratings.rating` pasa de `smallint` a `numeric(2,1)`, CHECK
de 0.0 a 5.0 (`V10`). La vista `v_style_ratings` hubo que bajarla y recrearla
—Postgres no deja cambiar el tipo de una columna de la que depende una vista—
pero su definición no cambia: `avg` y `round(...::numeric,2)` andan igual. El
`upsert` valida el rango y redondea a un decimal antes de guardar, así el valor
validado y el guardado son el mismo. Los DTOs (`NewRatingRequest`,
`MyRatingDto`, `RatingCommentDto`) pasan a `Double`.

**Web:** al lado de las estrellas, un campo numérico. Confirma con Enter o al
salir del foco, acepta coma, redondea y recorta al rango antes de mandar. La
estrella sigue funcionando igual para el que no quiere teclear.

**Android sólo se puso a tolerar el decimal**, no lo carga todavía: los modelos
que decodifican la nota (`MyRating`, `RatingComment`) pasan a `Double` para no
crashear cuando llegue un 3,8 desde la web. El input numérico en la app queda
como parity pendiente.

**Fuera de alcance:** la reseña del bar (`ReviewRepo`, su propio `1..5`) es otra
cosa y no se tocó.

49 tests en verde (backend). Web y app compilan.

## 2026-09-03 (cont.) — Dashboard con analíticas (BIR-20)

El dashboard contestaba con seis números sueltos y sin tendencia: `pricesWeek`
decía 12 y no había con qué compararlo, así que no se sabía si eso era bueno,
malo o igual que siempre. Ahora hay seis gráficos.

**Por qué no un script de Python con matplotlib.** Era la primera idea y se
descartó por escrito: los PNG quedan congelados (haría falta un cron y el
dashboard mostraría la última corrida), son una imagen —sin hover, sin cambiar
el rango, sin adaptarse al tema ni al ancho del teléfono— y sumarían un tercer
lenguaje con su propio camino de deploy a un proyecto cuyo item más urgente de
backlog es que desplegar el backend ya es a mano. Lo que sí era correcto de esa
intuición es que **la agregación va del lado de la base**: SQL agrupa, el
backend devuelve JSON, el front dibuja.

**Tampoco una librería de gráficos.** Un gráfico de líneas es un `<polyline>`
con los valores escalados a la caja; las estrellas de `Stars.tsx` ya eran SVG a
mano. Recharts pesa ~95kb gzip. Los seis gráficos, escritos a mano, costaron
**2,13 kb** (120,02 → 122,15 kb gzip). El número solo justifica la decisión.

**Una definición de qué es un aporte.** La unión de los cuatro tipos estaba
escrita a mano y repetida en `recentUsers()` y `dashboardSummary()`. Salió a la
vista `v_contributions` (V11), y de ahí cuelgan casi todas las métricas. La
nota va por `updated_at` y no por `created_at` porque se pisa al corregirla.

**Un dueño del peso.** `Dashboard.tsx` calculaba su propio `weight()`. Se mudó
al backend como `DashboardUserDto.score`. Ojo con la trampa: sacarlo del front
y después tener tres copias del `CASE` en SQL era la misma falla con otro
disfraz, y por un rato el plan mandaba exactamente eso. Quedó en una constante,
`CONTRIBUTION_WEIGHT`, que usan las tres queries.

**Las seis métricas.** Pulso diario de aportes por tipo; altas contra
aportantes por semana —la brecha es el problema de activación—; cobertura del
mapa en el tiempo; visitantes por día; concentración (qué porción se lleva el
top 5, porque si tres personas hacen el 80% el mapa tiene punto único de
falla); y el embudo de activación.

**Visitantes que no inician sesión** (pedido a mitad del trabajo). No era
computable: no había tabla de visitas y `CallLogging` sólo escribe a stdout. La
PWA ya mandaba pageviews a Vercel Analytics, pero eso vive fuera del Postgres.
Se mide con `traffic_sessions` (V12) y un ID aleatorio en `localStorage`: **ni
IP, ni user agent, ni una fila por request**, una fila por (día, cliente). El
hash de IP se evitó porque en criterio europeo sigue siendo dato personal.
`authed` sólo sube hacia `true`, así que quien entra anónimo y después se
loguea es un visitante que convirtió y no dos personas. Eso le dio al embudo el
escalón que le faltaba: de los que miran, cuántos se anotan.

**Deuda que esto crea, y hay que pagarla antes de publicar:** esta recolección
tiene que declararse en BIR-15 (política de privacidad) y BIR-16 (Data Safety /
nutrition labels). Y los números miden **sólo la web**: la app de Android no
manda el beacon, lo cual está dicho en el hint del gráfico para que nadie lo
lea como tráfico total.

**El dashboard es la excepción al ancho de 560px.** El resto de la app se acota
porque se usa parado en un bar; el dashboard es lo único que se usa sentado.
En mobile queda breve: los seis `Stat`, la cobertura, el pulso y la lista.

**Dos aproximaciones que quedaron dichas y no escondidas.** La cobertura
histórica usa "bares creados hasta esa fecha que hoy están aprobados" porque
`bars` no guarda cuándo se aprobó uno; un bar que estuvo mucho tiempo pendiente
baja la cobertura pasada. Y el último punto de esa serie *se aproxima* al
`barsWithFreshPrice` del resumen, no coincide: uno corta a medianoche y el otro
a la hora actual.

**Dos correcciones después de verlo corriendo:** las confirmaciones pasaron de
un oro apagado a violeta —el oro quedaba pegado al ámbar de precios, que es su
vecino en la barra apilada— y el texto de los gráficos era ilegible: el viewBox
de 600 dentro de una tarjeta de 320px escala a 0,53, así que la fuente de 9 se
dibujaba a 5px. El SVG escala entero, texto incluido. viewBox a 360 y etiquetas
a 11. Eso es lo que hace la 0.6.1.

69 tests de backend en verde. Web y app compilan.

---

## 2026-09-04 — v0.7.0: el bar se abre sobre el mapa (BIR-26, 27, 25, 24)

Cuatro cosas del mapa web, todas de la misma sesión porque todas viven en
`MapScreen.tsx` y separarlas era pelearse con uno mismo por el mismo archivo.

**El pin abre una preview y no la ficha completa (BIR-26).** Hasta ahora tocar
un bar te sacaba del mapa. Comparar dos bares del barrio —que es *el* gesto de
esta app— costaba entrar, volver, entrar, y en cada vuelta la cámara se
rearmaba desde cero. Ahora sube una tarjeta desde abajo con nombre, distancia
y el precio con su antigüedad al lado, y el mapa se queda donde estaba.

La tarjeta **no hace ninguna llamada a la API**: todo lo que muestra ya venía
en el `BarPin` del mapa. Por eso aparece en el mismo frame del toque. Con un
fetch sería un esqueleto que se completa, y un esqueleto no es una preview: si
tenés que esperar para saber si vale la pena entrar, entrás igual.

Decisiones que no se ven pero se notan:

- Se guarda **el bar entero, no su id**. La lista de bares se recarga sola al
  moverse la cámara, y la preview mueve la cámara: buscando por id en `p.bars`,
  un refresco que no devolviera ese bar vaciaba la tarjeta recién abierta.
- El mapa **centra el bar arriba de la tarjeta**, no en el medio, donde la
  tarjeta lo taparía. El corrimiento se calcula en coordenadas y va en un solo
  `panTo`: encadenar `panTo` + `panBy` son dos animaciones que compiten.
- El pin abierto lleva **aro crema y su precio siempre visible**, aunque el
  descarte de etiquetas superpuestas lo hubiera dejado como punto. Perder el
  precio justo del bar que estás mirando era el peor caso posible.
- **Los dos flotantes desaparecen** mientras hay preview: ocupan exactamente la
  franja donde entra la tarjeta. Mientras mirás un lugar, "agregar un bar" no
  es lo que estás por hacer.
- Arrastrar para abajo cierra, arrastrar para arriba abre la ficha completa.
  El manijón promete un gesto; sin el gesto sería un adorno.
- La guarda de `closest('button, a')` en el `pointerdown` no es cosmética:
  `setPointerCapture` sobre el contenedor le roba el `click` al botón, así que
  sin eso la X no cerraba nada.

Las flechas para ciclar entre bares cercanos que menciona BIR-26 quedan afuera:
el propio issue las deja "a debatir", y el mapa ya es el ciclador.

**Frescura y precio suben a la fila del rango (BIR-27).** Eran dos filas de
controles sobre el mapa para tres filtros. El modo apagado ahora muestra sólo
sus tres colores, sin texto: con las dos etiquetas puestas la fila no entra en
un teléfono angosto, y el nombre que importa es el del modo prendido. La
leyenda de colores —que era la razón de ser del toggle— se conserva entera,
porque los swatches siguen en los dos lados.

**El botón de centrar vuelve al punto elegido (BIR-25).** Si hay punto
secundario, centra ahí; antes lo borraba y se iba al GPS, o sea que perdías el
punto por querer volver a él. Y ese punto es el que manda la consulta: el
radio, la lista y los precios salen de ahí. Para volver a tu ubicación se borra
el punto con un toque en el mapa, que es el mismo gesto con el que se puso. El
ícono va crema cuando apunta al punto y ámbar cuando apunta a tu ubicación —
los colores de cada uno de los dos puntos en el mapa.

**El slider de rango deja de ser de 1900px (BIR-24).** `alignSelf: stretch` lo
estiraba a todo el viewport en escritorio: arrastrar de punta a punta cambiaba
el radio 8 metros por píxel. Tope de 420px.

Sólo la web. La app de Android sigue con el flujo de siempre; si el sheet
gusta, allá se hace con `ModalBottomSheet` y es otra sesión.

Backend sin tocar. `npm run build` en verde.

---

## 2026-09-04 — v0.6.3: dejar de pedir permiso de ubicación en cada apertura

Dos cosas de la PWA, las dos sobre gestos y permisos.

**El cartel de ubicación aparecía al abrir, y a veces dos o tres veces
seguidas.** Tres causas, tres arreglos, en `useBars.ts`:

- *Se pedía más de una vez por carga.* `useLocation` disparaba
  `getCurrentPosition` desde un `useEffect` sin ninguna guarda fuera del
  componente: el doble montaje de StrictMode —y cualquier remontaje del
  árbol— era otra llamada, y cada llamada es otro cartel encima del anterior.
  Ahora la guarda es de módulo: un pedido por carga de la app.
- *No se guardaba nada.* Cada apertura arrancaba sin saber dónde estás, así
  que el permiso era condición para que la app sirviera —de ahí la pantalla
  "Buscando dónde estás…" bloqueando la primera pintura—. El último fix se
  guarda en `localStorage` con su timestamp y vale una semana. Al abrir se
  arranca de ahí: la app abre donde la dejaste, sin preguntar nada.
- *Se preguntaba aunque el navegador ya supiera la respuesta.* Ahora se
  consulta la Permissions API primero. `granted` → ubica sin cartel. `denied`
  → ni se llama al GPS, que era pedirle al usuario que vuelva a decir que no.
  `prompt` con posición guardada → **no se pregunta al abrir**: el cartel
  espera al botón de centrar, que es el gesto que quiere decir "dónde estoy".
  Sólo la primera visita, sin nada guardado, ve el cartel al entrar.

De paso, el botón de centrar no vuelve a molestar al GPS si el fix tiene menos
de un minuto, y `maximumAge` pasó a ese mismo minuto para que dos pedidos
seguidos reusen el fix del navegador en vez de encender la antena.

Lo que **no** se arregla desde acá, y conviene tenerlo escrito: iOS no recuerda
el permiso entre lanzamientos de una PWA instalada. No hay API para eso. Por eso
importa la caché — sin GPS la app abre igual, y el permiso pasa a ser una
mejora y no un peaje.

**La ficha del bar se cierra arrastrando hacia abajo (`BarDetail.tsx`).** Es el
gesto inverso al que la abre desde el mapa, y faltaba: se abría con el pulgar y
se cerraba con la flechita de la esquina. Sólo cuenta desde el scroll arriba de
todo —más abajo un arrastre vertical es scroll y nada más—, sólo si es
claramente vertical, así que no le roba el swipe a las pestañas de birras ni a
la tira de fotos, y se desactiva con un diálogo o el visor de fotos abierto:
esos viven adentro del contenedor y sus toques burbujean hasta él.

Dos detalles que se sienten:

- El `transform` **no queda puesto en reposo**. Un transform crea bloque
  contenedor y los `position: fixed` de los diálogos dejarían de medirse contra
  el viewport.
- Se navega *después* de la animación de salida, no en el `touchend`.
  Desmontar en pleno arrastre hace aparecer el mapa de golpe.

Backend sin tocar. `tsc -b` y `npm run build` en verde.

---

## 2026-09-04 (cont.) — v0.6.4: swipe para cambiar de orden en la lista (BIR-29)

Arrastrar la lista al costado cambia entre "Más cerca" y "Más barata". Las
píldoras siguen estando: el gesto es el atajo, no el único camino. Con el
teléfono en una mano y una birra en la otra, apuntarle a una píldora de 34px
cuesta más que barrer la pantalla.

Todo el trabajo real está en convivir con el scroll vertical, que es el gesto
dominante de esta pantalla. Tres decisiones:

- **El eje se decide una sola vez por gesto**, a los 10px de recorrido, y no se
  revisa más. Revisándolo en cada frame, un scroll con la mano un poco torcida
  cambiaba de orden a mitad de camino.
- **El horizontal tiene que superar al vertical por 1.4x.** Un pulgar nunca
  traza una recta; sin el margen, cualquier scroll pasaba por swipe.
- **No se llama a `preventDefault` en ningún momento**, y no hace falta: no hay
  desbordamiento horizontal que scrollear, así que el gesto no compite con
  nada del navegador. Además React escucha `touchmove` en modo pasivo, así que
  un `preventDefault` ahí sería una excepción en consola y nada más. Tampoco se
  toca `touch-action`: ponerle `pan-y` al contenedor le rompía el arrastre al
  slider del radio, que vive adentro.

Dos detalles que se ven:

- **En los extremos la lista se resiste** (dx/5) en vez de moverse. No hay a
  dónde ir, y decirlo con el gesto es más claro que no reaccionar.
- **El arrastre se pinta sobre un `deck` de forma imperativa**, no por estado:
  un re-render de hasta 400 filas por frame de dedo no es una animación, es un
  tirón. Y ese `deck` envuelve sólo la lista, no el encabezado: un `transform`
  en un ancestro rompe el `position: sticky` de lo que tenga adentro, y la
  barra de búsqueda y orden es justamente lo que tiene que quedarse quieto.

De paso, las píldoras pasaron a recorrer la misma constante `SORTS` que usa el
swipe. Si el array y las píldoras se desordenaran entre sí, el gesto llevaría
al modo contrario del que muestra la pantalla.

Buscando el swipe no hace nada: los resultados vienen del servidor por
cercanía y las píldoras ni se muestran.

**Sin verificar en navegador.** La extensión de Chrome no estaba conectada en
esta sesión, así que el gesto está razonado y compila, pero no probado con un
dedo. Los umbrales (10px para decidir eje, 1.4x de margen, 55px para confirmar)
son los primeros candidatos a retocar si en la mano se siente mal.

Backend sin tocar. `npm run build` en verde.

---

## 2026-09-04 (cont.) — v0.6.5: `/bars` deja de regalar la base entera (BIR-13)

El issue proponía tres caminos y ninguno de los tres sobrevivió al primer
cálculo. Vale la pena dejar escrito por qué, porque la conclusión es
contraintuitiva.

**Una cuota de filas por día no sirve: el scraper es más eficiente que el
usuario real.** Bajarse los ~738 bares eran dos requests de 500 filas, o sea
~1.000 filas/día. Un usuario paseando el mapa pide entre 2.000 y 5.000, porque
`useBars` sobre-pide 2.5x y vuelve a consultar con cada radio, cada estilo y
cada zona nueva. Cualquier cuota holgada para el usuario le sobra al scraper
varias veces. La intuición de "límite por volumen" está exactamente al revés
acá.

**Lo que sí los separa es la cobertura, no el volumen.** El usuario mira
siempre los mismos doscientos bares de su barrio; el scraper quiere la unión de
todos, por definición. Contando **bares distintos por IP y por día** la
asimetría se da vuelta: repetir sale gratis para siempre y lo único que se paga
es territorio nuevo. `CoverageBudget`, 400 bares distintos por día.

**Pero eso obligaba a bajar `limit` igual.** Con el tope viejo de 500, un solo
request cubría el 68% de la base y ningún presupuesto de cobertura razonable
sobrevivía a una llamada. Así que `limit` 500 → 200 y `radius` 50 km → 20 km.
El invariante que importa —y que tiene su propio test— es **`MAX_LIMIT` <
`DEFAULT_PER_DAY`**: si un request lleno no entrara en el presupuesto de todo
el día, el endpoint quedaría roto para cualquiera desde el primer toque.

**En memoria, sin tabla.** La clave es la IP, y en `traffic_sessions` se
decidió a propósito no guardar ni IP ni hash de IP (en criterio europeo un hash
de IP sigue siendo dato personal). Esa decisión no se revisa por esto: la IP
vive en un `LinkedHashMap` con desalojo LRU y no sobrevive a un reinicio, igual
que el balde del `RateLimit` de Ktor que ya estaba instalado. El costo es que
un redeploy le devuelve el presupuesto a todo el mundo; para defenderse de
extracción sostenida da igual, porque hay que adivinar cuándo se reinicia.

**Un bug de caché que salió a la luz al bajar los topes.** `useBars` anotaba en
`covered` el radio *pedido*, no el *servido*. Cuando el servidor recorta por
`limit`, lo que realmente se cubrió llega hasta el bar más lejano que volvió, no
hasta `big`. Con el tope de 500 ya pasaba y se veía poco; con 200 iba a pasar
seguido: `covers()` daba por cubierta una zona sin datos, no volvía a consultar,
y al panear hacia el borde el mapa se veía vacío. Ahora, si la respuesta vino
llena, la cobertura se anota hasta la distancia del último bar recibido.

**Lo que esto NO es.** No es prevención, es fricción, y está dicho en el KDoc:
una IP no es una persona (un NAT comparte presupuesto, por eso el número es
varias veces la base), y rotar IPs lo saltea entero. En un mapa que se mira sin
cuenta no hay nada mejor disponible sin romper el producto. Lo que sube de
precio es la extracción *sostenida* —la serie temporal de precios, que es el
activo de verdad; el snapshot envejece solo a los 45 días—.

79 tests de backend en verde (69 + 10 nuevos, todos de `CoverageBudget`, que es
memoria pura y no toca la base). Web compila.

**No hay test por HTTP del 429**: en este repo no existe harness de
`testApplication` y montarlo era más grande que la feature. El cableado en
`Routes.kt` son cuatro líneas y quedó sin cubrir; si algún día se arma ese
harness, es lo primero que hay que agregarle.

---

## 2026-09-04 (cont.) — v0.6.6: el precio cargado se ve en el mapa al toque (BIR-23)

El reporte decía "tarda en actualizarse" y "tuve que poner buscar
actualización". No tardaba: **nadie le avisaba al mapa**.

`BarDetail.act()` es el embudo de las tres mutaciones de precio —confirmar,
cargar y borrar— y sólo llamaba a `load()`, que recarga la ficha del bar. El
`onChanged` que invalida la caché de `useBars` estaba cableado en un único
lugar de todo el archivo: borrar el bar entero. Así que después de cargar un
precio el pin se quedaba con el valor viejo hasta que `covered` se vencía sola
por `MAX_AGE_MS` (cinco minutos), o hasta recargar la app —que es lo que
"buscar actualización" termina haciendo—. Cargabas un precio, volvías al mapa y
el bar seguía diciendo lo de antes: la app parecía haber perdido el reporte.

El arreglo va en `act()` y no en cada botón. Los tres usos son precios y los
tres mueven el pin; un cuarto uso que no lo moviera tendría que decirlo
explícitamente, no al revés. Olvidarse de invalidar es justamente el bug.

**Dos sitios más con el mismo agujero, encontrados buscando el primero:**

- `MyContributions` borra un reporte propio y no invalidaba nada. Si el borrado
  era del precio vigente, el mapa seguía mostrando un precio que ya no existe
  —peor que mostrarlo viejo—. Ahora recibe `onChanged` como el resto.
- **Android tenía el bug idéntico.** `reloadAfterChange()` se llamaba sólo al
  borrar un bar y al agregar uno, nunca tras un precio. Se resolvió igual pero
  en el ViewModel y no en la pantalla: la UI no sabe cuándo terminó la
  corrutina, así que el aviso sale de `confirmPrice`, `reportPrice` y
  `removePrice`, al lado del `load()` que ya estaba.

**Lo que NO era.** El primer sospechoso era el service worker sirviendo
respuestas de la API cacheadas, que explicaría igual de bien los dos síntomas.
No es: `runtimeCaching: []` en `vite.config.ts` y el `globPatterns` sólo toma
assets. Queda dicho para que el próximo no vuelva a mirar ahí.

Web compila. Android compila (`compileDebugKotlin`). Backend sin tocar.

**Sin verificar a mano**: la extensión de Chrome no estuvo conectada en toda la
sesión. La cadena de llamadas está leída de punta a punta —`act` → `onChanged`
→ `afterChange` → `invalidate()` + `refresh(true)` → `load` con `force`, que
saltea `covers()`— pero nadie cargó un precio y miró el mapa.

---

## 2026-09-04 (cont.) — v0.6.7: la app dejaba de decirte que estás en el Obelisco

Reporte de varios usuarios: el mapa les marcaba que estaban en el Obelisco
estando en otro lado.

`useLocation` rellenaba `coords` con `BA_CENTER` en tres caminos —permiso
negado, GPS con timeout, navegador sin geolocalización— con el comentario "sin
permiso y sin nada guardado hay que mostrar algo: el centro". Y `App.tsx` pasa
ese mismo `coords` como `myLocation`, que es lo que dibuja el punto azul de
"acá estás". O sea: el valor puesto para encuadrar la cámara terminaba
afirmando una posición.

**La distinción que faltaba es entre "por dónde empezar a mirar" y "acá
estás".** La primera admite un default; la segunda no admite ninguno. Ahora
`coords` guarda sólo posiciones reales y puede quedarse en `null` para siempre;
el centro sobrevive únicamente en `coords ?? BA_CENTER` de App.tsx, que es
encuadre y no una afirmación. Sin posición no hay punto azul.

Tres consecuencias que hubo que atar, porque `coords` estaba haciendo de dos
cosas a la vez:

- **`denied` corta la espera.** Sin él, negar el permiso dejaba la app colgada
  para siempre en "Buscando dónde estás…", porque el valor inventado era lo que
  la destrababa. `useLocation` ya lo exponía y nadie lo usaba.
- **`queryPoint` cae al centro sólo si `denied`.** Es de dónde consultar bares,
  no dónde está la persona. Sin esto, quien niega el permiso y abre la lista
  antes que el mapa no veía ningún bar: nunca hubo cámara de la que sacar un
  punto.
- **Un cartel en el mapa.** Sacar el punto azul no alcanza: un mapa centrado en
  el Obelisco sigue siendo indistinguible de un mapa centrado en vos. Dice "No
  pudimos ubicarte — esto es el centro", con un "Reintentar" al lado.

**Android no tiene el bug.** Usa `isMyLocationEnabled` del SDK de Maps, gateado
por el permiso real: el punto azul lo dibuja el sistema desde la ubicación de
verdad y la app no le pasa ninguna coordenada. `BUENOS_AIRES_CENTER` allá sólo
encuadra la cámara, que es justamente la distinción que a la web le faltaba.

Web compila. **Sin verificar a mano**: la extensión de Chrome no estuvo
conectada en toda la sesión. Se prueba negando el permiso de ubicación en el
navegador y mirando que no aparezca el punto azul y sí el cartel.
