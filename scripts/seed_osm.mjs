#!/usr/bin/env node
/**
 * Puebla la tabla `bars` desde OpenStreetMap vía Overpass.
 *
 * Por qué OSM y no Google Places: los términos de Places prohíben guardar
 * datos de lugares más de 30 días (sólo `place_id` está exento), así que no
 * se puede construir una base propia con eso. OSM es ODbL — se puede guardar,
 * con atribución.
 *
 * Idempotente: hace UPSERT por osm_id, así que se puede volver a correr para
 * traer bares nuevos sin duplicar ni pisar los que cargó la comunidad.
 *
 *   node scripts/seed_osm.mjs [--dry-run]
 */
import { execFileSync } from 'node:child_process';

const DRY = process.argv.includes('--dry-run');

// CABA. Bounding box en vez del área administrativa: es más rápido en
// Overpass y no depende de que la relación de límites esté bien taggeada.
const BBOX = { south: -34.7056, west: -58.5315, north: -34.5265, east: -58.3350 };

const QUERY = `
[out:json][timeout:180];
(
  node["amenity"~"^(bar|pub|biergarten)$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way ["amenity"~"^(bar|pub|biergarten)$"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["craft"="brewery"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way ["craft"="brewery"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  node["microbrewery"="yes"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  way ["microbrewery"="yes"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out center tags;
`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function fetchOverpass() {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      process.stderr.write(`consultando ${url} ...\n`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'User-Agent': 'birrapp-seed/0.1' },
        body: QUERY,
        signal: AbortSignal.timeout(200_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      process.stderr.write(`  falló: ${e.message}\n`);
      lastErr = e;
    }
  }
  throw lastErr;
}

function addressOf(t) {
  // Sin calle, la altura sola no dice nada ("1417, Ciudad Autonoma...").
  // En OSM es comun que este el housenumber y falte el street.
  const street = t['addr:street'];
  if (!street) return null;
  const line = [street, t['addr:housenumber']].filter(Boolean).join(' ');
  return [line, t['addr:city']].filter(Boolean).join(', ');
}

const data = await fetchOverpass();
process.stderr.write(`elementos crudos: ${data.elements.length}\n`);

const seen = new Set();
const bars = [];
for (const el of data.elements) {
  const t = el.tags || {};
  const name = (t.name || '').trim();
  // Sin nombre no sirve: nadie puede reportar un precio en "bar sin nombre".
  if (!name) continue;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) continue;

  const osmId = `${el.type}/${el.id}`;
  if (seen.has(osmId)) continue;
  seen.add(osmId);

  bars.push({
    osmId,
    name: name.slice(0, 200),
    address: addressOf(t),
    neighbourhood: t['addr:suburb'] || t['addr:neighbourhood'] || null,
    lat, lon,
  });
}

process.stderr.write(`bares con nombre y coordenadas: ${bars.length}\n`);
if (!bars.length) { process.stderr.write('nada que insertar\n'); process.exit(1); }

const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const values = bars
  .map(b => `(${q(b.osmId)}, ${q(b.name)}, ${q(b.address)}, ${q(b.neighbourhood)}, ` +
            `ST_MakePoint(${b.lon}, ${b.lat})::geography, 'approved')`)
  .join(',\n  ');

// Los bares de OSM entran ya aprobados: OSM es una fuente curada, no una
// carga anónima. Sólo lo que sube la comunidad pasa por moderación.
// El UPSERT no toca `status`: si un moderador rechazó un bar, un re-seed
// no puede resucitarlo.
const sql = `
INSERT INTO bars (osm_id, name, address, neighbourhood, location, status)
VALUES
  ${values}
ON CONFLICT (osm_id) DO UPDATE
  SET name          = EXCLUDED.name,
      address       = EXCLUDED.address,
      neighbourhood = COALESCE(EXCLUDED.neighbourhood, bars.neighbourhood),
      location      = EXCLUDED.location,
      updated_at    = now();
`;

if (DRY) { console.log(sql.slice(0, 2000)); process.exit(0); }

const env = {
  ...process.env,
  PGPASSWORD: process.env.DATABASE_PASSWORD || 'birrapp_dev',
};
execFileSync('psql', [
  '-h', process.env.PGHOST || 'localhost',
  '-p', process.env.PGPORT || '5433',
  '-U', process.env.DATABASE_USER || 'birrapp',
  '-d', process.env.PGDATABASE || 'birrapp',
  '-v', 'ON_ERROR_STOP=1',
  '-c', sql,
], { env, stdio: 'inherit' });

process.stderr.write(`listo: ${bars.length} bares insertados/actualizados\n`);
