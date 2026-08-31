# AGENTS.md — birrapp

Actualizado: 2026-08-31. Historia: WORKLOG.md (append-only). Decisiones: docs/DECISIONS.md.

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

## Estado
Fase A completa: backend andando, APK compilando, 592 bares cargados, 18 tests verdes.
Fase B pendiente (necesita al usuario): credenciales de Google Cloud → docs/SETUP.md.
