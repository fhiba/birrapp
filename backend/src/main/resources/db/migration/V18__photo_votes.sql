-- Un pulgar por foto (BIR-10).
--
-- La presencia de la fila ES el voto. Una columna `value` abriría la puerta al
-- pulgar abajo, que nadie pidió: las fotos las saca la misma gente que carga
-- los precios, y un mecanismo para castigarlas desalienta justo lo que la app
-- necesita que pase más seguido.
--
-- Sin `status`, a diferencia de todo el resto del contenido: retirar el pulgar
-- borra la fila. Un voto no es contenido que haya que moderar —moderar la foto
-- se la lleva con CASCADE— y una fila `removed` sólo le agregaría un WHERE a
-- cada conteo.
CREATE TABLE photo_votes (
    photo_id   bigint      NOT NULL REFERENCES bar_photos (id) ON DELETE CASCADE,
    user_id    bigint      NOT NULL REFERENCES users (id)      ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Una sola por persona y por foto. El botón es un interruptor: dos toques
    -- no pueden dejar dos votos.
    PRIMARY KEY (photo_id, user_id)
);

-- La PK ya indexa (photo_id, user_id), que es el prefijo que usan el conteo
-- por foto y la foto del mes. El índice por user_id no: hace falta para que
-- borrar una cuenta no escanee la tabla entera.
CREATE INDEX idx_photo_votes_user ON photo_votes (user_id);
