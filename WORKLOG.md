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
