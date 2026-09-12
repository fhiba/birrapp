-- La app deja de ser sólo de Buenos Aires.
--
-- Hasta acá todo asumía pesos: la columna `currency` de los precios existía
-- desde V1 con default 'ARS' y nadie la leía nunca, y el formato de pantalla
-- tenía "ARS" escrito a mano. Con bares de cualquier parte del mundo, eso deja
-- de ser una simplificación razonable y pasa a ser un número mal etiquetado.

-- ---------- la moneda vive en el bar ----------
--
-- En el bar y no en cada precio, porque es una propiedad del lugar: un bar de
-- Londres cobra en libras, y si cada reporte trajera su moneda, el mismo bar
-- podría terminar con una lista mezclada donde "más barata" no significa nada.
--
-- Sale del país que devuelve Google al elegir el lugar del buscador. Para los
-- cargados a mano sale de la configuración de quien lo carga, que puede
-- cambiarla en el formulario.
--
-- Default 'ARS': los 740 bares que ya están son todos de Buenos Aires. Es el
-- único backfill correcto, y no hay que inventar nada.
ALTER TABLE bars ADD COLUMN currency char(3) NOT NULL DEFAULT 'ARS';

-- El país, en ISO-3166-1 alfa-2. No se usa todavía para nada: se guarda porque
-- viene gratis con el lugar de Google y porque el día que haya que corregir
-- monedas mal inferidas, sin el país no hay forma de saber cuáles revisar.
ALTER TABLE bars ADD COLUMN country_code char(2);

-- Los precios que ya están son todos en pesos, igual que sus bares. La columna
-- ya tenía el default correcto, pero dejarlo explícito acá evita que una fila
-- vieja cargada con otro default quede mal etiquetada.
UPDATE price_reports SET currency = 'ARS' WHERE currency IS NULL;

-- ---------- preferencias de cada persona ----------
--
-- Las tres tienen default y NOT NULL: una preferencia sin valor obliga a que
-- cada pantalla decida qué hacer con el NULL, y ahí es donde los defaults se
-- empiezan a contradecir entre sí.
ALTER TABLE users
    -- Con qué moneda carga precios por defecto. NO es en qué moneda ve: los
    -- precios se muestran siempre en la moneda en que se cargaron. Convertir
    -- necesita cotizaciones en vivo, y una cotización vieja miente igual que
    -- un precio viejo — que es justo lo que esta app existe para no hacer.
    ADD COLUMN currency         char(3) NOT NULL DEFAULT 'ARS',
    -- Tamaño de vaso por defecto al cargar un precio. 473 ml es la pinta de
    -- acá; en el Reino Unido son 568 y en Estados Unidos 473 (16 oz).
    ADD COLUMN default_size_ml  int     NOT NULL DEFAULT 473
        CHECK (default_size_ml BETWEEN 100 AND 2000),
    -- Radio de búsqueda con el que abre la app.
    ADD COLUMN default_radius_m int     NOT NULL DEFAULT 2000
        CHECK (default_radius_m BETWEEN 300 AND 20000);
