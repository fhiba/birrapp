-- Cuántos miran, para poder compararlo con cuántos aportan.
--
-- El embudo del dashboard arrancaba en "cuentas" y por eso escondía la caída
-- más grande: de los que entran, cuántos se anotan. Esto es el escalón cero.
--
-- Deliberadamente NO se guarda: ni IP, ni user agent, ni una fila por request.
-- Sólo un identificador aleatorio que genera el cliente (crypto.randomUUID en
-- localStorage) y una fila por día. No identifica a nadie y el usuario lo borra
-- limpiando los datos del sitio; el hash de IP se evitó porque en criterio
-- europeo sigue siendo dato personal.
--
-- Hay que declarar esta recolección en BIR-15 (política de privacidad) y
-- BIR-16 (Data Safety / nutrition labels) antes de publicar en las tiendas.
--
-- client_id es uuid y no text: el tipo rechaza basura sin validarla a mano, y
-- el endpoint que escribe acá es público.
CREATE TABLE traffic_sessions (
    day       date    NOT NULL,
    client_id uuid    NOT NULL,
    authed    boolean NOT NULL DEFAULT false,
    PRIMARY KEY (day, client_id)
);

-- La consulta de la serie filtra por rango de día y agrupa por día.
CREATE INDEX idx_traffic_day ON traffic_sessions (day);
