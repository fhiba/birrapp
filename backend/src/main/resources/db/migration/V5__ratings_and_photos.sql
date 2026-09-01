-- Rating por (bar, estilo) y fotos de la birra.
--
-- La clave es la misma que la del precio a propósito. Es todo cerveza tirada:
-- la misma IPA no es la misma birra en dos bares, así que una nota por marca
-- borraría justo lo que distingue. La nota del bar sale como agregado.

-- ---------- rating ----------
--
-- A diferencia de price_reports, esto NO es append-only. El historial de
-- precios es el dato; un rating viejo del mismo usuario no sirve para nada,
-- así que se pisa. De ahí el UNIQUE y el updated_at.
CREATE TABLE beer_ratings (
    id         bigserial PRIMARY KEY,
    bar_id     bigint   NOT NULL REFERENCES bars (id)        ON DELETE CASCADE,
    style_id   int      NOT NULL REFERENCES beer_styles (id) ON DELETE CASCADE,
    user_id    bigint   NOT NULL REFERENCES users (id)       ON DELETE CASCADE,
    rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body       text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    status     content_status NOT NULL DEFAULT 'active',
    UNIQUE (bar_id, style_id, user_id)
);
CREATE INDEX idx_ratings_lookup ON beer_ratings (bar_id, style_id)
    WHERE status = 'active';

-- ---------- fotos ----------
--
-- Sólo la llave del objeto en R2: los bytes nunca pasan por acá. El backend
-- firma la subida y el navegador sube directo al bucket.
--
-- Ojo con la moderación: como se sirven por URL pública, marcar status
-- 'removed' NO deja de servirlas. Hay que borrar el objeto del bucket
-- además. Es distinto de precios y reseñas, donde alcanza con el estado.
CREATE TABLE bar_photos (
    id         bigserial PRIMARY KEY,
    bar_id     bigint NOT NULL REFERENCES bars (id)        ON DELETE CASCADE,
    style_id   int    NOT NULL REFERENCES beer_styles (id) ON DELETE CASCADE,
    user_id    bigint REFERENCES users (id) ON DELETE SET NULL,
    object_key text   NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    status     content_status NOT NULL DEFAULT 'active'
);
CREATE INDEX idx_photos_lookup ON bar_photos (bar_id, style_id, created_at DESC)
    WHERE status = 'active';

-- ---------- moderación ----------
-- Sólo se agregan los valores; usarlos en esta misma transacción daría error.
ALTER TYPE flag_target ADD VALUE IF NOT EXISTS 'photo';
ALTER TYPE flag_target ADD VALUE IF NOT EXISTS 'rating';

-- ---------- agregado por (bar, estilo) ----------
--
-- Promedio bayesiano, no promedio simple: un 5,0 con un voto y un 4,2 con
-- treinta no valen lo mismo y a ojo se ven igual. Se lo empuja hacia la media
-- global con un peso de 5 votos, que es el mínimo a partir del cual una nota
-- empieza a decir algo. Con muchos votos el término desaparece solo.
-- La media global se usa como prior sólo cuando hay suficientes votos para
-- que signifique algo. Con la base joven, `avg(rating)` sobre dos o tres
-- filas ES el voto que se está corrigiendo: el término se encoge hacia sí
-- mismo y no corrige nada. Hasta los 50 votos se usa un 3,5 neutro fijo.
CREATE VIEW v_style_ratings AS
WITH global AS (
    SELECT CASE WHEN count(*) >= 50 THEN avg(rating) ELSE 3.5 END AS mean
    FROM beer_ratings WHERE status = 'active'
)
SELECT r.bar_id,
       r.style_id,
       count(*)                                   AS rating_count,
       round(avg(r.rating)::numeric, 2)           AS rating_raw,
       round(((count(*) * avg(r.rating) + 5 * g.mean) / (count(*) + 5))::numeric, 2)
                                                  AS rating_avg,
       max(r.updated_at)                          AS last_rated_at
FROM beer_ratings r
CROSS JOIN global g
WHERE r.status = 'active'
GROUP BY r.bar_id, r.style_id, g.mean;
