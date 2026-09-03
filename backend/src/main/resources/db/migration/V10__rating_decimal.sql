-- La nota de una birra pasa a admitir un decimal: un 3,8 es un 3,8, no un 4.
--
-- El promedio de la comunidad ya se mostraba con decimales (avg + round);
-- lo único que faltaba era poder *ingresar* uno. Y el piso baja de 1 a 0:
-- con carga numérica "estuvo pésima" es un voto legítimo, distinto de "no
-- voté" —que es la ausencia de fila, no un 0.
--
-- numeric(2,1): dos dígitos en total, uno decimal. Cubre 0.0 a 9.9; el CHECK
-- lo acota a 0–5. Postgres redondea al insertar, así que 3,84 entra como 3,8.

-- La vista depende de la columna, así que hay que bajarla para cambiar el
-- tipo y volver a crearla igual. avg(rating) y round(...::numeric, 2) andan
-- igual con la columna en numeric: la definición no cambia.
DROP VIEW IF EXISTS v_style_ratings;

ALTER TABLE beer_ratings DROP CONSTRAINT beer_ratings_rating_check;

ALTER TABLE beer_ratings
    ALTER COLUMN rating TYPE numeric(2,1);

ALTER TABLE beer_ratings
    ADD CONSTRAINT beer_ratings_rating_check CHECK (rating BETWEEN 0.0 AND 5.0);

-- Idéntica a la de V7. El shrinkage hacia la media global se mantiene: sirve
-- para ordenar, no para mostrar.
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
