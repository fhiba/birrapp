# AGENTS.md — birrapp

Actualizado: 2026-09-03. Historia: WORKLOG.md (append-only). Decisiones: docs/DECISIONS.md.

## Proyecto
Mapa comunitario de precios de la pinta en Buenos Aires. App Android + API.

## La regla que no se negocia
**Ningún precio se muestra sin su antigüedad al lado.** En pesos, un precio sin
edad es información falsa. Consecuencias en el código, todas testeadas:
- `price_reports` es APPEND ONLY. Nunca un UPDATE sobre `price`.
- `fresh` <14d · `aging` 14-45d · `stale` >45d.
- El orden "más barata" ignora los `stale` (`from_price` es NULL si sólo hay stale).
- "Sigue igual" tiene que costar un tap. Si confirmar cuesta lo mismo que
  reportar, nadie confirma y el mapa entero envejece.

Antes de tocar `v_current_prices`, `v_bar_headline` o `PriceRepo`: correr
`FreshnessTest` y `PriceReportTest`. Si se rompen, la app está mintiendo.

## Stack
| Área | Decisión |
|---|---|
| App | Kotlin · Compose · Material 3 · maps-compose 8.4 · compileSdk 37 · minSdk 26 |
| Auth | Credential Manager (el `GoogleSignIn` viejo está deprecado — no usarlo) |
| Backend | Kotlin · Ktor 3 · JDBC + SQL crudo (sin ORM) · Flyway |
| DB | PostgreSQL 16 + PostGIS, puerto 5433 |
| API | puerto 8090 |
| Datos de bares | OpenStreetMap / Overpass (ODbL) |

## Reglas
- Los chequeos de rol van en el servidor. Esconder UI no es control de acceso.
- Nunca guardar datos de Google Places en la base: sus términos lo prohíben más
  allá de 30 días. Los bares salen de OSM.
- Textos en castellano rioplatense, en `strings.xml`. No hay versión en inglés.
- Secretos en `.env` / `local.properties`, ambos gitignoreados. Nunca en el repo.
- Tests contra PostGIS real, nunca H2: no tiene PostGIS, ni `DISTINCT ON`, ni
  ENUM, ni `percentile_cont` — o sea, justo todo lo que hay que testear.
- Cada sesión de trabajo → entrada nueva en WORKLOG.md. Decisiones con el "por qué".

## Ramas — una por feature
`feature branch` → `dev` → `master`. **Todas las ramas salen de `dev`**, nunca de
`master`, y nunca se trabaja directo sobre `dev` ni sobre `master`.

Existe porque Felipe corre varios agentes en paralelo sobre este mismo repo: sin
una rama por feature se pisan entre ellos, y ya pasó. `dev` es donde él prueba;
a `master` se mergea cada tanto, cuando lo probado anda.

Ciclo de vida de cada rama, sin saltarse pasos:
1. Sale de `dev` y se pushea a `origin` **apenas se crea**. Una rama que vive
   sólo en local nadie más la ve: los otros agentes no saben que existe y se
   acumulan ramas sin que se sepa si están terminadas. Eso es lo que esto evita.
2. Se integra a `dev` por PR, no por merge local a ciegas.
3. Apenas está en `dev` y la feature está terminada, se borra en los dos lados:
   `git branch -d <rama>` y `git push origin --delete <rama>`. Así `git branch -a`
   siempre refleja el estado real.

Cada tanto, cuando lo que está en `dev` anda probado, se hace el merge grande
`dev` → `master` con merge commit, se taggea la versión (`git tag vX.Y.Z`) y se
pushean `master` y los tags.

Al commitear, agregar **sólo los archivos propios por path**. Nada de `git add
-A`: si aparecen cambios ajenos en el árbol son de otro agente, se dejan afuera
y se avisa.

## Versionado — sin excepciones
Todo cambio que se publica lleva versión nueva, y el commit se titula
`vX.Y.Z: qué cambió` en minúscula y en castellano. Nunca un commit de cambios
sin subir la versión.

Se suben los **tres** lugares en el mismo commit, o quedan desincronizados:

| Archivo | Qué |
|---|---|
| `app/build.gradle.kts` | `versionName` y `versionCode` (este último sólo crece: Android rechaza instalar un código menor o igual al instalado) |
| `web/package.json` | `version` |
| `web/vite.config.ts` | `const VERSION` — alimenta `__APP_VERSION__`, que es lo que se ve en Perfil |

Si se olvida `vite.config.ts`, la app sigue reportando la versión vieja en
pantalla aunque el código sea nuevo, y deja de haber forma de saber qué está
corriendo cada quien.

Única excepción: un commit que **sólo** toca documentación no sube versión,
porque no se publica nada. Si toca una línea de código, sube.

## Estado
Fase A completa: backend andando, APK compilando, 592 bares cargados, 18 tests verdes.
Fase B pendiente (necesita al usuario): credenciales de Google Cloud → docs/SETUP.md.
