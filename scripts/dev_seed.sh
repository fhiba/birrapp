#!/bin/sh
#
# Llena la base de pruebas (`birrapp_dev`) con una copia de la de verdad,
# **sin identidades**.
#
# Qué se copia: bares, estilos, marcas y precios. Qué NO: `users`, y con ellos
# el `reported_by` de cada precio, que entra en NULL. Es la misma regla que
# `docs/DEPLOY.md` fija para el entorno de test — un precio es un dato sobre un
# bar, un usuario es un dato sobre una persona, y sólo uno de los dos se copia
# a un entorno con menos cuidado.
#
# Tampoco se copian notas, fotos ni comentarios: todos cuelgan de un usuario.
# Si hace falta probar el ranking por nota, se votan tres birras a mano.
#
# Correr con el backend de dev apagado o recién migrado: las tablas tienen que
# existir, y las crea Flyway al arrancar. O sea: primero `scripts/dev.sh` una
# vez, después esto.
#
# Uso:  scripts/dev_seed.sh

set -e

SRC=${DEV_SEED_SRC:-birrapp}
DST=${DEV_DB:-birrapp_dev}
C=birrapp-db

say() { printf '\033[33m▸\033[0m %s\n' "$1"; }

docker exec "$C" psql -U birrapp -d "$DST" -tAc \
  "SELECT to_regclass('public.bars') IS NOT NULL" | grep -q t || {
  echo "La base $DST no tiene esquema todavía. Corré scripts/dev.sh una vez y volvé."
  exit 1
}

say "vaciando $DST"
docker exec "$C" psql -U birrapp -d "$DST" -q -c \
  "TRUNCATE beer_logs, favorites, flags, reviews, beer_ratings, beer_comments,
            bar_photos, price_reports, refresh_tokens, bars, users
   RESTART IDENTITY CASCADE"

# Un solo pg_dump por tabla, con COPY: es un pipe entre dos contenedores que en
# realidad es el mismo, así que no toca el disco de nadie.
copy() {
  say "copiando $1"
  docker exec "$C" psql -U birrapp -d "$SRC" -q -c "COPY ($2) TO STDOUT" \
    | docker exec -i "$C" psql -U birrapp -d "$DST" -q -c "COPY $1 ($3) FROM STDIN"
}

# Los vocabularios primero: los precios los referencian.
# `status` va en 'approved' para todos — un estilo pendiente en la base de
# pruebas sería una diferencia con producción que no tiene por qué estar.
copy beer_styles \
  "SELECT id, slug, name_es, sort_order, active FROM beer_styles ORDER BY id" \
  "id, slug, name_es, sort_order, active"
copy brands \
  "SELECT id, slug, name, craft, status, created_at FROM brands ORDER BY id" \
  "id, slug, name, craft, status, created_at"
copy bars \
  "SELECT id, osm_id, name, location, address, neighbourhood, status, google_place_id, created_at
     FROM bars ORDER BY id" \
  "id, osm_id, name, location, address, neighbourhood, status, google_place_id, created_at"

# El precio viaja; quién lo cargó, no.
copy price_reports \
  "SELECT id, bar_id, style_id, brand_id, price, size_ml, currency, NULL::bigint,
          created_at, status, is_confirmation
     FROM price_reports WHERE status = 'active' ORDER BY id" \
  "id, bar_id, style_id, brand_id, price, size_ml, currency, reported_by,
   created_at, status, is_confirmation"

# Las secuencias quedaron atrás: se copiaron ids explícitos.
docker exec "$C" psql -U birrapp -d "$DST" -q -c "
  SELECT setval(pg_get_serial_sequence(t, 'id'), coalesce((SELECT max(id) FROM bars), 1))
    FROM (VALUES ('bars')) AS x(t);
  SELECT setval(pg_get_serial_sequence('beer_styles','id'), coalesce((SELECT max(id) FROM beer_styles), 1));
  SELECT setval(pg_get_serial_sequence('brands','id'), coalesce((SELECT max(id) FROM brands), 1));
  SELECT setval(pg_get_serial_sequence('price_reports','id'), coalesce((SELECT max(id) FROM price_reports), 1));
" >/dev/null

docker exec "$C" psql -U birrapp -d "$DST" -c \
  "SELECT (SELECT count(*) FROM bars) AS bares,
          (SELECT count(*) FROM v_current_prices) AS precios,
          (SELECT count(*) FROM users) AS usuarios"
