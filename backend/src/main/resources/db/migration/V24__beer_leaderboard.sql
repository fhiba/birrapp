-- Índices para la tabla de birras tomadas por zona.
--
-- La consulta recorre `beer_logs` por `bar_id` —qué bares caen en el radio lo
-- resuelve el índice espacial de `bars`— y acota por `drank_at`. El índice que
-- había, `(user_id, drank_at DESC)`, sirve para "mis birras" y no para esto:
-- entrando por el usuario no hay forma de llegar a los bares de una zona sin
-- leer la tabla entera.
--
-- Parcial sobre los que tienen bar porque los otros **no entran en la tabla y
-- punto**: una birra sin bar no se puede ubicar, así que no puede competir en
-- un ranking por cercanía. Eso se avisa en la bienvenida, que es antes de que
-- alguien anote la primera. Sobre 995 bares y una bitácora donde la mayoría de
-- las filas no tiene bar, el índice parcial es una fracción del completo.
CREATE INDEX idx_beer_logs_bar_drank ON beer_logs (bar_id, drank_at DESC)
    WHERE bar_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- El tope diario se aplica al escribir (ver `BeerRepo.log`), pero la tabla
-- tiene que defenderse igual de lo que ya está cargado: el tope es nuevo y las
-- filas viejas no lo pasaron nunca. Por eso la consulta del ranking recorta con
-- `least(sum(qty), 15)` por día en vez de confiar en el dato.
--
-- No va como CHECK: un CHECK mira una fila y el tope es sobre la suma del día,
-- que no se puede expresar así sin un trigger. Un trigger acá sería una segunda
-- fuente de verdad sobre la misma regla, y la primera ya está en Kotlin con el
-- mensaje que la persona necesita leer.
