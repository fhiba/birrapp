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

## 2026-09-04 (cont.) — Vincular los bares de OSM con Places (BIR-14)

`scripts/link_place_ids.mjs`. Los 738 bares que sembró `seed_osm.mjs` no tienen
`google_place_id`, así que la deduplicación exacta de `BarRepo.create` no aplica
sobre ellos y alguien que carga un bar desde el autocompletado de Google crea un
duplicado de uno que ya está. Queda la defensa de nombre + 100 m, pero es
justamente la que falla cuando OSM y Google le dicen distinto al mismo lugar,
que es el caso común — y es lo que pasó con "Venice Bar Acassuso".

**Guardar el `place_id` está permitido y no contradice la regla de la casa.**
Los términos de Places prohíben guardar *contenido* de lugares más de 30 días,
y el `place_id` está explícitamente exento. Ya estaba dicho en
`V3__google_place_id.sql`. El script no guarda ninguna otra cosa de Google: el
nombre y la ubicación que vuelven se usan para decidir si el match sirve y se
descartan.

**El match no se cree lo que le dicen.** Un `place_id` equivocado es *peor* que
ninguno: haría que `create` rechace como duplicado un bar legítimo. Así que un
candidato entra sólo si está a menos de 150 m y el nombre se parece 0,5 o más.
Los 150 m no son generosos: OSM apunta al polígono del edificio y Google a la
entrada, y en una esquina de Palermo eso ya son 40 m.

El parecido de nombres es solapamiento de tokens **sobre el más corto**, no
Jaccard. Jaccard castiga que un lado tenga más palabras, y ése es el caso normal
acá: OSM dice "Antares" y Google "Antares Cervecería Artesanal Palermo Soho".
Sobre el más corto eso da 1, que es la respuesta correcta; Jaccard daría 0,25.
Antes de comparar se sacan tildes y las palabras que no distinguen nada —"bar",
"cervecería", "the"— porque aparecen en media base y sumaban parecido falso.

**El regalo.** `idx_bars_place_id` es UNIQUE, así que si dos filas matchean el
mismo lugar el índice no las deja entrar a las dos. Pero eso no es un error del
script: son dos filas que representan el mismo bar y **ya estaban duplicadas**.
El script las reporta y vincula la de id más bajo; cuál sobrevive de verdad es
una decisión de moderación, no de un script. O sea que el backfill sirve además
como detector del problema que el issue quiere evitar hacia adelante.

**Cuesta plata, así que está armado para no repagar.** Checkpoint en disco
escrito en cada vuelta —no al final— para que un corte a mitad de camino no
cueste dos veces; "consultado y sin match" se anota como `null`, distinto de
"todavía no consultado", o cada corrida volvería a pagar por los bares que
Google no reconoce; `--limit` para acotar la primera corrida y `--dry-run` que
no llama a nada. Los errores de red no se anotan, para que se puedan reintentar.

La escritura va por el mismo camino que `seed_osm.mjs`: COPY a una tabla
temporal y UPDATE desde ahí. `psql -c` no acepta parámetros, y concatenar SQL
con algo que volvió de una API externa es exactamente donde aparecen los
agujeros.

**Verificación.** `--self-test` corre las aserciones del matcher con
`node:assert` (incluye el caso "Venice Bar", el de 4 km que no debe matchear y
el del vecino de al lado que tampoco) — en verde. `--dry-run` corrido contra la
base de dev: encuentra los 738 bares sin vincular, con nombres y coordenadas
bien parseados. **Lo que NO se probó: la llamada a Places.** No tengo la API
key, y son ~738 llamadas con costo real. Conviene la primera corrida con
`--limit 25` y mirar el log antes de soltarlo entero.

Sin cambio de versión: no se toca nada que se publique, sólo se agrega un script
de mantenimiento.
---

## 2026-09-04 (cont.) — Entorno de test: la parte que vive en el repo (BIR-21)

Hasta hoy todo salía derecho a `master`, o sea a producción, sin ningún lugar
donde probarlo antes. Se notó en esta misma sesión: cuatro features y dos bugs
mergeados a producción sin que nadie los viera andar.

Lo que se puede hacer desde el repo es la mitad; la otra mitad son clics en
Railway, Neon, Vercel y Google Cloud. Queda documentado paso a paso en
`docs/DEPLOY.md` § "Entorno de test", con la forma: `dev` → staging,
`master` → producción, y environment de Railway en vez de servicio aparte
porque las variables se definen por environment, que es justo lo que hace falta.

**La base de staging va vacía, sembrada desde OSM.** Neon clona una branch con
los datos de un clic y es tentador, pero `users` tiene emails y `google_sub` de
gente real. Copiarlos a un entorno con menos cuidado contradice la línea que
sostiene el resto del proyecto —`traffic_sessions` sin IP ni user agent, el
presupuesto de BIR-13 sin persistir la IP—. El costo es no tener precios reales
para probar frescura; es barato al lado de arrastrar identidades.

**`JWT_SECRET` distinto en staging, y no es capricho.** Con el mismo secreto, un
token emitido por el entorno de pruebas vale en producción. Un entorno que
emite credenciales para el entorno real no es un entorno de pruebas.

**`scripts/smoke.mjs`** es lo que hace que el staging sirva de algo. Un entorno
sin forma de verificarlo se prueba a ojo, y a ojo no se ve lo que importa.
Chequea, en orden de qué tan seguido se rompe:

1. **CORS entre la web y el backend** — la falla número uno de un entorno nuevo:
   el backend levanta, `/health` contesta, y la app no muestra nada porque
   `ALLOWED_ORIGINS` quedó con el dominio de producción.
2. **Que la base esté conectada y sembrada** — `/health` no toca Postgres, así
   que un backend con la `DATABASE_URL` mal apuntada pasa el health check.
3. **Que los topes de BIR-13 estén desplegados** — la diferencia entre el
   entorno que creés que desplegaste y el que desplegaste.
4. **Que el bundle de la web apunte al backend de test.** El error más
   silencioso de todos: staging se ve perfecto mientras escribe en la base de
   producción, y mirando la pantalla no hay forma de darse cuenta.

Sale con código 1 si algo falla, así que sirve de paso previo a un merge.

**Verificado corriéndolo contra el backend local**, que resultó ser un caso de
prueba mejor que uno inventado: pasó los cuatro chequeos de vida y **falló los
dos de BIR-13**, porque el proceso local es un build anterior a ese merge. O
sea que detectó una desincronización real de versión, que es exactamente para lo
que existe. Contra staging todavía no se corrió: el entorno no está creado.

De paso, `DEPLOY.md` decía "`/bars` no tiene límite de tasa" en la lista de
pendientes. Es falso desde BIR-13; corregido, con el matiz de que lo que hay es
fricción y no prevención.

---

## 2026-09-04 (cont.) — El smoke test se estrena y encuentra algo (BIR-21)

Corrido por primera vez contra la URL real del preview de Vercel, y encontró un
bloqueante que no habíamos visto: **está detrás de Vercel Deployment
Protection**. Responde `302` a `vercel.com/sso-api` a cualquiera sin sesión de
Vercel en ese navegador. Con eso puesto el entorno de test no sirve: no se abre
desde el celular —que es donde se usa la app— y el callback de OAuth de Google
tampoco puede volver. Viene prendido por defecto en los Preview.

El chequeo ahora lo detecta por nombre y dice qué tocar, en vez de fallar con
"la respuesta no parece el index de la PWA", que manda a buscar al lugar
equivocado. Va con `redirect: 'manual'`: siguiendo el 302 se termina en una
página de login de Vercel que después falla por otro motivo, y el mensaje que
sale no tiene nada que ver con la causa.

**Y se arregló un defecto del propio reporte**: los chequeos salteados se
pintaban con ✓. El de "la web no apunta al backend equivocado" decía que estaba
bien cuando en realidad nunca se había podido mirar. Un salteo pintado de verde
es peor que no chequear: ahora hay un estado propio (`–`) y el resumen los
cuenta aparte. Un verificador en el que no se puede confiar no sirve para nada.

Estado del entorno: `dev` ya despliega, la URL de Vercel existe, y faltan la
protección de Vercel y el backend de staging en Railway.

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

---

## 2026-09-04 (cont.) — v0.6.8: el "Reintentar" que no podía reintentar

Pregunta de Felipe sobre la 0.6.7: "¿entonces ahora te muestra un botón para
darle permisos si no le diste?". Mirando el código, la respuesta era a medias, y
la mitad mala era un botón muerto.

El cartel traía un "Reintentar" que llama a `getCurrentPosition`. Eso funciona
si el permiso está en `prompt` —ahí el navegador sí abre el pedido— o si está
`granted` pero no hubo fix. **Pero si la persona bloqueó la ubicación para el
sitio, no hace absolutamente nada**: el navegador contesta el error al instante
y no vuelve a preguntar nunca. Desde JavaScript no hay forma de reabrir el
pedido. Y ése es justamente el caso más común detrás de "no me ubica".

Un botón que promete una acción que no puede cumplir es la misma clase de
mentira que el punto azul en el Obelisco, que es lo que arreglaba la 0.6.7. Por
eso va en la misma tanda y no en el backlog.

**`denied` era un booleano que colapsaba dos situaciones opuestas.** Ahora
`useLocation` expone `permission` (`granted` / `prompt` / `denied` / `unknown`)
y el cartel dice una cosa u otra:

- Sin bloqueo → "No pudimos ubicarte — esto es el centro" + Reintentar, que sirve.
- Bloqueado → se dice que está bloqueado y **dónde se destraba** (el candado de
  la barra de direcciones), sin ofrecer un botón que no puede funcionar. Es lo
  único accionable que queda.

**De dónde sale el estado.** De la Permissions API cuando existe, y del código
`PERMISSION_DENIED` del error sólo cuando NO existe —Safari viejo—. El orden
importa: un prompt que la persona cierra sin decidir también llega como código
1, pero el permiso sigue en `prompt` y ahí reintentar todavía sirve. Fiarse del
código del error en un navegador que tiene Permissions API haría aparecer el
mensaje de bloqueo a alguien que sólo cerró el cartel.

**Y se escucha `status.onchange`.** Si la persona lo destraba desde la
configuración del sitio, el estado cambia sin recargar y la app se ubica sola.
Sin eso habría que terminar el mensaje con "y ahora recargá", que es un paso más
para algo que el navegador ya nos está avisando.

Web compila. Sin verificar a mano, por lo mismo de siempre: la extensión de
Chrome no conectó en toda la sesión.

**Queda anotado, no arreglado:** con el permiso bloqueado pero una posición
guardada en `localStorage`, el punto azul se dibuja ahí, y esa posición puede
tener hasta 7 días (`FIX_TTL_MS`). Es una posición donde la persona estuvo de
verdad, así que es mucho menos grave que el Obelisco, pero sigue presentándose
como "acá estás" sin decir de cuándo es. Mismo patrón que la regla de los
precios: el dato sin su antigüedad al lado miente.

---

## 2026-09-04 (cont.) — v0.6.9: se apaga la cuota de cobertura, que rompió la app

**Incidente.** Un usuario en otra ciudad y en otra red abrió el mapa y recibió
`429` con el mensaje que escribí para BIR-13: "por hoy alcanzaste el límite de
bares nuevos desde esta conexión". No vio bares viejos: `/bars` falla entero, y
la pantalla queda vacía. Al lado, la misma zona y el mismo bar funcionaban
perfecto desde otro teléfono.

Estuvo prendido menos de un día.

**Mi primer diagnóstico fue equivocado** y lo dije antes de verificarlo: supuse
WiFi compartido, y no estaban ni en la misma red ni en la misma ciudad. Queda
anotado porque el error de método importa más que el de contenido: tenía dos
capturas y una hipótesis, y presenté la hipótesis como causa.

**Las dos causas posibles, ninguna confirmada:**

1. **El número.** Con `MAX_LIMIT` en 200, dos consultas de zonas distintas
   gastan los 400. El cálculo que justificaba el 400 —"un barrio son doscientos
   bares y repetirlos es gratis"— era correcto sobre repetir y equivocado sobre
   explorar, que es exactamente lo que hace alguien que abre la app por primera
   vez.
2. **Que la clave no distinga a nadie.** Si detrás del proxy de Railway
   `origin.remoteHost` devuelve siempre lo mismo, esto nunca fue una cuota por
   IP: era una cuota global, y el primero que paseaba el mapa se la gastaba para
   todos. Explicaría a alguien en otra red recibiendo el 429 sin haber pedido
   casi nada.

La segunda hipótesis tiene una consecuencia que sobrevive a este commit: **el
`RateLimit` global de 120/min de `Application.kt` usa la misma clave y sigue
encendido.** Si `remoteHost` colapsa, ese límite también es global, y a 120
req/min entre todos los usuarios el mapa se rompe solo apenas haya tráfico. Hay
que medirlo, y es más urgente que volver a prender la cuota.

**Lo que se hizo.** `COVERAGE_BUDGET_PER_DAY`, default **0 = apagado**. Con 0,
`charge()` devuelve `true` por todos los caminos y no guarda nada. Los topes de
`limit` (200) y `radius` (20 km) se quedan: no le sacan nada a nadie, el cliente
pide exactamente eso, y son la parte de BIR-13 que no rompió nada.

Se conserva la clase y sus tests en vez de borrarlos, con la advertencia arriba
de todo: **encenderla con un número más grande sin haber medido cuál de las dos
causas era es repetir el incidente más tarde.**

81 tests de backend en verde (79 + 2 nuevos, los del estado apagado).

---

## 2026-09-12 — v0.7.0: el contador de birras y el "+" que pregunta qué

Cinco tickets de una tanda, todos del mismo racimo: **BIR-34** (contador),
**BIR-36** (el menú del "+"), **BIR-35** (proponer estilos), **BIR-37/BIR-5**
(favoritos) y **BIR-33** (stats de la zona). Sólo backend + PWA: Android queda
para una rama aparte y la API ya está lista para cuando vaya.

### El "+" dejó de hacer una sola cosa

Hasta ahora el botón del mapa iba derecho a "agregar un bar". Cargar un precio
sólo se podía desde adentro de la ficha de un bar, y anotar una birra no
existía. Ahora es un desplegable chico anclado al botón —no una pantalla: elegir
qué vas a cargar es un paso de tránsito, y una vista entera lo convierte en un
trámite— con tres renglones: anotar una birra, cargar un precio, agregar un bar.

"Cargar un precio" pide el bar con los de al lado primero y un buscador para el
resto, y entra a la ficha con `?precio=1`, que abre el teclado de precio solo.
Quien eligió esa opción ya dijo a qué venía; dejarlo en la ficha sería
pedírselo de nuevo.

### El contador (BIR-34)

Tabla `beer_logs`, y a diferencia de `price_reports` **no es append-only**:
esto no es dato comunitario, no alimenta el mapa y no hay histórico que
defender. Quien anota una birra de más la borra y listo.

Todo es opcional menos la persona y la fecha. Anotar tiene que costar un tap,
igual que "Sigue igual" — el bar viene preelegido si hay uno a menos de 250 m
(el "¿la birra te la tomaste acá?" de BIR-36), la cantidad arranca en 1, y el
estilo y la marca están plegados detrás de "¿cuál era?". Si anotar cuesta lo
mismo que cargar un precio, nadie anota, y un contador que no se usa no cuenta
nada.

**La zona horaria no es un detalle.** El calendario y las rachas se agrupan por
`drank_at AT TIME ZONE 'America/Argentina/Buenos_Aires'`, fijo en el servidor.
Agrupando por el timestamp crudo, una birra de las 23:30 de un viernes aparece
el sábado y las rachas se cortan solas; el bug sería invisible hasta las nueve
de la noche. La zona no se negocia con el cliente: si la mandara el navegador,
el mismo dato se vería distinto según dónde esté el teléfono. Hay un test que
lo fija, y se verificó que falla si se cambia la zona a UTC.

Las rachas salen en SQL por gaps and islands. La actual admite que el último
día sea ayer: cortada a medianoche, abrir la app a la mañana mostraría cero
todos los días.

**Los emblemas se derivan, no se guardan.** Seis, calculados sobre cinco
cuentas de la misma tabla. Una tabla de emblemas ganados haría falta si
importara *cuándo* se ganó cada uno o si las reglas dependieran de algo que no
está en los logs; hoy no es el caso, y sin tabla no hay nada que se pueda
desincronizar. El umbral viaja al cliente (`target`) para que cambiarlo no
obligue a publicar una versión de la PWA. **BIR-32 queda abierto**: esto es la
mitad de emblemas, no el sistema de XP y niveles.

### Estilos propuestos por usuarios (BIR-35)

`beer_styles` recibe `status` y `created_by`, exactamente el patrón de
`brands`. El vocabulario cerrado es lo que permite comparar IPA contra IPA,
pero uno que no crece deja afuera a la birra que la persona tiene enfrente — y
lo que hace entonces no es abandonar, es elegir el estilo más parecido. Eso
ensucia el dato en silencio, que es peor que una lista con un estilo de más.

Va adentro del selector de estilo y **no** en el menú del "+": nadie abre la
app queriendo proponer un estilo en abstracto, se le ocurre cuando el suyo no
está en la lista. Rechazar no borra la fila: `price_reports.style_id` es
ON DELETE RESTRICT justamente para que un rechazo no se lleve puesto un precio.

### Favoritos (BIR-37 + BIR-5, que eran el mismo ticket)

`favorites (user_id, bar_id)` con clave compuesta: favoritear dos veces no es
un favorito nuevo, y con la PK ahí el `ON CONFLICT DO NOTHING` hace el botón
idempotente sin una línea de Kotlin. Corazón en la ficha del bar y filtro en la
lista. El filtro **pide al servidor** en vez de filtrar lo que hay en memoria:
la lista sólo tiene lo que entra en el radio, y el favorito que uno quiere ver
casi siempre está en otro barrio. Filtrando en memoria, un favorito lejos
simplemente no aparecería.

### Stats de la zona (BIR-33)

Tarjeta arriba de la lista, plegada, que respeta el radio y el filtro de estilo
que ya estén puestos. Dos decisiones:

- **Todo normalizado a una pinta de 473 ml.** Sin eso, un schop de 330 y una
  pinta de 473 se promedian como si fueran lo mismo y el número baja cuando lo
  que cambió fue el tamaño del vaso. La tarjeta lo dice: un promedio sin su
  unidad es otra forma de mentir.
- **"El mejor de la zona" es nota sobre precio**, con `rating_avg` (el del
  shrinkage), no la nota más alta. Con el promedio crudo, una sola persona
  votando 5 a la birra más barata se lleva el puesto sola. Sin votos en la
  zona no hay "mejor": no se puede decir cuál es la mejor si nadie opinó.
- Con menos de tres precios no se muestra nada. Un promedio de dos no es un
  promedio, es un precio con pretensiones.

### Verificación

107 tests de backend en verde (81 + 26 nuevos). `tsc` y build de la PWA
limpios. Los endpoints nuevos se probaron a mano contra un backend local con
PostGIS sembrado: stats, anotar, resumen con calendario y rachas, proponer
estilo, moderarlo, favoritear y desfavoritear.

**Lo que no se verificó: las pantallas, tocándolas.** La extensión de Chrome no
conectó, igual que en las últimas sesiones. Compila y buildea, y la lógica de
fechas del calendario se chequeó aparte, pero nadie tocó el menú del "+" con un
dedo todavía.

**Anotado, no hecho:** el contador existe sólo en la PWA. La app de Android
sigue con el "+" viejo que lleva directo a agregar un bar. Queda como ticket
propio.

---

## 2026-09-12 (cont.) — el deploy a `dev` pasa a ser local

Decisión de Felipe: en vez de desplegar cada rama a `dev` para probarla, se
levanta entera en su máquina. El motivo es el de siempre en este proyecto —
probar en un despliegue tiene un ciclo de minutos y, sobre todo, expone los
errores a quien esté usando la app mientras tanto, que es exactamente cómo nos
enteramos de que la 0.6.9 estaba rota.

`scripts/dev.sh` levanta todo y `Ctrl-C` lo baja. Tres decisiones, todas
obligadas por lo que ya había corriendo en la máquina:

**El backend va en 8091 y no en 8090.** El 8090 lo tiene desde el 3 de
septiembre el jar de `birrapp-deploy`, que es a lo que le apunta el Funnel de
Tailscale y, por lo tanto, el APK de los que están probando. No se lo toca: si
algo del entorno local sale mal, volver es apagarlo y nada más.

**La base es `birrapp_dev`, no `birrapp`.** Copia de bares, estilos, marcas y
precios reales —740 bares— **sin la tabla `users`** y con el `reported_by` de
cada precio en NULL. Es la misma línea que ya fijaba este documento para el
entorno de test: un precio es un dato sobre un bar, un usuario es un dato sobre
una persona, y sólo uno de los dos se copia a un entorno con menos cuidado.
`scripts/dev_seed.sh` la rearma cuando haga falta. Notas, fotos y comentarios
no se copian porque todos cuelgan de un usuario.

**El Funnel se da vuelta a 8091 mientras corre.** Es lo único que no se puede
esquivar: el redirect de Google está registrado contra
`debiansl.tail7fb17e.ts.net`, así que para que el login ande, el callback tiene
que llegar al backend de la rama. La contra está dicha en el script y en
AGENTS.md: **durante ese rato los teléfonos pegan contra código sin mergear**.
Por eso el script restaura el Funnel al salir, y por eso no es para dejarlo
prendido e irse. Con `DEV_FUNNEL=0` no se toca nada y no hay login.

**Dos bugs del propio script, encontrados probándolo** (que es la parte que
importa de haberlo probado):

1. `npx vite` mete un `sh -c` en el medio, así que el pid que quedaba guardado
   era el del wrapper. Al bajar todo, vite seguía vivo ocupando el 5173 y el
   arranque siguiente moría contra `--strictPort`. Se llama al binario
   directo. Lo mismo con el java de Gradle, que se busca por línea de comando
   — con el path del worktree adelante, para no llevarse puesto el backend de
   otro agente trabajando en otra rama.
2. La restauración del Funnel se probó a mano en los dos sentidos y después
   con un `SIGTERM` sobre el script entero. Un script que deja el Funnel
   apuntando a un puerto muerto rompe la app de todos los que tienen el APK, y
   eso no es algo para asumir que funciona.

La rama `dev` queda como estaba —`feature` → `dev` → `master`—, sólo que ya no
despliega nada. `docs/DEPLOY.md` conserva la sección del entorno desplegado:
sigue haciendo falta para lo que en local no se puede probar de verdad
(migraciones grandes, R2, el comportamiento detrás del proxy).

---

## 2026-09-12 (cont.) — v0.7.1: lo que Felipe marcó de la 0.7.0, más BIR-30

Tres devoluciones sobre la tanda anterior y un ticket nuevo.

**El contador sube a los cuadrados del perfil, y cada aporte tiene su
pantalla.** Los tres cuadrados —precios, fotos, bares— llevaban todos a la
misma vista con los cuatro tipos apilados. Eso tenía el problema de siempre de
las vistas compartidas: tocabas "Fotos" y caías arriba de todo, con los precios
por delante. El número que tocás tiene que ser el que te recibe. Ahora la ruta
es `/mis-aportes/:tipo` y cada cuadrado abre su lista. La consulta sigue siendo
una sola —el endpoint devuelve todo junto y cada pantalla muestra su parte—:
partirlo serían cuatro viajes para el mismo dato.

"Birras tomadas" entra como cuarto cuadrado. No es un aporte a la comunidad
como los otros tres, pero es donde uno lo busca, así que la sección pasó a
llamarse "Lo tuyo". Los comentarios quedan como fila y no como cuadrado:
`UserStats` no los cuenta, y pedir la lista entera de aportes para dibujar un
número sería traerse todo cada vez que alguien abre el perfil.

**El orden de la lista pasa a ser un interruptor**, el mismo que el toggle de
color del mapa. Dos píldoras sueltas no dicen "uno o el otro", y con la de
favoritos sumada la fila dejó de entrar en un teléfono: lo que se salía de
pantalla era el número de bares, o sea el dato y no el cromo. Ahora los filtros
viven en una franja que se arrastra y el conteo queda anclado afuera.

El interruptor salió a `ui/Segmented.tsx` y lo usan las dos pantallas. Era
copiarlo o compartirlo, y ya sabemos cómo termina copiarlo: `StyleFilter`
empezó duplicado y los dos filtros se fueron separando con cada retoque.

Efecto secundario del scroll horizontal: el swipe que cambia de orden competía
con arrastrar la franja de filtros. Se excluye por `[data-hscroll]`, igual que
ya se excluía el `input` del buscador.

**BIR-30 — orden "mejor puntuada".** Vista nueva `v_bar_ratings` (V15): la nota
del bar ponderada por cantidad de votos entre sus birras. No es una nota nueva,
es exactamente la que la ficha del bar ya calculaba en el cliente; tenerla en
dos lados era garantía de que un día dijeran cosas distintas.

Dos números y no uno, por lo de siempre: `rating_raw` es el que se muestra
—con un solo voto de 5 dice 5,0, que es lo que esa persona votó— y
`rating_sort`, con el shrinkage de `v_style_ratings`, es el que ordena. Un bar
con un voto de 5 no puede encabezar el ranking por encima de uno con 4,6 y
cuarenta votos. Hay test, y se verificó que falla si se ordena por la nota
cruda. Los bares sin votos van al final: no saber no es ser el mejor, el mismo
criterio que los precios stale en "más barata".

La nota viaja en cada pin y se muestra en la fila con su cantidad de votos al
lado. Ordenar por algo invisible es pedirle a alguien que confíe en un ranking
sin mostrarle de dónde sale, y un 5,0 de un voto no es un 5,0.

**Anotado, no arreglado:** el cliente ordena su caché por la nota real y el
servidor por la del shrinkage, que no viaja. La diferencia sólo se nota en
empates de los primeros puestos. El día que moleste, la respuesta es mandar
también la nota de ordenar, no replicar la fórmula bayesiana en el front.

113 tests de backend en verde (107 + 6). La segunda mitad de BIR-30 —"la mejor
opción de la zona"— ya está hecha: es el `bestValue` de la tarjeta de BIR-33.

Emblemas: Felipe pidió revisitarlos. Queda en BIR-39, con lo que no cierra de
los seis actuales anotado ahí.
---

## 2026-09-12 (cont.) — v0.8.0: birrapp deja de ser sólo de Buenos Aires

Pedido urgente: bares de cualquier parte del mundo, con su moneda.

**El bloqueo era una línea.** El backend nunca restringió nada —`create`
valida lat/lng contra el globo entero desde V1— pero el buscador de lugares
llevaba `includedRegionCodes: ['ar']`, así que sólo ofrecía Argentina. Eso se
fue.

Lo que sí había que pensar era la moneda, porque hasta hoy toda la app asumía
pesos: `formatPrice` tenía "ARS" escrito a mano, y la columna `currency` de
`price_reports` existía desde V1 con default 'ARS' sin que nadie la leyera
nunca.

### La moneda vive en el bar

Y no en cada precio ni en cada persona. Un bar de Londres cobra en libras: es
una propiedad del lugar. Si cada reporte trajera la moneda de quien lo carga,
el mismo bar terminaría con una lista mezclada donde "más barata" no significa
nada.

Sale, en orden de confianza: la que eligió quien carga el bar (hay bares que
cobran en dólares en países que no los usan), la del país que devuelve Google
al elegirlo del buscador, y por último la de la configuración de la persona.
La tabla país → moneda vive en `core/Currency.kt` y es corta a propósito: los
países donde puede aparecer alguien el año que viene, no los 195. El que falta
cae en el default y se agrega cuando aparezca.

### Nada se convierte

Decisión explícita: **los precios se muestran siempre en la moneda del bar**.
La configuración de cada persona define con qué moneda *carga*, no en cuál
*ve*. Convertir necesita cotizaciones en vivo, y una cotización de hace una
semana miente exactamente igual que un precio de hace tres meses — que es lo
único que esta app existe para no hacer. Si algún día hace falta, el número
convertido va a tener que llevar la fecha de la cotización al lado.

### Dos lugares donde mezclar monedas rompía cosas de verdad

**La detección de outliers.** Comparaba contra la mediana global del estilo.
Sin filtrar por moneda, el primer precio de Londres —6 libras contra una
mediana de 8.000 pesos— se iba solo a la cola de moderación por "atípico". Hay
test, y otro que verifica que dentro de la misma moneda se sigue detectando.

**Las stats de la zona.** Promediar 8.000 pesos con 6 libras no da un precio,
da un número sin significado. Ahora la consulta elige la moneda con más
precios del radio, filtra a esa, y devuelve `otherCurrencies` con cuántos dejó
afuera para que la pantalla pueda decirlo. Sólo pasa cerca de una frontera.

**Lo que queda anotado y no arreglado:** el orden "más barata" compara números
crudos. En un radio de 20 km eso es correcto en cualquier lado menos pegado a
una frontera, donde 6 libras se vería "más barato" que 5.000 pesos. Cuando
moleste, la respuesta es la misma que en las stats: agrupar por moneda, no
convertir.

### Configuración de usuario

Pantalla nueva en `/config`, con moneda, tamaño de vaso por defecto —una pinta
son 473 ml acá y 568 en el Reino Unido, y el teclado arrancaba fijo en 473— y
radio de búsqueda. Se lleva además el nombre, la foto y el borrado de cuenta,
que estaban sueltos en el perfil: el perfil es lo que mostrás, la
configuración lo que elegís.

Cada control guarda al tocarlo, sin botón de "guardar" — son preferencias
sueltas, no un formulario. La excepción es el nombre, que no sabe cuándo
terminaste de escribir.

El símbolo de la moneda sale de `Intl` y **no** se usa `narrowSymbol`: con
símbolos angostos, pesos argentinos, dólares y pesos chilenos son los tres
"$". Se muestra "GBP 5,80" en vez de "£5,80" a propósito — entre un símbolo
lindo y saber de qué moneda se habla, gana lo segundo.

122 tests de backend en verde (113 + 9).

**Android queda atrás otra vez:** los campos nuevos viajan con default, así
que la app vieja no se rompe, pero sigue mostrando todo con el "$" de pesos.
Va al ticket de Android junto con el resto.

---

## 2026-09-12 (cont.) — v0.8.1: la configuración va en la tuerca

La entrada a `/config` era un renglón más en la lista del perfil, entre "cómo
funcionan los precios" y el tutorial. Nadie lee una lista para encontrar la
configuración: la busca arriba a la derecha, en la tuerca. Ahí está, al lado
de cerrar sesión.

---

## 2026-09-12 (cont.) — v0.8.2: los filtros flanqueando la búsqueda, y el corazón en el mapa

**El filtro de favoritos estaba escondido.** Había quedado al final de una
franja que scrollea en horizontal, detrás del filtro de estilo y del
interruptor de orden: en un teléfono quedaba fuera de pantalla y había que
descubrir que se podía arrastrar para encontrarlo. Un filtro que no se ve es un
filtro que no existe.

Ahora los dos filtros flanquean el buscador —estilo a la izquierda, corazón a
la derecha— y abajo queda sólo el orden con el conteo. La división es la que
tiene sentido: arriba se elige QUÉ bares se ven, abajo en qué ORDEN. La franja
que scrollea desapareció, y con ella el `[data-hscroll]` que evitaba que el
swipe de orden peleara con arrastrarla.

**Los favoritos se ven en el mapa.** Un corazón al lado del precio en la
cápsula del pin, dibujado en el SVG y no como emoji: un emoji dentro de un
`data:` URI depende de la fuente de cada sistema y en Android sale de otro
color y otro tamaño. La cápsula crece 13px para hacerle lugar — sin eso el
corazón se monta sobre el último dígito del precio, que es justo el que no se
puede perder.

Los bares cuya etiqueta no entró se dibujan como punto, y ahí el favorito va
con un aro ámbar en vez de un corazón: a nueve píxeles, un corazón es una
mancha.

De paso, el paso del tutorial sobre el orden de la lista decía "Más cerca o más
barata" desde antes de que existiera "Mejor puntuada".

---

## 2026-09-12 (cont.) — v0.8.3: los outliers se comparan con el barrio, no con el mundo

Felipe marcó el agujero que dejó la 0.8.0: con bares de otros países, la
detección de precios atípicos iba a mandar todo a moderación por el tipo de
cambio. Tenía razón, y el problema era más hondo que las monedas.

**Filtrar por moneda no alcanzaba.** Una misma moneda cubre lugares con
precios muy distintos: una pinta en Dublín y una en Lisboa son las dos en
euros y no se parecen en nada. Contra la mediana del euro entero, media Irlanda
entra como "cara" y medio Portugal como "sospechosamente barata". Lo mismo con
el dólar entre Estados Unidos, Ecuador y Panamá.

**Ahora la referencia son los bares de al lado**: la mediana del mismo estilo,
en la misma moneda, entre los bares a menos de 25 km. Veinticinco kilómetros
es una ciudad y su alrededor — el área dentro de la cual tiene sentido decir
"acá la pinta sale más o menos esto".

Y funciona en las dos direcciones. La mediana global no sólo generaba falsos
positivos: también tapaba la variación local, que es justo donde vive el precio
raro que queremos encontrar — un bar cobrando el triple que los tres de la
misma cuadra se perdía en el promedio de la ciudad entera.

**Sin vecinos suficientes no se compara contra nada y se deja pasar.** Retener
el precio legítimo de alguien que acaba de descubrir la app en una ciudad nueva
es mucho peor que dejar entrar uno raro, que además se muestra con su
antigüedad al lado y lo puede denunciar cualquiera.

**Dos cosas que salieron de probarlo, y que importan más que el cambio:**

1. **El helper de tests mentía.** `TestDb.insertPrice` escribía los precios con
   el default de la columna —pesos— aunque el bar cobrara en libras. En
   producción no puede pasar, porque `report()` copia la moneda del bar, así
   que los tests estaban probando un estado que la app no puede producir. Ahora
   el helper copia la moneda del bar, igual que el código de verdad.
2. **El primer test de Dublín no probaba nada.** Lo puse con 8 euros contra una
   mediana de 3: son 2,67 veces, por debajo del factor de 3 que dispara la
   retención. O sea que pasaba con el arreglo y sin él. Se vio al mutar el
   código a propósito —sacando el filtro geográfico— y ver que los tests
   seguían en verde. Con precios igual de reales (2,50 en Lisboa contra 8,50 en
   Dublín) el test discrimina, y la mutación lo rompe.

124 tests de backend en verde.

**Anotado:** el mensaje de la denuncia automática ahora dice contra qué mediana
se comparó y en qué radio. Un moderador que ve "auto: 12000/L contra una
mediana de 3000/L (ARS) entre los bares a menos de 25 km" puede decidir; con el
mensaje viejo tenía que adivinar de dónde salía el número.

---

## 2026-09-12 (cont.) — v0.9.0: la persona detrás del contenido (BIR-6 + BIR-17)

Los dos tickets juntos porque son la misma cosa vista de los dos lados, y lo
dice el propio BIR-17: **el ban es la herramienta del moderador y el bloqueo la
del usuario**. Hacen falta las dos, y las dos necesitaban lo mismo que no
existía — una pantalla de la persona.

### Perfil ajeno (BIR-6)

`GET /users/{id}`, y `/usuario/:id` en la PWA. Se llega tocando el nombre en un
comentario o en el visor de fotos, que es desde donde hace falta: la moderación
llegaba hasta la fila —bajar el comentario— y no había forma de llegar a quién
lo escribió. Bajar la fila no alcanza porque el autor la vuelve a mandar.

Muestra nombre, foto, desde cuándo está y qué aportó. **No muestra el email**, y
no por un `if` en la consulta: el DTO no tiene el campo, así que es una garantía
de tipo. `banned` y `role` viajan sólo para moderadores — que una cuenta esté
suspendida no es información pública, sería una lista de escarmiento.

**El ban ahora corta al toque.** Era el "a decidir" del ticket: el rol y la
identidad viajan en el JWT para no ir a la base en cada request, y para el rol
el precio es aceptable, pero para el ban son hasta dos horas
(`JWT_ACCESS_MINUTES`) de abuso sostenido *después* de haber apretado el botón —
justo lo que la herramienta viene a cortar. Ahora hay un interceptor sobre el
bloque entero de escritura que consulta `banned_at`. Va como interceptor y no
como línea al principio de cada handler porque hay una docena, y el endpoint
número trece se va a olvidar de ponerla.

### Bloqueo (BIR-17)

Tabla `user_blocks` con clave compuesta —bloquear dos veces no es un bloqueo
nuevo— y **oculta en las dos direcciones**. Si A bloquea a B, A no ve los
comentarios de B y B tampoco los de A. Una sola dirección deja a quien bloqueó
igual de expuesto: el otro sigue leyendo lo que escribe y sigue teniendo a quién
responderle, que es el problema que el bloqueo viene a cortar. Y la regla es más
fácil de explicar: se dejan de ver, punto.

El filtro vive en una constante con nombre (`notBlocked(columna)`) y no copiado
en cada consulta: el día que se agregue otra lista de contenido firmado hay que
acordarse de filtrarla, y tener un nombre para esto es la única pista de que
hace falta. Hoy la usan comentarios y fotos.

Los precios **no** se esconden: son datos sobre bares, no sobre personas.
Esconderlos dejaría el mapa peor informado como efecto de un conflicto entre dos
usuarios, y es la misma razón por la que borrar la cuenta tampoco se los lleva.

La lista de bloqueados está en Configuración, que es el único lugar desde donde
se puede deshacer: un bloqueo que no se puede levantar es una decisión que
quedó para siempre por un toque.

### Verificación

134 tests de backend en verde (124 + 10). El filtro de bloqueo se verificó por
mutación: desactivándolo caen tres tests, no cero.

Un assert que había escrito mal —una cadena de `sorted().reversed()` sin
sentido que pasaba igual— quedó corregido antes de commitear. Pasaba, pero no
probaba lo que decía probar.

---

## 2026-09-12 (cont.) — v0.9.1: cargar un precio, de a una pregunta por vez

Pedido de Felipe, y tenía razón: la carga de precio era una sola pantalla con
la fila de estilos, el selector de marca y el teclado del monto peleando por el
mismo alto, con el bar dado por dónde hubieras entrado. Funciona cuando ya
sabés usarlo; para alguien que entra por primera vez son tres decisiones
encimadas, y lo que pasa es que carga el precio con el estilo que venía puesto.

**Ahora son tres preguntas, en el orden en que se saben:** qué tipo de birra
(se sabe siempre, se ve en el vaso), qué marca (no siempre, y "sin marca" es
una respuesta y no un dato faltante) y en qué bar (casi siempre el de al lado,
así que primero los cercanos). Recién con las tres contestadas aparece el
teclado del monto.

Cada paso muestra arriba lo que ya se contestó. Sin eso, tres pantallas
seguidas se sienten como un formulario que no termina; ver "IPA · Antares"
arriba es lo que dice que se está avanzando y sobre qué.

**Los pasos ya contestados no se preguntan.** Entrando desde la ficha de un
bar, el bar no se pregunta; desde "Otra marca" tampoco el estilo; desde
"Actualizar" sobre una birra concreta se va derecho al monto. La lista de
pasos se calcula al entrar y no cambia, así que "paso 2 de 3" no puede mentir.

**Tres extracciones para no duplicar nada.** El flujo necesitaba, adentro de
sus pasos, cosas que ya existían metidas en su propia cáscara: la lista de
marcas con su alta (`BrandList`, sacada de `BrandPicker`), el buscador de bares
(`BarSearchList`, sacado de `PickBarSheet`) y la grilla de estilos con su alta
(`StyleChips` con `layout="grid"`). Ninguna lógica nueva: si se hubiera
copiado, en dos meses habría dos formas distintas de proponer una marca.

`ReportPrice` se queda con lo suyo —el teclado, la tecla 000, el separador de
miles— y muestra la birra elegida arriba en vez de dejarte elegirla ahí. La
flecha vuelve un paso, no sale del flujo: quien eligió tres cosas y se equivocó
en la marca no tiene que empezar de nuevo.

Se fue el `?precio=1`: el "+" del mapa abre el flujo entero y ya no pasa por la
ficha del bar. Y el precio cargado desde el mapa invalida la caché de bares —
es el agujero de BIR-23, que estaba arreglado en la ficha y habría vuelto a
aparecer por la puerta nueva.

### Y el ruido de la ficha del bar

**La dirección se corta en la primera coma.** Google devuelve
`formattedAddress` entera —"Av. Corrientes 1234, C1043AAZ CABA, Argentina"— y
el código postal, la ciudad, la provincia y el país no le dicen nada a alguien
que está parado a cuatrocientos metros: son tres datos que ya sabe ocupando el
renglón del que no sabe. Se corta al mostrar y no al guardar: la dirección
completa sirve para desambiguar bares homónimos en moderación. El barrio queda,
que en una ciudad que no conocés sí ubica.

**El rótulo con el estilo y la marca arriba del precio se fue.** Lo dicen las
dos filas de pestañas que están justo encima, con la activa en ámbar: repetirlo
gastaba el renglón de mayor jerarquía en algo que la persona acababa de tocar.
Lo único que las pestañas no dicen es si la marca es artesanal, y eso se queda.

134 tests de backend en verde (sin cambios de backend). `shortAddress` se
verificó contra las formas reales que devuelve Google en tres países, más las
direcciones a mano y los nulos.

---

## 2026-09-12 (cont.) — v0.9.2: el código postal que sobrevivió, y la fila corrida

Dos cosas que Felipe vio en pantalla y que yo no podía ver.

**El código postal seguía ahí.** Cortar en la primera coma alcanzaba para "Av.
Corrientes 1234, C1043AAZ CABA, Argentina", que es la forma que miré. Pero hay
direcciones que **empiezan** por el código postal —"B1640HEM, Martínez,
Provincia de Buenos Aires, Argentina", un bar de Martínez— y ahí cortar en la
coma deja en pantalla exactamente el dato más inútil de todos. La regla parecía
general porque los casos que probé eran todos del mismo molde.

Ahora se recorren los segmentos y se devuelve el primero que no sea un código
postal, sacándole el CPA de adelante si lo tiene ("B1640HEM Martínez" →
"Martínez"). Si el bar no tiene calle, lo que queda es la localidad: peor que
la calle, mejor que el código postal, y es lo que de verdad sabemos.

El reconocedor cubre el CPA argentino, los cuatro o cinco dígitos de media
Europa y Estados Unidos, el CEP brasileño, el británico, el canadiense y el
holandés. **El CPA pegado adelante se saca sólo en su forma argentina**
(letra + cuatro dígitos + tres letras), que no se confunde con nada: sacar
cuatro dígitos sueltos del principio le comería la altura a "1600 Pennsylvania
Avenue NW", y eso es perder el dato, no limpiar ruido. Verificado contra quince
formas reales, incluida ésa.

**La fila de birras estaba corrida.** La primera pestaña quedaba pegada al
borde de la pantalla, desalineada de todo el resto de la ficha. No era el
padding: es que al engancharse, el navegador alinea la pestaña contra el borde
del scrollport, que está *antes* del padding, así que la fila se corría sola
esos 18px. Se arregla con `scroll-padding-left` en las dos filas que enganchan
—estilos y marcas—, que es el control que existe justamente para eso.

---

## 2026-09-12 (cont.) — v0.9.3: la nota con coma, lo tecleado que no se pierde, y los comentarios a la vista

Tres cosas de la lista de Felipe.

### La nota no aceptaba 3,5

El bug no estaba donde parecía. `parseRating` siempre supo aceptar la coma
—hace `replace(',', '.')` desde que existe— pero **nunca la veía**: el campo
era `<input type="number">`, y ahí el navegador saneá el valor antes de que
llegue a nuestro código. Cualquier cosa que no sea un número con punto se
convierte en cadena vacía, así que al escribir "3,5" —la forma natural de
escribir un decimal en castellano, y la que ofrece el teclado del teléfono—
`value` llegaba vacío y no se guardaba nada.

Pasa a `type="text"` con `inputMode="decimal"`, que conserva el teclado
numérico en el teléfono, que era lo único que `type="number"` aportaba acá. El
clamp, el redondeo y la coma ya estaban resueltos.

### Lo tecleado que se perdía

En los tres lugares donde se escribe un nombre que todavía no existe —marca,
estilo, bar nuevo— había que encontrar y tocar el botón "Agregar". La tecla que
sigue naturalmente a escribir un nombre es Enter, y Enter no hacía nada: lo
tecleado quedaba ahí, aparentemente ignorado, y se perdía al salir del paso.
Ahora Enter da de alta la marca y el estilo, y abre el alta a mano del bar con
lo escrito.

### Los comentarios, abajo de las fotos

Estaban detrás de un ícono, en una hoja que había que abrir. El argumento era
no convertir la pantalla en un muro; el efecto real es que no los leía nadie, y
un comentario que nadie lee tampoco lo escribe nadie.

Ahora están en la página, después de las fotos, que es el orden en que se mira
una birra: cuánto sale, cómo se ve, qué dijeron. **De a diez, del más nuevo al
más viejo**, con el resto detrás de un botón — así una birra con historia no
alarga la ficha sin fin. La paginación es por `offset` y no por cursor: son
decenas, no miles, y un cursor sería maquinaria para un problema que esta tabla
no tiene. El orden se hizo estable (`created_at DESC, id DESC`) para que pedir
la página siguiente no repita ni saltee filas.

**La nota salió de ahí adentro.** Estaba en la misma caja que el texto porque
el campo del decimal vivía en esa hoja, y eso obligaba a abrir los comentarios
para poder puntuar. Ahora las estrellas guardan solas, con la birra, y el campo
del decimal está al lado. Son dos acciones distintas —puntuar es una por
persona, comentar son todas las que quieras— y ahora se ven como dos.

135 tests de backend en verde (134 + 1: las páginas de comentarios no repiten
ni saltean filas).

---

## 2026-09-12 (cont.) — v0.10.0: el piso de calidad que faltaba

Felipe pidió una revisión de UX contra lo que se hace en la industria. Busqué
skills y plugins de UX: no hay ninguno de eso en el catálogo, así que instalé
`modern-web-guidance` —que sí trae guías de patrones web actuales— y trabajé
contra las heurísticas de Nielsen, las guías de toque de Apple y Material, y
WCAG 2.2 AA.

Lo que sigue no es maquillaje: son las cosas que separan una app que se puede
usar de una que se puede usar *si* la usás como el autor esperaba.

### Accesibilidad, en un solo lugar

**Foco visible.** No había ninguno. Moverse con teclado por la app era moverse
a ciegas: el reset de `button` no saca el contorno, pero el que pone el
navegador sobre fondo oscuro casi no se ve. Ahora hay un anillo ámbar en
`:focus-visible` —no en `:focus`, así no aparece al tocar con el dedo—.

**Movimiento reducido.** Quien marcó esa preferencia en su sistema ahora no ve
las animaciones. No se esconde nada: aparece igual, sin el trayecto.

**Área de toque.** Apple pide 44pt y Material 48dp; la app tenía quince botones
redondos de 38px. `.icon-btn` deja el círculo donde está y agranda lo que se
puede tocar.

**Y el zoom volvió.** El HTML tenía `maximum-scale=1`, que bloquea agrandar la
pantalla — incumplimiento de WCAG 1.4.4 y deja afuera a quien lo necesita.
Estaba ahí para evitar que iOS acercara la pantalla al enfocar un campo, que es
un problema con otra solución: los campos de texto ahora son de 16px, que es el
umbral donde iOS deja de hacerlo.

### Diálogos de verdad

`Confirm` y las hojas inferiores eran `div` con `position: fixed`. Se veían
bien y les faltaba todo lo que hace usable un modal: el foco se quedaba en la
página de atrás —con teclado se podía tabular hasta los botones tapados—,
Escape no cerraba, el botón de atrás del teléfono tampoco, y al cerrar el foco
no volvía a donde estaba.

Ahora los dos salen del `<dialog>` nativo con `showModal()`, que da las cuatro
cosas y el `::backdrop` gratis, más `closedby="any"` para cerrar tocando afuera
donde el navegador lo soporta.

### El toast tenía un bug

`setTimeout(onDone, 3200)` estaba suelto en el cuerpo del componente, así que
se programaba otro temporizador en **cada render** — y el mapa se redibuja con
cada movimiento de cámara. Un aviso podía cerrarse antes de tiempo por el
temporizador de un render anterior. Va en un efecto, uno solo, y con
`role="status"` para que un lector de pantalla lo anuncie: hasta ahora la única
confirmación de que un precio se cargó era visual.

### Los vacíos y las esperas

Media docena de pantallas vacías resueltas con un renglón gris: "No hay bares
cargados por acá todavía". Verdadero e inútil — quien lo lee no sabe qué hacer,
y es justo el momento donde más sirve decirlo. Ahora cada vacío dice qué pasa,
por qué no es culpa de nadie, y ofrece el paso siguiente: cargar un bar, ver
todos, anotar la primera birra.

Y la lista dejó de anunciar la carga con una barra de un pixel: ahora hay
filas fantasma con la forma de las que vienen, así la pantalla no salta cuando
llegan.

### Palabras

**"Reportar precio" era una trampa.** Es el botón de denunciar un precio mal
cargado, y está al lado del de cargar uno: en esta app "reportar un precio" es
exactamente lo otro. Pasa a "Este precio está mal".

El botón final del flujo de carga decía "Enviar"; ahora dice "Cargar el
precio", que es lo que hace. Y el de agregar un bar, "Agregar este bar" — con
una línea abajo que explica por qué está apagado cuando lo está, en vez de
dejar a la persona mirando un botón gris.

El perfil recuperó la foto, que se había ido con la mudanza a configuración: un
perfil sin cara es una lista de números con un nombre arriba.

### Y lo que falla cuando las cosas salen mal

**Sin conexión no se decía en ningún lado.** Esta app se usa parado en un bar,
en un subsuelo, con una raya de señal: perder la conexión no es el caso raro,
es un martes. Hasta ahora eso se veía como un error genérico o como una
pantalla que no cargaba nunca, sin forma de distinguir "se cayó el servidor" de
"estás sin datos". Ahora hay un aviso que dice las dos cosas que importan: que
el problema es la conexión y que lo que ya está en pantalla sigue sirviendo.

**Y si algo se rompe al dibujar, ya no queda la pantalla en blanco.** Era la
peor falla posible: React desmonta el árbol entero, no queda ni un botón, y en
una PWA instalada no hay ni barra de direcciones para recargar. Ahora hay una
pantalla que lo dice y ofrece recargar. No intenta recuperarse sola: si el
estado quedó roto, volver a dibujar lo mismo falla de nuevo.

### El precio y su edad

La antigüedad estaba chiquita, a la derecha, alineada con la última línea: se
leía como un pie de página. En esta app un precio sin su edad al lado es
información falsa —es la regla que no se negocia— así que ahora va debajo del
monto, con su color, y cuando el precio está viejo el aviso se envuelve en una
píldora para que sea lo primero que se lee.

También aparecieron rótulos de sección en fotos y comentarios: con las dos
cosas una arriba de la otra y nada que las separe, la tira de fotos parecía
parte de la fila de puntaje.

---

## 2026-09-13 — v0.10.1: los flujos, de a uno

Segunda tanda de la revisión de UX. Cuatro cosas, todas de flujo.

**El teclado del precio no respondía al teclado.** El teclado propio existe
porque en el teléfono el del sistema tapa media pantalla; en una notebook es al
revés — hay un teclado físico adelante y la única forma de cargar un precio era
apuntarle a los botones con el mouse, dígito por dígito. Ahora responde a los
números, al borrado y a Enter.

**Salir del flujo a mitad de camino tiraba lo elegido en silencio.** Es un
formulario de varios pasos: irse sin avisar es la forma más rápida de perder
tres respuestas. Ahora pregunta — pero sólo si hay algo que perder: en el
primer paso, salir es salir. El diálogo se dibuja en las dos ramas del
componente, porque el paso del monto sale por su propio `return` y ahí es
justamente donde salir cuesta más caro.

**La barra de abajo tenía dos pestañas sin nombre.** La etiqueta se dibuja sólo
en la activa —es lo que mantiene la barra angosta— así que un lector de
pantalla anunciaba las otras dos como enlaces sin nombre. El nombre va ahora en
`aria-label`, que no ocupa lugar.

**El menú del "+" prometía un teclado que no tiene.** Estaba declarado como
`menu` con `menuitem`, y el patrón ARIA de menú promete flechas, Home y End.
Acá se navega con Tab, como en cualquier grupo de botones, así que ahora dice
lo que es. Declarar un menú que no se comporta como un menú es peor que no
declarar nada.

Y el orden de la lista se recuerda entre sesiones, en localStorage: es una
preferencia de cómo mirás, no un dato de la cuenta, y quien usa la app sin
cuenta también la tiene.

---

## 2026-09-13 (cont.) — v0.10.2: los dos callejones que dejó abrir el mundo

Dos consecuencias de la 0.8.0 que no habíamos visto, las dos del mismo tipo:
lugares donde alguien nuevo se queda sin nada que hacer.

**El mapa vacío no decía nada.** Desde que se pueden cargar bares de cualquier
parte del mundo, éste pasó a ser el primer contacto más probable de alguien
nuevo: abre la app en una ciudad donde nadie cargó nada y ve un mapa mudo, sin
una palabra que le diga si la app está rota, si está mal parado, o si
simplemente no hay nada todavía. Ahora lo dice y ofrece cargar el primero.

Aparece sólo cuando terminó de cargar y el zoom alcanza: con el mapa lejos ya
lo dice el cartel de "acercá el mapa", y mientras carga decir "no hay nada"
sería mentir por un segundo.

**Y el paso 3 del flujo de carga era un callejón.** Si no hay bares cerca, la
lista está vacía y no se puede seguir — no se puede cargar el precio de un bar
que no existe. En Buenos Aires eso no pasa nunca; en una ciudad donde todavía
no cargó nadie es el caso normal. Ahora hay una salida: "El bar no está —
agregalo". Se pierde el flujo, y no hay forma de que no se pierda, pero al
menos hay puerta.

---

## 2026-09-13 (cont.) — v0.10.3: el slider del radio no guardaba con teclado

Bug propio, de la pantalla de configuración que salió con la 0.8.0. Guardaba en
`onPointerUp`, que parecía suficiente porque cubre el dedo y el mouse — y deja
afuera al teclado: con las flechas se movía el control y no se guardaba nunca.

De paso, el número de arriba mostraba el valor guardado y no el que se estaba
arrastrando, así que se quedaba quieto hasta soltar y parecía trabado.

Ahora el control es controlado, el número sigue al dedo, y se guarda medio
segundo después de que se deja de mover — que era el motivo original de no usar
`onChange`: una consulta por pixel arrastrado.

---

## 2026-09-13 — Revisión de UX: resumen y lo que queda

Cuatro versiones (v0.10.0 → v0.10.3) de la revisión pedida. Anotado acá junto
porque las entradas de arriba cuentan cada tanda por separado y conviene tener
el estado en un solo lugar.

**Método.** No hay plugins ni skills de UX en el catálogo —lo busqué— así que
se instaló `modern-web-guidance`, que trae guías de patrones web actuales y se
usó para los diálogos y los formularios, y se trabajó contra las heurísticas de
Nielsen, las guías de toque de Apple y Material, y WCAG 2.2 AA.

**Lo que se encontró que era un bug y no una mejora:**

1. El toast programaba un temporizador por cada render. El mapa se redibuja con
   cada movimiento de cámara, así que un aviso podía cerrarse antes de tiempo
   por el temporizador de un render anterior.
2. El slider del radio en Configuración guardaba en `onPointerUp`: con teclado
   no guardaba nunca. Bug propio, de la 0.8.0.
3. Dos de las tres pestañas de la barra de abajo no tenían nombre accesible.
4. El paso "¿en qué bar?" del flujo de carga era un callejón sin bares cerca.
5. El mapa vacío no decía una palabra, que desde que se abrió al mundo es el
   primer contacto más probable de alguien nuevo.

**Lo que queda pendiente, en orden de importancia:**

1. **Nada de esto está probado tocándolo.** `tsc` y build limpios, backend en
   verde, pero la extensión de Chrome no conecta y el ambiente local todavía no
   se abre desde la tailnet. Destrabar eso es lo primero: son cuatro versiones
   de cambios de interfaz verificados sólo por compilación.
2. **Escala tipográfica.** Los tamaños de letra están escritos a mano pantalla
   por pantalla: 10, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5… Unificarlos en
   tokens es un diff enorme y sin cambio visible, así que se deja anotado en
   vez de hacerlo a las tres de la mañana.
3. **El visor de fotos** sigue siendo un overlay propio y no un `<dialog>`.
   Maneja Escape por su cuenta, así que anda, pero no atrapa el foco como los
   demás.
4. **La lista no tiene "tirar para actualizar"**, que sí tiene la ficha del
   bar. Hay que pensarlo con el swipe horizontal que ya cambia el orden.

## 2026-09-13 — v0.10.4: el mapa deja de terminarse en la General Paz

El recorte de `scripts/seed_osm.mjs` llegaba hasta Tigre por el norte y
Quilmes por el sur. Alcanzaba para CABA y Zona Norte, pero apenas uno se
corría del centro el mapa se veía vacío: no era que no hubiera bares, era que
nunca los habíamos traído.

Ahora el bbox es el AMBA entera —Escobar y Pilar arriba, Moreno y General
Rodríguez al oeste, La Plata y Ensenada abajo—. El borde este queda en -57.88
a propósito: un poco más y entra Colonia del Sacramento, que es otro país y
otra moneda.

740 → 995 bares aprobados, casi todo el crecimiento en el eje sur y oeste
(La Plata, La Matanza, Morón). Después del seed se corrió
`scripts/dedupe_bars.sql`, que fusionó 7 duplicados: OSM mapea el mismo local
como nodo y como polígono, y el seed trae a los dos.

### Precios: no hay API, y no la va a haber

La otra mitad del pedido era pegarle a una API de precios. No existe: lo que
hay publicado en Argentina son precios de góndola de supermercado (Precios
Claros y derivados), que es cerveza envasada, no la pinta en el bar. Y aunque
existiera, un precio importado no tiene reportante ni fecha de reporte, o sea
que no se puede mostrar con su antigüedad al lado — que es la única regla que
este proyecto no negocia. Los bares se pueden sembrar; los precios los pone
la gente.

---

## 2026-09-13 (cont.) — v0.11.0: revamp con sistema de escalas

Pedido: "utilizando lo que te bajaste y lo de uizze de stop ui slop, pegale un
buen revamp" — de la app entera, no sólo del contador.

**Herramientas.** Se instalaron seis plugins: `ui-ux-pro-max`, `taste-skill`,
`daisyui`, `ux-design` (de wondelai/skills: trae Refactoring UI, heurísticas de
usabilidad, microinteracciones, tipografía web), `uizze` (anti-ui-slop) y
`accessibility-test-scanner`.

Dos notas sobre eso. `wondelai-refactoring-ui` ya no existe en el marketplace
de jeremylongshore —`plugins/design/` sólo tiene `brand-forge` y `uizze`—; se
tomó de la fuente original, `wondelai/skills`, donde viene dentro del plugin
`ux-design` junto con siete skills más. Y hay un mirror llamado exactamente
`github-trending-wondelai-refactoring-ui` que adentro tiene
`agent-context-manager`: no se usó.

`daisyui` queda instalado pero no aplica: es una librería de componentes sobre
Tailwind y acá los estilos son `theme.css` con variables propias.

### El diagnóstico, medido antes de tocar nada

| Qué | Cuántos |
|---|---|
| Tamaños de letra distintos | 26 (9,5 / 10 / 10,5 / 11 / 11,5 / 12 / 12,5 / 13 / 13,5 / 14 / 14,5 …) |
| Radios de esquina | 14 |
| Blancos translúcidos para "superficie apenas elevada" | 18 |
| Combinaciones de padding | ~30 |
| `SectionLabel` definido | 5 veces, con 5 márgenes distintos |

No es que estuvieran mal elegidos de a uno. El problema es elegirlos de a uno:
un valor fuera de escala no se nota solo, se nota apilado contra sus vecinos.

### Lo que resultó ser un bug, no una mejora

1. **Los nueve campos de texto estaban abajo del piso de 16px de iOS.** Safari
   acerca el viewport al enfocar un campo más chico y al salir no lo aleja.
   Antes lo tapaba `maximum-scale=1`, que se sacó en v0.10.0 por WCAG 1.4.4, así
   que desde entonces la única defensa es el tamaño — y no lo cumplía ninguno:
   seis a 15px, el de la nota a 13 y el de confirmación heredando 15. El de
   búsqueda tenía el comentario que explicaba los 16px justo arriba del 15.
2. **`--faint` falla contraste.** #8A7B6D daba 4,46:1 sobre `--base`, 4,01 sobre
   `--raised` y 3,50 sobre `--elevated`, contra el 4,5:1 que pide WCAG 1.4.3
   para texto chico. Es el color de 106 textos, casi todos de 11 y 12px.
   `--stale` igual, a 4,40 sobre `--elevated`.
3. **Cinco controles abajo de 44px**, el piso que la app declara cumplido desde
   v0.10.0: cerrar la preview (30), borrar un aporte (36), las flechas de mes
   (34), limpiar la búsqueda (30 de ancho) y la tuerca y salir del perfil (42).
4. **El mapa de calor del calendario no mapeaba nada** (BIR-42). La intensidad
   era proporcional al mejor día del mes, así que un mes de dos birras pintaba
   su mejor día tan fuerte como un mes de quince: el color decía "lo más que
   tomaste este mes", no "cuánto tomaste". Comparar dos meses era imposible.
5. **El ancho de la cápsula del pin se estima en 8,6px por carácter** y el SVG
   no pedía cifras tabulares, que es lo único que hace cierta esa cuenta. Sin
   ellas "$11.111" nada en una cápsula de más y "$8.888" se sale.

### El sistema

10 pasos de tipografía, 7 de espaciado, 3 de radio, 3 de película, más
`--t-field` (16px) para los campos con su regla de CSS de respaldo. 408 valores
sueltos pasaron a salir de la escala; cero tamaños de letra fuera de ella.

`--hairline` y el `--film-3` que había definido eran el mismo `rgba(…,.12)` con
dos nombres: se colapsaron.

### Jerarquía

La regla de la casa es precio → antigüedad → nombre del bar, y no se cumplía:

- En la lista el precio iba a 17px contra un nombre de bar de 15. Ahora es lo
  más grande de la fila y con ancho mínimo, que es lo que arma una columna: sin
  columna, comparar dos filas obliga a buscar el número en cada una.
- En la ficha del bar el precio sube al paso más grande de la escala, que se usa
  sólo ahí. Estaba a la misma altura que el número de una baldosa del perfil.
- Cifras tabulares en todo `.num`.
- En la preview del mapa la antigüedad pasa abajo del monto, como en la ficha.
- Los cuatro cuadrados del perfil tenían el número en 17px y estaban sobre otra
  superficie que las tres del contador, por ser dos copias de la misma baldosa.

`ui/Kit.tsx`: `SectionLabel`, `Tile` y `Screen`, una vez.

### Lo que no se hizo

- **Nada de esto está probado tocándolo.** `tsc` y build limpios, pero es un
  cambio visual grande verificado sólo por compilación. Sigue sin destrabarse el
  ambiente local desde la tailnet.
- La mitad de BIR-42 que son notificaciones push para la racha: es backend e
  infra de push, no entra en un revamp. Queda en el ticket.
- El visor de fotos sigue sin atrapar el foco.
- La lista sigue sin "tirar para actualizar".

---

## 2026-09-14 — v0.12.0: la hoja sin salida, color sólo por precio, vidrio

### El bug: la hoja no se podía cerrar en iPhone

`Sheet` no tenía **ningún** control para cerrarse. Salió confiando en
`closedby="any"` —el atributo nuevo de `<dialog>` que cierra tocando afuera— y
Safari no lo implementa. Escape no existe en un teléfono, y en la PWA instalada
en iOS tampoco hay botón de atrás. O sea: quien abría "Me tomé una birra" desde
un iPhone y se arrepentía, quedaba adentro.

Es de v0.10.0, de la misma tanda en que pasé los diálogos a `<dialog>` nativo.
Gané el foco atrapado, Escape y el botón de atrás, y perdí lo único que un
`div` con `position: fixed` sí tenía: una X.

Ahora la hoja lleva ✕ y manijón, y cerrar tocando afuera se hace a mano
comparando el click contra la caja del diálogo — funciona en todos lados. El
atributo queda igual: donde está implementado hace lo mismo.

### El color del mapa codifica precio, y sólo precio

Había un interruptor frescura/precio. Verde/ámbar/rojo es una convención tan
fuerte para barato/caro que ésa era la lectura por defecto aunque el modo
dijera "Frescura": la mitad del tiempo el mapa decía una cosa y se leía otra.
Un control que existe para desambiguar algo que no debería ser ambiguo es el
síntoma, no la solución.

En su lugar va una leyenda ("barato ▪▪▪▪ caro"). Era el interruptor quien decía
qué significan los colores, así que sacarlo a secas dejaba el mapa pintado y
mudo. La frescura no se pierde: sigue en el punto al lado de cada precio, donde
es el dato de UN precio, que es lo que la frescura es.

### Nombres de calle desde zoom 17

A zoom de barrio compiten con las cápsulas de precio, que es lo que hay que
leer. Encima de una manzana la pregunta ya cambió —el bar está elegido, ahora
es cómo llegar— y ahí no saber en qué calle estás es una molestia gratuita.

Dos arrays constantes de estilo, no una función: Google no soporta condiciones
de zoom adentro del JSON, y pasarle a `<Map>` un array nuevo lo hace re-estilar
entero.

### Vidrio en todo lo que flota

Diálogos, hojas, preview del bar, toast y barra de navegación eran color sólido
o tenían cada uno su propia mezcla. Ahora sale de `.glass`: desenfoque con
saturación —el `saturate` es la mitad del efecto, sin él lo de atrás se ve
lavado— tinte bajo y brillo especular arriba y abajo. El fondo del diálogo baja
de .6 a .28 de negro con más desenfoque: un vidrio contra un fondo casi opaco
no es vidrio, es una tarjeta sobre una pared.

El tinte se queda en .72 y no en cero a propósito. Con vidrio realmente
transparente el contraste del texto queda a merced de lo que haya atrás, que
acá es un mapa con manchas claras y oscuras — sería legible o no según dónde
estés parado.

### Paleta: cinco propuestas, sin decidir

Comparadas sobre las mismas tres pantallas, con los contrastes medidos. La
restricción que ordena todo: la escala de precio ya ocupa el verde, el amarillo
y el rojo, así que el acento tiene que dejarlos libres.

* **Espuma** (modo claro) queda descartada por medición, no por gusto: la
  escala de precio rinde 1,4 a 2,3:1 sobre crema. Habría que rehacerla entera.
* **Lúpulo** (verde de lúpulo) es la más linda y la que más choca: el acento
  lima y el pin verde de "barato" son casi el mismo color.
* **Cobre** y **Noche** son las que arreglan el problema real, que no es que el
  marrón sea feo sino que el fondo marrón y el acento ámbar son vecinos de
  tono, así que el ámbar nunca termina de saltar.

Pendiente de decisión.

---

## 2026-09-13 — v0.13.0: Hueso, o sacarle el color a la marca

La decisión que quedó pendiente en la 0.12.0. Ninguna de las cinco propuestas:
el problema no era qué acento elegir sino que la marca tuviera acento de color.

El ámbar de la marca era `--amber: #FFB627`, y ése es *exactamente* el mismo
hex que el punto "precio medio-alto" de `PRICE_STOPS` y que `--aging`. O sea
que el color de los botones, de la pestaña activa y de los links era además un
valor del dato. En un mapa con bares de precio medio —que es la mayoría del
mapa— el pin de un bar y el botón "Sigue igual" eran el mismo color, y no por
un descuido de nadie: el token de marca y el token de dato nacieron con el
mismo valor y nadie volvió a mirarlo. Las cinco propuestas de la 0.12.0
buscaban un acento que dejara libres el verde, el amarillo y el rojo; Hueso
deja de buscar y le saca el color al acento.

El fondo pasa de marrón a un neutro apenas frío (`#0F1012` / `#191B1F` /
`#24272C`) y el acento a blanco cálido (`#EDE6D8`). De acá en más la regla es
**si tiene color, es un dato**: el cromo vive en la rampa de grises hueso, y el
verde, el ámbar y el rojo quedan reservados para frescura, precio y peligro. El
token se llama `--acento` y ya no `--amber`, porque nombrar un token del cromo
por su color es justamente lo que dejó pasar esto sin que nadie lo viera.

`--fresh`, `--aging`, `--stale`, `--danger`, `PRICE_STOPS` y los escalones
`.heat-*` no se tocaron. Los contrastes se midieron sobre las tres superficies:
el peor caso es `--faint` con 4,53:1 sobre `--elevated`, y ninguno baja del
4,5:1 de WCAG 1.4.3. `--stale`, que en la paleta vieja se quedaba en 4,40 sobre
`--elevated`, sube a 4,71 de regalo: el fondo nuevo es más oscuro.

El reemplazo fue mecánico en unos cien usos, pero tres lugares no eran marca y
había que sacarlos a mano. El escalón `.heat-4` del mapa de calor apuntaba a
`--amber`: la rampa entera del calendario es ámbar y ahí el ámbar es el dato,
así que ahora apunta a `--aging` —el mismo hex de siempre— en vez de quedar
pintado de hueso justo en el paso que tiene que gritar. La serie `prices` de
los gráficos y las series del dashboard se quedan en `#FFB627` por lo mismo:
una serie sin color deja de ser una serie, y de los dos significados que
compartían el hex el que se queda con el color es el dato.

El tercero apareció recién al mirarlo. El aro del favorito en el mapa es marca
—dice "es tuyo"—, así que le tocaba el acento; pero el aro del bar abierto ya
era `--cream`, y con Hueso el acento queda a un suspiro de ese blanco: dos aros
de 2px a nueve píxeles pasaban a ser el mismo aro. Va en `--acento-deep`, que
mantiene la distinción sin volver a meter un tono que signifique un precio.

Las estrellas de puntuación se quedan en el acento y no pasan a `--aging`. El
color ahí no dice cuánto vale la nota —eso lo dice el relleno parcial— sino de
quién es el voto, el tuyo contra el de la comunidad, que es lo mismo que el aro
de favorito. Pintarlas de `--aging` diría "esta nota tiene entre 14 y 45 días",
que es una frase sobre precios y en una estrella no significa nada.

Queda afuera el ícono de la app. `icon.svg` y `favicon.svg` siguen con la pinta
ámbar sobre el marrón viejo, y siguen así a propósito: los `icon-192.png` e
`icon-512.png` son los que usa el manifest y no hay con qué rasterizar los SVG
en esta máquina, así que cambiar sólo los vectoriales dejaría la pestaña y la
pantalla de inicio con dos íconos distintos. Un ícono viejo y coherente es
mejor que uno a medio migrar.

---

## 2026-09-14 (cont.) — v0.13.1: la birra del loader vuelve a ser birra

Reportado al toque después de la 0.13.0: el vaso que se llena mientras carga la
app quedó blanco.

El líquido usaba `var(--amber)` y el renombre lo llevó a `var(--acento)`, que
ahora es hueso. La espuma de arriba ya era `#FFFFFF`. Resultado: líquido blanco
debajo de espuma blanca, contraste 1,00 entre los dos — un vaso vacío
animándose.

Es la excepción correcta a la regla nueva, y vale la pena escribir por qué es
una excepción de verdad y no una escapatoria. La regla dice "si tiene color, es
un dato, y el cromo es hueso". El líquido de la pinta no es cromo ni es un
dato: **es una cerveza dibujada**. Es la única ilustración de la app — todo lo
demás que lleva color es un precio, una antigüedad o un control.

Va como token propio, `--birra`, y no reusando `--aging`, que casualmente es el
mismo hex. Ahí el ámbar significa "este precio tiene entre 14 y 45 días"; el
día que ese umbral cambie de color, la birra no tiene por qué cambiar con él.
Dos cosas que valen lo mismo hoy y no significan lo mismo son dos tokens.

Espuma sobre líquido pasa de 1,00 a 1,75, que para dos campos de color
adyacentes en una ilustración es suficiente — no es texto.

---

## 2026-09-14 (cont.) — v0.13.2: el vidrio ahora deja ver

Reportado: "ese `.glass` no es transparente, no se ve a través". Tenía razón, y
lo que yo había contado como una decisión de contraste era en realidad la
salida fácil.

El `.glass` de la 0.12.0 tenía un tinte de `rgba(25,27,31,.72)`. Setenta y dos
por ciento de opacidad no es vidrio: es un panel oscuro con un desenfoque
decorativo detrás que casi no se ve. Lo justifiqué diciendo que hacía falta
para el contraste del texto, y esa parte del problema era cierta — la solución
no.

**Lo que faltaba: el oscurecimiento va adentro del `backdrop-filter`.**

Una capa opaca encima *tapa* lo de atrás. Se le puede bajar la opacidad, pero
entonces deja de oscurecer y el texto queda a merced de lo que pase por debajo.
Es una disyuntiva sin salida, y de ahí salió el .72.

`brightness()` dentro del `backdrop-filter` oscurece **lo de atrás mismo**.
Seguís viendo las formas, el color y el movimiento —una cápsula de precio que
pasa por debajo se ve pasar— pero ya bajada de luz, así que el contraste está
garantizado sin tapar nada. Es la diferencia entre pintar el vidrio y polarizarlo.

Queda: tinte cero (sólo el degradado del canto), `blur(14px)` en vez de 30 —a
más desenfoque, más esmerilado y menos se reconoce lo que hay detrás— y
`brightness(.45)`, que sale de medir el peor caso real: una cápsula de precio
ámbar justo debajo del panel.

### El precio de que el vidrio sea vidrio

Si se ve lo de atrás, lo de atrás a veces es brillante. Medido sobre una
cápsula ámbar:

| | sobre el mapa | sobre una cápsula ámbar |
| --- | --- | --- |
| `--cream` | 15,63:1 | 5,50:1 |
| `--muted` | 12,86:1 | **2,48:1** |

El texto principal aguanta; el secundario no, y no hay valor de `brightness`
que lo arregle sin volver a tapar todo. Así que adentro del vidrio el color
deja de llevar jerarquía y la llevan el tamaño y el peso — que es lo que
Refactoring UI dice que hay que hacer igual: combinar palancas, no
multiplicarlas.

Token nuevo, `--sobre-vidrio` (#DDE0E2), para los textos secundarios que
flotan sobre el mapa: la leyenda de colores, el panel del radio, el cartel de
"acercá el mapa" y las pestañas inactivas de la barra. Esas últimas estaban en
2,5:1 cuando pasaba una cápsula por detrás, y son navegación primaria.

No aplica a diálogos ni hojas: ahí lo de atrás es la pantalla de la app, que ya
es oscura, y encima el `::backdrop` la oscurece antes. Ese `::backdrop` bajó de
.28 a .18 de negro, porque ahora el vidrio oscurece por su cuenta y apilar las
dos cosas lo dejaba opaco de nuevo.

## 2026-09-14 — v0.13.3: `master` de vuelta adentro de `dev`

El PR de `dev` → `master` estaba en conflicto y no se podía deployar. No había
choque de código: sólo los cuatro archivos de la versión y el WORKLOG, que es
append-only y al que las dos ramas le habían agregado su tanda.

Lo que hay que mirar acá es **por qué** chocaba la versión. `master` venía
adelante de `dev`: 0.13.2 contra 0.10.4, porque el revamp de UI se fue
commiteando sobre `master` mientras `dev` seguía en lo suyo. Eso da vuelta el
flujo que dice AGENTS.md —todo sale de `dev` y `master` recibe— y el síntoma
es este: cada rama que salga de `dev` va a nacer con una versión más baja que
la publicada, y su `versionCode` con ella. Android rechaza instalar un código
menor o igual al instalado, así que no es un detalle de prolijidad.

Resuelto tomando la de `master` y subiendo una. Las ramas abiertas que salieron
de `dev` con versión vieja tienen que volver a numerarse antes de mergear.

## 2026-09-14 — El voto, de los dos lados: BIR-10 y BIR-11

Dos tickets del mismo tema, en una rama: poder votar una foto y poder retirar
la nota de una birra.

**BIR-10 — pulgares en las fotos y foto del mes.** Tabla `photo_votes` nueva
(V18), con la presencia de la fila como voto: un pulgar es binario y una
columna `value` abría la puerta al pulgar abajo, que nadie pidió y que en una
app donde las fotos las sube la misma gente que carga los precios sólo sirve
para desalentar. Sin `status`, único contenido del proyecto que se borra de
verdad al retirarse — un voto no es algo que haya que moderar, y moderar la
foto se lo lleva por CASCADE.

La **foto del mes** se resolvió por bar y adentro de la tira de fotos que ya
existía: va primera, con borde ámbar y una banda "DEL MES". El ticket dejaba
abierto dónde mostrarla y advertía que en la pantalla del bar compite con el
precio; adentro de la tira no compite con nada, porque ahí ya se está mirando
fotos. La versión global —la mejor foto del mes de toda la app— sigue sin
lugar donde vivir hasta que exista la página de colaboradores (BIR-9).

El mes es el de Buenos Aires y lo resuelve el servidor, por lo mismo que el
día de las birras anotadas: con la zona del navegador, la foto del mes
cambiaría según dónde esté parado quien mira. Empate de votos lo gana la más
nueva: premiar a la que llegó primero sólo por llevar más días juntando
pulgares convierte la foto del mes en la del día 1.

El conteo vuelve del servidor en cada toque en vez de sumarse en el cliente.
Con dos personas votando a la vez, sumar uno localmente muestra un número que
no tiene nadie más.

**BIR-11 — retirar el voto.** Faltaba desde que se separaron la nota y el
comentario: la nota se podía corregir tocando otra estrella, pero no sacar, y
quien votó una birra que el bar dejó de tener seguía contando para siempre en
el promedio de algo que ya no se sirve. El texto del diálogo de borrar un
comentario ya decía "borrar lo que escribiste no es retirar tu voto" — y
retirarlo no se podía.

Borra la fila, no la marca `removed`: `removed` es lo que deja un moderador, y
además `upsert` revive las filas `removed`, así que volver a votar después
tenía que encontrar el terreno limpio. Sin diálogo de confirmación, a
diferencia de borrar un comentario: ahí se pierde un texto que no vuelve, acá
se vuelve tocando una estrella.

Mandar un 0 no es lo mismo que retirar: el 0 es un voto real —"estuvo
pésima"— y cuenta para el promedio.

**Migración V18 y no V17.** El V17 se lo llevó la rama de bloqueo entre
usuarios, que ya lo había aplicado a la base de tests compartida. Los tests de
esta rama corrieron contra una base propia (`birrapp_test_bir10`) para no
pisar la del otro agente: 145 verdes, 10 nuevos en `VoteTest`.

Al mergear `dev` (0.10.3) la rama se encontró con dos cosas que habían pasado
mientras tanto y que la tocan de cerca:

* **Bloqueo entre usuarios (BIR-17).** La lista de fotos ahora filtra a las
  personas bloqueadas. La foto del mes se calcula **sin** ese filtro, a
  propósito: es la que ganó para todo el bar, no una por espectador. Si la
  subió alguien que bloqueaste, el WHERE la saca igual y para vos
  simplemente no hay foto del mes.
* **Las estrellas se mudaron de la hoja de comentarios a la birra.** El botón
  de retirar la nota se fue con ellas, que es donde tiene sentido: al lado del
  voto que retira.

**La cola de moderación de fotos, que el ticket pedía primero.** BIR-10
advertía que los votos le suben el premio a subir fotos y que conviene tener
dónde repasarlas *antes* de encender los pulgares, no después. Hasta ahora una
foto sólo se miraba si alguien la denunciaba — o sea, cuando el problema ya
pasó por la pantalla de todo el mundo.

`GET /moderation/photos/recent` y una grilla al final de Moderación con las
últimas 60. No es una cola de aprobación y no va a serlo: retener las fotos
hasta que alguien las mire haría que subir una no tenga efecto visible, y
nadie sube una segunda. Tampoco entra en el contador de pendientes — el
repaso nunca llega a cero, y un número siempre prendido en Perfil deja de
leerse a la semana.

Cada foto viene con quién la subió y hace cuánto, que es el contexto que
decide: una foto rara de una cuenta de ayer no es lo mismo que una de alguien
que viene cargando precios hace meses.

Sólo web y backend. La app de Android sigue sin esto, igual que sin el
contador de birras y los favoritos: va todo junto en BIR-38.

**Renumerada a 0.13.4 al mergear.** La rama había nacido en 0.10.x, y mientras
tanto `master` se fue a 0.13.2 con el revamp de UI. Un `versionCode` por debajo
del publicado es un APK que Android se niega a instalar, así que la versión se
rehizo contra lo que hay hoy. De paso, lo nuevo se pasó a la escala de tokens
que entró con el revamp: los 9,5 y 11,5 sueltos son justo lo que la escala vino
a sacar.

## 2026-09-14 (cont.) — v0.13.5: el pulgar, de nuevo y bien

Felipe: "está pesimamente puesto el botón y encima cuando lo apretas
desaparece". Las dos cosas eran ciertas y eran dos problemas distintos.

**El bug.** No era de lógica: el revamp de la paleta borró `--amber` y lo
renombró a `--acento`, y esta rama —que había nacido antes— se quedó con cinco
`var(--amber)` colgados. Un `var()` que no existe no es un error visible: la
declaración se descarta, el fondo del botón cae al `button { background: none }`
global y queda transparente, y el ícono se pinta de `--base`, que es casi
negro. O sea que al votar el botón no desaparecía: se volvía negro sobre la
foto. Lo mismo le pasaba a la banda "DEL MES" y al borde de la foto del mes,
que directamente nunca se vieron.

La lección no es "revisar los tokens al mergear". Es que un token muerto se
degrada en silencio, y que una rama larga contra una paleta que se está
reescribiendo va a chocar con eso sí o sí. Barrí todo `web/src` comparando
`var(--x)` contra lo definido en `theme.css`: no quedó ninguno.

**El botón.** Auditado con las dos skills de UX. Daba 5/10 en el diagnóstico de
microinteracciones: el trigger no se descubría, no mostraba su estado, el
feedback no estaba a la altura del evento y un primerizo no podía entenderlo.

Lo que cambió, y por qué:

* **La miniatura vuelve a tener una sola acción: abrir la foto.** Tenía dos, y
  la segunda era un pulgar de 24px en la esquina de un cuadrado de 108 — por
  debajo del mínimo que se puede tocar, y pegado al borde del botón de abrir.
  La mitad de los toques caían en el que no era.
* **Se vota adentro del visor, que es donde estás mirando la foto.** Nadie
  decide si le gusta una foto de 108px en una tira que scrollea. Ahí el botón
  mide 44px de alto y tiene su etiqueta.
* **La etiqueta ya no se va al votar.** Antes el texto se reemplazaba por el
  número y quedaba un "1" suelto: el botón perdía lo único que decía qué hacía,
  justo en el instante en que cambiaba de estado. El número va al lado y
  apagado, porque es otro dato.
* **En la miniatura queda el número, no el control.** No es un botón, es parte
  de lo que la foto dice de sí misma —como la antigüedad al lado del precio— y
  relleno significa que la votaste vos: de un barrido por la tira se ve cuáles
  marcaste.
* **Velo en degradado en vez de pastilla opaca.** La pastilla tapaba justo la
  parte de la foto que uno quiere ver.
* **Respuesta al toque por debajo de los 100ms** (`:active` hunde el botón) y
  un golpe corto del pulgar al prenderse. El golpe va atado a *tu toque* y no
  al estado: con el selector puesto en `[aria-pressed="true"]` se disparaba
  también al abrir una foto ya marcada y al pasar a la de al lado, que es
  festejar una navegación.

El color sale de la rampa hueso y no del ámbar, y esta vez no por el token
roto: la regla de la paleta nueva es "si tiene color, es un dato", y "me gusta
esta foto" no es frescura, ni precio, ni peligro. El estado prendido se
distingue por relleno y contraste, así que se lee con la pantalla en blanco y
negro.

## 2026-09-15 — v0.14.0: traer menos, y no traerlo de nuevo (BIR-44 + BIR-43)

Dos tickets del mismo síntoma: la app se baja de más y se lo vuelve a bajar
cada vez que entrás.

### BIR-44 — paginar

El peor caso era `/auth/me/contributions`: devolvía las **cuatro** listas de
aportes, hasta 200 filas cada una. La pantalla web muestra una sola —la ruta ya
es `/mis-aportes/:tipo`— así que abrir "precios" se bajaba además tus fotos,
tus bares y tus comentarios. Hasta 800 filas para dibujar una lista.

Ahora se pide `?tipo=` y viene una, de a 30, con cursor. Sin `tipo` siguen
viniendo las cuatro, que es como lo llama la app de Android y no hacía falta
romperlo para arreglar esto.

El cursor compara la tupla `(created_at, id)` y no sólo la fecha. No es
prolijidad: tres precios cargados seguidos caen en el mismo segundo, y con un
corte por fecha sola el segundo y el tercero se saltean al pasar de página. Hay
un test que carga seis aportes con la misma antigüedad justamente para eso.

Se pide una fila de más para saber si hay página siguiente. Un `count(*)` por
página cuesta recorrer la tabla entera para contestar un sí o un no.

**Lo que se acotó sin paginar, y por qué.** `favorites` y las fotos de un bar
no tenían techo — eran dos consultas sin `LIMIT`. Les puse un tope (200 y 60) y
un comentario `ponytail:` con el techo y el camino de salida, en vez de un
cursor: nadie marca doscientos bares como favoritos, y en la tira de fotos de
un bar nadie llega a la sesenta. Poner un "ver más" ahí sería construir un
mecanismo para un caso que no existe; lo que no se podía dejar era la consulta
sin límite.

El número del encabezado ahora lleva un "+" cuando falta una página. Con
paginación, ese número es cuántos se bajaron y no cuántos hay, y mostrar "30"
cuando son ochenta es el mismo pecado que un precio sin su edad al lado.

### BIR-43 — que no arranque en blanco

Felipe preguntó cuál era la mejor estrategia. Son dos cosas y la primera no es
caché:

**Una, había un pedido que no tenía que existir.** Perfil mostraba las birras
tomadas y para conseguir ese entero llamaba a `/beers/summary`, que arma el
calendario del mes, las rachas, los bares top y los emblemas. Era la consulta
más cara de la pantalla, para leerle un campo. El total ahora viaja con los
otros cuatro contadores, en la misma consulta: de dos viajes a uno, y la grilla
deja de dibujarse en dos tiempos.

**Dos, recién ahí, caché.** *Stale-while-revalidate* en `localStorage`
(`data/cached.ts`), elegido sobre las otras dos opciones por lo que hace cada
una cuando el dato cambió:

* *Caché con vencimiento* (guardar 5 minutos): el número queda viejo justo en
  el caso que importa — cargás un precio, volvés a Perfil y dice lo de antes.
  Peor que tardar.
* *Nada* (lo que había): siempre correcto, pero parpadea en cada entrada
  aunque no haya cambiado nada.
* *Esto*: se pinta lo guardado al instante y se pregunta igual, siempre. Si
  cambió, se actualiza sin que la pantalla se vacíe. Nunca se muestra menos de
  lo que ya se sabía.

Va sólo para los cinco contadores de Perfil: datos chicos, propios y que se
pueden mostrar un segundo viejos. **Nada de precios.** Un precio viejo pintado
como fresco es exactamente lo que esta app existe para no hacer, y esa es la
línea que la caché no cruza.

Se limpia al cerrar sesión: son números de una persona.

152 tests verdes, 7 nuevos en `PaginationTest`.

## 2026-09-15 (cont.) — v0.15.0: el precio pasa a ser el consenso (BIR-8)

`v_current_prices` era un `DISTINCT ON` ordenado por fecha: **el último que
reporta gana**, aunque sea uno contra veinte. Alcanzaba con que alguien cargara
un número falso para que ese fuera *el* precio del bar. Es el agujero más
grande que le quedaba al modelo de datos.

No cambió nada de cómo se guarda, y ese es el punto: `PriceRepo.confirm` ya
insertaba una fila completa con el valor vigente y `is_confirmation = true`,
así que cada "Sigue igual" **ya era un voto por un número** — sólo que nadie
los contaba. Efecto lateral bueno: confirmar pasa a valer más, no menos. Antes
sólo rejuvenecía la fecha; ahora es peso detrás de un valor.

Las cuatro decisiones, en orden de cuánto importan:

1. **Un voto por persona, ANTES de la mediana.** Es el paso del que depende
   todo. Sin él, el atacante reporta diez veces y *es* el consenso, y el modelo
   queda más manipulable que el que había. Hay un test que carga diez reportes
   del mismo usuario justamente para eso.
2. **Mediana y no promedio.** Un valor absurdo entre cinco honestos no mueve la
   mediana; al promedio lo arrastra, que es el ataque.
3. **Ventana de 21 días, y adentro el peso decae con la edad.** La ventana
   sola no alcanzaba, y lo marcó Felipe al revisarlo: adentro de los 21 días un
   reporte de hoy y uno de hace veinte valían igual, así que tres viejos que
   coinciden le ganaban a uno de hoy que dice otra cosa — y el de hoy es
   justamente el que más chance tiene de tener razón, porque el precio se
   movió. Cada voto pesa `0.5 ^ (días / 10)`: hoy vale 1, a los diez días
   medio, a los veinte un cuarto. La media vida de 10 días es **la perilla** de
   la vista: subirla da un precio más estable y más lento para reaccionar a un
   aumento, bajarla al revés.

   El compromiso tiene dos lados y los dos están testeados: uno de hoy le gana
   a tres de hace veinte, pero **no** da vuelta un consenso de hace cinco. Si
   lo diera, alcanzaría con reportar último para mandar, que es justo lo que
   esto vino a arreglar.

   Efecto lateral lindo de la mediana ponderada: devuelve un precio que alguien
   reportó de verdad, en vez del promedio de los dos del medio. El número que
   se muestra existió.
4. **Con menos de 3 votantes, el más reciente**, o sea lo de antes. Una
   "mediana" de dos reportes es el promedio de dos números.

**Lo que no se toca: la edad.** El consenso decide QUÉ número se muestra, no de
cuándo es. `age_days` y `freshness` siguen saliendo del reporte más reciente.
Tocar eso rompería la única regla que el proyecto no negocia, y hay un test que
lo fija: tres reportes de hace 20 días más una confirmación de hoy da precio de
consenso y `fresh`.

**Dos cosas que no estaban en el ticket y aparecieron escribiendo la vista:**

* **El tamaño.** La mediana tiene que ser entre reportes del mismo `size_ml` y
  la misma moneda, o mezcla una pinta con un litro y devuelve un número que no
  es el precio de ninguno de los dos. Se toma el tamaño del reporte más
  reciente como referencia.
* **`reported_by` puede ser NULL** —la cuenta se borró y el precio queda, que
  es deliberado—. Cada una de esas filas cuenta como su propio votante: eran
  personas distintas cuando se cargaron, y juntarlas en un voto sería inventar
  un consenso que no hubo.

En pantalla, debajo de la edad: "consenso de 6", y el rango cuando hay
desacuerdo de verdad. Si los seis dicen lo mismo, mostrar "$5.000–$5.000" es
ruido; si dicen cosas distintas, esconderlo sería precisión falsa.

157 tests verdes, 12 nuevos en `ConsensusTest`, y los dos que AGENTS.md exige
para esta vista —`FreshnessTest` y `PriceReportTest`— pasan sin cambios.

**Versión 0.15.0 y no 0.14.0**: la 0.14.0 se la lleva la rama de paginación
(PR #49), que está abierta en paralelo. Dos ramas sin mergear no pueden
reclamar el mismo número.

## 2026-09-15 (cont.) — v0.16.0: página de colaboradores (BIR-9 + la foto del mes de BIR-10)

La app agradecía los aportes en privado: "Mis aportes" lo ve sólo quien lo
cargó, y no había nada que devolviera estatus en público. En una app que
depende de que la gente releve precios gratis, era la palanca de retención más
barata que quedaba sin usar.

El ticket dejaba dos cosas abiertas. Las dos se resolvieron, y las dos son
reversibles si no convencen.

### 1. Qué nombre se muestra: el alias, y sólo el alias

`display_name` viene de Google y muy seguido es nombre y apellido reales.
Publicarlo no es una decisión de interfaz, es un cambio de privacidad: quien
cargó un precio para que la app funcione no aceptó aparecer en una lista
pública con su nombre completo.

Por eso el alias es **opt-in y sin default**: sin alias no se aparece. La
alternativa —sembrarlo con el nombre de pila de cada uno— publica a todos y
después les avisa, que es el orden equivocado.

La contra es real y conocida: al principio la tabla va a estar casi vacía. Se
prefiere una tabla vacía a una tabla con gente que no pidió estar, y para que
la página no mienta sobre cuánta gente sostiene esto, abajo dice cuántos
aportaron sin alias puesto. De paso es la invitación más honesta a ponerse uno.

Validación del alias: 3 a 20, letras/números/espacio/`. _ -`, tiene que
arrancar con letra o número, único sin distinguir mayúsculas. El filtro no es
prolijidad: la tabla pública es exactamente donde alguien mete emojis, saltos
de línea y espacios invisibles para hacerse notar.

### 2. Qué pesa cada aporte: lo que ya pesaba, con tope

Se reusa `CONTRIBUTION_WEIGHT` —precio y bar 3, foto y nota 2, confirmación 1—
que ya rankea gente en el dashboard, en vez de inventar una economía nueva.

Lo que se agrega es el tope que pedía el ticket: **un aporte que puntúa por
persona, tipo, bar y día**. Veinte precios en el mismo bar el mismo día valen
lo mismo que uno.

Es el punto entero del ranking. Hecho público, el score se vuelve un incentivo
y la gente optimiza para el número; premiar el volumen crudo es invitar a
cargar precios inventados, que es el ataque contra el que se defiende el resto
de la app. Con el tope, la única forma de subir es tocar bares distintos o
volver otro día — las dos cosas que el mapa necesita. Por eso la fila muestra
**los bares** antes que los aportes: es el número que distingue a quien relevó
la ciudad de quien apretó veinte veces en la esquina de su casa.

El mes corre y se reinicia. Una tabla histórica la gana siempre el mismo y al
que llega nuevo le dice que no tiene sentido empezar.

### La foto del mes encontró dónde vivir

Quedó pendiente en BIR-10: en la pantalla del bar competía con el precio, que
es lo que la app viene a contestar. Acá no compite con nada — esta página **es**
el reconocimiento. Va arriba de la tabla, con el bar, la birra, los pulgares y
la firma del autor (su alias; sin alias se muestra igual pero sin firma).

156 tests verdes, 11 nuevos en `LeaderboardTest` — los del tope y los de
privacidad son los que importan.

**Versión 0.16.0**: la 0.14.0 se la lleva PR #49 (paginación) y la 0.15.0 PR
#50 (consenso), las dos abiertas en paralelo.

## 2026-09-16 — v0.16.1: fuera la leyenda de barato/caro

Felipe, mirando el mapa: "es obvio y además quedó feo". Tiene razón en las dos.
Verde a rojo para barato/caro es una convención lo bastante fuerte como para no
gastar una pastilla del encabezado en explicarla, y esa franja ya venía cargada
—filtro, radio, y esto— encima de un cartel de error cuando no hay ubicación.

Se fue la pastilla, el componente `Swatch` que la dibujaba y el paso del
tutorial que la señalaba. El paso había que sacarlo igual: sin su ancla en
pantalla el tutorial lo saltea solo, así que quedaba como configuración muerta.

**Lo único que la leyenda decía y no era obvio** es que el pin gris no es un bar
caro sino un bar sin precio cargado. Eso se mudó a "Cómo funcionan los precios",
que es donde alguien lo va a buscar. La confusión es real y cara: leer el gris
como "caro" es leer el mapa al revés justo en los bares donde falta el aporte.

## 2026-09-16 (cont.) — v0.16.2: los filtros de la lista con favoritos puesto

Felipe: "no funcionan los filtros en la vista de listas cuando tengo puesto el
botón de favoritos, y tampoco le da bola al punto secundario".

Las dos cosas, y las dos en el backend. Con el filtro de favoritos prendido la
lista salía de `/favorites`, que no aceptaba ni `style` ni `sort` y ordenaba
siempre por `f.created_at DESC`. Los controles seguían en pantalla, se podían
tocar, y no pasaba nada: la píldora de estilo y el interruptor de orden estaban
de adorno.

Lo del punto secundario es la mitad más confusa del bug, y vale anotarla porque
el síntoma no señala la causa. La distancia **sí** se calculaba desde el punto
elegido, así que cada fila decía bien a cuánto estaba; lo que no cambiaba era el
orden. O sea que se veía "a 200 m" debajo de "a 4,1 km" — que no se lee como un
problema de orden sino como que la app calcula mal las distancias.

`favorites()` ahora toma los mismos `sort` y `styleSlug` que `nearby`, con el
mismo JOIN contra `v_current_prices` para que, filtrando por estilo, el precio
de la fila sea el de ESE estilo y no el más barato del bar. Sin ubicación cae al
orden de antes —el último que marcaste, arriba—, porque ordenar por una
distancia que es NULL en todas las filas deja el orden a gusto de Postgres.

179 tests verdes, 4 nuevos en `FavoriteTest`. El de distancia prueba las dos
puntas: desde el Obelisco y desde el punto secundario, y la lista se da vuelta.

## 2026-09-16 (cont.) — v0.17.0: birras favoritas, tres pastillas, y el rating se arrastra

Cuatro pedidos de Felipe mirando la app, que resultaron tener poco que ver
entre sí salvo que los cuatro eran "esto está incómodo".

### La fila de birras: tres y un "⋯"

La ficha mostraba TODOS los estilos en una fila horizontal que scrollea. Con
seis birras, la cuarta y la quinta **no existen** para quien no descubra que la
fila se arrastra — y una fila horizontal adentro de una página que ya scrollea
vertical es de los gestos que menos se descubren solos.

Ahora se ven tres y el resto está detrás de un "⋯" que abre la lista completa.
Cuáles son los tres, en orden y sin repetir:

1. **La que estás mirando.** Si la solapa activa se escondiera detrás del "⋯",
   la fila diría que estás viendo algo que no está.
2. **Tus favoritas**, en el orden en que las elegiste.
3. **Las mejor puntuadas**, para quien no eligió ninguna. Por `ratingAvg` —el
   que lleva shrinkage— así que un 5,0 con un voto no le gana a un 4,6 con
   cuarenta.

Se dibujan en el orden original de la lista, no en el orden en que se eligieron:
si no, las pastillas se reacomodan cada vez que tocás una y la fila baila
debajo del dedo.

### Las favoritas: V21, y por qué arrays

`favorite_styles` y `favorite_brands` como `text[]` en `users`, no dos tablas de
relación. Son un puñado de slugs por persona, se leen siempre enteros y junto
con el resto del usuario, y no hay una sola consulta que quiera cruzarlos. Dos
tablas serían dos joins en cada lectura de perfil para guardar seis palabras.

Se eligen al crear la cuenta, **una vez y salteable**. Esto mejora la app, no la
habilita: sin preferencias el desempate por puntuación es razonable. Un
onboarding que bloquea la entrada por algo opcional es la forma más rápida de
que alguien cierre la app antes de ver un precio, que es a lo que vino. La marca
de "ya se le ofreció" va en `localStorage` **por cuenta**: en un teléfono
compartido, que uno diga "ahora no" no puede dejar al siguiente sin la oferta.

### El rating: se arrastra, no se teclea

Eran cinco botones que daban sólo enteros y, al lado, un campo de texto
permanente para el decimal. El campo estaba siempre a la vista aunque no lo
usaras, el número salía descentrado, y pedirle a alguien que **escriba** "3,5"
para puntuar una birra es pedirle que abra el teclado para algo que el dedo ya
sabe hacer.

Ahora se apoya el dedo y se corre; la nota engancha de a medio punto. Por eso
las estrellas de edición pasaron de 19 a 34 píxeles: con estrellas chicas, medio
punto son cuatro píxeles de recorrido y no hay pulgar que lo acierte. **El
tamaño acá no es estética, es la resolución del control.** El valor se manda al
soltar, no en cada movimiento.

### Color: dos tokens nuevos, y por qué son una excepción

La paleta Hueso dice "si tiene color, es un dato" y el cromo va en la rampa de
grises. El resultado era que el nombre del bar, la nota, cada pastilla y el
corazón de favorito pesaban todos lo mismo y nada sobresalía. Dos excepciones,
cada una con su motivo:

* **`--favorito` (#FF4D5E).** El corazón rojo es una convención más fuerte que
  cualquier paleta; uno hueso relleno no se lee como "es mío". Va aparte de
  `--danger` a propósito: ese rojo significa "esto no se deshace" y aparece en
  borrar cuenta. Marcar un bar que te gusta no puede compartir color con eso.
* **`--nota` (#FFC24D).** El ámbar de la estrella, también convención. La nota
  es el segundo dato que se mira después del precio y necesita su tono.

El corazón del mapa pasó a la izquierda del precio, de 10 a 14 píxeles y a rojo.
Estaba a la derecha, calzado contra el borde con un ancho extra de 13 — o sea
que su "padding" no era un padding sino la diferencia entre dos números que
nadie había vuelto a mirar. A la izquierda funciona mejor por cómo se lee un
pin: el ojo entra por ahí, y "es tuyo" es lo primero que querés saber de un bar
que marcaste.

Y la dirección del bar se despegó de la fila de pastillas, que estaba tan pegada
que la dirección se leía como su rótulo.

179 tests verdes, 6 nuevos en `PreferencesTest`.

## 2026-09-17 — v0.18.0: ubicación, filtros, y que la app conteste al tocarla

Una tanda larga de pedidos mirando la app. Lo que vale anotar de cada uno es
por qué estaba roto, no qué se agregó.

### El permiso de ubicación que nunca se pedía

El bug era real y tenía dos capas, las dos en `useLocation`:

* `request()` —el botón de centrar y el "Reintentar" del cartel— arrancaba con
  un atajo por frescura: si había un fix de menos de N minutos, volvía sin
  hacer nada. Ese atajo valía **siempre**, también con el permiso todavía en
  `prompt`. O sea que a quien tenía una posición guardada de antes pero el
  permiso sin dar —permisos reseteados, la PWA reinstalada, el navegador
  limpiando el sitio sin limpiar el `localStorage`— el botón le salía por ahí
  sin llegar nunca a `getCurrentPosition`, y **el navegador nunca preguntaba**.
* En el arranque, con permiso en `prompt` y posición guardada, se marcaba
  `denied = false` y se terminaba: ni cartel ni pedido. La app usaba una
  posición vieja para siempre.

Ahora el atajo vale sólo con el permiso ya dado. Sigue sin pedirse de arranque
—preguntar antes de que se vea para qué sirve es la forma más rápida de que lo
nieguen para siempre— pero el botón llega de verdad al pedido.

El cartel además se puede cerrar. Para quien decidió mirar precios sin dar la
ubicación era un aviso permanente sobre una decisión ya tomada, tapando mapa.
Se cierra por pantalla, no para siempre: la situación sigue siendo cierta.

### Filtros: varios estilos y piso de estrellas

El filtro pasó de uno a varios. El detalle que importa es el **LATERAL**: un
`= ANY(?)` sobre `v_current_prices` devuelve una fila por estilo que coincida,
así que un bar con IPA y APA aparecía dos veces en el mapa, dos pines encimados
con precios distintos. El LATERAL se queda con la más barata de las que
coinciden, que además es la respuesta correcta a "¿cuánto me sale una IPA o una
APA acá?".

La clave de la caché del cliente pasó a ser la combinación entera de filtros.
Era sólo el slug: con varios, "IPA" y "IPA + APA" habrían compartido caché y al
agregar el segundo estilo se verían los bares del primero.

El piso de estrellas filtra por `rating_raw` —la nota que se muestra— y no por
`rating_sort`, que es la que lleva shrinkage. Es al revés que el orden, y a
propósito: si alguien filtra "4 o más" y ve un bar que dice 3,9, el filtro
parece roto. Lo que se ve y lo que se filtra tienen que ser el mismo número.

### Feedback: vibración y sonido

Confirmar un precio, votar una foto o marcar un favorito no producían nada
hasta que volvía el servidor. Parado en un bar, con una mano, esa espera se
siente como que el toque no entró — y la reacción natural es tocar de nuevo.

Dos canales porque ninguno alcanza solo: `navigator.vibrate` no existe en
Safari de iOS, y el sonido es lo único que llega ahí. Tonos sintetizados y no
archivos: tres notas no justifican bajar assets ni cachearlos.

Sólo en lo que **cambia algo** —un voto, un precio, un favorito, una birra, y
los errores—. Un canal que avisa de todo deja de avisar de nada. Los dos se
apagan por separado: en un bar con gente el sonido molesta y la vibración no.

El del favorito va en `useFavorites.toggle` y no en cada botón: es el único
camino que tienen todos los corazones, así que el aviso sale una vez.

### Lo demás

* **La nota subió al renglón del nombre** en la lista. Estaba tercera en la
  línea de metadatos, después de la distancia y la antigüedad, donde todo pesa
  igual.
* **El tutorial se puede pedir** desde un "?" en el mapa, con o sin sesión.
  Sigue sin arrancar solo sin cuenta —habla de aportar— pero quien quiere
  entender la app antes de crearse una es justo a quien más le sirve.
* **Cuántas birras te tomaste en el bar**, en la ficha. Viaja con el detalle y
  no en un pedido aparte: es un entero, y un round trip por un número es lo que
  se sacó de Perfil en BIR-43.
* **Favoritear desde la vista previa**, sin entrar al bar. Y **filtro de
  favoritos en el mapa**, que filtra los pines cargados en vez de pedir de
  nuevo: el mapa muestra lo que entra en pantalla, así que "mis favoritos"
  acá significa "de lo que veo, cuáles marqué". En la lista sí se pide al
  servidor, porque ahí el favorito que buscás suele estar en otro barrio.
* **Fuera el cartel de la app de Android.**

### A Linear

* **BIR-47** — cómo asociar la birra tomada al bar y sacar los más populares.
  Lo primero es medir qué proporción de `beer_logs` tiene `bar_id`: si la
  mayoría viene en NULL, un ranking sería de los bares donde alguien se acordó
  de tocar la pastilla.
* **BIR-48** — si vale la pena un distintivo para los más recomendados. La
  pregunta real no es cómo calcularlo sino qué agrega sobre poder ordenar por
  nota, que ya se puede. Conviene decidirlo después de ver si con el filtro de
  estrellas alcanza.

187 tests verdes.

## 2026-09-17 (cont.) — v0.19.0: dirección "Pizarra heritage", la PWA repintada entera

Viene de un proyecto de Claude Design («BirrApp rediseño de UI», variante **C —
Pizarra heritage**), que propone cuatro direcciones y de las cuatro ésta es la
que menos pelea con lo que la app ya era. Se aplicó sólo a la PWA: el tema de
Android no se tocó.

### La regla de la paleta no cambió; cambió el material

Sigue valiendo **"si tiene color, es un dato"**, que es lo que en su momento
sacó el ámbar de marca porque compartía hex con `--aging` y con un punto de
`PRICE_STOPS`. Lo que cambia es el fondo: la rampa de grises fríos pasa a una
de espresso (`--base #1B0D17`, `--raised #241321`, `--elevated #33202D`) y el
cromo hueso pasa de `#EDE6D8` a Floral White `#FFFDF4`.

El motivo no es de gusto. Sobre el neutro frío, los tres colores del dato
flotaban sobre un gris que no era de nadie. Sobre espresso se leen como tiza
sobre una pizarra, que es literalmente de dónde salen los precios que la app
viene a juntar.

Los datos se movieron con el fondo: **la frescura deja de ser verde** y pasa a
Lime Cream `#FFFC9A`. El verde menta era el único tono de la pantalla que no
pertenecía a la familia y quedaba como un LED pegado encima; la lima dice
"recién escrito", que es exactamente lo que significa un precio fresco, y da
14,18:1 contra `--elevated` — el valor más alto de toda la rampa de datos. Lo
más importante es lo que más se ve. `--aging` va a `#EE9A52`, `--stale` a
`#9C8A90` (el mismo tono que los metadatos: un precio viejo dejó de ser
noticia) y `--favorito` a coral `#EE6352`.

`--favorito` y `--danger` ahora son el mismo coral y siguen siendo dos tokens.
Hasta acá eran dos rojos distintos a propósito —"es mío" contra "esto no se
deshace"—; heritage tiene un solo rojo, así que la diferencia la hace el
tratamiento, que es la palanca que corresponde: el favorito es un ícono
relleno, el peligro es un botón con borde y confirmación, y nunca aparecen
juntos. Se dejan separados porque el día que vuelvan a ser dos tonos, eso
cuesta una línea y no una búsqueda por todo el código.

### `--info`: el token que faltaba

Steel Blue `#85A1C1`, y es lo que más cambia cómo se lee la app.

El problema de la pantalla anterior no era de color sino de jerarquía: había
**una sola voz apagada** para tres cosas distintas —el metadato de una fila, la
etiqueta que separa una sección y el dato secundario— así que todo lo que no
era el precio pesaba igual y la pantalla se leía plana. Ahora lo informativo y
analítico tiene tono propio: distancias, etiquetas de sección, consenso,
telemetría, radio, "verificado", el punto del GPS, las acciones secundarias.
"A 450 m" dejó de competir con "Palermo Soho".

Es frío a propósito: sobre espresso, un segundo acento cálido se confundiría
con `--aging`, que es precio.

Contraste medido, no estimado, contra las tres superficies: el piso es
`--faint` con 4,66:1 sobre `--elevated`, mejor que el 4,53 de Hueso. Ninguno
de los once tonos baja de 4,5:1 en ninguna superficie.

### La gramática "pizarra"

* **Filas con filete, no tarjetas.** La tarjeta queda para lo que de verdad es
  un bloque aparte: el resumen de zona, el karma, las baldosas del perfil.
* **Barra de frescura de 3px** a la izquierda de cada fila de bar. Es el cambio
  que más rinde: la lista se lee de un vistazo sin leer una sola fecha.
* **Precio grande a la derecha y la edad justo debajo**, en el color de su
  frescura. Salió de cuatro copias distintas del mismo markup a un solo
  `PriceColumn`, con la regla adentro: si no se sabe de cuándo es, dice "sin
  fecha"; nunca queda el número solo.
* **Segmentados y pestañas: texto con barra de 2px**, no cápsulas. La cápsula
  rellena pesaba lo mismo que un CTA y competía con el precio. Un solo
  vocabulario para "posición activa" en toda la app.
* **La barra de navegación deja de flotar**: plana, apoyada abajo, con filete
  arriba, indicador de 2px sobre el ícono activo — y **las tres etiquetas
  visibles**. Antes sólo la activa mostraba texto y las otras dos se anunciaban
  sólo por `aria-label`: había que adivinar o tocar para saber.
* **El vidrio queda sólo donde flota sobre el mapa**, más diálogos y hojas.
* **El basemap pasa a espresso** y el agua a azul acero. De paso se arreglaron
  los nombres de calle, que estaban en 2,41:1 sobre la autopista.

### Lo que se sacó porque estaba mal, no porque no entrara

Los dos encabezados —mapa y lista— iban a mostrar "N bares · promedio $ X",
que es lo que propone el diseño. **No se implementó, y el promedio que ya
existía se fue.** Promediaba `fromPrice`, que es el precio *más barato* de cada
bar y además sin normalizar por tamaño de servicio: no era el promedio de nada.
Y encima se dibujaba sin antigüedad, o sea rompiendo la regla que no se
negocia. El promedio correcto ya existe —`AreaStats.avgPint`, normalizado a
473 ml y con su alcance temporal— y en la Lista se estaba dibujando a pocos
píxeles de distancia, en `AreaStatsCard`: eran dos números distintos del mismo
radio en la misma pantalla. Los encabezados quedan contando lo que se ve.

Por lo mismo se le sacó el precio a las pastillas de marca de la ficha: tres
marcas con monto y edad ocupaban tres renglones justo arriba del precio, y sin
la edad no se podían mostrar. El monto con su antigüedad sigue en la fila de
abajo, y cambiar de marca es un tap.

### Accesibilidad, de paso

* El `aria-label` del monto en "Cargar precio" **tapaba el monto**: con lector
  de pantalla no había forma de saber qué precio se estaba tecleando. Pasó a
  `aria-describedby`, y el valor entró además en la región `aria-live`.
* El corazón de favorito sobre la portada del bar daba 1,65:1 con una foto
  clara — peor que el estado sin marcar. El `backdrop-filter` de esos botones
  lleva ahora `brightness(.45)` y pasa a 3,76:1.
* El `<select>` del tamaño del vaso estaba en 13px: Safari de iOS hace zoom al
  enfocarlo y no lo devuelve. Es de antes de este cambio; se arregló igual.
* En el calendario de "Mis birras", un `outline` inline anulaba el anillo de
  foco de todos los días.

### Cómo se hizo

Ocho agentes en paralelo, uno por grupo de archivos, contra una especificación
escrita antes de tocar nada. Después una revisión adversarial en cuatro
dimensiones —reglas duras, accesibilidad, regresión, adherencia— con un
escéptico por dimensión encargado de refutar los hallazgos. Sobrevivieron 33,
y esos se arreglaron en una tercera ronda.

Vale anotar lo que eso encontró, porque es el argumento para volver a hacerlo:
los dos defectos más graves —los dos precios sin antigüedad en los
encabezados— los introdujo este mismo trabajo, en texto nuevo, en la misma
sesión en la que la especificación decía en su sección 4 que esa regla no se
tocaba.

### Pendiente

* **El tema de Android no se tocó.** La especificación sirve igual; es un pase
  equivalente sobre Compose.
* **`vs zona` mientras se teclea el precio** (está en el diseño): necesita
  `AreaStats.avgPint` en la pantalla de carga. Hoy sólo lo pide `AreaStatsCard`
  por dentro; encenderlo es levantar ese estado y bajarlo como prop, sin API
  nueva.
* **El consenso en la fila de la lista** (también del diseño): `BarPin` no trae
  `voters` ni el rango, eso vive en `StylePrice`. No se inventó el campo.
* **`PriceColumn` vive en `ui/Empty.tsx`**, que no es su casa. Está ahí a
  propósito, al lado de `SkeletonRows`, porque la métrica del esqueleto y la de
  la fila real se habían separado justamente por vivir en archivos distintos.
  Cuando se mude, tienen que mudarse las dos.
* La tarifa de puntos (`+N pts`) está escrita en el cliente y la verdad vive en
  `CONTRIBUTION_WEIGHT` del backend. Ya estaba así; ahora está en más lugares.

## 2026-09-17 (cont.) — v0.20.0: sin puntos a la vista, y los filtros del mapa que se leen

### Los "+N pts" se apagan

El sistema de karma no existe. Los números eran reales —salen de
`CONTRIBUTION_WEIGHT` y son los que ordenan la tabla de Colaboradores— pero lo
que no existe es lo que un "+3 pts" arriba de un botón promete: un saldo que se
mira, niveles, algo que los puntos hagan. Prometer una recompensa que no llega
es peor que no prometer nada, y encima gasta el gesto una sola vez.

Van detrás de `KARMA_VISIBLE`, en `data/karma.ts`, junto con los pesos, que
estaban copiados en tres archivos. No es código borrado: el día que el sistema
esté, se prende ahí y vuelve a aparecer en los cuatro lugares que ya lo
dibujan. Se apagan los "+N pts" de "Sigue igual", "Actualizar", "Cargar el
primer precio" y "Cargar su precio", el de la foto —que pasa a decir
"Agregar", porque un cuadro punteado con una cámara y nada más se lee como una
foto que no cargó— y la tarjeta de karma de Colaboradores. **La tabla de
Colaboradores se queda**: es dato real y no promete nada.

### Los filtros del mapa

No se había borrado ninguno: estilos + nota mínima, favoritos y radio estaban
los tres. El problema era que se habían vuelto ilegibles. Eran píldoras de
44px con un ícono adentro y ninguna palabra, apoyadas justo debajo del
encabezado nuevo, que también es de vidrio: cuatro piezas del mismo material,
sin una sola etiqueta entre todas, se leen como cromo de la barra y no como
cosas que se tocan.

Ahora cada filtro lleva su palabra al lado del ícono —Estilos, Favoritos,
Frescos— que es lo mismo que la dirección hizo con las pestañas de abajo.

**Y hay uno nuevo: Frescos**, que no existía en ninguna pantalla. Deja los
bares con un precio de menos de 14 días, que es el mismo corte de `fresh` de
todo el proyecto —ahora exportado como `FRESCO_DIAS` desde `data/format.ts`,
para que el filtro no invente un segundo significado de "fresco"—. Un bar sin
precio no pasa el filtro, y es deliberado: "sólo frescos" es una pregunta sobre
el precio, y un bar sin precio no la contesta que sí.

Filtra lo cargado y no vuelve a pedir, igual que el de favoritos: en el mapa la
pregunta es siempre "de lo que estoy viendo, cuáles". Los dos se cruzan, y el
encabezado y el vacío saben decirlo — "3 favoritos con precio fresco",
"ningún precio fresco por acá", y el botón de salida limpia los dos.

### Un control prendido sobre el mapa va opaco

Al medir el contraste del chip prendido apareció un defecto que venía del
repintado. Sobre el mapa, un relleno translúcido deja el contraste a merced de
lo que pase por debajo: contra una cápsula de precio clara, el filtro de
estilos prendido daba **2,58:1** y un chip coral habría dado 1,28:1.

El agravante es que `.glass` estaba calibrado para eso, pero con la paleta
vieja: el `brightness(.45)` se había medido contra el ámbar `#FFB627`, que era
lo más brillante del mapa. Heritage invirtió la cápsula del pin seleccionado a
hueso pleno `#FFFDF4`, bastante más claro, y contra eso el texto principal
sobre vidrio caía a 4,10:1 y el secundario a 3,31:1 — los dos por debajo de
1.4.3, en toda la familia del vidrio y no sólo en los filtros.

Dos cambios:

* `.glass` baja a `brightness(.35)`. Texto principal 5,74:1, secundario
  4,64:1, y sobre el mapa oscuro —que es lo normal— 16:1. Queda anotado en el
  token que este número no depende de la paleta del vidrio sino de lo más
  claro que pueda quedar debajo: cada vez que cambie un color del mapa hay que
  volver a medirlo.
* Un filtro **prendido** sobre el mapa se pinta opaco, con la etiqueta en
  espresso: favoritos 5,86:1, frescos 17,59:1, estilos 7,04:1, y ninguno
  depende del fondo. En la lista, donde el fondo es la pantalla y no el mapa,
  el prendido sigue siendo el tinte suave de la dirección.

Ningún brillo razonable salva a `--info` como texto sobre vidrio, así que eso
queda dicho en el token: sobre vidrio se escribe en hueso.

## 2026-09-17 (cont.) — v0.21.0: "Cerca" es una pestaña, y el filtro de frescura en la lista

### Cerca

La barra de abajo pasa a cuatro pestañas, en el orden del diseño: **Cerca,
Mapa, Lista, Perfil**. Cerca va primera porque contesta la pregunta más general
—cuánto sale la pinta por acá— y las otras dos la responden cada vez más fino:
el mapa dice dónde, la lista dice cuál.

Lo que hay adentro, en ese orden: el típico de la zona con el abanico entre el
piso y el tope, la más barata cerca, lo último que se cargó, y —sólo si hay
algo concreto que pedir— cuántos bares del radio tienen el precio vencido, con
el botón para arreglarlo.

**El promedio de la zona se mudó de la Lista.** Vivía en `AreaStatsCard`,
plegado arriba de las filas, con este argumento: la pregunta aparece mirando
precios, y una pantalla aparte sería un lugar al que habría que acordarse de
ir. El argumento era bueno y se cae por una sola razón: ahora hay una pestaña,
y un destino de la barra de abajo no es un lugar al que hay que acordarse de
ir. Arriba de la Lista pagaba caro — plegado no se leía, y desplegado empujaba
las filas media pantalla para abajo.

Dos cosas que **no** se hicieron, y por qué:

* El diseño muestra "Se movió esta semana". Para saber que un precio cambió
  hace falta el anterior, y el servidor no lo manda con los pines. La sección
  dice "Lo último que se cargó", que es lo que el dato sí sostiene: los pines
  ordenados por antigüedad del precio.
* No hay ninguna consulta nueva. `bars` ya viene del mismo `useBars` que
  alimenta el mapa y la lista, y `areaStats` era la única que hacía la tarjeta
  vieja.

### El filtro de frescura, también en la lista

El de la v0.20.0 estaba sólo en el mapa. Ahora está en las dos, al lado del de
favoritos. Se cruzan, y el resumen del encabezado y el vacío saben decirlo.

Acá filtra en memoria, al revés que el de favoritos, y no es una
inconsistencia: "mis favoritos" es sobre bares que pueden estar en cualquier
lado y por eso se piden al servidor; "sólo frescos" es un recorte de lo que la
lista ya trajo. Buscando no se aplica ni se dibuja: la búsqueda es por nombre
sobre toda la base, y que el bar que estás tipeando desaparezca porque nadie
pasó a mirar su pizarra sería contestar otra cosa de la que se preguntó.

### Dos arreglos del Perfil

* **La tuerca se veía cortada.** El mail es un token de veinte y pico de
  caracteres sin espacios: se salía de su columna —`minWidth: 0` deja que el
  contenedor se encoja, pero no impide que el texto se desborde— y empujaba la
  tuerca y el botón de salir fuera del ancho de la pantalla. Ahora va en una
  línea con elipsis, y el nombre corta con `overflowWrap: anywhere`.
* **El símbolo de salir estaba descentrado.** Era el carácter `⇥`: un glifo de
  texto se centra por su caja de avance y por la línea base, no por su tinta.
  Pasó a SVG, con el mismo `viewBox` que la tuerca de al lado.

## 2026-09-17 (cont.) — v0.22.0: el perfil, más cerca del diseño

Tres cosas que la pantalla no tenía y el diseño sí:

* **Título "Perfil".** Las otras tres pestañas lo tienen y ésta arrancaba
  directamente con la cara. Con la barra de abajo mostrando las cuatro
  etiquetas, un encabezado que dice dónde estás es lo que cierra el par.
* **El avatar es un cuadrado de esquina blanda**, no un círculo: es la forma
  que la dirección usa para los avatares —la misma de las iniciales de cada
  comentario en la ficha del bar— y el círculo era la única esquina redonda que
  quedaba en una pantalla de filetes. Sin foto, las iniciales van en la familia
  informativa.
* **Los favoritos, en filas.** El diseño muestra los bares marcados en el
  perfil y no sólo un número que lleva a otra pantalla, y es el lugar donde
  corresponde: un favorito es de la cuenta, no de la zona, así que ésta es la
  única pantalla donde la lista entera cabe sin que el radio la recorte. Se
  muestran los primeros cinco; "Ver en la lista" lleva a `/lista?favoritos=1`,
  que abre la Lista con el ámbito de favoritos ya puesto. Por la URL y no por
  estado de router, así el enlace se puede compartir y el botón de atrás
  devuelve el ámbito que había.

### Lo que queda distinto del diseño, a propósito

* **La tarjeta de karma no está**, por lo de la v0.20.0: el sistema no existe.
* **"Aportando desde hace N meses"** no se puede decir: `User` no trae la fecha
  de alta. En su lugar queda el mail, que es el dato que sí hay.
* **Reseñas y aportes siguen siendo destinos y no listas inline.** El diseño
  los apila en la misma pantalla porque el mockup no tiene sub-pantallas;
  acá existen, con paginado y con su propio filtro, y duplicarlos en el perfil
  sería bajarse dos veces lo mismo para mostrar las primeras tres filas.

## 2026-09-17 (cont.) — v0.22.1: cuatro cosas que se veían mal

* **El ícono de "Cerca" se veía cortado.** Eran tres arcos concéntricos
  escritos a mano en un `path`, y un arco elíptico con los flags de barrido mal
  puestos no falla: dibuja otra cosa. Cerraba por donde no correspondía y
  dejaba un mordisco. Pasó a dos `<circle>` —un aro y un punto—, que es además
  el mismo dibujo con el que el encabezado del mapa nombra el ámbito.
* **Faltaba el filete bajo el título de "Cerca".** Es el mismo que el del
  Perfil: separa el encabezado del contenido que scrollea por debajo.
* **La tuerca del Perfil se veía cortada.** Dos causas, las dos arregladas: la
  silueta de la rueda ocupa de x=1,1 a x=21,5 en una caja de 24, o sea corrida
  a la izquierda, y contra el borde del botón eso se lee como un recorte — el
  `viewBox` arranca ahora en -0,7 y la centra sin tocar el `path`. Y la fila
  quedó blindada: el aire baja de 16 a 12, los dos botones se agrupan en un
  bloque con `flexShrink: 0` —o entran los dos o no entra ninguno— y la columna
  del nombre lleva `overflow: hidden`.
* **La foto en Configuración no tenía el formato del Perfil.** Era un círculo
  con la inicial en gris; ahora es el mismo cuadrado de esquina blanda con la
  inicial en la familia informativa. Encima era la que hay que tocar para
  cambiarla, así que era justamente la que tenía que enseñar cómo va a quedar.

## 2026-09-17 (cont.) — v0.22.2: la tuerca, ahora sí

El recorte no era del layout: estaba adentro del `path`. Donde el diente de
arriba a la izquierda pedía un tramo **relativo** `l-1.9 3.2` había un
**absoluto** `L1.1 8.9`. El trazo se iba hasta x=1,1 y volvía derecho, o sea
rebanaba esa esquina de un corte recto y dejaba el contorno asimétrico: el
diente de abajo a la izquierda sí estaba, y por eso se leía como un recorte y
no como un dibujo raro.

Es el mismo error que el ícono del radar de la barra de abajo, en otra forma:
**un comando de SVG mal escrito no falla, dibuja otra cosa.** No hay error en
consola, no lo ve el compilador, y el `path` sigue siendo válido.

Con el tramo corregido el contorno cierra exacto en su punto de arranque
(19,4 / 12,9) y la caja queda en x 3,1–21,5 e y 2,7–21,3. El `viewBox` vuelve a
`0 0 24 24`: el `-0.7` del intento anterior compensaba el corrimiento que
causaba el bug, y con el bug arreglado sobra.

Lo que sí se queda de la v0.22.1 es el blindaje de la fila —menos aire, los dos
botones agrupados, `overflow: hidden` en el nombre—: no era la causa de esto,
pero es lo que evita que un nombre largo empuje los botones fuera de pantalla.

## 2026-09-18 — v0.23.0: pasada de UX sobre el mapa, la carga y la configuración

Doce correcciones pedidas mirando la PWA andando. La rama sale de `master` y no
de `dev` porque `dev` estaba 14 commits atrás y no tenía nada de esta interfaz:
nada de lo que había que corregir existía ahí.

**Mapa**
- El filtro de estilo se partió en dos píldoras, `StyleFilter` y `RatingFilter`.
  Estaban en el mismo desplegable y con el menú cerrado no había forma de ver
  —ni de sacar— un piso de estrellas puesto sin querer.
- Favoritos pasa a ser sólo el corazón, pegado al canto derecho. La palabra no
  agregaba nada y le comía el ancho a las píldoras que sí se leen por su texto.
- El "?" se fue de la esquina de abajo al principio de la franja de arriba, y
  el signo pasó a ser un `<path>`: como glifo se posicionaba por baseline y
  nunca quedaba centrado en el círculo.
- Se sacó el encabezado ("Mapa" + el resumen de lo que hay en pantalla). El
  título nombraba la pestaña donde ya estabas y le comía alto al mapa.
- **El color del pin vuelve a ser el precio**, lima → coral por puesto dentro de
  lo que hay en pantalla. Verde/ámbar/rojo es una convención demasiado fuerte
  para barato/caro: pintar frescura ahí hacía que el mapa dijera una cosa y se
  leyera otra. La antigüedad no se pierde —no se negocia— y va como punto de
  color adentro de una chapita de espresso, que es lo que la deja legible sobre
  cualquier color de cápsula (las dos escalas son los mismos tres tonos).
  `Info.tsx` se corrigió para que explique esto y no lo anterior.

**Barra de pestañas**
- El "+" se mudó al centro de la barra: círculo más grande, asomando arriba del
  filete, con aro de `--base`. Se ve en las cuatro pantallas, así que el flujo
  de carga (`ReportFlow`, `LogBeerSheet`) subió de `MapScreen` a `Shell`.

**Carga**
- "El bar no está — agregalo" ya no navega a `/agregar`: monta el alta encima
  del flujo. La flecha vuelve al paso 3 con el estilo y la marca puestos, y si
  el bar se crea queda elegido y se sigue al monto. Antes el desvío se llevaba
  puesto todo el progreso, y sin avisar.
- "Cargar el primer precio" en la vista previa de un bar sin precio hace eso:
  abre el flujo con el bar elegido. Abría la ficha del bar.
- "Otro estilo" dejó de ser una palabra más de la grilla: cápsula punteada en
  ámbar (`AgregarOtro` en `Kit.tsx`, con `--aging-soft` nuevo). La salida
  estaba escondida adentro de la lista donde alguien acaba de no encontrar lo
  suyo.
- La elección de marca usa la misma grilla de palabras que la de estilo
  (`Vocablo`, compartido). Eran dos mitades del mismo paso vestidas distinto.
  Se quedan el buscador, "Sin marca" y el corte artesanales/industriales.

**Configuración**
- El alias no guardaba "sin decir por qué": el error se dibujaba al pie de la
  pantalla, a dos scrolls del botón. Ahora va pegado al campo, y las reglas del
  servidor (3 a 20, sin emojis) se chequean antes de viajar.
- `Preferences` mandaba SIEMPRE los dos campos. Elegir estilos y nada más
  mandaba `favoriteBrands: []`, o sea "borrame las marcas": desde adentro
  parecía que obligaba a configurar las dos cosas. Ahora viaja sólo lo que
  cambió, y el error se dibuja junto al botón.

**Textos** — "pizarra" y "Benchmark zonal" salieron de la interfaz (siguen como
nombre de la dirección de diseño en los comentarios, que es otra cosa): "¿Viste
otra pizarra hoy?" → "¿Pasaste por otro bar?", "Benchmark zonal" → "Cómo viene
la zona", "RESEÑAS" → "LO QUE DICEN". El resto de la copy ya estaba en voseo.

**Consola** — `Settings` y `Preferences` llamaban a `nav()` durante el render
para mandar a Perfil sin sesión, que es el "Cannot update a component while
rendering a different component" de React. Pasaron a `<Navigate>`. Falta ver el
resto: sin navegador acá no se puede leer la consola.

## 2026-09-18 (cont.) — v0.24.0: el PATCH que CORS no dejaba pasar, y niveles en el perfil

**El bug del alias y las birras favoritas.** No era del front. Ktor trae
permitidos GET, POST y HEAD nada más; el backend había agregado `Delete` y
nunca `Patch`, y `PATCH /auth/me` es el único PATCH de toda la app — o sea
exactamente el alias y las favoritas, y nada más. El preflight se rechazaba,
así que el fetch fallaba como error de red ("Load failed" en Safari) sin que el
backend llegara a loguear nada ni el front a ver un status. Una línea:
`allowMethod(HttpMethod.Patch)`.

**El "?" vuelve abajo a la derecha**, al lugar que dejó el "+". Subirlo a la
franja de controles la apilaba en dos renglones sobre el mapa. Lo que se queda
del intento anterior es el signo dibujado como `<path>`: como glifo se
posiciona por baseline y no se centra adentro de un círculo.

**Niveles en el perfil.** Ocho por ahora, de Pichi a Super saiyajin birrero,
en `web/src/data/nivel.ts`. Se cuentan **las birras de los últimos 45 días**, no
el total histórico: es una ventana móvil, así que el nivel se mantiene tomando
y baja si dejás de anotar. Un total que sólo sube no es una noticia. 45 días es
el mismo corte que `VIEJO_DIAS`.

El número sale de `UserStats.beersRecent`, una subconsulta más en la consulta
de stats que ya existía — no un endpoint nuevo, y el índice
`(user_id, drank_at DESC)` ya cubre el filtro. `BeerLogTest` tiene el caso:
tres birras de hace 10 días, dos de hace 44 y siete de hace 46 dan 12 de total
y 5 de nivel. Existe porque el corte está escrito en SQL adentro de otras seis
subconsultas y nada impide que alguien lo copie de la de al lado.

En pantalla: el emblema arriba a la derecha (por ahora el número del nivel, en
el oro de la nota) y, debajo del nombre y a todo el ancho, el nombre del nivel,
cuánto falta para el que sigue y la barra. Al pie dice que la cuenta es de 45
días — sin eso, quien anotó cuarenta birras el año pasado ve un nivel 1 y lo
lee como un bug.

Faltan dos nombres para llegar a los diez niveles pedidos.

## 2026-09-18 (cont.) — v0.24.1: dejar de preguntar lo mismo, y el buscador arriba

**Las pantallas que arrancaban en blanco.** El patrón estaba copiado en cuatro
lugares: `useState(null)` + `useEffect` que pide, o sea vacío garantizado en
cada entrada aunque el dato no hubiera cambiado. Y como las pantallas se
desmontan al cambiar de pestaña, "cada entrada" es seguido.

Ya existía la pieza que resuelve esto —`useCached`, *stale-while-revalidate*
sobre localStorage, escrita para los contadores del perfil— y no se había usado
en ningún otro lado. Ahora la usan:

- **Cerca**, el promedio de la zona. Era el peor: además de arrancar vacío, el
  rebote de 350 ms del slider corría también en el primer render, así que abrir
  la pestaña costaba un tercio de segundo de nada antes de que la consulta
  saliera. La clave redondea la posición a dos decimales (~1 km): con
  coordenadas enteras nunca se repetiría una clave, porque la cámara cambia con
  cada paneo.
- **Perfil**, los favoritos.
- **Dashboard**, los tres pedidos. `dashboardAnalytics` es la consulta más cara
  de la app y se disparaba en blanco cada vez.
- **Colaboradores**, la tabla del mes. Se vaciaba también al cambiar de mes y
  volver, que es el gesto de comparar.

`useCached` ganó un `delayMs` opcional para el caso del slider, que es lo único
que faltaba para que Cerca pudiera usarlo.

**No se cachean** `MisAportes` ni `MisBirras`, a propósito: las dos borran cosas
y recargan, y sin una forma de invalidar la entrada mostrarían lo borrado. Y
ningún precio suelto, que es la regla de siempre. El promedio de zona sí pasa
porque dice su alcance al lado —"N precios, de menos de 45 días"— así que no se
puede leer como el precio de hoy de ningún bar.

**El buscador de la Lista, arriba de los filtros.** Estaba en el medio de la
fila, con dos píldoras a la izquierda y dos botones a la derecha. Cuando el
filtro de estilo se partió en dos —estilo y nota— la fila dejó de entrar: al
campo le quedaban unos ochenta píxeles y no entraba ni el placeholder. Arriba
tiene el ancho entero y además queda en el orden en que se usa: primero buscás
un bar concreto, y si no, filtrás lo que hay.

## 2026-09-18 (cont.) — v0.24.2: el emblema debajo de los botones, y sin el rol

El emblema del nivel estaba arriba de la tuerca y del botón de salir, y los
empujaba para abajo: dos controles que están siempre en el mismo lugar en todas
las pantallas se movían de altura sólo en el perfil, y la fila entera quedaba
desalineada con la foto. Debajo cuelga de la esquina sin mover nada.

Se fue también la píldora del rol ("Usuario" / "Moderador" / "Admin"). Para la
enorme mayoría decía "Usuario", que no es información: es la única opción que
podés ser. Para quien modera, el acceso a Moderación de más abajo ya lo dice, y
lo dice haciendo algo.

## 2026-09-18 (cont.) — v0.25.0: la ficha del bar, más apretada arriba y más ancha abajo

**Las pestañas de birra, en un renglón.** Con el padding de 16 a los costados,
tres estilos más el "⋯" más "Otra birra" no entraban en un teléfono y la fila
se partía en dos justo arriba del precio, que es lo que se vino a mirar. Se
apretó el padding a 11, el gap de `PillRow` de 8 a 6, el "⋯" de 44 a 36 de
ancho, y "Otra birra"/"Otra marca" pasaron a "Otra" — la fila ya dice de qué
está hablando. Las pastillas se quedan: con esto entran, y no hacía falta
cambiarles la forma.

**"Este precio está mal" quedó para moderación.** Estaba para cualquiera, con
el argumento de que quien ve el precio mal es el que está parado ahí. Pero para
eso ya está **Actualizar**, que arregla el número en el acto y además aporta el
dato; la denuncia no corrige nada, abre un trámite. Ofrecer el camino que no
arregla nada al lado del que sí es empujar a la opción equivocada, y llena la
cola de moderación de precios que sólo habían cambiado.

**Las fotos.** Tres cosas:

- El botón de agregar estaba **al final de la tira**, o sea después de
  arrastrar seis fotos. Ahora es un "+" chico al lado del rótulo FOTOS:
  siempre a la vista y siempre en el mismo lugar, tenga el bar una foto o
  veinte.
- Se fue el renglón debajo de cada miniatura (pulgar + autor + antigüedad).
  Eran tres datos en 150 píxeles: la tira se leía como una lista de fichas y el
  nombre se cortaba con puntos suspensivos casi siempre. Todo eso ya estaba en
  el visor, que es donde alguien de verdad mira una foto.
- El pulgar se queda, chico y sobre la esquina de arriba a la derecha, con
  velo oscuro para que se lea sobre cualquier foto. Va como **hermano** del
  botón que abre la foto, no adentro: un botón adentro de otro no es HTML
  válido y hace que la mitad de los toques caigan en el que no era, que es por
  lo que el pulgar se había sacado de la tira una vez. Hay que pisarle el
  `min-height: 44px` de `.like` a mano — esa regla es para el pulgar del visor,
  que ahí sí es el botón principal.
- Y las fotos pasan de 150×112 a 184×138.

## 2026-09-18 (cont.) — v0.26.0: pasada sobre la ficha del bar

La pantalla más importante de la app estaba cargada, y casi todo lo que sobraba
venía del mismo patrón: **una acción metida adentro del contenido que venía a
ampliar**. Cada una pagaba su precio en el mismo lugar.

**Los "+" se van al rótulo de la sección.** "Otra birra" y "Otra marca" eran
pastillas más adentro de las filas de chips: una acción de ancho fijo peleando
el renglón con N nombres de ancho variable. Bastaba un estilo de nombre largo
para que la fila se partiera en dos y el "⋯" se cayera solo al renglón de
abajo. Ahora hay un solo "+" al lado de LA PINTA ACÁ, del mismo modo que el de
FOTOS, y los dos salen de la misma pieza: `SumarEnRotulo` en `Kit.tsx`. Ámbar
punteado, que es como se dibuja "agregar algo que todavía no está" en el resto
de la app — el azul es el color de lo estructural ("esto se despliega", "esto
lleva a otra pantalla") y acá no se navega, se suma.

**`PillRow` ya no envuelve.** Con las acciones afuera, la fila es N opciones más
el "⋯" y puede ser un renglón siempre: `flexWrap: nowrap`, las pastillas ceden
con `flex: 0 1 auto` y recortan el nombre con puntos suspensivos, y el "⋯" no
cede nunca. El nombre entero se lee adentro del desplegable, que es su lugar.

**La fila de marcas aparece sólo si hay más de una.** Aparecía siempre porque
ahí vivía el "+". Sin el "+", lo que quedaba en el caso normal —un bar con una
marca por estilo— era un segundo renglón de chips, debajo de otro renglón de
chips, que no ofrece ninguna elección.

**La nota del bar sube a debajo del nombre.** Vivió en tres lugares. Pegada al
nombre competía por ancho con el nombre y con el botón de cómo llegar, y no
dejaba lugar para decir de qué es —y hay que decirlo: no es una nota al bar, es
el promedio de las notas de sus birras—. En una sección propia al fondo se
enteraba sólo quien scrolleaba hasta el final, y arriba quedaba un "★ 4,1" de
once píxeles perdido entre las canillas y el "Al día". Abajo del nombre tiene
el ancho entero: número grande, estrellas, votos y una línea que lo explica.

Con eso se fueron: una sección entera con su párrafo de dos renglones, el chip
de la nota en la fila de estado (que lo duplicaba), dos pastillas de "Otra" y,
en el caso normal, una fila de chips completa.

**Fotos:** el "+" contra el borde derecho —pegado al título se leía como parte
de la palabra FOTOS— y más aire entre el rótulo y la tira.

## 2026-09-18 (cont.) — v0.26.1: la versión, de un solo lugar

La app venía mostrando **0.22.2** en Perfil mientras corría código de la 0.26.0.
`__APP_VERSION__` sale de `const VERSION` en `web/vite.config.ts`, que estaba
escrito a mano, y en cuatro versiones seguidas subí `package.json`,
`package-lock.json` y `build.gradle.kts` y me lo salteé. AGENTS.md lo decía en
su tabla, con la advertencia exacta de lo que iba a pasar.

Era el único de los lugares del versionado que **no se nota cuando se olvida**:
nada falla, no hay test que se ponga rojo, la app simplemente miente sobre qué
está corriendo — que es justo el dato que sirve para saber si alguien tiene la
versión con el arreglo.

Ahora `vite.config.ts` lee la versión de `package.json` con `readFileSync`, así
que para la web queda un solo número. AGENTS.md pasa de tres lugares a dos, y
deja anotado que si vuelve a aparecer un número escrito a mano ahí, volvió el
problema.

## 2026-09-18 (cont.) — v0.27.0: bienvenida, encuadre de la foto y la barra que tapaba

### La foto de perfil rompía Configuración

Subir una foto vertical desbordaba el avatar: la imagen salía del botón y tapaba
el campo del nombre. Con la foto de Google no pasaba nunca, y por eso había
sobrevivido — es cuadrada y chica, así que el bug era invisible hasta que
alguien subía una propia.

La causa no era el tamaño del archivo sino la forma de pedir las medidas. El
botón del avatar es `display: grid` con `placeItems: center`, o sea que la fila
se dimensiona **por su contenido**. La `<img>` pedía `height: '100%'`, que
necesita una altura contra la cual resolver; como no la hay, cae a `auto` y la
foto se dibuja con su alto natural. El ancho sí resolvía, contra los 64px
fijos del botón: de ahí que quedara una tira angosta y larga. Y el botón lleva
`overflow: visible` a propósito —para que el lápiz de la esquina no quede
mordido—, así que no había nada que la recortara.

Ahora la foto pide `LADO` en píxeles, la misma constante que usa el botón. Sin
porcentajes no hay contra qué resolver nada.

### Encuadrar antes de subir

El avatar se muestra en un cuadrado y las fotos de teléfono son verticales, así
que `object-fit: cover` recortaba por el centro geométrico — que en una foto
vertical cae en el pecho. Subías una foto tuya y salía tu remera.

`CropSquare` es una hoja con un recuadro: se arrastra para mover y hay una barra
para acercar. La barra y no el pellizco de dos dedos porque esto también se abre
desde una computadora, donde el pellizco no existe; arrastrar funciona igual en
los dos lados y se queda como está. El zoom mínimo es el que hace que la foto
tape el cuadrado entero y el desplazamiento se recorta contra los bordes: sin
eso se puede encuadrar el vacío y el avatar sale con una franja transparente.

Lo que se sube ya es un cuadrado de 512, así que ninguna vista tiene que
defenderse de una proporción rara. Y como todo pasa por un canvas, se sigue
borrando el EXIF con las coordenadas GPS, que es la razón por la que la foto
nunca se sube tal cual.

### La bienvenida, en tres pasos (V22)

Crear la cuenta te dejaba en el mapa. Todo lo que hace que la app sea tuya
—cómo te llamás en público, qué tomás, en qué moneda cargás— vivía detrás de la
tuerca de Configuración, o sea de algo que nadie abre el primer día.

Tres pasos y no una pantalla, porque son tres decisiones con costos distintos:
quién sos se contesta en diez segundos, qué birras te gustan requiere leer una
lista larga, y el radio y la moneda no significan nada hasta que usaste la app.
Amontonadas, la larga del medio se come a las otras dos. Separadas, además, cada
una se saltea por su cuenta.

Cada paso guarda al pasar al siguiente. Guardar todo junto al final convertiría
cada abandono a mitad de camino en la pérdida de lo que ya se había contestado.

**La marca de "ya la hizo" se mudó de `localStorage` a la cuenta.** Alcanzaba
mientras la pantalla ofrecía sólo birras favoritas: volver a ofrecerlas en otra
computadora no rompe nada. Ahora también decide el nombre público y la foto, y
entrar desde otro teléfono no puede volver a pedirte lo que ya elegiste.

### El alias por defecto, y por qué es una excepción y no un cambio de criterio

V20 dejó el alias **opt-in y sin default**, con un argumento que sigue en pie:
`display_name` viene de Google y suele ser el nombre real, así que sembrarlo
solo equivale a publicar a alguien en una tabla pública sin preguntarle.

Una cuenta nueva ahora arranca con `nombre_apellido` puesto. Lo que hace que no
sea la publicación silenciosa que V20 evitó es que **hay una pantalla**: el
primer paso muestra ese alias ya escrito en el campo, dice que es el nombre con
el que se te va a ver en público, y deja cambiarlo o borrarlo antes de seguir.
El default deja de ser algo que pasa a escondidas y pasa a ser algo que se
acepta. Sin él, el campo arranca vacío y la mayoría sigue de largo sin entender
qué se perdió.

Para que la excepción no se derrame, V22 marca a **todos los que ya existen**
como que ya pasaron por la bienvenida. `onboarded_at IS NULL` es de acá en más
"cuenta creada después de este deploy", y es lo único de lo que cuelga el alias
automático. Sin ese relleno, el próximo login de cualquiera de los que ya usan
la app le habría asignado un alias derivado de su nombre de Google.

El número al final es por el índice único: los nombres se repiten y los alias no
pueden. Se prueba primero el limpio, que es el que alguien querría, y recién si
está tomado se le cuelga uno.

`OnboardingTest` cuida sobre todo **a quién no se le toca el alias**: que volver
a entrar no se lo cambie a nadie, y que quien lo borró a propósito no lo
recupere en el próximo login.

### El perfil muestra el alias

El perfil es donde te ves como te ve el resto, y afuera —en Colaboradores, al
pie de una foto— el único nombre que circula es el alias. Mostrar ahí el de
Google era enseñarte una identidad que nadie más ve, y de paso dejaba sin
contestar la única pregunta que importa del alias: cómo quedó.

### La barra de abajo tapaba el botón de Cerca

En "Cerca", el botón de cargar un precio quedaba detrás de la barra. No era que
la lista no scrolleara hasta abajo: era que abajo no había lugar reservado.

El `padding-bottom` de cada pantalla estaba escrito a ojo y ninguno coincidía
—había un `60px`, un `40px + gap` y un `24px + gap`— contra una barra que mide
49px más el `--nav-gap`. El de Cerca era menos de la mitad. Ahora hay un token,
`--nav-h`, y quien scrollea por debajo de la barra usa `calc(var(--nav-h) + aire)`
en vez de un número estimado.

### Adelantar el promedio de la zona

Los bares ya eran compartidos: el mapa, la lista y "Cerca" leen el mismo `bars`,
así que cambiar de pestaña no los vuelve a pedir. El que faltaba era el promedio
de la zona, que sólo se pedía al abrir "Cerca" — y como su clave depende de
dónde está la cámara, moverse por el mapa y después entrar daba siempre pantalla
vacía y un viaje de espera.

`prefetchCached` calienta esa clave 700 ms después de que el mapa se queda
quieto. **Sólo pide si la clave está fría**: si ya hay algo guardado, `useCached`
lo pinta al instante y revalida por su cuenta, y volver a pedirlo sería una
consulta de más por cada paneo. Lo que se compra es que no haya pantalla en
blanco, no que el número sea de hace un segundo en vez de hace un minuto.

### Más feedback, y el háptico de los sliders

Faltaban los dos aportes más grandes: cargar un precio desde el "+" y dar de
alta un bar no devolvían nada.

Los sliders llevan `paso()`, que **sólo vibra y nunca suena**: el radio tiene 148
pasos y un tono por paso es insoportable a los tres segundos. Va limitado en el
tiempo, porque ciento cuarenta vibraciones seguidas se sienten como un zumbido
continuo — lo contrario de marcar una muesca.

## 2026-09-18 (cont.) — v0.28.0: el radio del mapa mentía, y una pasada de ajustes

### El tope de filas, no el radio

Reporte: con el radio en 7,2 km, dos bares a 5 km no aparecían en el mapa.

El radio funcionaba. Lo que fallaba era el techo de filas. Los pines vuelven
**ordenados por distancia**, así que un tope recorta por afuera, y estaba en
200. Medido contra la base real (995 bares aprobados):

- dentro de 7,2 km desde Palermo: **526 bares**
- Quaystone, el que faltaba: a **4.765 m**, con **377 bares más cerca que él**

O sea puesto 378 de una lista que se cortaba en 200. Desde afuera eso no se lee
como un tope: se lee como que el bar no está cargado, o como que el control del
radio no hace nada.

**Había un segundo tope tapado por el primero.** `project()` en `useBars` hacía
`slice(0, 400)` sobre lo ya traído. Con 526 bares en rango, subir sólo el del
servidor no habría alcanzado — dos topes distintos para lo mismo garantizan que
arreglar uno no arregle nada.

Los dos pasan a `MAX_BARES_POR_PEDIDO` (1000), en `core/Limits.kt` y espejado en
`useBars`. Es del tamaño de la base a propósito: el slider llega a 15 km, que
desde cualquier punto de la ciudad abarca casi todo lo cargado, así que el único
número que no miente es uno así.

BIR-13 había bajado el tope a 200 para que un pedido no se llevara media base.
Esa parte del mecanismo no defendía nada: `CoverageBudget` cuenta bares
**distintos** por día justamente porque un tope de filas no separa al usuario
del scraper — el scraper pide menos filas que alguien paseando el mapa. Lo que
sí se mantiene es la relación `MAX_BARES_POR_PEDIDO < DEFAULT_PER_DAY`, que subió
a 3000 con él; `CoverageBudgetTest` ahora lee las dos constantes en vez de una
copia escrita a mano, que era lo que dejaba el test diciendo 200 para siempre.

`RadiusCapTest` fija la propiedad: **un bar dentro del radio no puede
desaparecer por tener muchos más cerca.** Verificado por las dos puntas —
falla con el techo en 200 y pasa en 1000.

### Cuántos bares traigo y cuántos marcadores dibujo eran la misma pregunta

Subir el techo a 1000 abre la otra mitad del problema. El payload no es nada:
los 995 bares son **108 kB** de JSON crudo, unos 30 comprimidos, contra un
bundle de 512 kB. Pero cada pin es un `google.maps.Marker`, un objeto del SDK
con su overlay, y mil de esos en un teléfono se sienten al panear. Antes el
`slice(0, 400)` los limitaba de rebote; sacarlo los dejaba sueltos.

`Pins` ahora dibuja sólo los que caen en el recuadro visible, con un margen del
35% para que panear no los haga aparecer contra el borde. Los datos quedan
completos —la lista, el promedio de la zona y "más barata cerca" siguen viendo
todo— y el mapa dibuja las decenas que se están mirando. El recuadro se relee en
`idle` y no en `bounds_changed`, que dispara decenas de veces por gesto.

De paso, el puesto de precio y el descarte de etiquetas ahora se calculan sobre
lo visible, que es lo que su propio comentario ya decía que hacían.

Queda [BIR-49] para cuando la base pase los mil: al truncar, preferir los bares
con precio. Tiene una trampa —`useBars` deduce la cobertura del último elemento
de la lista, y eso deja de valer si el orden de supervivencia no es la
distancia— así que va con la mitad del servidor que devuelve el radio cubierto,
o cambia un bug visible por uno silencioso.

### La bienvenida no vuelve más

Se cerraba en el último paso, así que quien no llegaba hasta ahí —se fue al
mapa, cerró la app— quedaba con la cuenta sin marcar y el siguiente login se la
ponía de nuevo adelante, ya con el alias y las birras elegidas. Una pantalla que
reaparece después de haberla contestado se lee como que no se guardó nada.

Ahora se marca al abrirla. Lo de adentro se sigue guardando paso a paso, así que
irse a la mitad conserva lo contestado; lo único que no vuelve es la pantalla.

### Un cuarto paso, y dos pantallas que quedaron limpias

La bienvenida explica ahora las dos cosas de la app que no se adivinan
mirándola: que **el nivel puede bajar** —sale de los últimos 45 días— y que **la
nota es de las birras y no del bar**.

Las dos vivían como letra chica permanente en la pantalla donde aparecen, que es
el peor lugar posible: se entienden una vez y después son ruido para siempre, en
la pantalla que más se mira. Dicho una vez en la bienvenida, se fueron de la
ficha del bar y del perfil.

En el perfil se fue también el "te faltan 3 para el 4". Convertía el nivel en
una tarea pendiente: cada visita al perfil te recordaba lo que no hiciste. Queda
el nombre y la barra, que dicen que hay recorrido sin poner deberes.

### Lo demás de la pasada

**Ficha del bar:** fuera la fila de "Al día · N canillas · Verificado" — tres
rótulos en mayúscula chica compitiendo entre ellos justo arriba de los precios,
que es lo único que se vino a mirar. Las canillas se cuentan mirando la lista y
la frescura la dice cada fila con su "hace N d". Queda el filete, que sí separaba
algo. Y la nota de la birra dejó de estar dos veces en la misma tarjeta: queda la
de abajo del nombre, y sólo sobrevive el aviso de "sin votos nuevos", que no está
en ningún otro lado.

**Cerca:** el pie de la tarjeta dice sólo de cuántos precios y bares sale. La
unidad no se pierde, el titular ya dice "la pinta, típico".

**Lista:** el contador de bares volvió a la fila de los filtros, contra el borde
derecho. Pegado a ellos se lee como lo que dejaron pasar; en su propio renglón
era un título suelto que comía alto.

### Lo que no pude reproducir

El reporte de que la lista filtra por favoritos con el corazón apagado y el
vacío diciendo "ninguno de tus favoritos". Desde master no es alcanzable: el
texto del resumen y el del vacío salen los dos de `favOnly`, y `traidos` vuelve
a `p.bars` en el mismo render en que `favOnly` se apaga. Los dos textos del
screenshot no pueden convivir. Lo más probable es el service worker sirviendo el
bundle anterior —`registerType: 'autoUpdate'` cambia el SW pero la pestaña
abierta sigue con el JS viejo hasta recargar—, así que hay que volver a mirarlo
después de cerrar y abrir la app.

## 2026-09-18 (cont.) — v0.29.0: nombrar admins desde la app, y la cabecera del perfil

### El endpoint de roles existía y no lo llamaba nadie

Pedido: hacer admin a Pitu. Resultó que no había forma desde la app.

`POST /moderation/users/{id}/role` está desde siempre y no tenía ni cliente ni
UI: el Dashboard **mostraba** el rol y no lo dejaba cambiar. Y
`BOOTSTRAP_ADMIN_EMAILS` no sirve para esto, porque se lee en el INSERT y el
upsert no toca el rol nunca —a propósito, para que un re-login no degrade a
nadie—. O sea que para nombrar a un moderador había que entrar a la base a mano,
que es la forma más rápida de que no se nombre a nadie.

Ahora la etiqueta del rol, siendo admin, es el `<select>` que lo cambia. Un
selector y no un botón que rota: son tres roles y uno es admin, así que hay que
poder elegir a cuál se va y no descubrirlo tocando.

**Antes de exponerlo hubo que ponerle el candado que no tenía.** `setRole` no
impedía que un admin se bajara a sí mismo, y como el rol sólo se siembra al
crear la cuenta, al último admin no lo puede volver a subir nadie: un toque de
más en una lista de usuarios y la única salida es un UPDATE a mano en
producción.

La regla quedó en el repo y no en el handler, y eso fue deliberado: el proyecto
no tiene pruebas de ruta, así que una guardia en la ruta habría sido una guardia
sin cubrir. En `UserRepo.setRole(actorId, targetId, role)` la alcanza
`RoleTest`, que verifica las dos mitades — que rebotar no lo deje a medio camino
y que a otro sí lo pueda cambiar, que es para lo que existe.

### La cabecera del perfil

La tuerca y el botón de salir subieron al renglón del título. Son controles de
la **pantalla** —configurarla, salir de ella—, no datos de la persona, y en la
fila del nombre eran 88px peleando ancho con un mail de veinte caracteres: esa
fila tenía 56 de foto + 44 + 44 antes de que el nombre tuviera a dónde ir.
Arriba ocupan un renglón que estaba vacío.

Con ese rincón libre, el emblema del nivel pudo dejar de colgar debajo de los
botones y pasar al renglón del nombre, contra el borde derecho. Compartiendo
columna con dos controles, el nivel se leía como un tercer botón; al lado del
nombre se lee como lo que es.
