#!/usr/bin/env node
/**
 * Le pone `google_place_id` a los bares que vinieron de OpenStreetMap.
 *
 * ## Por qué
 *
 * `BarRepo.create` deduplica exacto por `google_place_id`, pero eso sólo
 * funciona cuando los dos lados lo tienen. Los ~738 bares que sembró
 * `seed_osm.mjs` no lo tienen, así que alguien que carga un bar desde el
 * autocompletado de Google crea un duplicado de uno que ya estaba. Se detectó
 * con "Venice Bar Acassuso" (BIR-14).
 *
 * Queda la defensa de nombre + 100 m que también hace `create`, pero es
 * justamente la que falla cuando OSM y Google le dicen distinto al mismo lugar,
 * que es el caso común.
 *
 * ## Guardar el place_id está permitido
 *
 * Los términos de Places prohíben guardar contenido de lugares más de 30 días,
 * y por eso los bares salen de OSM y no de Google. El `place_id` está
 * **explícitamente exento** y se puede guardar indefinidamente — ya está dicho
 * en `V3__google_place_id.sql`, que es la migración que creó la columna. Este
 * script no guarda ninguna otra cosa que venga de Google: el nombre y la
 * ubicación que llegan en la respuesta se usan para decidir si el match es
 * bueno y se descartan.
 *
 * ## Cuesta plata
 *
 * Una llamada a Places por bar sin vincular. Por eso: checkpoint en disco para
 * no volver a pagar lo ya resuelto si se corta, `--limit` para acotar la
 * primera corrida, y `--dry-run` que no llama a nada.
 *
 * ## El regalo: encontrar duplicados que ya están en la base
 *
 * `idx_bars_place_id` es UNIQUE. Si dos filas distintas matchean el mismo lugar
 * de Google, eso **no es un error del script**: son dos filas que representan
 * el mismo bar y ya estaban duplicadas. El script no elige por su cuenta cuál
 * sobrevive —eso es una decisión de moderación— pero las reporta.
 *
 *   node scripts/link_place_ids.mjs --dry-run
 *   node scripts/link_place_ids.mjs --limit 25
 *   node scripts/link_place_ids.mjs
 *   node scripts/link_place_ids.mjs --self-test
 *
 * Variables: GOOGLE_PLACES_API_KEY, y las de psql que usa seed_osm.mjs
 * (PGHOST, PGPORT, PGDATABASE, DATABASE_USER, DATABASE_PASSWORD).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SELF_TEST = args.includes('--self-test');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

const CHECKPOINT = 'scripts/.place-ids.checkpoint.json';

/**
 * Cuán lejos puede estar el lugar de Google del bar de OSM.
 *
 * 150 m no es generoso, es lo mínimo honesto: las coordenadas de OSM apuntan
 * al polígono del edificio y las de Google a la entrada, y en una esquina de
 * Palermo eso ya son 40 m. Más allá de 150 m dejás de estar mirando el mismo
 * lugar y empezás a mirar al vecino, y un place_id equivocado es peor que
 * ninguno: haría que `create` rechace un bar legítimo por duplicado.
 */
const MATCH_METERS = 150;

/** Cuánto se tienen que parecer los nombres. Ver `similar`. */
const MATCH_NAME = 0.5;

// ---------------------------------------------------------------- matching

/**
 * Normaliza un nombre para comparar.
 *
 * Saca tildes, puntuación y las palabras que no distinguen nada: "bar",
 * "cerveceria", "the" aparecen en media base y sumaban parecido falso entre
 * lugares que no tienen nada que ver.
 */
const STOP = new Set([
  'bar', 'pub', 'the', 'el', 'la', 'los', 'las', 'de', 'del', 'y',
  'cerveceria', 'brewing', 'brewery', 'resto', 'restaurant',
  'restaurante', 'cafe', 'birreria', 'taproom', 'tap',
]);

export function tokens(name) {
  return (name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !STOP.has(t));
}

/**
 * Parecido entre dos nombres, 0 a 1.
 *
 * Es solapamiento de tokens sobre el más corto, no Jaccard. Jaccard castiga
 * que un lado tenga más palabras, y ése es el caso normal acá: OSM dice
 * "Antares" y Google "Antares Cerveceria Artesanal Palermo Soho". Contra el
 * más corto, eso da 1 —que es la respuesta correcta— y Jaccard daría 0,25.
 */
export function similar(a, b) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.min(ta.size, tb.size);
}

/** Metros entre dos puntos. Misma fórmula que el cliente. */
export function haversine(aLat, aLng, bLat, bLng) {
  const R = 6_371_000, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Elige el mejor candidato, o null si ninguno convence.
 *
 * Devuelve también por qué se descartó, porque un log que dice "0 matches" no
 * se puede accionar: la diferencia entre "Google no lo conoce" y "lo conoce
 * pero a 300 m" cambia qué hacés después.
 */
export function pick(bar, candidates) {
  // `score` y no `name`: el nombre del candidato se conserva, porque es lo
  // único que hace accionable el log de un descarte. Pisarlo con el puntaje
  // dejaba mensajes tipo 'nombre distinto: "0.33"'.
  const scored = candidates.map(c => ({
    ...c,
    meters: haversine(bar.lat, bar.lng, c.lat, c.lng),
    score: similar(bar.name, c.name),
  }));
  scored.sort((x, y) => (y.score - x.score) || (x.meters - y.meters));

  const ok = scored.filter(c => c.meters <= MATCH_METERS && c.score >= MATCH_NAME);
  if (ok.length) return { match: ok[0], why: null };

  const near = scored[0];
  if (!near) return { match: null, why: 'Google no devolvió nada' };
  if (near.meters > MATCH_METERS) {
    return { match: null, why: `"${near.name}" está a ${Math.round(near.meters)} m` };
  }
  return { match: null, why: `nombre distinto: "${near.name}"` };
}

// ---------------------------------------------------------------- self-test

if (SELF_TEST) {
  const { strict: assert } = await import('node:assert');

  assert.deepEqual(tokens('El Bar de Antares'), ['antares']);
  assert.deepEqual(tokens('Café Tortoni'), ['tortoni']);

  // El caso que motiva usar el más corto y no Jaccard.
  assert.equal(similar('Antares', 'Antares Cervecería Artesanal Palermo'), 1);
  assert.equal(similar('Antares', 'Berlina'), 0);
  // Dos lugares que sólo comparten palabras vacías no se parecen en nada.
  assert.equal(similar('Bar El Federal', 'Bar La Poesía'), 0);

  assert.ok(haversine(-34.6037, -58.3816, -34.6037, -58.3816) === 0);
  assert.ok(Math.abs(haversine(-34.6037, -58.3816, -34.6047, -58.3816) - 111) < 3);

  const bar = { name: 'Venice Bar', lat: -34.4795, lng: -58.5060 };
  assert.equal(
    pick(bar, [{ id: 'X', name: 'Venice Bar Acassuso', lat: -34.4796, lng: -58.5061 }]).match.id,
    'X',
    'mismo nombre a metros: matchea',
  );
  assert.equal(
    pick(bar, [{ id: 'X', name: 'Venice Bar', lat: -34.5200, lng: -58.5060 }]).match,
    null,
    'mismo nombre pero a 4 km: NO matchea',
  );
  assert.equal(
    pick(bar, [{ id: 'X', name: 'Panadería Los Dos Hermanos', lat: -34.4796, lng: -58.5061 }]).match,
    null,
    'al lado pero otro lugar: NO matchea',
  );
  assert.equal(pick(bar, []).match, null);

  console.log('self-test OK');
  process.exit(0);
}

// ---------------------------------------------------------------- psql

const PG = [
  '-h', process.env.PGHOST || 'localhost',
  '-p', process.env.PGPORT || '5433',
  '-U', process.env.DATABASE_USER || 'birrapp',
  '-d', process.env.PGDATABASE || 'birrapp',
  '-v', 'ON_ERROR_STOP=1',
];
const pgEnv = { ...process.env, PGPASSWORD: process.env.DATABASE_PASSWORD || 'birrapp_dev' };

function psql(argv, input) {
  return execFileSync('psql', [...PG, ...argv], {
    env: pgEnv, input, encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
  });
}

/** Los bares sin vincular. Sólo aprobados: los pendientes puede que ni existan. */
function pending() {
  const out = psql(['-At', '-F', '\t', '-c', `
    SELECT id, name, ST_Y(location::geometry), ST_X(location::geometry)
    FROM bars
    WHERE google_place_id IS NULL AND status = 'approved'
    ORDER BY id
  `]);
  return out.trim().split('\n').filter(Boolean).map(line => {
    const [id, name, lat, lng] = line.split('\t');
    return { id: Number(id), name, lat: Number(lat), lng: Number(lng) };
  });
}

// ---------------------------------------------------------------- Places

const KEY = process.env.GOOGLE_PLACES_API_KEY;

/**
 * Text Search (New), sesgada al punto del bar.
 *
 * La máscara pide id, nombre y ubicación y no más: el nombre y la ubicación
 * son para poder decidir si el match sirve, y no se guardan. Pedir sólo el id
 * sale más barato pero deja el match a ciegas, y un place_id equivocado es
 * peor que ninguno — haría que `create` rechace un bar legítimo por duplicado.
 */
async function search(bar) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
    },
    body: JSON.stringify({
      textQuery: bar.name,
      maxResultCount: 5,
      locationBias: {
        circle: {
          center: { latitude: bar.lat, longitude: bar.lng },
          radius: 300,
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Places HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return (json.places || []).map(p => ({
    id: p.id,
    name: p.displayName?.text ?? '',
    lat: p.location?.latitude,
    lng: p.location?.longitude,
  })).filter(p => p.id && p.lat != null && p.lng != null);
}

// ---------------------------------------------------------------- corrida

const bars = pending();
process.stderr.write(`bares sin google_place_id: ${bars.length}\n`);
if (!bars.length) { process.stderr.write('nada que hacer\n'); process.exit(0); }

const done = existsSync(CHECKPOINT)
  ? JSON.parse(readFileSync(CHECKPOINT, 'utf8'))
  : {};
const todo = bars.filter(b => done[b.id] === undefined).slice(0, LIMIT);
process.stderr.write(
  `ya resueltos en corridas anteriores: ${Object.keys(done).length}\n` +
  `a consultar ahora: ${todo.length}\n`,
);

if (DRY) {
  for (const b of todo.slice(0, 20)) {
    process.stderr.write(`  [${b.id}] ${b.name} (${b.lat.toFixed(5)}, ${b.lng.toFixed(5)})\n`);
  }
  if (todo.length > 20) process.stderr.write(`  ... y ${todo.length - 20} más\n`);
  process.stderr.write(`\n--dry-run: no se llamó a Places ni se escribió nada\n`);
  process.exit(0);
}

if (!KEY) {
  process.stderr.write('falta GOOGLE_PLACES_API_KEY\n');
  process.exit(1);
}

let matched = 0, skipped = 0;
for (const b of todo) {
  try {
    const { match, why } = pick(b, await search(b));
    if (match) {
      done[b.id] = match.id;
      matched++;
      process.stderr.write(
        `✓ [${b.id}] ${b.name} → ${match.id} ` +
        `(${Math.round(match.meters)} m, nombre ${match.score.toFixed(2)})\n`,
      );
    } else {
      // `null` es "consultado y sin match", distinto de "todavía no
      // consultado". Sin esa diferencia, cada corrida volvería a pagar por
      // los mismos bares que Google no reconoce.
      done[b.id] = null;
      skipped++;
      process.stderr.write(`· [${b.id}] ${b.name} — ${why}\n`);
    }
  } catch (e) {
    // No se anota nada: un error de red tiene que poder reintentarse.
    process.stderr.write(`✗ [${b.id}] ${b.name} — ${e.message}\n`);
  }
  // El checkpoint se escribe en cada vuelta, no al final: si el proceso muere
  // a mitad de camino, lo pagado hasta ahí no se vuelve a pagar.
  writeFileSync(CHECKPOINT, JSON.stringify(done, null, 2));
  await new Promise(r => setTimeout(r, 120));
}

process.stderr.write(`\nvinculados: ${matched} · sin match: ${skipped}\n`);

// ---------------------------------------------------------------- escritura

const links = Object.entries(done)
  .filter(([, placeId]) => placeId)
  .map(([id, placeId]) => ({ id: Number(id), placeId }));

if (!links.length) { process.stderr.write('nada para escribir\n'); process.exit(0); }

// Colisiones: dos bares que matchearon el mismo lugar. El índice es UNIQUE, así
// que sólo uno puede quedarse con el id — pero lo importante no es cuál gana,
// es que esos dos bares son el mismo bar cargado dos veces, que es la clase de
// duplicado que este issue quiere evitar hacia adelante. Se reportan para que
// alguien de moderación los mire.
const byPlace = new Map();
for (const l of links) {
  if (!byPlace.has(l.placeId)) byPlace.set(l.placeId, []);
  byPlace.get(l.placeId).push(l.id);
}
const collisions = [...byPlace.entries()].filter(([, ids]) => ids.length > 1);
if (collisions.length) {
  process.stderr.write(`\n⚠ ${collisions.length} lugares matchearon con más de un bar.\n`);
  process.stderr.write('  Son duplicados que YA estaban en la base. Revisar a mano:\n');
  for (const [placeId, ids] of collisions) {
    process.stderr.write(`  ${placeId} → bares ${ids.join(', ')}\n`);
  }
  process.stderr.write('  Se vincula el de id más bajo y los otros quedan sin place_id.\n\n');
}
const unique = [...byPlace.entries()].map(([placeId, ids]) => ({
  id: Math.min(...ids), placeId,
}));

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/\t/g, ' ').replace(/[\n\r]/g, '');
const copyBody = unique.map(l => `${l.id}\t${esc(l.placeId)}`).join('\n');

// Mismo camino que seed_osm.mjs: COPY a una tabla temporal y UPDATE desde ahí.
// `psql -c` no acepta parámetros, y concatenar SQL con algo que vino de una API
// externa es exactamente donde aparecen los agujeros.
psql(['-q', '-f', '-'], `
BEGIN;
CREATE TEMP TABLE incoming (id bigint, place_id text) ON COMMIT DROP;

COPY incoming FROM STDIN;
${copyBody}
\\.

UPDATE bars b
   SET google_place_id = i.place_id,
       updated_at = now()
  FROM incoming i
 WHERE b.id = i.id
   AND b.google_place_id IS NULL;
COMMIT;
`);

process.stderr.write(`listo: ${unique.length} bares con google_place_id\n`);
