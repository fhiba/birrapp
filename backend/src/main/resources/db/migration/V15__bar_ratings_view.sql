-- La nota de un bar, para poder ordenar por ella (BIR-30).
--
-- No es una nota nueva: es exactamente la que la ficha del bar ya venía
-- mostrando en su encabezado, sólo que calculada en la base en vez de en el
-- cliente. Tenerla en dos lados era garantía de que un día dijeran cosas
-- distintas.
--
-- Ponderada por cantidad de votos: una birra con treinta votos tiene que pesar
-- más que una con uno.
--
-- Y dos números, no uno, por la misma razón de siempre en este proyecto:
--
--   * `rating_raw` es el promedio real. Es el que se MUESTRA. Con un solo voto
--     de 5, esto dice 5,0, que es lo que esa persona votó.
--   * `rating_sort` arrastra el shrinkage bayesiano de `v_style_ratings`. Es
--     el que ORDENA, y nunca se muestra: un bar con un solo voto de 5 no puede
--     encabezar el ranking por encima de uno con 4,6 y cuarenta votos.
--
-- `last_rated_at` viaja para lo mismo que la edad de los precios: una nota de
-- hace dos años no dice nada del bar de hoy. Todavía no se usa en la UI, pero
-- el dato tiene que estar disponible para cuando se muestre.
CREATE VIEW v_bar_ratings AS
SELECT bar_id,
       round((sum(rating_raw * rating_count) / sum(rating_count))::numeric, 2) AS rating_raw,
       round((sum(rating_avg * rating_count) / sum(rating_count))::numeric, 2) AS rating_sort,
       sum(rating_count)::int AS rating_count,
       max(last_rated_at)     AS last_rated_at
FROM v_style_ratings
GROUP BY bar_id;
