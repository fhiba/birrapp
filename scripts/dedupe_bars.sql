-- Fusiona bares duplicados: mismo nombre a menos de 150 m.
--
-- El origen es OSM: un mismo local suele estar mapeado dos veces, como nodo
-- y como polígono del edificio, y el seed los trae a los dos. Ojo con subir
-- el umbral: las cadenas tienen sucursales legítimas cerca (los siete
-- "Temple" de CABA están a 674 m el más cercano, y son todos reales).
--
-- Idempotente: correrlo dos veces no hace nada la segunda.
--
--   psql ... -f scripts/dedupe_bars.sql            (aplica)
--   psql ... -v dry=1 -f scripts/dedupe_bars.sql   (sólo muestra)

BEGIN;

CREATE TEMP TABLE merges AS
WITH ranked AS (
    SELECT
        id, name, location, osm_id, google_place_id,
        -- Sobrevive el más completo, no el más viejo: primero el que tenga
        -- place_id de Google, después el que tenga dirección, y a igualdad
        -- el de menor id para que el resultado sea determinístico.
        row_number() OVER (
            PARTITION BY lower(name)
            ORDER BY (google_place_id IS NOT NULL) DESC,
                     (address IS NOT NULL) DESC,
                     id ASC
        ) AS rn
    FROM bars
    WHERE status = 'approved'
)
SELECT a.id AS keep_id, b.id AS drop_id, a.name
FROM ranked a
JOIN ranked b
  ON lower(a.name) = lower(b.name)
 AND a.id <> b.id
 AND a.rn < b.rn
 AND ST_DWithin(a.location, b.location, 150);

\if :{?dry}
    SELECT keep_id, drop_id, name FROM merges ORDER BY name;
    ROLLBACK;
\else

-- Los precios se mudan al sobreviviente. Borrar en cascada perdería
-- reportes reales de gente que estuvo en ese bar.
UPDATE price_reports p SET bar_id = m.keep_id
FROM merges m WHERE p.bar_id = m.drop_id;

-- Las reseñas también, salvo que el mismo usuario ya haya reseñado el que
-- queda: hay un UNIQUE(bar_id, user_id) que lo impediría.
UPDATE reviews r SET bar_id = m.keep_id
FROM merges m
WHERE r.bar_id = m.drop_id
  AND NOT EXISTS (
      SELECT 1 FROM reviews r2 WHERE r2.bar_id = m.keep_id AND r2.user_id = r.user_id
  );
DELETE FROM reviews r USING merges m WHERE r.bar_id = m.drop_id;

UPDATE flags f SET target_id = m.keep_id
FROM merges m WHERE f.target_type = 'bar' AND f.target_id = m.drop_id;

-- Si el duplicado tenía datos que al sobreviviente le faltan, se conservan.
UPDATE bars k SET
    address         = COALESCE(k.address, d.address),
    neighbourhood   = COALESCE(k.neighbourhood, d.neighbourhood),
    google_place_id = COALESCE(k.google_place_id, d.google_place_id)
FROM merges m JOIN bars d ON d.id = m.drop_id
WHERE k.id = m.keep_id;

DELETE FROM bars b USING merges m WHERE b.id = m.drop_id;

SELECT count(*) AS bares_fusionados FROM merges;
COMMIT;
\endif
