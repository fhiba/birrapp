# Dashboard con analíticas — diseño

**Issue:** [BIR-20 — Improved dashboard](https://linear.app/birrapp/issue/BIR-20/improved-dashboard)
**Fecha:** 2026-09-03

## El problema

El dashboard de admin contesta hoy con seis números sueltos y una lista de
personas. Los números no tienen tendencia: `pricesWeek` dice 12 y no hay con
qué compararlo, así que no se sabe si eso es bueno, malo o igual que siempre.

La pregunta que el dashboard ya declara como su razón de ser —*de los que se
anotan, cuántos aportan*— es la que decide si el mapa se mantiene solo o hay
que empujarlo a mano. Contestarla necesita series en el tiempo, no contadores.

## Decisiones tomadas

### Los gráficos se dibujan en el navegador, en SVG a mano

Se evaluó generar PNGs con un script de Python + matplotlib contra la base.
Se descartó:

- **Quedan congelados.** Haría falta un cron que los regenere; el dashboard
  mostraría la última corrida, no el estado actual.
- **Son una imagen.** Sin hover, sin cambiar el rango, y no se adaptan ni al
  tema oscuro ni al ancho del teléfono.
- **Sumaría un tercer lenguaje y un tercer camino de deploy** a un proyecto
  cuyo item más urgente de backlog (BIR-12) es que desplegar el backend ya es
  a mano.

Tampoco se suma una librería de gráficos. El repo no tiene ninguna dependencia
de UI —todo es inline styles y SVG propio, las estrellas de `Stars.tsx` son
exactamente eso— y Recharts casi duplicaría el bundle (120kb gzip hoy) para
dibujar líneas y barras. Un gráfico de líneas es un `<polyline>` con los
valores escalados a la caja; no hay nada que importar.

Lo que sí va del lado de la base es **la agregación**, que es lo correcto de
la intuición del script de Python: SQL agrupa, el backend devuelve JSON, el
front dibuja.

> Si en algún momento hace falta *explorar* datos ad-hoc en vez de mirar un
> dashboard fijo, eso es Metabase o Grafana apuntando al Postgres. Cero
> código. Es otro servicio con otro login, y por eso queda afuera de esto.

### En desktop el dashboard rompe el ancho de 560px

El resto de la app se acota a 560px por una razón escrita en `theme.css`: se
usa parado en un bar y en escritorio alcanza con que se vea bien. El dashboard
es la única pantalla que se usa sentado y con datos que piden espacio, así que
es la excepción justificada. En mobile queda breve, como pide el issue.

## Backbone: la vista `v_contributions`

Cuatro de las cinco métricas necesitan "todos los aportes, de quién y cuándo".
Hoy esa unión está escrita a mano y repetida en `recentUsers()` y en
`dashboardSummary()`, con criterios que hay que mantener sincronizados (qué
cuenta como activo, si el rating va por `updated_at`). Se extrae a una vista,
en una migración nueva (`V11__contributions_view.sql`):

```sql
CREATE VIEW v_contributions AS
SELECT reported_by AS user_id,
       CASE WHEN is_confirmation THEN 'confirmation' ELSE 'price' END AS kind,
       created_at AS at
  FROM price_reports WHERE status = 'active' AND reported_by IS NOT NULL
UNION ALL
SELECT created_by, 'bar',    created_at FROM bars       WHERE created_by IS NOT NULL
UNION ALL
-- `bar_photos.user_id` es nullable con ON DELETE SET NULL: sin este guard, al
-- borrarse un usuario sus fotos entran como (NULL, 'photo', at) y la
-- concentración y el embudo, que agrupan por user_id, cuentan ese NULL como
-- si fuera una persona.
SELECT user_id,    'photo',  created_at FROM bar_photos
 WHERE status = 'active' AND user_id IS NOT NULL
UNION ALL
SELECT user_id,    'rating', updated_at FROM beer_ratings WHERE status = 'active';
```

`beer_ratings` va por `updated_at` y no por `created_at` a propósito: la nota
se pisa al corregirla, así que la fecha que dice cuándo la persona hizo algo
es la de la última edición. Es el mismo criterio que ya usa `recentUsers()`.

Con eso cada métrica queda en pocas líneas y con una sola definición de qué es
un aporte.

## El peso de un aporte pasa al backend

`Dashboard.tsx` tiene hoy su propia función `weight()` para ordenar la lista
por aportes:

```ts
u.prices * 3 + u.bars * 3 + u.photos * 2 + u.ratings * 2 + u.confirmations
```

La concentración (métrica 4) necesita el mismo peso. Duplicarlo en SQL deja
dos definiciones que se van a desincronizar, así que el backend pasa a ser el
único dueño: `DashboardUserDto` suma un campo `score`, `Dashboard.tsx` borra
su `weight()` local y ordena por el del servidor.

```sql
CASE kind WHEN 'price'  THEN 3
          WHEN 'bar'    THEN 3
          WHEN 'photo'  THEN 2
          WHEN 'rating' THEN 2
          ELSE 1 END          -- confirmation
```

Las confirmaciones pesan menos porque mantener fresco lo que ya está es un
aporte real pero más barato que relevar un precio nuevo. Sin ese peso, el
ranking lo gana quien aprieta "Sigue igual" en serie.

## Las cinco métricas

### 1. Pulso diario — aportes por día, 30 días, apilado por tipo

Contesta *¿pasa algo?* y *¿la última feature movió la aguja?*. Es el gráfico
que también se muestra en mobile.

```sql
WITH d AS (
    SELECT generate_series(
        date_trunc('day', now()) - interval '29 days',
        date_trunc('day', now()), interval '1 day')::date AS day
)
SELECT d.day,
       count(*) FILTER (WHERE c.kind = 'price')        AS prices,
       count(*) FILTER (WHERE c.kind = 'confirmation') AS confirmations,
       count(*) FILTER (WHERE c.kind = 'bar')          AS bars,
       count(*) FILTER (WHERE c.kind = 'photo')        AS photos,
       count(*) FILTER (WHERE c.kind = 'rating')       AS ratings
FROM d LEFT JOIN v_contributions c ON c.at::date = d.day
GROUP BY d.day ORDER BY d.day;
```

`generate_series` rellena los días sin actividad con ceros en SQL. El front no
interpola nada: un hueco en el medio de una serie es una mentira gráfica.

### 2. Altas vs. aportantes — dos líneas, por semana, 12 semanas

La brecha entre las dos líneas es el problema de activación. Es la métrica
declarada del dashboard, hoy sin tendencia.

`contributors` cuenta **personas distintas**, no aportes: una sola persona muy
activa inflaría el número y contestaría mal la pregunta.

### 3. Cobertura en el tiempo — % de bares con precio no vencido, 90 días

Lo único que importa a largo plazo: si el mapa se mantiene o se está apagando.
`price_reports` es append-only, así que la historia está intacta y la cobertura
pasada es reconstruible.

```sql
WITH d AS (
    SELECT generate_series(
        date_trunc('day', now()) - interval '89 days',
        date_trunc('day', now()), interval '1 day')::date AS day
)
SELECT d.day,
       (SELECT count(*) FROM bars b
         WHERE b.status = 'approved' AND b.created_at::date <= d.day) AS bars,
       (SELECT count(DISTINCT pr.bar_id) FROM price_reports pr
         WHERE pr.status = 'active'
           AND pr.created_at::date <= d.day
           AND pr.created_at > d.day - interval '45 days')            AS covered
FROM d ORDER BY d.day;
```

Los 45 días son el corte de `stale` que ya define `v_current_prices` en `V2`;
el numerador queda consistente con el `barsWithFreshPrice` que el dashboard ya
muestra. El denominador son los bares aprobados **a esa fecha**, no los de hoy:
con el total actual, la cobertura de hace tres meses se vería falsamente baja.

Son 180 subconsultas correlacionadas sobre ~740 bares. Con esta base es
instantáneo; si algún día molesta, se materializa.

### 4. Concentración — top 10 aportantes y qué porción hace el top 5

En una app que depende de aportes gratis, si el 80% lo hacen tres personas el
mapa tiene un punto único de falla. Hoy eso es invisible: la lista está
ordenada por aportes pero no dice cuánto pesa la cabeza contra el total.

Devuelve el top 10 con nombre, `score` y desglose, más `top5Share` (fracción
del score total que concentran los cinco primeros).

### 5. Embudo de activación

`cuentas → aportó alguna vez → aportó ≥5 veces → aportó en 30 días`

Convierte `contributorsMonth` en algo accionable: dice en qué escalón se cae la
gente. Cuatro barras horizontales.

## Contrato del endpoint

`GET /moderation/dashboard/analytics`, detrás de `requireRole(Role.moderator)`
como los otros dos. Una sola llamada — el dashboard ya hace `Promise.all` y
pasa a ser de tres.

```jsonc
{
  "pulse": [
    { "day": "2026-08-05", "prices": 3, "confirmations": 1,
      "bars": 0, "photos": 2, "ratings": 4 }
  ],
  "weekly": [
    { "week": "2026-06-15", "signups": 7, "contributors": 3 }
  ],
  "coverage": [
    { "day": "2026-06-05", "bars": 730, "covered": 210 }
  ],
  "topContributors": [
    { "userId": 1, "displayName": "Felipe", "score": 42,
      "prices": 8, "confirmations": 6, "bars": 2, "photos": 3, "ratings": 5 }
  ],
  "top5Share": 0.68,
  "funnel": { "accounts": 120, "everContributed": 31,
              "fiveOrMore": 12, "activeMonth": 9 }
}
```

Las fechas van como `YYYY-MM-DD` y no como timestamp: son días, y un timestamp
invita a problemas de zona horaria que acá no existen.

## Frontend

### Primitivas de gráfico

`web/src/ui/charts/`, SVG puro, ~200 líneas en total:

| Componente | Forma | La usan |
|---|---|---|
| `LineChart` | Una o más series sobre eje x compartido, y autoescalado, relleno opcional | 2, 3 |
| `StackedBars` | Una barra por día, segmentos por tipo | 1 |
| `HBars` | Barras horizontales con etiqueta y valor | 4, 5 |

Cada una recibe datos planos y devuelve un `<svg viewBox>` con `width: 100%`,
así escala sola sin medir el contenedor. El tooltip es un `<title>` dentro de
cada figura: es nativo del navegador, accesible y no necesita una línea de JS.
Es la versión correcta de la primera iteración; si después hace falta un
tooltip que siga el mouse, se agrega.

Los colores salen de los tokens del tema. Hace falta una paleta categórica de
cinco para los tipos de aporte — **cargar la skill `dataviz` antes de elegirla**
y verificar contraste en claro y oscuro.

### Layout

```css
@media (min-width: 820px) {
  .desk-wide { max-width: 1100px; margin-inline: auto; }
}
```

La grilla de gráficos va en `repeat(auto-fit, minmax(320px, 1fr))`. Debajo de
820px se ocultan los gráficos 2 a 5 y queda lo breve que pide el issue: los
seis `Stat` de hoy, el pulso como sparkline, y la lista de usuarios.

## Tests

En `DashboardTest`, que ya existe y ya tiene la infraestructura
(`TestDb.insertPrice` acepta `daysAgo`, que es justo lo que hace falta para la
cobertura histórica):

- El pulso rellena con cero los días sin actividad y separa precio de
  confirmación.
- `weekly.contributors` cuenta personas distintas: dos aportes de la misma
  persona en la semana suman uno.
- La cobertura reconstruye la historia — un precio de hace 60 días cuenta para
  el día 50 pero no para hoy.
- El denominador de cobertura usa los bares de esa fecha: un bar creado ayer no
  baja la cobertura de hace un mes.
- `top5Share` y el orden por `score` respetan el peso (una confirmación no vale
  lo mismo que un precio).
- El escalón `fiveOrMore` no cuenta a quien hizo cuatro aportes.

## Fuera de alcance

- Reescribir `recentUsers()` contra `v_contributions`. Se puede y quedaría más
  corto, pero es refactor de código que anda y no lo pide el issue. Queda
  anotado por si se toca esa función por otro motivo.
- Filtros de rango de fecha en la UI. Los rangos van fijos en esta iteración
  (30 / 12 semanas / 90 días); si se piden, se agregan como query params.
- Android. El dashboard es sólo web.

---

# Ampliación (2026-09-03): visitantes que no inician sesión

Pedido después de aprobado el diseño original. **Nada de esto era computable
con los datos que había:** no existe tabla de visitas y `CallLogging`
(`Application.kt:108`) sólo escribe a stdout, que se pierde. La PWA ya manda
pageviews a Vercel Analytics (`App.tsx:42`), pero eso vive en el panel de
Vercel y no en el Postgres, así que no puede aparecer al lado de las métricas
de aportes — que es justamente lo que se pidió.

## Qué contesta

**De los que miran, cuántos se anotan.** El embudo del diseño original arranca
en "cuentas" y por eso esconde la caída más grande de todas. Este es el
escalón cero.

## Qué NO se guarda

Ni IP, ni user agent, ni una fila por request. Sólo un identificador aleatorio
que genera el cliente y **una fila por (día, cliente)**.

El identificador lo genera el front con `crypto.randomUUID()` la primera vez y
lo guarda en `localStorage`. No identifica a nadie, el usuario lo borra
limpiando los datos del sitio, y evita el hash de IP — que en criterio europeo
sigue siendo dato personal.

> **Deuda que esto crea:** hay que declarar esta recolección en
> [BIR-15](https://linear.app/birrapp/issue/BIR-15) (política de privacidad) y
> [BIR-16](https://linear.app/birrapp/issue/BIR-16) (Data Safety / nutrition
> labels) antes de publicar en las tiendas. Queda anotado acá porque es
> consecuencia directa de esta ampliación.

## La tabla

```sql
CREATE TABLE traffic_sessions (
    day       date    NOT NULL,
    client_id uuid    NOT NULL,
    authed    boolean NOT NULL DEFAULT false,
    PRIMARY KEY (day, client_id)
);
```

Una fila por cliente por día: repetir el beacon el mismo día no agrega filas.
El `ON CONFLICT` sólo sube `authed` hacia `true` y nunca lo baja, para que
alguien que entra anónimo y después inicia sesión cuente como convertido y no
como dos personas distintas.

`client_id` es `uuid` y no `text` a propósito: el tipo rechaza basura sin que
haga falta validarla a mano.

## El beacon

`POST /traffic` con `{ "clientId": "<uuid>" }`, **público** — es el único
endpoint de escritura sin sesión obligatoria, porque medir a los anónimos
exige justamente eso. Si viene un JWT válido, `authed = true`; para eso la
ruta va con `authenticate("jwt", optional = true)`.

El front lo llama una vez por carga de la app, no por navegación. Con la clave
`(day, client_id)` la escritura es idempotente, así que no hace falta
throttling del lado del cliente.

**Riesgo aceptado:** es un endpoint de escritura sin autenticar, así que
alguien puede inflar la tabla con UUIDs random. Lo acota el `RateLimit` global
de 120 req/min por IP que ya está instalado (`Application.kt:117`), y las
filas son dos columnas chicas. Si algún día molesta, se le pone un límite
propio más bajo.

## Las métricas nuevas

1. **Visitantes por día, 30 días, anónimos contra con sesión.** Dos líneas;
   reusa el `LineChart` que ya define el diseño original.
2. **El embudo gana el escalón cero:** `visitantes → cuentas → aportó alguna
   vez → aportó ≥5 → activo en 30 días`. `visitors30` son los clientes
   distintos de los últimos 30 días.

## Fuera de alcance de esta ampliación

- **Android no manda el beacon.** Coherente con el resto del plan: el
  dashboard es sólo web. Los números van a medir la PWA, y eso hay que
  recordarlo al leerlos.
- **Purga de filas viejas.** No hace falta por privacidad (es un ID aleatorio
  y una fecha), pero conviene por volumen. Cuando moleste.
