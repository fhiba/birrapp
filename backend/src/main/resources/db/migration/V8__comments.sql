-- La nota y el comentario dejan de ser la misma fila.
--
-- Hasta acá `beer_ratings` guardaba las dos cosas juntas, con una fila por
-- (bar, estilo, marca, usuario). Eso ataba dos reglas que no tienen por qué ir
-- juntas:
--
--   * La nota TIENE que ser una sola por persona y por birra. Si no, quien
--     quiera inflar una cerveza vota cinco veces y el promedio deja de
--     significar algo.
--   * El comentario NO. Volviste al bar seis meses después y la canilla
--     cambió: eso es un comentario nuevo, no una corrección del viejo.
--
-- Y traía una consecuencia peor: como eran la misma fila, un usuario no podía
-- borrar su comentario sin borrar también su voto, así que directamente no se
-- le ofrecía borrarlo. Sus propias palabras quedaban fuera de su alcance.
--
-- La nota se queda en `beer_ratings`, con su índice único intacto. El texto se
-- muda acá, donde varias filas por persona son válidas.

CREATE TABLE beer_comments (
    id         bigserial PRIMARY KEY,
    bar_id     bigint NOT NULL REFERENCES bars (id)        ON DELETE CASCADE,
    style_id   int    NOT NULL REFERENCES beer_styles (id) ON DELETE CASCADE,
    brand_id   int    REFERENCES brands (id)               ON DELETE CASCADE,
    user_id    bigint NOT NULL REFERENCES users (id)       ON DELETE CASCADE,
    body       text   NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 600),
    created_at timestamptz NOT NULL DEFAULT now(),
    status     content_status NOT NULL DEFAULT 'active'
);

CREATE INDEX idx_comments_lookup
    ON beer_comments (bar_id, style_id, brand_id, created_at DESC)
    WHERE status = 'active';

-- Índice aparte para "mis comentarios": la consulta de moderación y la de
-- borrado propio filtran por usuario, no por birra.
CREATE INDEX idx_comments_by_user ON beer_comments (user_id, created_at DESC)
    WHERE status = 'active';

-- Se mudan los comentarios que ya existen. Se conserva `created_at` original:
-- la edad de un comentario es parte de lo que dice, igual que la de un precio.
-- El estado también, así lo que un moderador bajó no revive con la migración.
INSERT INTO beer_comments (bar_id, style_id, brand_id, user_id, body, created_at, status)
SELECT bar_id, style_id, brand_id, user_id, btrim(body), created_at, status
FROM beer_ratings
WHERE body IS NOT NULL AND btrim(body) <> '';

ALTER TABLE beer_ratings DROP COLUMN body;
