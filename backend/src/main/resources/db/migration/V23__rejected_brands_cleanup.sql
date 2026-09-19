-- Rechazar una marca dejaba el contenido que la usaba a la vista.
--
-- El rechazo escribía `brands.status = 'rejected'` y nada más. Eso la saca de
-- la lista que se ofrece al cargar un precio —la única consulta que mira el
-- status— y de ningún otro lado: la ficha del bar, "Mis aportes", las fotos,
-- los votos y los comentarios hacen `LEFT JOIN brands` sin condición, así que
-- la marca rechazada seguía apareciendo con nombre y todo. Desde el lado del
-- moderador el botón no hacía nada visible.
--
-- `PriceRepo.setBrandStatus` ahora baja ese contenido a 'removed' al rechazar.
-- Esto es lo mismo para las marcas que ya estaban rechazadas antes del arreglo:
-- sin esto habría que volver a rechazarlas una por una para que se note.
--
-- 'removed' y no DELETE: es el mismo estado en el que espera un precio atípico
-- —registrado, invisible, reversible— y el histórico de precios es el activo
-- más valioso del proyecto. `removed_by` queda NULL: no hay forma de saber
-- ahora quién apretó el botón entonces.
UPDATE price_reports SET status = 'removed'
 WHERE status = 'active'
   AND brand_id IN (SELECT id FROM brands WHERE status = 'rejected');

UPDATE bar_photos SET status = 'removed'
 WHERE status = 'active'
   AND brand_id IN (SELECT id FROM brands WHERE status = 'rejected');

UPDATE beer_ratings SET status = 'removed'
 WHERE status = 'active'
   AND brand_id IN (SELECT id FROM brands WHERE status = 'rejected');

UPDATE beer_comments SET status = 'removed'
 WHERE status = 'active'
   AND brand_id IN (SELECT id FROM brands WHERE status = 'rejected');

-- El contador propio de cada uno es la excepción: privado, sin status, y nadie
-- dejó de tomarse la birra porque la marca fuera basura. Se le saca la marca y
-- queda como birra sin marca, que es un estado previsto.
UPDATE beer_logs SET brand_id = NULL
 WHERE brand_id IN (SELECT id FROM brands WHERE status = 'rejected');
