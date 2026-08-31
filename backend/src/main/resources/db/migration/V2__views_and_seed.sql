-- Precio vigente por (bar, estilo): el último reporte activo.
-- DISTINCT ON es específico de Postgres y es la forma más barata de hacerlo.
CREATE VIEW v_current_prices AS
SELECT DISTINCT ON (pr.bar_id, pr.style_id)
       pr.id,
       pr.bar_id,
       pr.style_id,
       bs.slug        AS style_slug,
       bs.name_es     AS style_name,
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
WHERE pr.status = 'active'
ORDER BY pr.bar_id, pr.style_id, pr.created_at DESC;

-- Precio "desde" por bar, para el pin del mapa y el orden "más barata".
-- Sólo mira precios NO stale: un precio viejo y barato no puede ganarle
-- a uno fresco. Si un bar sólo tiene precios stale queda sin headline
-- (NULL) y se ordena al final.
CREATE VIEW v_bar_headline AS
SELECT bar_id,
       min(price) FILTER (WHERE freshness <> 'stale')  AS from_price,
       min(age_days) FILTER (WHERE freshness <> 'stale') AS freshest_age_days,
       count(*)                                         AS style_count,
       count(*) FILTER (WHERE freshness = 'stale')      AS stale_count
FROM v_current_prices
GROUP BY bar_id;

-- Vocabulario de estilos. Editable por admin vía API.
INSERT INTO beer_styles (slug, name_es, sort_order) VALUES
    ('rubia',    'Rubia / Golden', 10),
    ('ipa',      'IPA',            20),
    ('apa',      'APA',            30),
    ('roja',     'Roja / Irish Red', 40),
    ('negra',    'Negra',          50),
    ('stout',    'Stout',          60),
    ('porter',   'Porter',         70),
    ('honey',    'Honey',          80),
    ('scottish', 'Scottish',       90),
    ('kolsch',   'Kölsch',        100),
    ('trigo',    'Trigo / Weisse', 110),
    ('lager',    'Lager',         120),
    ('ipa-negra','IPA Negra',     130),
    ('sin-alcohol','Sin alcohol', 200);
