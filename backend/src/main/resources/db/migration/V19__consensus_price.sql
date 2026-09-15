-- El precio pasa a ser el consenso, no el último que reportó (BIR-8).
--
-- Hasta acá `v_current_prices` era un `DISTINCT ON` ordenado por fecha: **el
-- último que reporta gana**, aunque sea uno contra veinte. Alcanzaba con que
-- alguien cargara un número falso para que ese fuera *el* precio del bar.
--
-- No cambia nada de cómo se guarda. `PriceRepo.confirm` ya inserta una fila
-- completa con el valor vigente y `is_confirmation = true`, así que cada
-- "Sigue igual" **ya era un voto por un número** — sólo que nadie los contaba.
-- Efecto lateral bueno: confirmar pasa a valer más, no menos. Antes sólo
-- rejuvenecía la fecha; ahora es peso detrás de un valor.
--
-- Las cuatro decisiones, y por qué cada una:
--
--  1. **Mediana y no promedio.** Un valor absurdo entre cinco honestos no
--     mueve la mediana; al promedio lo arrastra, que es justo el ataque.
--
--  2. **Un voto por persona, ANTES de la mediana.** Es el paso que decide si
--     esto sirve para algo: sin él, el atacante reporta diez veces y *es* el
--     consenso, y el modelo queda más manipulable que el anterior, no menos.
--     Se toma el reporte más reciente de cada persona dentro de la ventana.
--
--  3. **Ventana de 21 días, y adentro de la ventana el peso decae con la
--     edad.** Una mediana sobre 45 días en Argentina mezcla dos niveles de
--     precio y devuelve un número que no existió nunca — de ahí la ventana.
--     Pero el corte por ventana solo no alcanza: adentro, un reporte de hoy y
--     uno de hace veinte días valían igual, y entonces tres reportes viejos
--     que coinciden le ganaban a uno de hoy que dice otra cosa. El de hoy es
--     justamente el que más chance tiene de tener razón, porque el precio se
--     movió. Cada voto pesa `0.5 ^ (días / 10)`: hoy vale 1, a los diez días
--     medio, a los veinte un cuarto.
--
--  4. **Con menos de 3 votantes, el más reciente**, que es lo de antes. Una
--     "mediana" de dos reportes es el promedio de dos números, y llamar a eso
--     consenso es precisión falsa.
--
-- La fila sigue siendo una por birra (bar, estilo, marca) y `id` sigue siendo
-- el del reporte más reciente: es lo que mira `isCurrent` en "Mis aportes"
-- para avisar que bajar ESE reporte cambia lo que ve todo el mundo. Con
-- mediana eso ya no es un solo reporte, pero el más reciente sigue siendo el
-- que mueve la edad y el que más chance tiene de mover el número.
--
-- La edad y la frescura NO se tocan: siguen siendo las del reporte más
-- reciente. El consenso decide QUÉ número se muestra, no de cuándo es. Sin
-- esto se rompería la única regla que el proyecto no negocia.

DROP VIEW IF EXISTS v_bar_headline;
DROP VIEW IF EXISTS v_current_prices;

CREATE VIEW v_current_prices AS
WITH latest AS (
    -- Lo que había antes, y que sigue mandando para la edad, el tamaño y la
    -- moneda: el reporte más reciente de cada birra.
    SELECT DISTINCT ON (pr.bar_id, pr.style_id, pr.brand_id)
           pr.id, pr.bar_id, pr.style_id, pr.brand_id,
           pr.price, pr.size_ml, pr.currency, pr.created_at
    FROM price_reports pr
    WHERE pr.status = 'active'
    ORDER BY pr.bar_id, pr.style_id, pr.brand_id, pr.created_at DESC
),
votes AS (
    -- Un voto por persona. `reported_by` puede ser NULL —la cuenta se borró y
    -- el precio queda, que es deliberado— y en ese caso cada fila cuenta como
    -- su propio votante: eran reportes de personas distintas cuando se
    -- cargaron, y juntarlos en uno solo sería inventar un consenso que no
    -- hubo.
    SELECT DISTINCT ON (l.id, COALESCE(pr.reported_by::text, 'anon:' || pr.id))
           l.id AS latest_id,
           pr.price,
           -- Media vida de 10 días. Es LA perilla de esta vista: subirla hace
           -- el precio más estable y más lento para reaccionar a un aumento;
           -- bajarla, al revés. Diez días contra una ventana de 21 da un
           -- rango de 4x entre el voto más nuevo y el más viejo, que alcanza
           -- para que uno de hoy le gane a tres de hace veinte.
           power(0.5, EXTRACT(EPOCH FROM (now() - pr.created_at)) / 86400.0 / 10.0)
               AS weight
    FROM latest l
    JOIN price_reports pr
      ON pr.bar_id = l.bar_id
     AND pr.style_id = l.style_id
     AND pr.brand_id IS NOT DISTINCT FROM l.brand_id
     -- Mismo tamaño y misma moneda, o la mediana mezclaría una pinta con un
     -- litro y devolvería un número que no es el precio de ninguno de los dos.
     AND pr.size_ml = l.size_ml
     AND pr.currency = l.currency
     AND pr.status = 'active'
     AND pr.created_at > now() - interval '21 days'
    ORDER BY l.id, COALESCE(pr.reported_by::text, 'anon:' || pr.id), pr.created_at DESC
),
ranked AS (
    -- Para la mediana ponderada: por cada voto, cuánto peso quedó por debajo
    -- de él ordenando por precio, y cuánto pesa el total.
    SELECT latest_id, price, weight,
           sum(weight) OVER (PARTITION BY latest_id ORDER BY price
                             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running,
           sum(weight) OVER (PARTITION BY latest_id) AS total
    FROM votes
),
consensus AS (
    SELECT latest_id,
           -- La mediana ponderada es el precio más barato cuyo peso acumulado
           -- ya pasó la mitad del total. Como `running` sólo crece con el
           -- precio, las filas que cumplen son exactamente la cola de arriba,
           -- y la más barata de ellas es la que buscamos.
           --
           -- Sale un precio que alguien reportó de verdad, no el promedio de
           -- los dos del medio: el número que se muestra existió.
           min(price) FILTER (WHERE running >= total / 2.0) AS median_price,
           count(*)::int AS voters,
           min(price) AS price_low,
           max(price) AS price_high
    FROM ranked
    GROUP BY latest_id
)
SELECT l.id,
       l.bar_id,
       l.style_id,
       bs.slug        AS style_slug,
       bs.name_es     AS style_name,
       l.brand_id,
       b.slug         AS brand_slug,
       b.name         AS brand_name,
       b.craft        AS brand_craft,
       CASE WHEN c.voters >= 3 THEN c.median_price ELSE l.price END AS price,
       l.size_ml,
       l.currency,
       l.created_at,
       EXTRACT(DAY FROM (now() - l.created_at))::int AS age_days,
       CASE
           WHEN l.created_at > now() - interval '14 days' THEN 'fresh'
           WHEN l.created_at > now() - interval '45 days' THEN 'aging'
           ELSE 'stale'
       END AS freshness,
       -- Cuánta gente hay detrás del número. 1 = nadie lo confirmó todavía.
       COALESCE(c.voters, 1) AS voters,
       -- El desacuerdo, sólo cuando hay consenso de verdad: si los reportes
       -- están dispersos eso ES información, y un número solo sería precisión
       -- falsa. Iguales al precio cuando todos coinciden, y la app no muestra
       -- nada en ese caso.
       CASE WHEN c.voters >= 3 THEN c.price_low END  AS price_low,
       CASE WHEN c.voters >= 3 THEN c.price_high END AS price_high
FROM latest l
JOIN beer_styles bs ON bs.id = l.style_id
LEFT JOIN brands b  ON b.id = l.brand_id
LEFT JOIN consensus c ON c.latest_id = l.id;

-- Idéntica a la anterior: se recrea sólo porque depende de la de arriba.
CREATE VIEW v_bar_headline AS
SELECT bar_id,
       min(price) FILTER (WHERE freshness <> 'stale')     AS from_price,
       min(age_days) FILTER (WHERE freshness <> 'stale')  AS freshest_age_days,
       count(*)                                           AS style_count,
       count(*) FILTER (WHERE freshness = 'stale')        AS stale_count
FROM v_current_prices
GROUP BY bar_id;

-- La ventana de 21 días toca `created_at` en cada consulta de precio. El
-- índice que ya existe es (bar_id, style_id, created_at DESC) parcial por
-- status, que es exactamente el prefijo que usa el JOIN de `votes`.
