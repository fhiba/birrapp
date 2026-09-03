# Dashboard con analíticas — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar cinco analíticas con series en el tiempo al dashboard de admin, dibujadas en SVG a mano, a ancho completo en desktop y reducidas en mobile.

**Architecture:** Una vista `v_contributions` unifica los cuatro tipos de aporte y es la base de casi todas las métricas. Un `AnalyticsRepo` nuevo agrega en SQL y expone un único endpoint `GET /moderation/dashboard/analytics`. El front dibuja con tres primitivas SVG propias, sin librería de gráficos.

**Tech Stack:** Kotlin · Ktor 3 · JDBC crudo · Flyway · PostGIS 16 · React 19 · TypeScript · Vite

**Spec:** `docs/superpowers/specs/2026-09-03-dashboard-analytics-design.md`

## Global Constraints

- **Sin dependencias nuevas.** Ni en `web/package.json` ni en `backend/build.gradle.kts`. Los gráficos son SVG escrito a mano.
- **Los tests corren contra PostGIS real**, nunca H2. El contenedor `birrapp-db-test` escucha en `localhost:5434`. Backend: `cd backend && ./gradlew test`.
- **Todo el SQL va crudo con los helpers de `core/Db.kt`:** `Connection.query(sql, vararg args) { rs -> ... }`, `Connection.queryOne(...)`, `db.conn { c -> ... }`. No hay ORM.
- **Los comentarios del código van en castellano** y explican *por qué*, no *qué*. Es la convención del repo; mirá cualquier archivo existente.
- **Las fechas viajan como `YYYY-MM-DD`**, nunca como timestamp.
- **Los huecos de las series se rellenan en SQL** con `generate_series`. El front no interpola: un hueco dibujado como línea recta es una mentira gráfica.
- **Endpoints de dashboard van detrás de `call.requireRole(Role.moderator)`**, no de admin.
- **Ventana de frescura de precio: 45 días** (es el corte `stale` que define `v_current_prices` en `V2__views_and_seed.sql`).
- **Peso de los aportes:** precio 3, bar 3, foto 2, nota 2, confirmación 1.
- **El tema es oscuro y único** (no hay modo claro). Fondo `--base: #1A1410`, acento `--amber: #FFB627`.

---

### Task 1: La vista `v_contributions`

Unifica los cuatro tipos de aporte en una sola definición. Hoy esa unión está escrita a mano y repetida en `recentUsers()` y en `dashboardSummary()`.

**Files:**
- Create: `backend/src/main/resources/db/migration/V11__contributions_view.sql`
- Test: `backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt`

**Interfaces:**
- Consumes: nada.
- Produces: vista `v_contributions (user_id bigint, kind text, at timestamptz)`. `kind` ∈ `'price' | 'confirmation' | 'bar' | 'photo' | 'rating'`. La usan las tasks 2 a 6.

- [ ] **Step 1: Write the failing test**

Creá `backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt`:

```kotlin
package com.birrapp

import com.birrapp.prices.NewPriceRequest
import com.birrapp.prices.PriceRepo
import com.birrapp.ratings.NewRatingRequest
import com.birrapp.ratings.RatingRepo
import com.birrapp.core.query
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Las analíticas del dashboard.
 *
 * Lo que se testea es el SQL, que es donde vive todo. Un error acá no rompe
 * nada: muestra números equivocados, que es peor, porque se le cree.
 */
class AnalyticsTest {
    private val lat = -34.6037
    private val lng = -58.3816
    private val prices by lazy { PriceRepo(TestDb.db) }
    private val ratings by lazy { RatingRepo(TestDb.db) }

    @BeforeTest fun setup() = TestDb.reset()

    @Test
    fun `la vista separa precio de confirmacion y junta los cuatro tipos`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), u)
        ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 4.0), u)

        val kinds = TestDb.db.conn { c ->
            c.query("SELECT kind FROM v_contributions WHERE user_id = ?", u) {
                it.getString("kind")
            }
        }.sorted()

        // `TestDb.insertBar` inserta con created_by NULL (TestDb.kt:74), así que
        // el bar no se le atribuye a nadie y no aparece acá. Van el precio y la
        // nota, cada uno con su kind.
        assertEquals(listOf("price", "rating"), kinds)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: FALLA con `PSQLException: ERROR: relation "v_contributions" does not exist`.

- [ ] **Step 3: Write the migration**

Creá `backend/src/main/resources/db/migration/V11__contributions_view.sql`:

```sql
-- Todos los aportes en una sola definición.
--
-- Hasta acá la unión de los cuatro tipos estaba escrita a mano y repetida en
-- recentUsers() y en dashboardSummary(), con criterios que había que mantener
-- sincronizados: qué cuenta como activo, si la nota va por created_at o por
-- updated_at. Cada métrica nueva multiplicaba el problema.
--
-- La nota va por updated_at y no por created_at a propósito: se pisa al
-- corregirla, así que la fecha que dice cuándo la persona hizo algo es la de
-- la última edición. Es el criterio que ya usaba recentUsers().

CREATE VIEW v_contributions AS
SELECT reported_by AS user_id,
       CASE WHEN is_confirmation THEN 'confirmation' ELSE 'price' END AS kind,
       created_at AS at
  FROM price_reports
 WHERE status = 'active' AND reported_by IS NOT NULL
UNION ALL
SELECT created_by, 'bar', created_at
  FROM bars
 WHERE created_by IS NOT NULL
UNION ALL
SELECT user_id, 'photo', created_at
  FROM bar_photos
 WHERE status = 'active'
UNION ALL
SELECT user_id, 'rating', updated_at
  FROM beer_ratings
 WHERE status = 'active';
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: PASA.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V11__contributions_view.sql backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt
git commit -m "Vista v_contributions: una sola definición de qué es un aporte"
```

---

### Task 2: El peso de un aporte pasa al backend

`Dashboard.tsx` calcula hoy su propio `weight()` para ordenar. La métrica de concentración (Task 6) necesita el mismo peso, y duplicarlo en SQL deja dos definiciones que se desincronizan. El backend pasa a ser el único dueño.

**Files:**
- Modify: `backend/src/test/kotlin/com/birrapp/TestDb.kt` (`insertPrice`, línea ~87)
- Modify: `backend/src/main/kotlin/com/birrapp/moderation/ModerationRepo.kt` (`DashboardUserDto` en la línea ~40, `recentUsers()` en la ~142)
- Modify: `web/src/data/types.ts` (`DashboardUser`, línea ~149)
- Modify: `web/src/screens/Dashboard.tsx` (borrar `weight()`, líneas 37-38; ordenar por `score`, línea 42)
- Test: `backend/src/test/kotlin/com/birrapp/DashboardTest.kt`

**Interfaces:**
- Consumes: `v_contributions` de la Task 1.
- Produces:
  - `DashboardUserDto.score: Int`, y en TS `DashboardUser.score: number`. Lo usa la Task 6 (misma fórmula) y la Task 9 (ordena por él).
  - `TestDb.insertPrice(barId, styleSlug, price, daysAgo, userId, sizeMl = 473, isConfirmation = false): Long`. La usan las tasks 5 y 6.

- [ ] **Step 1: Let the test helper insert confirmations**

`PriceRepo.confirm` tiene cooldown por (usuario, bar, estilo, marca) — mirá `PriceRepo.kt:163-173` — así que no se puede confirmar dos veces lo mismo desde un test. `TestDb.insertPrice` escribe SQL directo y esquiva el cooldown, pero hoy no puede marcar una fila como confirmación.

En `backend/src/test/kotlin/com/birrapp/TestDb.kt`, agregá el parámetro y la columna:

```kotlin
    /**
     * Inserta un precio con fecha retroactiva, para poder probar la frescura.
     *
     * Va por SQL directo y no por `PriceRepo.report`, así que esquiva el
     * cooldown de 6 horas: es lo que permite armar una serie de varios aportes
     * de la misma persona sobre la misma birra.
     */
    fun insertPrice(
        barId: Long, styleSlug: String, price: Double, daysAgo: Int,
        userId: Long, sizeMl: Int = 473, isConfirmation: Boolean = false,
    ): Long = db.conn { c ->
        val sid = styleId(c, styleSlug)
        c.prepareStatement(
            "INSERT INTO price_reports " +
                "(bar_id, style_id, price, size_ml, reported_by, created_at, is_confirmation) " +
                "VALUES (?, ?, ?, ?, ?, now() - make_interval(days => ?), ?) RETURNING id"
        ).use { st ->
            st.setLong(1, barId); st.setLong(2, sid); st.setDouble(3, price)
            st.setInt(4, sizeMl); st.setLong(5, userId); st.setInt(6, daysAgo)
            st.setBoolean(7, isConfirmation)
            st.executeQuery().use { rs -> rs.next(); rs.getLong(1) }
        }
    }
```

- [ ] **Step 2: Write the failing test**

Agregá a `backend/src/test/kotlin/com/birrapp/DashboardTest.kt`:

```kotlin
    @Test
    fun `el score pesa menos las confirmaciones que los precios`() {
        val cargador = TestDb.insertUser("cargador")
        val confirmador = TestDb.insertUser("confirmador")
        val bar = TestDb.insertBar("Prueba", lat, lng)

        TestDb.insertPrice(bar, "ipa", 8000.0, daysAgo = 0, userId = cargador)
        TestDb.insertPrice(
            bar, "ipa", 8000.0, daysAgo = 0, userId = confirmador, isConfirmation = true,
        )

        val byName = repo.recentUsers().associateBy { it.displayName }
        assertEquals(3, byName["cargador"]!!.score, "relevar un precio nuevo pesa 3")
        assertEquals(1, byName["confirmador"]!!.score,
            "mantener fresco lo que ya está vale, pero menos que relevar")
    }
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend && ./gradlew test --tests "com.birrapp.DashboardTest" 2>&1 | tail -20
```

Esperado: no compila — `DashboardUserDto` no tiene `score`.

- [ ] **Step 4: Add `score` to the DTO and the query**

En `ModerationRepo.kt`, agregá el campo al final de `DashboardUserDto`:

```kotlin
    /** Días desde su último aporte. Null = nunca aportó nada. */
    val lastActiveDays: Int?,
    /**
     * Los aportes pesados: precio 3, bar 3, foto 2, nota 2, confirmación 1.
     *
     * Las confirmaciones pesan menos porque mantener fresco lo que ya está es
     * un aporte real pero más barato que relevar un precio nuevo. Sin ese
     * peso, el ranking lo gana quien aprieta "Sigue igual" en serie.
     *
     * Vive acá y no en el front porque la concentración del dashboard usa la
     * misma fórmula, y dos copias se desincronizan.
     */
    val score: Int,
)
```

En la query de `recentUsers()`, agregá un CTE y la columna. Sumá esto a la lista de CTEs (después de `r AS (...)`, con su coma):

```sql
            ), sc AS (
                SELECT user_id AS uid,
                       sum(CASE kind WHEN 'price'  THEN 3
                                     WHEN 'bar'    THEN 3
                                     WHEN 'photo'  THEN 2
                                     WHEN 'rating' THEN 2
                                     ELSE 1 END)::int AS score
                FROM v_contributions GROUP BY user_id
            )
```

En el `SELECT`, después de `coalesce(r.ratings, 0) AS ratings,`:

```sql
                   coalesce(sc.score, 0)        AS score,
```

Y el join, después de `LEFT JOIN r ON r.uid = u.id`:

```sql
            LEFT JOIN sc ON sc.uid = u.id
```

En el mapeo del `ResultSet`, después de `lastActiveDays = ...`:

```kotlin
                score = rs.getInt("score"),
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && ./gradlew test 2>&1 | tail -10
```

Esperado: toda la suite pasa.

- [ ] **Step 6: Use the score on the front and delete the duplicate**

En `web/src/data/types.ts`, dentro de `interface DashboardUser`, después de `lastActiveDays`:

```ts
  /** Aportes pesados. La fórmula vive en el backend; ver DashboardUserDto. */
  score: number
```

En `web/src/screens/Dashboard.tsx`, borrá el comentario y la función de las líneas 34-38:

```ts
  // Las confirmaciones cuentan, pero menos: ...
  const weight = (u: DashboardUser) =>
    u.prices * 3 + u.bars * 3 + u.photos * 2 + u.ratings * 2 + u.confirmations
```

y cambiá el `useMemo` para ordenar por el score del servidor:

```ts
  const shown = useMemo(() => {
    if (!users) return null
    return sort === 'nuevos' ? users : [...users].sort((a, b) => b.score - a.score)
  }, [users, sort])
```

- [ ] **Step 7: Verify the front builds**

```bash
cd web && npm run build 2>&1 | tail -8 && git checkout -- tsconfig.tsbuildinfo
```

Esperado: `built in ...` sin errores de TypeScript.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/kotlin/com/birrapp/moderation/ModerationRepo.kt backend/src/test/kotlin/com/birrapp/DashboardTest.kt web/src/data/types.ts web/src/screens/Dashboard.tsx
git commit -m "El peso de un aporte pasa al backend, con una sola definición"
```

---

### Task 3: Pulso diario — aportes por día, 30 días

**Files:**
- Create: `backend/src/main/kotlin/com/birrapp/moderation/AnalyticsRepo.kt`
- Test: `backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt`

**Interfaces:**
- Consumes: `v_contributions` (Task 1).
- Produces:
  - `class AnalyticsRepo(private val db: Db)` — la usan las tasks 4, 5, 6, 7.
  - `data class PulseDay(val day: String, val prices: Int, val confirmations: Int, val bars: Int, val photos: Int, val ratings: Int)`
  - `fun AnalyticsRepo.pulse(days: Int = 30): List<PulseDay>`

- [ ] **Step 1: Write the failing test**

Agregá a `AnalyticsTest.kt` (y sumá `import com.birrapp.moderation.AnalyticsRepo` y `private val analytics by lazy { AnalyticsRepo(TestDb.db) }` a la clase):

```kotlin
    @Test
    fun `el pulso trae una fila por dia aunque no haya pasado nada`() {
        assertEquals(30, analytics.pulse(30).size,
            "un hueco sin fila obligaría al front a interpolar, que es mentir")
    }

    @Test
    fun `el pulso de hoy separa precio de confirmacion`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)
        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), u)

        val hoy = analytics.pulse(30).last()
        assertEquals(1, hoy.prices)
        assertEquals(0, hoy.confirmations)
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: no compila — no existe `AnalyticsRepo`.

- [ ] **Step 3: Write the repo**

Creá `backend/src/main/kotlin/com/birrapp/moderation/AnalyticsRepo.kt`:

```kotlin
package com.birrapp.moderation

import com.birrapp.core.Db
import com.birrapp.core.query
import kotlinx.serialization.Serializable

/**
 * Las analíticas del dashboard: lo mismo que ya muestra, pero en el tiempo.
 *
 * Va aparte de ModerationRepo porque son preguntas distintas. Ese repo
 * contesta "qué hay que revisar ahora"; este contesta "cómo viene la cosa", y
 * mezclarlos deja un archivo que hace dos cosas y no se termina de leer.
 *
 * Todas las series rellenan los días vacíos con generate_series. Un hueco que
 * el front dibuje como línea recta entre dos puntos lejanos es una mentira
 * gráfica, y el lugar barato de evitarla es el SQL.
 */
@Serializable
data class PulseDay(
    val day: String,
    val prices: Int,
    val confirmations: Int,
    val bars: Int,
    val photos: Int,
    val ratings: Int,
)

class AnalyticsRepo(private val db: Db) {

    /** Aportes por día, desglosados por tipo. El pulso de la app. */
    fun pulse(days: Int = 30): List<PulseDay> = db.conn { c ->
        c.query(
            """
            WITH d AS (
                SELECT generate_series(
                    date_trunc('day', now()) - make_interval(days => ? - 1),
                    date_trunc('day', now()),
                    interval '1 day')::date AS day
            )
            SELECT d.day,
                   count(*) FILTER (WHERE c.kind = 'price')        AS prices,
                   count(*) FILTER (WHERE c.kind = 'confirmation') AS confirmations,
                   count(*) FILTER (WHERE c.kind = 'bar')          AS bars,
                   count(*) FILTER (WHERE c.kind = 'photo')        AS photos,
                   count(*) FILTER (WHERE c.kind = 'rating')       AS ratings
            FROM d LEFT JOIN v_contributions c ON c.at::date = d.day
            GROUP BY d.day
            ORDER BY d.day
            """.trimIndent(),
            days,
        ) { rs ->
            PulseDay(
                day = rs.getDate("day").toString(),
                prices = rs.getInt("prices"),
                confirmations = rs.getInt("confirmations"),
                bars = rs.getInt("bars"),
                photos = rs.getInt("photos"),
                ratings = rs.getInt("ratings"),
            )
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: PASA. Si `make_interval(days => ?)` se queja del tipo del parámetro, cambiá el bind a `days` explícito con cast: `make_interval(days => ?::int)`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/birrapp/moderation/AnalyticsRepo.kt backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt
git commit -m "Pulso diario: aportes por día, desglosados por tipo"
```

---

### Task 4: Altas vs. aportantes, por semana

La brecha entre las dos líneas es el problema de activación.

**Files:**
- Modify: `backend/src/main/kotlin/com/birrapp/moderation/AnalyticsRepo.kt`
- Test: `backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt`

**Interfaces:**
- Consumes: `AnalyticsRepo` y `v_contributions`.
- Produces:
  - `data class WeeklyPoint(val week: String, val signups: Int, val contributors: Int)`
  - `fun AnalyticsRepo.weekly(weeks: Int = 12): List<WeeklyPoint>`

- [ ] **Step 1: Write the failing test**

```kotlin
    @Test
    fun `los aportantes de la semana son personas distintas y no aportes`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)

        // Tres aportes de la misma persona en la misma semana.
        prices.report(NewPriceRequest(bar, "ipa", 8000.0, brandSlug = "antares"), u)
        ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 4.0), u)
        ratings.upsert(NewRatingRequest(bar, "ipa", "berlina", 3.0), u)

        val semana = analytics.weekly(12).last()
        assertEquals(1, semana.contributors,
            "una persona muy activa no puede parecer tres personas")
        assertEquals(1, semana.signups)
    }

    @Test
    fun `la serie semanal trae una fila por semana aunque esten vacias`() {
        assertEquals(12, analytics.weekly(12).size)
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: no compila — no existe `weekly`.

- [ ] **Step 3: Implement**

Agregá a `AnalyticsRepo.kt`, arriba de la clase:

```kotlin
@Serializable
data class WeeklyPoint(val week: String, val signups: Int, val contributors: Int)
```

y dentro de la clase:

```kotlin
    /**
     * Altas de cuenta contra personas que aportaron, por semana.
     *
     * `contributors` cuenta personas distintas, no aportes: la pregunta es
     * cuántos de los que se anotan hacen algo, y sumar aportes la contestaría
     * mal porque una sola persona muy activa la infla sola.
     */
    fun weekly(weeks: Int = 12): List<WeeklyPoint> = db.conn { c ->
        c.query(
            """
            WITH w AS (
                SELECT generate_series(
                    date_trunc('week', now()) - make_interval(weeks => ? - 1),
                    date_trunc('week', now()),
                    interval '1 week')::date AS week
            ), s AS (
                SELECT date_trunc('week', created_at)::date AS week, count(*)::int AS n
                FROM users GROUP BY 1
            ), k AS (
                SELECT date_trunc('week', at)::date AS week,
                       count(DISTINCT user_id)::int AS n
                FROM v_contributions GROUP BY 1
            )
            SELECT w.week,
                   coalesce(s.n, 0) AS signups,
                   coalesce(k.n, 0) AS contributors
            FROM w
            LEFT JOIN s ON s.week = w.week
            LEFT JOIN k ON k.week = w.week
            ORDER BY w.week
            """.trimIndent(),
            weeks,
        ) { rs ->
            WeeklyPoint(
                week = rs.getDate("week").toString(),
                signups = rs.getInt("signups"),
                contributors = rs.getInt("contributors"),
            )
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: PASA.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/birrapp/moderation/AnalyticsRepo.kt backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt
git commit -m "Serie semanal: altas contra aportantes, que es la brecha que importa"
```

---

### Task 5: Cobertura del mapa en el tiempo

Lo único que importa a largo plazo: si el mapa se mantiene o se está apagando.

**Files:**
- Modify: `backend/src/main/kotlin/com/birrapp/moderation/AnalyticsRepo.kt`
- Test: `backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt`

**Interfaces:**
- Consumes: `AnalyticsRepo`. Lee `price_reports` y `bars` directo (no `v_contributions`: acá importa el bar, no quién lo cargó).
- Produces:
  - `data class CoverageDay(val day: String, val bars: Int, val covered: Int)`
  - `fun AnalyticsRepo.coverage(days: Int = 90): List<CoverageDay>`

- [ ] **Step 1: Write the failing test**

`TestDb.insertPrice` acepta `daysAgo`, que es justo lo que hace falta para reconstruir historia:

```kotlin
    @Test
    fun `un precio viejo cuenta para su epoca pero no para hoy`() {
        val u = TestDb.insertUser()
        val bar = TestDb.insertBar("Prueba", lat, lng)
        TestDb.insertPrice(bar, "ipa", 8000.0, daysAgo = 60, userId = u)

        val serie = analytics.coverage(90).associateBy { it.day }
        val hoy = serie.keys.max()
        val haceCincuenta = serie.keys.sorted()[89 - 50]

        assertEquals(1, serie[haceCincuenta]!!.covered,
            "hace 50 días ese precio tenía 10 días: estaba vigente")
        assertEquals(0, serie[hoy]!!.covered,
            "hoy tiene 60 días: venció a los 45")
    }

    @Test
    fun `el denominador son los bares que existian a esa fecha`() {
        TestDb.insertBar("Nuevo", lat, lng)

        val serie = analytics.coverage(90)
        assertEquals(0, serie.first().bars,
            "un bar creado hoy no puede bajar la cobertura de hace tres meses")
        assertEquals(1, serie.last().bars)
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: no compila — no existe `coverage`.

- [ ] **Step 3: Implement**

Agregá el DTO arriba de la clase:

```kotlin
@Serializable
data class CoverageDay(val day: String, val bars: Int, val covered: Int)
```

y el método:

```kotlin
    /**
     * Bares con al menos un precio no vencido, día por día.
     *
     * `price_reports` es append-only, así que la historia está intacta y la
     * cobertura pasada se reconstruye. Los 45 días son el corte de `stale`
     * que ya define `v_current_prices` en V2: así el último punto de esta
     * serie coincide con el `barsWithFreshPrice` que el dashboard ya muestra.
     *
     * El denominador son los bares aprobados A ESA FECHA y no los de hoy: con
     * el total actual, la cobertura de hace tres meses se vería falsamente
     * baja sólo porque después se cargaron más bares.
     *
     * Son dos subconsultas correlacionadas por día. Con ~740 bares es
     * instantáneo; si algún día molesta, se materializa.
     */
    fun coverage(days: Int = 90): List<CoverageDay> = db.conn { c ->
        c.query(
            """
            WITH d AS (
                SELECT generate_series(
                    date_trunc('day', now()) - make_interval(days => ? - 1),
                    date_trunc('day', now()),
                    interval '1 day')::date AS day
            )
            SELECT d.day,
                   (SELECT count(*)::int FROM bars b
                     WHERE b.status = 'approved'
                       AND b.created_at::date <= d.day)              AS bars,
                   (SELECT count(DISTINCT pr.bar_id)::int FROM price_reports pr
                     WHERE pr.status = 'active'
                       AND pr.created_at::date <= d.day
                       AND pr.created_at > d.day - interval '45 days') AS covered
            FROM d ORDER BY d.day
            """.trimIndent(),
            days,
        ) { rs ->
            CoverageDay(
                day = rs.getDate("day").toString(),
                bars = rs.getInt("bars"),
                covered = rs.getInt("covered"),
            )
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: PASA.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/birrapp/moderation/AnalyticsRepo.kt backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt
git commit -m "Cobertura en el tiempo: si el mapa se mantiene o se apaga"
```

---

### Task 6: Concentración y embudo de activación

Dos agregados sobre personas. Van juntos porque comparten la misma unión y se testean con el mismo escenario.

**Files:**
- Modify: `backend/src/main/kotlin/com/birrapp/moderation/AnalyticsRepo.kt`
- Test: `backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt`

**Interfaces:**
- Consumes: `v_contributions`, y el mismo peso de la Task 2.
- Produces:
  - `data class TopContributor(val userId: Long, val displayName: String, val score: Int, val prices: Int, val confirmations: Int, val bars: Int, val photos: Int, val ratings: Int)`
  - `data class Funnel(val accounts: Int, val everContributed: Int, val fiveOrMore: Int, val activeMonth: Int)`
  - `fun AnalyticsRepo.topContributors(limit: Int = 10): List<TopContributor>`
  - `fun AnalyticsRepo.top5Share(): Double` — fracción 0..1
  - `fun AnalyticsRepo.funnel(): Funnel`

- [ ] **Step 1: Write the failing test**

```kotlin
    @Test
    fun `el top ordena por score y no por cantidad de aportes`() {
        val calidad = TestDb.insertUser("calidad")
        val cantidad = TestDb.insertUser("cantidad")
        val bar = TestDb.insertBar("Prueba", lat, lng)

        // Dos notas: 2 + 2 = 4 puntos en 2 aportes.
        ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 4.0), calidad)
        ratings.upsert(NewRatingRequest(bar, "ipa", "berlina", 3.0), calidad)
        // Tres confirmaciones: 1 + 1 + 1 = 3 puntos en 3 aportes.
        repeat(3) { i ->
            TestDb.insertPrice(
                bar, "ipa", 8000.0, daysAgo = i, userId = cantidad, isConfirmation = true,
            )
        }

        val top = analytics.topContributors(10)
        // Por cantidad ganaría "cantidad", que hizo tres cosas contra dos.
        assertEquals("calidad", top.first().displayName, "ordena por peso, no por volumen")
        assertEquals(4, top.first().score)
        assertEquals(2, top.first().ratings)
        assertEquals(3, top[1].score)
        assertEquals(3, top[1].confirmations)
    }

    @Test
    fun `la concentracion es la porcion del score que se lleva el top cinco`() {
        val bar = TestDb.insertBar("Prueba", lat, lng)
        // Seis personas con una nota cada una: 2 puntos cada una, 12 en total.
        // El top 5 se lleva 10 de 12.
        listOf("a", "b", "c", "d", "e", "f").forEach { name ->
            val u = TestDb.insertUser(name)
            ratings.upsert(NewRatingRequest(bar, "ipa", "antares", 4.0), u)
        }

        assertEquals(10.0 / 12.0, analytics.top5Share(), 0.001)
    }

    @Test
    fun `el embudo no cuenta como constante al que aporto cuatro veces`() {
        val u = TestDb.insertUser("cuatro")
        val bar = TestDb.insertBar("Prueba", lat, lng)
        repeat(4) { i ->
            TestDb.insertPrice(bar, "ipa", 8000.0 + i, daysAgo = i, userId = u)
        }

        val f = analytics.funnel()
        assertEquals(1, f.accounts)
        assertEquals(1, f.everContributed)
        assertEquals(0, f.fiveOrMore, "cuatro no llega al escalón de cinco")
        assertEquals(1, f.activeMonth)
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: no compila — no existen `topContributors` ni `funnel`.

- [ ] **Step 3: Implement**

DTOs arriba de la clase:

```kotlin
@Serializable
data class TopContributor(
    val userId: Long,
    val displayName: String,
    val score: Int,
    val prices: Int,
    val confirmations: Int,
    val bars: Int,
    val photos: Int,
    val ratings: Int,
)

/** Cuentas → aportó alguna vez → aportó ≥5 veces → aportó en 30 días. */
@Serializable
data class Funnel(
    val accounts: Int,
    val everContributed: Int,
    val fiveOrMore: Int,
    val activeMonth: Int,
)
```

Métodos dentro de la clase. El peso está repetido literal del de `recentUsers()`; si cambia uno, cambian los dos:

```kotlin
    /**
     * Los que más aportan, por score.
     *
     * El peso es el mismo que el de DashboardUserDto.score. Están escritos dos
     * veces porque son dos queries distintas, no porque sean dos criterios:
     * si cambia uno, cambian los dos.
     */
    fun topContributors(limit: Int = 10): List<TopContributor> = db.conn { c ->
        c.query(
            """
            SELECT u.id, u.display_name,
                   sum(CASE c.kind WHEN 'price'  THEN 3
                                   WHEN 'bar'    THEN 3
                                   WHEN 'photo'  THEN 2
                                   WHEN 'rating' THEN 2
                                   ELSE 1 END)::int                 AS score,
                   count(*) FILTER (WHERE c.kind = 'price')::int        AS prices,
                   count(*) FILTER (WHERE c.kind = 'confirmation')::int AS confirmations,
                   count(*) FILTER (WHERE c.kind = 'bar')::int          AS bars,
                   count(*) FILTER (WHERE c.kind = 'photo')::int        AS photos,
                   count(*) FILTER (WHERE c.kind = 'rating')::int       AS ratings
            FROM v_contributions c
            JOIN users u ON u.id = c.user_id
            GROUP BY u.id, u.display_name
            ORDER BY score DESC, u.display_name
            LIMIT ?
            """.trimIndent(),
            limit,
        ) { rs ->
            TopContributor(
                userId = rs.getLong("id"),
                displayName = rs.getString("display_name"),
                score = rs.getInt("score"),
                prices = rs.getInt("prices"),
                confirmations = rs.getInt("confirmations"),
                bars = rs.getInt("bars"),
                photos = rs.getInt("photos"),
                ratings = rs.getInt("ratings"),
            )
        }
    }

    /**
     * Qué porción del total concentran los cinco primeros.
     *
     * En una app que depende de aportes gratis, si el 80% lo hacen tres
     * personas el mapa tiene un punto único de falla. Hoy eso es invisible: la
     * lista está ordenada por aportes pero no dice cuánto pesa la cabeza.
     */
    fun top5Share(): Double = db.conn { c ->
        c.query(
            """
            WITH s AS (
                SELECT sum(CASE kind WHEN 'price'  THEN 3
                                     WHEN 'bar'    THEN 3
                                     WHEN 'photo'  THEN 2
                                     WHEN 'rating' THEN 2
                                     ELSE 1 END) AS score
                FROM v_contributions GROUP BY user_id
            )
            SELECT coalesce(
                (SELECT sum(score) FROM (SELECT score FROM s ORDER BY score DESC LIMIT 5) t)
                    / nullif((SELECT sum(score) FROM s), 0),
                0)::float8 AS share
            """.trimIndent(),
        ) { it.getDouble("share") }.first()
    }

    /** En qué escalón se cae la gente. */
    fun funnel(): Funnel = db.conn { c ->
        c.query(
            """
            WITH per_user AS (
                SELECT user_id,
                       count(*) AS n,
                       max(at)  AS last_at
                FROM v_contributions GROUP BY user_id
            )
            SELECT (SELECT count(*) FROM users)::int                      AS accounts,
                   (SELECT count(*) FROM per_user)::int                   AS ever,
                   (SELECT count(*) FROM per_user WHERE n >= 5)::int      AS five,
                   (SELECT count(*) FROM per_user
                     WHERE last_at > now() - interval '30 days')::int     AS active
            """.trimIndent(),
        ) { rs ->
            Funnel(
                accounts = rs.getInt("accounts"),
                everContributed = rs.getInt("ever"),
                fiveOrMore = rs.getInt("five"),
                activeMonth = rs.getInt("active"),
            )
        }.first()
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: PASA.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/com/birrapp/moderation/AnalyticsRepo.kt backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt
git commit -m "Concentración y embudo: cuánta gente sostiene esto y dónde se cae"
```

---

### Task 7: El endpoint `/moderation/dashboard/analytics`

**Files:**
- Modify: `backend/src/main/kotlin/com/birrapp/moderation/AnalyticsRepo.kt` (agregar el DTO contenedor y el método que arma todo)
- Modify: `backend/src/main/kotlin/com/birrapp/Routes.kt` (firma de `apiRoutes` en la línea 22, ruta nueva junto a las otras dos de dashboard en la ~319)
- Modify: `backend/src/main/kotlin/com/birrapp/Application.kt` (instanciar el repo en la ~86, pasarlo en la ~200)
- Modify: `web/src/data/types.ts`
- Modify: `web/src/data/api.ts`

**Interfaces:**
- Consumes: todos los métodos de `AnalyticsRepo` (tasks 3-6).
- Produces:
  - `data class DashboardAnalytics(val pulse: List<PulseDay>, val weekly: List<WeeklyPoint>, val coverage: List<CoverageDay>, val topContributors: List<TopContributor>, val top5Share: Double, val funnel: Funnel)`
  - `fun AnalyticsRepo.all(): DashboardAnalytics`
  - En TS: `interface DashboardAnalytics` con los mismos campos, y `api.dashboardAnalytics()`. Los usa la Task 9.

- [ ] **Step 1: Write the failing test**

```kotlin
    @Test
    fun `el paquete de analiticas trae las cinco series juntas`() {
        val a = analytics.all()
        assertEquals(30, a.pulse.size)
        assertEquals(12, a.weekly.size)
        assertEquals(90, a.coverage.size)
        assertEquals(0.0, a.top5Share, "sin aportes no hay concentración, y no divide por cero")
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: no compila — no existe `all()`.

- [ ] **Step 3: Add the container DTO and method**

En `AnalyticsRepo.kt`, DTO arriba de la clase:

```kotlin
/** Todo lo que el dashboard pide de una sola vez. */
@Serializable
data class DashboardAnalytics(
    val pulse: List<PulseDay>,
    val weekly: List<WeeklyPoint>,
    val coverage: List<CoverageDay>,
    val topContributors: List<TopContributor>,
    val top5Share: Double,
    val funnel: Funnel,
)
```

y dentro de la clase:

```kotlin
    /**
     * Las cinco métricas en una sola llamada.
     *
     * Van juntas y no en cinco endpoints porque se muestran juntas: cinco
     * requests para pintar una pantalla es latencia regalada, y el dashboard
     * ya hace un Promise.all.
     */
    fun all() = DashboardAnalytics(
        pulse = pulse(),
        weekly = weekly(),
        coverage = coverage(),
        topContributors = topContributors(),
        top5Share = top5Share(),
        funnel = funnel(),
    )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && ./gradlew test --tests "com.birrapp.AnalyticsTest" 2>&1 | tail -20
```

Esperado: PASA.

- [ ] **Step 5: Wire the route**

En `Routes.kt`, agregá el parámetro a `apiRoutes` después de `moderation: ModerationRepo,`:

```kotlin
    analytics: AnalyticsRepo,
```

y el import `import com.birrapp.moderation.AnalyticsRepo`.

Justo después del bloque `get("/dashboard/summary") { ... }`:

```kotlin
            /**
             * Las mismas preguntas que el resumen, pero en el tiempo.
             *
             * Un contador sin tendencia no dice si 12 precios en la semana es
             * bueno, malo o igual que siempre.
             */
            get("/dashboard/analytics") {
                call.requireRole(Role.moderator)
                call.respond(analytics.all())
            }
```

En `Application.kt`, junto a `val moderation = ModerationRepo(db)`:

```kotlin
    val analytics = com.birrapp.moderation.AnalyticsRepo(db)
```

y en la llamada a `apiRoutes(...)`, agregá `analytics` después de `moderation`:

```kotlin
            bars, prices, reviews, ratings, photos, moderation, analytics, users,
```

**Ojo:** el orden de los argumentos posicionales tiene que coincidir con el de la firma. Verificá que `analytics` quede entre `moderation` y `users` en los dos lados.

- [ ] **Step 6: Verify the backend compiles and the suite is green**

```bash
cd backend && ./gradlew test 2>&1 | tail -10
```

Esperado: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Add the TypeScript types and the API call**

En `web/src/data/types.ts`, al final:

```ts
export interface PulseDay {
  day: string
  prices: number
  confirmations: number
  bars: number
  photos: number
  ratings: number
}

export interface WeeklyPoint { week: string; signups: number; contributors: number }

export interface CoverageDay { day: string; bars: number; covered: number }

export interface TopContributor {
  userId: number
  displayName: string
  score: number
  prices: number
  confirmations: number
  bars: number
  photos: number
  ratings: number
}

export interface Funnel {
  accounts: number
  everContributed: number
  fiveOrMore: number
  activeMonth: number
}

export interface DashboardAnalytics {
  pulse: PulseDay[]
  weekly: WeeklyPoint[]
  coverage: CoverageDay[]
  topContributors: TopContributor[]
  /** Fracción 0..1 del score total que concentran los cinco primeros. */
  top5Share: number
  funnel: Funnel
}
```

En `web/src/data/api.ts`, junto a `dashboardSummary`:

```ts
export const dashboardAnalytics = () =>
  req<DashboardAnalytics>('GET', '/moderation/dashboard/analytics', { auth: true })
```

y agregá `DashboardAnalytics` al import de tipos que ya existe arriba del archivo.

- [ ] **Step 8: Verify the front builds**

```bash
cd web && npm run build 2>&1 | tail -8 && git checkout -- tsconfig.tsbuildinfo
```

Esperado: `built in ...` sin errores.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/kotlin/com/birrapp/moderation/AnalyticsRepo.kt backend/src/main/kotlin/com/birrapp/Routes.kt backend/src/main/kotlin/com/birrapp/Application.kt backend/src/test/kotlin/com/birrapp/AnalyticsTest.kt web/src/data/types.ts web/src/data/api.ts
git commit -m "Endpoint /dashboard/analytics: las cinco métricas en una llamada"
```

---

### Task 8: Las primitivas de gráfico en SVG

**REQUIRED SUB-SKILL:** cargá la skill `dataviz` antes de escribir este task — define la paleta, el contraste y las reglas de eje/leyenda.

**Files:**
- Create: `web/src/ui/charts/Chart.tsx` (primitivas + paleta)

**Interfaces:**
- Consumes: nada del backend; recibe datos planos.
- Produces (las usa la Task 9):
  - `type Series = { label: string; color: string; points: number[] }`
  - `function LineChart({ x, series, height, fill, format }): JSX.Element`
  - `function StackedBars({ x, series, height }): JSX.Element`
  - `function HBars({ rows }): JSX.Element`
  - `const KIND_COLORS: Record<'prices' | 'confirmations' | 'bars' | 'photos' | 'ratings', string>`

- [ ] **Step 1: Load the dataviz skill and settle the palette**

Invocá la skill `dataviz`. Con sus reglas, validá esta paleta de arranque sobre el fondo `--base: #1A1410` (tema oscuro único, no hay modo claro):

```ts
export const KIND_COLORS = {
  prices:        '#FFB627',  // el ámbar de la marca: es el aporte que más importa
  confirmations: '#8A7B6D',  // deliberadamente apagado: vale, pero menos
  bars:          '#6BC4A6',
  photos:        '#7FA9E8',
  ratings:       '#C99BE8',
} as const
```

Ajustá los valores si la skill marca problemas de contraste o de distinguibilidad. Dejá escrito en un comentario por qué las confirmaciones van apagadas.

- [ ] **Step 2: Write the primitives**

Creá `web/src/ui/charts/Chart.tsx`:

```tsx
/**
 * Tres gráficos en SVG, sin librería.
 *
 * Un gráfico de líneas es un <polyline> con los valores escalados a la caja;
 * una librería de gráficos es azúcar sobre eso. Recharts pesa ~95kb gzip
 * contra los 120kb que pesa hoy toda la app, y traía un look que no es el del
 * resto. Las estrellas de Stars.tsx ya son SVG a mano: esto es lo mismo.
 *
 * El viewBox es fijo y el ancho es 100%, así escalan solas sin medir el
 * contenedor ni escuchar resize.
 *
 * El tooltip es un <title> adentro de cada figura: es nativo del navegador,
 * accesible, y no cuesta una línea de JS. Si algún día hace falta uno que
 * siga el mouse, se agrega entonces.
 */

export type Series = { label: string; color: string; points: number[] }

export const KIND_COLORS = {
  prices:        '#FFB627',
  // Apagada a propósito: confirmar mantiene fresco lo que ya está, que vale,
  // pero menos que relevar un precio nuevo. El color lo dice sin leyenda.
  confirmations: '#8A7B6D',
  bars:          '#6BC4A6',
  photos:        '#7FA9E8',
  ratings:       '#C99BE8',
} as const

const W = 600
const PAD = { l: 34, r: 8, t: 10, b: 20 }
const GRID = 'rgba(255,255,255,.08)'
const LABEL = { fontSize: 9, fill: '#8A7B6D' } as const

/** Las etiquetas del eje x: primera, del medio y última. Más se amontonan. */
function xTicks(x: string[]) {
  if (x.length === 0) return []
  const idx = [0, Math.floor((x.length - 1) / 2), x.length - 1]
  return [...new Set(idx)].map(i => ({ i, label: x[i]!.slice(5) }))
}

function Grid({ max, h, fmt }: { max: number; h: number; fmt: (n: number) => string }) {
  const ih = h - PAD.t - PAD.b
  return (
    <>
      {[0, 0.5, 1].map(f => {
        const y = PAD.t + ih - f * ih
        return (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke={GRID} />
            <text x={PAD.l - 5} y={y + 3} textAnchor="end" {...LABEL}>
              {fmt(max * f)}
            </text>
          </g>
        )
      })}
    </>
  )
}

export function LineChart({
  x, series, height = 160, fill = false, format = (n: number) => String(Math.round(n)),
}: {
  x: string[]
  series: Series[]
  height?: number
  fill?: boolean
  format?: (n: number) => string
}) {
  const max = Math.max(1, ...series.flatMap(s => s.points))
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const px = (i: number) => PAD.l + (x.length <= 1 ? iw / 2 : (i / (x.length - 1)) * iw)
  const py = (v: number) => PAD.t + ih - (v / max) * ih

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }}>
      <Grid max={max} h={height} fmt={format} />
      {series.map(s => {
        const pts = s.points.map((v, i) => `${px(i)},${py(v)}`).join(' ')
        return (
          <g key={s.label}>
            {fill && (
              <polygon
                points={`${PAD.l},${PAD.t + ih} ${pts} ${px(s.points.length - 1)},${PAD.t + ih}`}
                fill={s.color} opacity={0.14}
              />
            )}
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((v, i) => (
              <circle key={i} cx={px(i)} cy={py(v)} r={6} fill="transparent">
                <title>{`${x[i]} · ${s.label}: ${format(v)}`}</title>
              </circle>
            ))}
          </g>
        )
      })}
      {xTicks(x).map(t => (
        <text key={t.i} x={px(t.i)} y={height - 6} textAnchor="middle" {...LABEL}>
          {t.label}
        </text>
      ))}
    </svg>
  )
}

export function StackedBars({
  x, series, height = 160,
}: { x: string[]; series: Series[]; height?: number }) {
  const totals = x.map((_, i) => series.reduce((a, s) => a + (s.points[i] ?? 0), 0))
  const max = Math.max(1, ...totals)
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const step = iw / Math.max(1, x.length)
  const bw = Math.max(1, step - 2)

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }}>
      <Grid max={max} h={height} fmt={n => String(Math.round(n))} />
      {x.map((day, i) => {
        let acc = 0
        return (
          <g key={day}>
            {series.map(s => {
              const v = s.points[i] ?? 0
              if (v === 0) return null
              const h = (v / max) * ih
              acc += h
              return (
                <rect key={s.label} x={PAD.l + i * step + 1} width={bw}
                  y={PAD.t + ih - acc} height={h} fill={s.color}>
                  <title>{`${day} · ${s.label}: ${v}`}</title>
                </rect>
              )
            })}
            {/* Área invisible para que el día vacío también tenga tooltip. */}
            <rect x={PAD.l + i * step} width={step} y={PAD.t} height={ih} fill="transparent">
              <title>{`${day} · ${totals[i]} aportes`}</title>
            </rect>
          </g>
        )
      })}
      {xTicks(x).map(t => (
        <text key={t.i} x={PAD.l + t.i * step + bw / 2} y={height - 6}
          textAnchor="middle" {...LABEL}>{t.label}</text>
      ))}
    </svg>
  )
}

export function HBars({
  rows,
}: { rows: { label: string; value: number; hint?: string; color?: string }[] }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  const rowH = 26
  const height = Math.max(rowH, rows.length * rowH)
  const labelW = 118

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto' }}>
      {rows.map((r, i) => {
        const y = i * rowH
        const w = (r.value / max) * (W - labelW - 52)
        return (
          <g key={r.label}>
            <text x={0} y={y + 16} {...LABEL} fontSize={11} fill="#B6A899">
              {r.label.length > 18 ? `${r.label.slice(0, 17)}…` : r.label}
            </text>
            <rect x={labelW} y={y + 5} width={Math.max(2, w)} height={13} rx={3}
              fill={r.color ?? '#FFB627'} opacity={0.85}>
              <title>{`${r.label}: ${r.hint ?? r.value}`}</title>
            </rect>
            <text x={labelW + Math.max(2, w) + 6} y={y + 16} {...LABEL} fontSize={11}
              fill="#FBF6EE">{r.hint ?? r.value}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** La leyenda va aparte: los tres gráficos la comparten y no todos la usan. */
export function Legend({ series }: { series: Series[] }) {
  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6,
      fontSize: 11, color: 'var(--faint)',
    }}>
      {series.map(s => (
        <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 9, height: 9, borderRadius: 2, background: s.color, display: 'inline-block',
          }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd web && npm run build 2>&1 | tail -8 && git checkout -- tsconfig.tsbuildinfo
```

Esperado: `built in ...` sin errores. (El archivo todavía no lo importa nadie; alcanza con que tipe.)

- [ ] **Step 4: Commit**

```bash
git add web/src/ui/charts/Chart.tsx
git commit -m "Primitivas de gráfico en SVG, sin librería"
```

---

### Task 9: Los gráficos en el dashboard, ancho completo en desktop

**Files:**
- Modify: `web/src/theme.css` (agregar `.desk-wide` y `.desk-only` al bloque `@media (min-width: 820px)` de la línea ~176)
- Modify: `web/src/screens/Dashboard.tsx`

**Interfaces:**
- Consumes: `api.dashboardAnalytics()` y los tipos de la Task 7; `LineChart`, `StackedBars`, `HBars`, `Legend`, `KIND_COLORS` de la Task 8.
- Produces: nada que consuman otras tasks.

- [ ] **Step 1: Add the CSS**

En `web/src/theme.css`, dentro del bloque `@media (min-width: 820px)` que ya existe, después de la regla de `.desk-narrow`:

```css
  /* El dashboard es la excepción al ancho angosto. El argumento del 560px es
     que la app se usa parado en un bar; el dashboard es lo único que se usa
     sentado, y son datos que piden espacio. */
  .desk-wide { max-width: 1100px; margin-inline: auto; }
}
```

Y **fuera** del media query (al final del archivo), lo que oculta los gráficos pesados en pantalla chica:

```css
/* Los gráficos de análisis: en un teléfono el dashboard tiene que contestar
   rápido, no ser un tablero. Queda el pulso y los números. */
.desk-only { display: none; }
@media (min-width: 820px) {
  .desk-only { display: block; }
}
```

- [ ] **Step 2: Load the analytics in the screen**

En `web/src/screens/Dashboard.tsx`, ajustá los imports. **Ojo:** el archivo importa nombrado (`import { useCallback, ... } from 'react'`) y no trae `React` al scope, así que `React.ReactNode` no compila — hay que importar el tipo:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { HBars, KIND_COLORS, Legend, LineChart, StackedBars } from '../ui/charts/Chart'
import type { DashboardAnalytics, DashboardSummary, DashboardUser } from '../data/types'
```

Sumá el estado y la carga (el `Promise.all` pasa de dos a tres):

```ts
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [s, u, a] = await Promise.all([
        api.dashboardSummary(), api.dashboardUsers(), api.dashboardAnalytics(),
      ])
      setSummary(s); setUsers(u); setAnalytics(a)
    } catch (e) { setError((e as Error).message) }
  }, [])
```

- [ ] **Step 3: Widen the container and add the charts**

Cambiá `<div className="desk-narrow">` (línea ~50) por `<div className="desk-wide">`.

Después del `<p>` de cobertura (el que cierra en la línea ~85) y antes del bloque de solapas `nuevos`/`aportes`, insertá:

```tsx
        {analytics && <Charts a={analytics} />}
```

Y agregá el componente al final del archivo:

```tsx
/**
 * Los cinco gráficos.
 *
 * En mobile queda sólo el pulso: en un teléfono el dashboard tiene que
 * contestar rápido, no ser un tablero. El resto va detrás de `.desk-only`.
 */
function Charts({ a }: { a: DashboardAnalytics }) {
  const pulseSeries = [
    { label: 'precios',  color: KIND_COLORS.prices,        points: a.pulse.map(d => d.prices) },
    { label: 'confirm.', color: KIND_COLORS.confirmations, points: a.pulse.map(d => d.confirmations) },
    { label: 'bares',    color: KIND_COLORS.bars,          points: a.pulse.map(d => d.bars) },
    { label: 'fotos',    color: KIND_COLORS.photos,        points: a.pulse.map(d => d.photos) },
    { label: 'notas',    color: KIND_COLORS.ratings,       points: a.pulse.map(d => d.ratings) },
  ]
  const pulseX = a.pulse.map(d => d.day)

  const coverPct = a.coverage.map(d => d.bars === 0 ? 0 : (d.covered / d.bars) * 100)
  const f = a.funnel

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: 14, padding: '20px 18px 0',
    }}>
      <Card title="Aportes por día" hint="últimos 30 días">
        <StackedBars x={pulseX} series={pulseSeries} />
        <Legend series={pulseSeries} />
      </Card>

      <Card title="Altas contra aportantes" hint="por semana · 12 semanas" deskOnly>
        <LineChart
          x={a.weekly.map(w => w.week)}
          series={[
            { label: 'se anotaron', color: '#8A7B6D', points: a.weekly.map(w => w.signups) },
            { label: 'aportaron',   color: '#FFB627', points: a.weekly.map(w => w.contributors) },
          ]}
        />
        <Legend series={[
          { label: 'se anotaron', color: '#8A7B6D', points: [] },
          { label: 'aportaron',   color: '#FFB627', points: [] },
        ]} />
      </Card>

      <Card title="Cobertura del mapa" hint="% con precio no vencido · 90 días" deskOnly>
        <LineChart
          x={a.coverage.map(d => d.day)} fill
          format={n => `${Math.round(n)}%`}
          series={[{ label: 'cobertura', color: '#6BC4A6', points: coverPct }]}
        />
      </Card>

      <Card
        title="Quiénes sostienen esto"
        hint={`el top 5 concentra el ${Math.round(a.top5Share * 100)}% de los aportes`}
        deskOnly
      >
        <HBars rows={a.topContributors.map(t => ({
          label: t.displayName, value: t.score, hint: String(t.score),
        }))} />
      </Card>

      <Card title="Activación" hint="dónde se cae la gente" deskOnly>
        <HBars rows={[
          { label: 'cuentas',        value: f.accounts },
          { label: 'aportó alguna',  value: f.everContributed },
          { label: 'aportó 5 o más', value: f.fiveOrMore },
          { label: 'activo · 30 d',  value: f.activeMonth },
        ]} />
      </Card>
    </div>
  )
}

function Card({ title, hint, deskOnly, children }: {
  title: string; hint?: string; deskOnly?: boolean; children: ReactNode
}) {
  return (
    <div className={deskOnly ? 'desk-only' : undefined} style={{
      padding: 14, borderRadius: 14, background: 'rgba(255,255,255,.04)',
    }}>
      <div className="lbl" style={{ fontSize: 12.5 }}>{title}</div>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--faint)', margin: '2px 0 10px' }}>{hint}</div>
      )}
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Verify the build**

```bash
cd web && npm run build 2>&1 | tail -8 && git checkout -- tsconfig.tsbuildinfo
```

Esperado: `built in ...` sin errores. Si TypeScript se queja de `React.ReactNode`, agregá `import type { ReactNode } from 'react'` y usá `ReactNode`.

- [ ] **Step 5: Look at it in the browser**

```bash
cd web && npm run dev
```

Entrá a `/dashboard` con una cuenta de moderador y verificá, a más de 820px de ancho: los cinco gráficos en grilla, el contenido más ancho que el resto de la app, los tooltips al pasar el mouse. Después achicá la ventana por debajo de 820px y confirmá que quedan sólo los `Stat`, el pulso y la lista.

Si la base local no tiene datos suficientes para que se vea algo, cargá unos precios con fechas retroactivas por SQL contra `birrapp-db` (puerto 5433).

- [ ] **Step 6: Commit**

```bash
git add web/src/theme.css web/src/screens/Dashboard.tsx
git commit -m "Dashboard: cinco gráficos, ancho completo en desktop y breve en mobile"
```

---

### Task 10: Cerrar

- [ ] **Step 1: Run everything**

```bash
cd backend && ./gradlew test --rerun-tasks 2>&1 | tail -6
cd ../web && npm run build 2>&1 | tail -6 && git checkout -- tsconfig.tsbuildinfo
```

Esperado: backend `BUILD SUCCESSFUL`, web `built in ...`.

- [ ] **Step 2: Append the WORKLOG entry**

`WORKLOG.md` es append-only, una entrada por sesión. Agregá al final una sección `## 2026-09-03 — Dashboard con analíticas (BIR-20)` que cuente: las cinco métricas y qué contesta cada una, por qué se descartó el script de Python con matplotlib y por qué no entró una librería de gráficos, la vista `v_contributions` como definición única de aporte, el peso que se mudó del front al backend, y la excepción del ancho de 560px en desktop. Cerrá con la cantidad de tests en verde.

- [ ] **Step 3: Commit and report**

```bash
git add WORKLOG.md && git commit -m "WORKLOG: dashboard con analíticas"
```

Contale a Felipe qué quedó, con los archivos tocados, y dejá el issue BIR-20 en *In Review* con un comentario que resuma lo hecho.
