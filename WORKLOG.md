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
