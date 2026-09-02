-- La marca entra en la identidad de la birra.
--
-- Una IPA de Antares y una de Juguetes Perdidos en el mismo bar son cervezas
-- distintas: tienen precio distinto y merecen nota y fotos propias. Hasta acá
-- las notas eran por (bar, estilo) y las dos habrían mostrado el mismo número,
-- que además es la señal que más confunde: dice que probaste una cosa cuando
-- probaste otra.
--
-- brand_id nullable: "sin marca" es un valor legítimo, no un dato faltante.
-- Hay bares donde la birra no tiene marca declarada, y los votos ya cargados
-- son exactamente ese caso.

ALTER TABLE beer_ratings ADD COLUMN brand_id int REFERENCES brands (id) ON DELETE CASCADE;
ALTER TABLE bar_photos   ADD COLUMN brand_id int REFERENCES brands (id) ON DELETE CASCADE;

-- La restricción de "un voto por persona" pasa a contemplar la marca. Con
-- NULL, UNIQUE no compara, así que hace falta un índice parcial aparte para
-- que "sin marca" tampoco admita dos votos de la misma persona.
ALTER TABLE beer_ratings DROP CONSTRAINT IF EXISTS beer_ratings_bar_id_style_id_user_id_key;

CREATE UNIQUE INDEX idx_ratings_one_per_user
    ON beer_ratings (bar_id, style_id, brand_id, user_id)
    WHERE brand_id IS NOT NULL;

CREATE UNIQUE INDEX idx_ratings_one_per_user_nobrand
    ON beer_ratings (bar_id, style_id, user_id)
    WHERE brand_id IS NULL;

DROP INDEX IF EXISTS idx_ratings_lookup;
CREATE INDEX idx_ratings_lookup ON beer_ratings (bar_id, style_id, brand_id)
    WHERE status = 'active';

DROP INDEX IF EXISTS idx_photos_lookup;
CREATE INDEX idx_photos_lookup ON bar_photos (bar_id, style_id, brand_id, created_at DESC)
    WHERE status = 'active';

-- El promedio se agrupa ahora por marca. El shrinkage hacia la media global
-- se mantiene igual: sirve para ordenar, no para mostrar.
DROP VIEW IF EXISTS v_style_ratings;
CREATE VIEW v_style_ratings AS
WITH global AS (
    SELECT CASE WHEN count(*) >= 50 THEN avg(rating) ELSE 3.5 END AS mean
    FROM beer_ratings WHERE status = 'active'
)
SELECT r.bar_id,
       r.style_id,
       r.brand_id,
       count(*)                                   AS rating_count,
       round(avg(r.rating)::numeric, 2)           AS rating_raw,
       round(((count(*) * avg(r.rating) + 5 * g.mean) / (count(*) + 5))::numeric, 2)
                                                  AS rating_avg,
       max(r.updated_at)                          AS last_rated_at
FROM beer_ratings r
CROSS JOIN global g
WHERE r.status = 'active'
GROUP BY r.bar_id, r.style_id, r.brand_id, g.mean;
