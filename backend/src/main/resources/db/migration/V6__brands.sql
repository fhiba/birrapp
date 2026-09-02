-- Marca de la cerveza.
--
-- El caso que lo motiva: un bar con dos IPA a precios distintos. Con la clave
-- en (bar, estilo) una pisaba a la otra y el mapa mostraba un precio que no
-- correspondía a ninguna de las dos.
--
-- Vocabulario controlado, no texto libre: con texto libre aparecen "Quilmes",
-- "quilmes" y "Qulimes" como tres marcas distintas y se rompe la comparación.
-- Pero a diferencia de los estilos, las marcas son cola larga —cada cervecería
-- chica es una— así que la lista tiene que crecer: lo que carga un usuario
-- entra pendiente y un moderador lo aprueba.
CREATE TABLE brands (
    id         serial PRIMARY KEY,
    slug       text NOT NULL UNIQUE,
    name       text NOT NULL,
    craft      boolean NOT NULL DEFAULT false,
    status     moderation_status NOT NULL DEFAULT 'approved',
    created_by bigint REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_brands_search ON brands USING GIN (bar_search_key(name) gin_trgm_ops);

-- Nullable a propósito: los precios ya cargados no tienen marca y siguen
-- siendo válidos. Obligarla habría requerido inventar datos.
ALTER TABLE price_reports ADD COLUMN brand_id int REFERENCES brands (id) ON DELETE SET NULL;

DROP INDEX IF EXISTS idx_prices_lookup;
CREATE INDEX idx_prices_lookup ON price_reports (bar_id, style_id, brand_id, created_at DESC)
    WHERE status = 'active';

-- La clave del precio vigente pasa a incluir la marca.
--
-- Se recrea en vez de usar CREATE OR REPLACE: las columnas nuevas van en el
-- medio, y Postgres no deja cambiar el orden ni el nombre de las columnas de
-- una vista existente. v_bar_headline depende de esta, así que cae con ella y
-- se vuelve a crear igual.
DROP VIEW IF EXISTS v_bar_headline;
DROP VIEW IF EXISTS v_current_prices;

CREATE VIEW v_current_prices AS
SELECT DISTINCT ON (pr.bar_id, pr.style_id, pr.brand_id)
       pr.id,
       pr.bar_id,
       pr.style_id,
       bs.slug        AS style_slug,
       bs.name_es     AS style_name,
       pr.brand_id,
       b.slug         AS brand_slug,
       b.name         AS brand_name,
       b.craft        AS brand_craft,
       pr.price,
       pr.size_ml,
       pr.currency,
       pr.created_at,
       EXTRACT(DAY FROM (now() - pr.created_at))::int AS age_days,
       CASE
           WHEN pr.created_at > now() - interval '14 days' THEN 'fresh'
           WHEN pr.created_at > now() - interval '45 days' THEN 'aging'
           ELSE 'stale'
       END AS freshness
FROM price_reports pr
JOIN beer_styles bs ON bs.id = pr.style_id
LEFT JOIN brands b  ON b.id = pr.brand_id
WHERE pr.status = 'active'
ORDER BY pr.bar_id, pr.style_id, pr.brand_id, pr.created_at DESC;

-- Idéntica a la anterior. Con marcas, `style_count` pasa a contar birras
-- (estilo + marca), que es lo que la pantalla muestra igual.
CREATE VIEW v_bar_headline AS
SELECT bar_id,
       min(price) FILTER (WHERE freshness <> 'stale')     AS from_price,
       min(age_days) FILTER (WHERE freshness <> 'stale')  AS freshest_age_days,
       count(*)                                           AS style_count,
       count(*) FILTER (WHERE freshness = 'stale')        AS stale_count
FROM v_current_prices
GROUP BY bar_id;

-- Marcas comunes en Buenos Aires. Arranca acotada a propósito: es más fácil
-- agregar por moderación que limpiar duplicados después.
INSERT INTO brands (slug, name, craft) VALUES
    ('quilmes','Quilmes',false), ('brahma','Brahma',false),
    ('andes','Andes',false), ('patagonia','Patagonia',false),
    ('stella','Stella Artois',false), ('heineken','Heineken',false),
    ('corona','Corona',false), ('schneider','Schneider',false),
    ('imperial','Imperial',false), ('isenbeck','Isenbeck',false),
    ('palermo','Palermo',false), ('budweiser','Budweiser',false),
    ('miller','Miller',false), ('warsteiner','Warsteiner',false),
    ('antares','Antares',true), ('berlina','Berlina',true),
    ('temple','Temple',true), ('grunge','Grunge',true),
    ('juguetes-perdidos','Juguetes Perdidos',true),
    ('strange','Strange Brewing',true), ('penon','Peñón del Águila',true),
    ('blest','Blest',true), ('kraken','Kraken',true), ('baum','Baum',true),
    ('bierlife','Bierlife',true), ('broeders','Broeders',true),
    ('jerome','Jerome',true), ('bruder','Bruder',true),
    ('astor','Astor',true), ('cerveceria-nacional','Cervecería Nacional',true),
    ('casera','De la casa',true);
