-- Foto de perfil propia.
--
-- Hasta acá `avatar_url` era siempre la de Google y se refrescaba en cada
-- login. Dos columnas nuevas en vez de una sola porque hay que poder volver
-- atrás: si alguien sube una foto y después la borra, tiene que recuperar la
-- de Google, no quedarse sin nada.
--
--   * `avatar_key`        — el objeto en el bucket, null si nunca subió una.
--                            Es también lo que hay que borrar al sacarla.
--   * `google_avatar_url` — la de Google, guardada aparte para poder volver.
--
-- `avatar_url` se queda como está y sigue siendo "la foto que se muestra". Así
-- nada de lo que ya la lee —el perfil, el dashboard— tiene que cambiar: la
-- decisión de cuál gana se toma al escribir y no en cada lectura.
ALTER TABLE users ADD COLUMN avatar_key        text;
ALTER TABLE users ADD COLUMN google_avatar_url text;

-- Lo que hay hoy vino todo de Google.
UPDATE users SET google_avatar_url = avatar_url;
