# Deploy: frontend en Vercel, backend afuera

## Lo primero: Vercel no puede correr el backend

Vercel corre funciones serverless en Node, Python, Go y Ruby. **No hay runtime
de JVM**, y aunque lo hubiera, el backend mantiene un pool de conexiones a
Postgres y un caché en memoria de los flujos OAuth en curso — cosas que
necesitan un proceso vivo, no una función que arranca y muere en cada request.

Así que el reparto es:

| Pieza | Dónde | Costo |
|---|---|---|
| Frontend (PWA) | **Vercel** | Gratis |
| Backend (Ktor) | **Render** o Railway | Gratis con sueño / US$5-7 al mes |
| Base (PostGIS) | **Neon** o Supabase | Gratis |
| APK | Sigue en el backend, en `/descargar` | — |

## Elegir dónde va el backend

[Fly.io ya no tiene capa gratis](https://expresstech.io/7-fly-io-alternatives-in-2026-real-pricing-after-the-free-tier-died/)
para cuentas nuevas: arranca en ~US$2/mes.

- **Render** tiene capa gratis real, sin tarjeta. **Pero el servicio se
  duerme** tras un rato sin tráfico y el primer pedido tarda ~50 segundos en
  despertarlo. Para una app que se abre para ver un precio en dos segundos,
  eso es inaceptable en producción — sirve para probar. El plan pago arranca
  en US$7/mes.
- **Railway** son US$5/mes con US$5 de crédito incluido, y es el más simple:
  conectás GitHub y sale andando.

Recomendación: **Railway** si vas a repartirlo, **Render gratis** si sólo
querés verlo funcionando fuera de tu máquina.

## Base de datos

PostGIS es requisito, y no todos los Postgres administrados lo traen.
[Neon](https://neon.com/docs/extensions/postgis) y Supabase sí, los dos con
`CREATE EXTENSION postgis`.

Neon tiene 0,5 GB gratis. Supabase da 500 MB pero **pausa el proyecto tras 7
días sin uso**, lo que sumado al sueño de Render da dos cosas dormidas a la
vez. Con Neon eso no pasa.

---

# Paso a paso

## 1. Base de datos en Neon

1. Crear cuenta en [neon.com](https://neon.com) y un proyecto, región **AWS
   São Paulo** — es la más cercana a Buenos Aires y son ~100 ms contra ~200 de
   Virginia. Esta es la decisión de latencia que más se nota.
2. En el SQL Editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
3. Copiar la cadena de conexión. Viene en formato `postgresql://…`, y hace
   falta convertirla a JDBC:
   ```
   jdbc:postgresql://HOST/DBNAME?sslmode=require
   ```
   El usuario y la contraseña van aparte, en `DATABASE_USER` y
   `DATABASE_PASSWORD`.

   Dos cosas al convertirla:

   - **Sacarle el `-pooler` al host.** Neon ofrece por defecto el host del
     pooler, que es PgBouncer en modo transacción. Flyway toma un lock de
     sesión para migrar y eso no sobrevive al pooler. El backend abre 10
     conexiones (`maximumPoolSize` en `core/Db.kt`), muy lejos del límite
     del host directo, así que el pooler no aporta nada acá.
   - **Sacarle `channel_binding=require`.** Es un parámetro de libpq; el
     driver JDBC no lo conoce y lo ignora. `sslmode=require` ya cifra.

Flyway crea todo el esquema solo al arrancar el backend. **No hay que correr
las migraciones a mano** — de hecho hacerlo rompe Flyway, ya pasó dos veces.

## 2. Migrar los datos que ya hay

**Este paso va después del 3.** El import necesita que las tablas existan, y
las crea Flyway cuando el backend arranca por primera vez contra Neon.

```bash
# Exportar desde la base local. Va por docker exec y no por el pg_dump del
# sistema: el de Debian es 15 y el contenedor corre 16, y pg_dump se niega a
# volcar un servidor más nuevo que él.
docker exec -e PGPASSWORD=birrapp_dev birrapp-db pg_dump -U birrapp -d birrapp \
  --data-only --no-owner \
  -t users -t bars -t price_reports -t reviews -t flags \
  > birrapp-data.sql

# Importar
psql "postgresql://USER:PASS@HOST/DB?sslmode=require" -f birrapp-data.sql
```

`beer_styles` queda afuera a propósito: los 14 estilos los siembra Flyway en
`V2__views_and_seed.sql`, con los mismos ids que tiene la base local. Si la
exportás, el import falla por clave duplicada.

El orden de las tablas importa y `pg_dump` ya lo resuelve: `users` antes que
`bars`, y `price_reports` después de las dos, por las claves foráneas.

Alternativa si preferís empezar limpio: no migres nada y corré
`node scripts/seed_osm.mjs` apuntando a la base nueva. Los 739 bares se
vuelven a traer de OSM; los 11 precios se pierden.

## 3. Backend en Railway (o Render)

Hay un `Dockerfile` en `backend/`, así que cualquiera de los dos lo toma.

1. Conectar el repo. **Root directory: `backend`**. Si se deja en la raíz,
   Railpack no encuentra nada que reconocer y el build ni arranca.
2. **Builder: `Dockerfile`.** Aunque el root directory esté bien, Railway
   puede elegir Railpack igual: ve un proyecto Gradle y lo construye a su
   manera, con `gradle build` en vez de `buildFatJar`, y arranca con
   `java -jar $(ls */build/libs/*jar)`. Ese glob no matchea nada —el jar
   queda en `build/libs/`, no un nivel abajo— y el deploy muere con
   `Error: -jar requires jar file specification`. El `backend/railway.json`
   ya lo fija, pero el archivo sólo cuenta si está pusheado; en la UI es
   *Settings → Build → Builder*.
3. Cargar las variables de entorno:

   ```
   DATABASE_URL=jdbc:postgresql://HOST/DB?sslmode=require
   DATABASE_USER=...
   DATABASE_PASSWORD=...

   GOOGLE_WEB_CLIENT_ID=...            (el mismo de siempre)
   GOOGLE_CLIENT_SECRET=...
   JWT_SECRET=...                      (openssl rand -base64 48)

   PUBLIC_BASE_URL=https://tu-backend.up.railway.app
   WEB_APP_URL=https://tu-app.vercel.app
   ALLOWED_ORIGINS=https://tu-app.vercel.app

   BOOTSTRAP_ADMIN_EMAILS=tu@email.com
   BIND_HOST=0.0.0.0
   ```

   `WEB_APP_URL` y `ALLOWED_ORIGINS` son los que hacen que el login vuelva a
   Vercel en vez de a este backend, y que el navegador acepte las llamadas
   entre dominios distintos.

4. Desplegar y verificar: `https://tu-backend/health` tiene que devolver
   `{"ok":true}`. Un 404 con `{"status":"error",...,"request_id":...}` es del
   proxy de Railway, no del backend: quiere decir que no hay ningún deploy
   activo detrás del dominio.

No cargar `PORT`: Railway lo inyecta y el backend lo lee. Y `BIND_HOST` va en
`0.0.0.0` —el `.env` local lo tiene en `127.0.0.1` porque ahí entra por el
proxy— o el contenedor no acepta nada de afuera.

## 4. Frontend en Vercel

1. Importar el repo. **Root directory: `web`**. El `vercel.json` ya está.
2. Variables de entorno:
   ```
   VITE_MAPS_API_KEY=...      (ver punto 5)
   VITE_API_BASE=https://tu-backend.up.railway.app
   VITE_BASE_PATH=/
   ```
   `VITE_BASE_PATH=/` es importante: en Vercel la app va en la raíz, no bajo
   `/app` como cuando la sirve el backend.
3. Desplegar.

## 5. Actualizar Google Cloud

Tres cosas, y si falta una no anda:

1. **Key de Maps para web** → *Application restrictions → Websites* → agregar
   `tu-app.vercel.app/*`. Si dejás sólo el dominio viejo, el mapa no carga.
2. **Cliente OAuth Web** → *Authorized redirect URIs* → agregar
   `https://tu-backend.up.railway.app/auth/callback`. El redirect apunta al
   **backend**, no a Vercel: el canje del código lo hace el servidor.
3. La key de Android no se toca.

## 6. Actualizar la app Android

En `app/local.properties`:
```
API_BASE_URL=https://tu-backend.up.railway.app
```
Recompilar y subir el APK nuevo. La app vieja va a seguir apuntando al Funnel
hasta que se actualice.

---

## Después de migrar

- **Dominio propio**: Vercel lo configura en dos clics. Acordate de agregarlo
  también a los referrers de la key de Maps.
- **El Funnel puede quedar**: sirve de respaldo mientras probás.
- **`/descargar` y el APK** siguen en el backend. Si querés que estén en el
  dominio lindo, hay que moverlos o poner un redirect desde Vercel.

## Lo que hay que cerrar antes de que esto sea público

Ya anotado en `BACKLOG.md`, pero pesa más una vez que la API es pública de
verdad:

- `/bars` no tiene límite de tasa: cualquiera puede bajarse la base entera.
  Si el plan incluye vender datos agregados, esto va primero.
- Falta política de privacidad y declaración de datos.
