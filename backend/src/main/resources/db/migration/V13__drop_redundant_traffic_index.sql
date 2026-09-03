-- El idx_traffic_day que creó V12 sobra: la clave primaria (day, client_id) ya
-- es un btree con day como primera columna, así que un índice sólo sobre (day)
-- es un prefijo estricto de uno que ya existe y el planner usa igual. Lo único
-- que agregaba era costo de escritura en cada beacon. Se dropea acá y no
-- editando V12 porque Flyway valida el checksum de las migraciones ya aplicadas.
DROP INDEX IF EXISTS idx_traffic_day;
