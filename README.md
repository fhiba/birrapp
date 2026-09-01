# birrapp

Mapa comunitario de precios de la pinta en Buenos Aires.

En vez de entrar a Yelp y filtrar a ciegas, abrís un mapa y cada bar muestra
cuánto sale la pinta. Los precios los carga y los mantiene al día la comunidad.

## Por qué

Los clones de afuera ([Beer Me](https://beerme.au/) AU, [Pint Prices](https://www.pint-prices.com/) UK)
funcionan en monedas donde un precio de hace seis meses sigue siendo más o menos cierto.
En pesos no. **La frescura del precio es el producto**, no el mapa.

De ahí las reglas duras del modelo de datos:

- Los precios son *append-only*. Nunca se hace UPDATE — cada reporte es una fila nueva.
  Eso deja un histórico real por bar y por estilo, gratis.
- La antigüedad se muestra **siempre**, al lado del precio. Nunca un precio pelado.
- Frescura: `fresh` <14d · `aging` 14-45d · `stale` >45d (gris + advertencia).
- Confirmar tiene que salir más barato que reportar: "Sigue igual" es un solo tap.
- El ranking "más barata" ignora los precios `stale`. Un precio viejo y barato
  nunca puede ganarle a uno fresco y honesto.

## Stack

| | |
|---|---|
| App | Kotlin · Jetpack Compose · Material 3 · maps-compose |
| Auth | Credential Manager + Sign in with Google (el `GoogleSignIn` viejo está deprecado) |
| Backend | Kotlin · Ktor 3 · Exposed |
| DB | PostgreSQL 16 + PostGIS |
| Datos de bares | OpenStreetMap vía Overpass (ODbL) |

**Por qué OSM y no Google Places:** los términos de Places prohíben guardar
datos de lugares más de 30 días (solo `place_id` está exento). No se puede
armar una base propia de bares con Places. El mapa sí es de Google — el
Maps SDK for Android es gratis e ilimitado.

## Arranque

```bash
docker compose up -d          # PostGIS
cd backend && ./gradlew run   # API en :8090
cd app && ./gradlew installDebug
```

Ver `docs/SETUP.md` para las credenciales que faltan.

## Cómo se cargan los datos

Los 592 bares de CABA ya están cargados desde OpenStreetMap. **Los precios los
carga la comunidad desde la app** — no hay carga masiva, y es a propósito: un
precio que nadie vio es un precio inventado.

Herramientas de carga dentro de la app:

| Acción | Dónde | Quién |
|---|---|---|
| Cargar precio de un estilo | Detalle del bar → `+ Cargar precio` | Cualquiera logueado |
| Confirmar que un precio sigue igual | Detalle del bar → `Sigue igual` | Cualquiera logueado |
| Actualizar un precio que cambió | Detalle del bar → `Actualizar` | Cualquiera logueado |
| Agregar un bar que falta | Mapa → `Agregar un bar` | Cualquiera logueado (queda pendiente) |
| Aprobar/rechazar bares nuevos | Perfil → Moderación | Moderador |
| Publicar o descartar precios retenidos | Perfil → Moderación | Moderador |
| Nombrar moderadores | API `POST /moderation/users/{id}/role` | Admin |

Tu cuenta (`BOOTSTRAP_ADMIN_EMAILS` en `.env`) queda **admin automáticamente**
en el primer login, así que tenés acceso a moderación sin tocar la base a mano.

Para volver a traer bares de OSM (idempotente, no pisa lo cargado por la
comunidad ni resucita lo rechazado):

```bash
node scripts/seed_osm.mjs
```

El vocabulario de estilos (14 cargados) se edita en
`backend/src/main/resources/db/migration/` o vía API como admin.

## PWA

El mismo frontend, en web. Se sirve en `/app` desde el propio backend, así que
comparte origen con la API: sin CORS, sin cookies cross-site, y el redirect del
login vuelve al mismo dominio.

```bash
cd web && npm run build
rm -rf "$WEB_DIR"/* && cp -r dist/* "$WEB_DIR"/
```

En iOS se instala desde Safari con *Compartir → Agregar a pantalla de inicio*.
El service worker cachea el shell pero **nunca los datos**: servir precios
viejos desde el caché sería exactamente lo que la app existe para evitar.

## Distribuir el APK

El backend sirve el APK más reciente de `APK_DIR` en `/descargar`, con una
página de instalación. Para publicar una versión nueva alcanza con dejar el
archivo ahí:

```bash
cd app && ./gradlew assembleDebug
cp build/outputs/apk/debug/birrapp-debug.apk \
   "$APK_DIR/birrapp-0.1.0-$(date +%Y%m%d).apk"
```

El link es siempre el mismo, así que se comparte una vez. No reemplaza a
Play —no hay actualizaciones automáticas— pero para un grupo de prueba
alcanza.

## Estructura

```
backend/   API Ktor. Un paquete por dominio; todos pueden importar core/, nunca entre sí.
app/       App Android. Build de Gradle independiente del backend.
scripts/   seed_osm.sh — pobla bares desde Overpass.
docs/      SETUP.md (credenciales), DECISIONS.md
```

Felipe Hiba
