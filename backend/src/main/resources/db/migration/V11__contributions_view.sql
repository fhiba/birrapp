-- Todos los aportes en una sola definición.
--
-- Hasta acá la unión de los cuatro tipos estaba escrita a mano y repetida en
-- recentUsers() y en dashboardSummary(), con criterios que había que mantener
-- sincronizados: qué cuenta como activo, si la nota va por created_at o por
-- updated_at. Cada métrica nueva multiplicaba el problema.
--
-- La nota va por updated_at y no por created_at a propósito: se pisa al
-- corregirla, así que la fecha que dice cuándo la persona hizo algo es la de
-- la última edición. Es el criterio que ya usaba recentUsers().

CREATE VIEW v_contributions AS
SELECT reported_by AS user_id,
       CASE WHEN is_confirmation THEN 'confirmation' ELSE 'price' END AS kind,
       created_at AS at
  FROM price_reports
 WHERE status = 'active' AND reported_by IS NOT NULL
UNION ALL
SELECT created_by, 'bar', created_at
  FROM bars
 WHERE created_by IS NOT NULL
UNION ALL
SELECT user_id, 'photo', created_at
  FROM bar_photos
 WHERE status = 'active' AND user_id IS NOT NULL
UNION ALL
SELECT user_id, 'rating', updated_at
  FROM beer_ratings
 WHERE status = 'active';
