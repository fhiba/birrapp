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
