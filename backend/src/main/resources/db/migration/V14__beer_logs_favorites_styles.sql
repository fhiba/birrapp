-- Tres cosas que comparten migración porque las tres cuelgan del usuario:
-- su bitácora de birras (BIR-34), sus favoritos (BIR-37/BIR-5) y el permiso
-- para proponer estilos (BIR-35).

-- ---------- bitácora personal ----------
--
-- A diferencia de price_reports, esto NO es dato comunitario: nadie más lo ve,
-- no alimenta el mapa y no hay histórico que defender. Por eso se puede
-- borrar de verdad — quien anotó una birra de más la saca y listo.
--
-- Todo es opcional menos la persona y la fecha. Anotar una birra tiene que
-- costar un tap, igual que "Sigue igual": si exige elegir bar, marca y estilo,
-- nadie la anota estando en un bar con una mano ocupada.
CREATE TABLE beer_logs (
    id         bigserial PRIMARY KEY,
    user_id    bigint NOT NULL REFERENCES users (id)       ON DELETE CASCADE,
    bar_id     bigint REFERENCES bars (id)                 ON DELETE SET NULL,
    style_id   int    REFERENCES beer_styles (id)          ON DELETE SET NULL,
    brand_id   int    REFERENCES brands (id)               ON DELETE SET NULL,
    -- Techo de 20: una ronda larga entra, una tipeada errónea de 100 no.
    qty        smallint NOT NULL DEFAULT 1 CHECK (qty BETWEEN 1 AND 20),
    -- Cuándo se la tomó, que puede no ser cuándo la anotó.
    drank_at   timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_beer_logs_user ON beer_logs (user_id, drank_at DESC);

-- ---------- favoritos ----------
--
-- Clave compuesta y no serial: favoritear dos veces el mismo bar no es un
-- favorito nuevo. Con la PK acá, el ON CONFLICT DO NOTHING del INSERT hace
-- que el botón sea idempotente sin una sola línea de Kotlin.
CREATE TABLE favorites (
    user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    bar_id     bigint NOT NULL REFERENCES bars (id)  ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, bar_id)
);

-- ---------- estilos propuestos por usuarios (BIR-35) ----------
--
-- Mismo patrón que `brands`, y por el mismo motivo: el vocabulario cerrado
-- evita que "IPA", "ipa" e "I.P.A." sean tres estilos distintos, pero un
-- vocabulario que no crece deja afuera a la birra que alguien tiene enfrente.
-- Lo que carga un usuario entra 'pending' y un moderador decide.
--
-- Default 'approved': los estilos sembrados en V1/V2 son los que ya estaban.
ALTER TABLE beer_styles
    ADD COLUMN status     moderation_status NOT NULL DEFAULT 'approved',
    ADD COLUMN created_by bigint REFERENCES users (id) ON DELETE SET NULL;
