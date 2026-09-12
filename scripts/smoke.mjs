#!/usr/bin/env node
/**
 * Verifica que un entorno desplegado esté vivo y bien configurado.
 *
 * Nació con el entorno de test (BIR-21): tener un staging no sirve de nada si
 * después de cada deploy hay que abrir la app y tantear a ojo qué se rompió.
 * Esto contesta en dos segundos si el deploy quedó usable.
 *
 * Lo que chequea, en orden de qué tan seguido se rompe:
 *
 * 1. **CORS entre la web y el backend.** Es la falla número uno de un entorno
 *    nuevo: el backend levanta, `/health` contesta, y la app igual no muestra
 *    nada porque `ALLOWED_ORIGINS` quedó con el dominio de producción. Desde el
 *    navegador eso se ve como "no carga" sin más pista que la consola.
 * 2. **La base está conectada y sembrada.** `/health` contesta sin tocar
 *    Postgres, así que un backend con la `DATABASE_URL` mal apuntada pasa el
 *    health check y falla en todo lo demás.
 * 3. **Los topes de BIR-13 se aplican.** Son la diferencia entre el entorno que
 *    creés que desplegaste y el que desplegaste.
 *
 * No toca nada: son todos GET. Se puede correr contra producción sin miedo.
 *
 *   node scripts/smoke.mjs --api https://staging.up.railway.app --web https://dev.vercel.app
 *   node scripts/smoke.mjs --api http://localhost:8090
 *
 * Sale con código 1 si algo falla, así que sirve de paso previo a un merge.
 */

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const API = (argOf('--api', process.env.SMOKE_API) || '').replace(/\/$/, '');
const WEB = (argOf('--web', process.env.SMOKE_WEB) || '').replace(/\/$/, '');

if (!API) {
  process.stderr.write('uso: node scripts/smoke.mjs --api <url> [--web <url>]\n');
  process.exit(2);
}

// Obelisco. Cualquier punto sirve mientras haya bares alrededor.
const LAT = -34.6037, LNG = -58.3816;

let failed = 0;
const results = [];

/**
 * Marca un chequeo como no ejecutado.
 *
 * Existe porque un salteo pintado de ✓ es peor que no chequear nada: el
 * reporte diría que la web apunta al backend correcto cuando en realidad nunca
 * se pudo mirar. Un verificador en el que no se puede confiar no sirve.
 */
const skip = (why) => ({ __skip: why });

async function check(name, fn) {
  try {
    const detail = await fn();
    if (detail && detail.__skip) {
      results.push({ state: 'skip', name, detail: detail.__skip });
      return;
    }
    results.push({ state: 'ok', name, detail });
  } catch (e) {
    failed++;
    results.push({ state: 'fail', name, detail: e.message });
  }
}

const get = async (url, init) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), ...init });
  return res;
};

const json = async (url, init) => {
  const res = await get(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
};

// ----------------------------------------------------------------- backend

await check('el backend contesta', async () => {
  const body = await json(`${API}/health`);
  if (body?.ok !== true) throw new Error(`/health devolvió ${JSON.stringify(body)}`);
  return 'GET /health → {"ok":true}';
});

await check('la base está conectada y sembrada', async () => {
  // Vocabularios primero: salen de una tabla y no dependen de que haya bares,
  // así que separan "la base no responde" de "la base está vacía".
  const styles = await json(`${API}/styles`);
  if (!Array.isArray(styles) || styles.length === 0) {
    throw new Error('/styles vino vacío: la base responde pero no tiene migraciones o seed');
  }
  return `${styles.length} estilos`;
});

await check('hay bares cargados', async () => {
  const bars = await json(`${API}/bars?lat=${LAT}&lng=${LNG}&radius=5000&limit=200`);
  if (!Array.isArray(bars)) throw new Error('/bars no devolvió una lista');
  if (bars.length === 0) {
    throw new Error('cero bares alrededor del Obelisco — falta correr scripts/seed_osm.mjs');
  }
  return `${bars.length} bares en 5 km`;
});

await check('el tope de limit se aplica (BIR-13)', async () => {
  const bars = await json(`${API}/bars?lat=${LAT}&lng=${LNG}&radius=20000&limit=999`);
  if (bars.length > 200) {
    // "devolvió 500" a secas se lee como un HTTP 500. La unidad va siempre.
    throw new Error(
      `pidiendo limit=999 devolvió ${bars.length} filas: el tope de 200 no está desplegado`,
    );
  }
  return `limit=999 → ${bars.length} filas (tope 200)`;
});

await check('el tope de radius se aplica (BIR-13)', async () => {
  // Se pide un radio absurdo desde un punto lejano: si el backend respetara los
  // 50 km viejos, contestaría bares de Buenos Aires. Con el tope de 20 km, no.
  const far = await json(`${API}/bars?lat=-34.9&lng=-57.95&radius=50000&limit=200`);
  const reach = far
    .map(b => b.distanceMeters)
    .filter(d => typeof d === 'number');
  const max = reach.length ? Math.max(...reach) : 0;
  if (max > 20_000) {
    throw new Error(`devolvió un bar a ${Math.round(max)} m: el tope de 20 km no está desplegado`);
  }
  return `radius=50000 → nada más allá de ${Math.round(max)} m`;
});

await check('los parámetros inválidos dan 400 y no 500', async () => {
  const res = await get(`${API}/bars?lat=999&lng=0`);
  if (res.status !== 400) throw new Error(`lat=999 devolvió ${res.status}, esperaba 400`);
  return 'lat fuera de rango → 400';
});

// -------------------------------------------------------------------- CORS

if (WEB) {
  await check('el backend acepta a la web (CORS)', async () => {
    const res = await get(`${API}/styles`, { headers: { Origin: WEB } });
    const allow = res.headers.get('access-control-allow-origin');
    if (!allow) {
      throw new Error(
        `sin access-control-allow-origin para Origin: ${WEB}. ` +
        'Revisar ALLOWED_ORIGINS en el backend — la app va a ver "no carga" sin más pista',
      );
    }
    if (allow !== '*' && allow !== WEB) {
      throw new Error(`el backend permite "${allow}" y la web es "${WEB}"`);
    }
    return `allow-origin: ${allow}`;
  });

  await check('un origen ajeno NO está permitido', async () => {
    const res = await get(`${API}/styles`, { headers: { Origin: 'https://ejemplo-ajeno.com' } });
    const allow = res.headers.get('access-control-allow-origin');
    if (allow === '*') throw new Error('ALLOWED_ORIGINS está en *: cualquier sitio puede usar la API');
    if (allow === 'https://ejemplo-ajeno.com') throw new Error('el backend acepta cualquier origen');
    return 'un dominio cualquiera no entra';
  });

  // ----------------------------------------------------------------- web

  await check('la web responde y es alcanzable sin sesión', async () => {
    // `redirect: manual` a propósito: seguir el 302 esconde el problema
    // detrás de una página de login de Vercel que después falla por otro
    // motivo, y el mensaje que sale no tiene nada que ver con la causa.
    const res = await get(`${WEB}/`, { redirect: 'manual' });

    // Vercel Deployment Protection. Es el default en los Preview de las
    // cuentas nuevas, y convierte al entorno de test en algo que sólo abre
    // quien tenga sesión de Vercel en ese navegador: no sirve desde el
    // celular, y el callback de OAuth de Google tampoco puede volver.
    const to = res.headers.get('location') || '';
    if (res.status === 302 && /vercel\.com\/sso-api/.test(to)) {
      throw new Error(
        'protegida por Vercel Deployment Protection: 302 a vercel.com/sso-api. ' +
        'Settings → Deployment Protection → desactivar para Preview, o el entorno ' +
        'de test no se puede abrir desde el celular ni recibir el callback de OAuth',
      );
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}${to ? ` → ${to}` : ''}`);

    const html = await res.text();
    if (!/<div id="root"/.test(html)) throw new Error('la respuesta no parece el index de la PWA');
    return `HTTP ${res.status}`;
  });

  await check('la web no apunta al backend equivocado', async () => {
    // `VITE_API_BASE` queda horneada en el bundle. Es el error más silencioso
    // de todos: staging anda perfecto pero escribiendo en la base de
    // producción, y no hay forma de darse cuenta mirando la pantalla.
    const page = await get(`${WEB}/`, { redirect: 'manual' });
    if (!page.ok) return skip('la web no es alcanzable — ver el chequeo de arriba');
    const html = await page.text();
    const src = html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1];
    if (!src) return skip('no se encontró el bundle en el HTML');
    const bundle = await get(`${WEB}${src.startsWith('/') ? '' : '/'}${src}`).then(r => r.text());
    const host = new URL(API).host;
    if (!bundle.includes(host)) {
      throw new Error(
        `el bundle de ${WEB} no menciona a ${host}: VITE_API_BASE apunta a otro backend`,
      );
    }
    return `el bundle apunta a ${host}`;
  });
}

// ---------------------------------------------------------------- reporte

const MARK = { ok: '\u2713', fail: '\u2717', skip: '\u2013' };
const pad = Math.max(...results.map(r => r.name.length));
for (const r of results) {
  process.stdout.write(`${MARK[r.state]} ${r.name.padEnd(pad)}  ${r.detail}\n`);
}

const passed = results.filter(r => r.state === 'ok').length;
const skipped = results.filter(r => r.state === 'skip').length;
process.stdout.write(
  `\n${passed} ok · ${failed} fallan${skipped ? ` · ${skipped} sin correr` : ''}` +
  ` · api=${API}${WEB ? ` web=${WEB}` : ''}\n`,
);
if (!WEB) {
  process.stdout.write('(sin --web se saltean los chequeos de CORS y del bundle)\n');
}
process.exit(failed ? 1 : 0);
