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
- Textos en castellano rioplatense. Android: en `strings.xml`. Web: en
  `web/src/i18n/es/<Pantalla>.json`, usados con `t('Pantalla.clave')`; nunca un
  literal en el código. Por ahora no hay otro idioma.
- Secretos en `.env` / `local.properties`, ambos gitignoreados. Nunca en el repo.
- Tests contra PostGIS real, nunca H2: no tiene PostGIS, ni `DISTINCT ON`, ni
  ENUM, ni `percentile_cont` — o sea, justo todo lo que hay que testear.
- Cada sesión de trabajo → entrada nueva en WORKLOG.md. Decisiones con el "por qué".

## Ramas — una por feature
`feature branch` → `dev` → `master`. **Todas las ramas salen de `dev`**, nunca de
`master`, y nunca se trabaja directo sobre `dev` ni sobre `master`.

Existe porque Felipe corre varios agentes en paralelo sobre este mismo repo: sin
una rama por feature se pisan entre ellos, y ya pasó. `dev` es la cola de
integración; a `master` se mergea cada tanto, cuando lo probado anda.

**Lo probado se prueba en esta máquina, no en un despliegue** (desde
2026-09-12). Antes `dev` tenía su propio deploy y era ahí donde Felipe miraba
si algo andaba: el ciclo era de minutos y los errores quedaban expuestos a
quien estuviera usando la app — así se descubrió que la 0.6.9 estaba rota.
Ahora la rama se levanta entera acá:

```
scripts/dev.sh          # backend en 8091 + PWA en 5173, Ctrl-C baja todo
```

La PWA se abre en **`http://127.0.0.1:5173/app`**, con la IP y no con
`localhost`: vite escucha por su cuenta sólo en `::1` y Ktor sólo en
`127.0.0.1`, así que con el nombre el navegador entra a la página por IPv6 y
después no encuentra la API. El script ya fuerza IPv4 en las dos puntas.

Corre contra `birrapp_dev`, una copia de los bares y precios reales **sin
usuarios** (`scripts/dev_seed.sh` la rearma). El jar de producción en 8090 no
se toca. Para que el login de Google funcione, el script da vuelta el Funnel a
8091 mientras corre y lo devuelve al salir: durante ese rato **los teléfonos
con el APK pegan contra la rama**, así que no es para dejarlo prendido y irse.
Con `DEV_FUNNEL=0` no se toca el Funnel y no hay login.

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

Se suben los **dos** lugares en el mismo commit, o quedan desincronizados:

| Archivo | Qué |
|---|---|
| `app/build.gradle.kts` | `versionName` y `versionCode` (este último sólo crece: Android rechaza instalar un código menor o igual al instalado) |
| `web/package.json` | `version` — de acá sale todo lo de la web |

`web/package-lock.json` lo repite en dos lugares y lo sincroniza `npm`, pero si
se edita `package.json` a mano hay que tocarlo a mano también, o `npm ci` se
queja.

`web/vite.config.ts` **ya no lleva la versión escrita**: la lee de
`package.json` y se la pasa a `__APP_VERSION__`, que es lo que se ve en Perfil
y en Info. Era un tercer lugar, y era el único que no se nota cuando se olvida
— la app siguió mostrando 0.22.2 durante cuatro versiones sin que nada fallara.
Si algún día vuelve a haber un número escrito a mano ahí, volvió el problema.

Única excepción: un commit que **sólo** toca documentación no sube versión,
porque no se publica nada. Si toca una línea de código, sube.

## Estado
Fase A completa: backend andando, APK compilando, 592 bares cargados, 18 tests verdes.
Fase B pendiente (necesita al usuario): credenciales de Google Cloud → docs/SETUP.md.

<!-- caveman-begin -->
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
<!-- caveman-end -->
