-- Búsqueda de bares por nombre, tolerante a tildes.
--
-- Sin unaccent, buscar "martinez" no encuentra "Martínez" — y nadie escribe
-- tildes en un buscador. Es la diferencia entre encontrar el bar y crear un
-- duplicado.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- `unaccent()` es STABLE, no IMMUTABLE, así que Postgres no la acepta dentro
-- de un índice. El envoltorio fija el diccionario y la declara inmutable, que
-- es cierto mientras el diccionario no cambie.
--
-- Todo va calificado con `public.` a propósito. Desde Postgres 16.5 y 17 el
-- CREATE INDEX corre con search_path restringido a `pg_catalog, pg_temp` —fue
-- un parche de seguridad—, así que al inlinear la función no encuentra
-- `unaccent` sin el esquema por delante. Sin esto la migración anda en un
-- Postgres viejo y falla en uno nuevo, que es la peor forma de fallar.
CREATE OR REPLACE FUNCTION bar_search_key(txt text)
RETURNS text AS $$
    SELECT lower(public.unaccent('public.unaccent'::regdictionary, txt));
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

CREATE INDEX idx_bars_name_search ON bars
    USING GIN (bar_search_key(name) public.gin_trgm_ops);
