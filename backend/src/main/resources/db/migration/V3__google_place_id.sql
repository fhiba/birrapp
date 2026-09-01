-- Vínculo con la ficha de Google Maps.
--
-- Por qué sólo el place_id y nada más: los términos de Places prohíben
-- guardar contenido de lugares (nombre, dirección, coordenadas) más de 30
-- días. El `place_id` está explícitamente exento y se puede guardar
-- indefinidamente. Así que el ID es nuestro ancla permanente, mientras que
-- el nombre y la ubicación que guardamos son los que confirma el usuario.
--
-- Para qué sirve:
--  1. Deduplicar: dos usuarios que cargan el mismo bar traen el mismo ID.
--  2. Validar: si el lugar existe en Google, no es un bar inventado.
--  3. Enlazar: se puede abrir la ficha real sin guardar su contenido.
ALTER TABLE bars ADD COLUMN google_place_id text;

CREATE UNIQUE INDEX idx_bars_place_id ON bars (google_place_id)
    WHERE google_place_id IS NOT NULL;

-- Un bar validado contra Google salta la cola de moderación: el riesgo que
-- la moderación cubre es que alguien invente un lugar, y eso ya está resuelto.
COMMENT ON COLUMN bars.google_place_id IS
    'Place ID de Google Maps. Exento de las restricciones de caché de Places.';
