-- birrapp — esquema inicial
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------- usuarios ----------
CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');

CREATE TABLE users (
    id           bigserial PRIMARY KEY,
    google_sub   text        NOT NULL UNIQUE,
    email        text        NOT NULL,
    display_name text        NOT NULL,
    avatar_url   text,
    role         user_role   NOT NULL DEFAULT 'user',
    created_at   timestamptz NOT NULL DEFAULT now(),
    banned_at    timestamptz
);
CREATE INDEX idx_users_email ON users (lower(email));

-- ---------- bares ----------
CREATE TYPE moderation_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE bars (
    id            bigserial PRIMARY KEY,
    osm_id        text UNIQUE,               -- NULL = lo cargó un usuario
    name          text NOT NULL,
    address       text,
    neighbourhood text,
    location      geography(Point, 4326) NOT NULL,
    status        moderation_status NOT NULL DEFAULT 'pending',
    created_by    bigint REFERENCES users (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- El índice que realmente importa para la performance del mapa.
CREATE INDEX idx_bars_location ON bars USING GIST (location);
CREATE INDEX idx_bars_status   ON bars (status) WHERE status = 'approved';

-- Anti-duplicados: dos bares aprobados a menos de 30 m con el mismo nombre
-- casi seguro son el mismo lugar. Se chequea en la capa de servicio al crear.
CREATE INDEX idx_bars_name_trgm ON bars (lower(name));

-- ---------- estilos ----------
-- Vocabulario controlado a propósito. Texto libre acá fragmenta los datos
-- ("IPA" / "ipa" / "India Pale Ale") y rompe toda comparación de precios.
CREATE TABLE beer_styles (
    id         serial PRIMARY KEY,
    slug       text    NOT NULL UNIQUE,
    name_es    text    NOT NULL,
    sort_order int     NOT NULL DEFAULT 100,
    active     boolean NOT NULL DEFAULT true
);

-- ---------- precios ----------
CREATE TYPE content_status AS ENUM ('active', 'removed');

-- APPEND ONLY. Nunca UPDATE sobre el precio.
-- Cada reporte es una fila inmutable => histórico real gratis.
CREATE TABLE price_reports (
    id           bigserial PRIMARY KEY,
    bar_id       bigint NOT NULL REFERENCES bars (id)        ON DELETE CASCADE,
    style_id     int    NOT NULL REFERENCES beer_styles (id) ON DELETE RESTRICT,
    price        numeric(12, 2) NOT NULL CHECK (price > 0),
    size_ml      int    NOT NULL DEFAULT 473 CHECK (size_ml BETWEEN 100 AND 2000),
    currency     char(3) NOT NULL DEFAULT 'ARS',
    reported_by  bigint REFERENCES users (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    status       content_status NOT NULL DEFAULT 'active',
    removed_by   bigint REFERENCES users (id) ON DELETE SET NULL,
    -- true = entró por "Sigue igual" (confirmación), no por carga manual.
    is_confirmation boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_prices_lookup  ON price_reports (bar_id, style_id, created_at DESC)
    WHERE status = 'active';
CREATE INDEX idx_prices_by_user ON price_reports (reported_by, created_at DESC);

-- ---------- reseñas ----------
CREATE TABLE reviews (
    id         bigserial PRIMARY KEY,
    bar_id     bigint   NOT NULL REFERENCES bars (id)  ON DELETE CASCADE,
    user_id    bigint   NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body       text,
    created_at timestamptz NOT NULL DEFAULT now(),
    status     content_status NOT NULL DEFAULT 'active',
    UNIQUE (bar_id, user_id)
);
CREATE INDEX idx_reviews_bar ON reviews (bar_id) WHERE status = 'active';

-- ---------- moderación ----------
CREATE TYPE flag_target AS ENUM ('bar', 'price', 'review');

CREATE TABLE flags (
    id          bigserial PRIMARY KEY,
    target_type flag_target NOT NULL,
    target_id   bigint      NOT NULL,
    reporter_id bigint REFERENCES users (id) ON DELETE SET NULL,
    reason      text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    resolved_by bigint REFERENCES users (id) ON DELETE SET NULL,
    resolved_at timestamptz
);
CREATE INDEX idx_flags_open ON flags (created_at DESC) WHERE resolved_at IS NULL;

-- ---------- refresh tokens ----------
CREATE TABLE refresh_tokens (
    id         bigserial PRIMARY KEY,
    user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text   NOT NULL UNIQUE,   -- SHA-256; nunca el token en claro
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);
CREATE INDEX idx_refresh_user ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
