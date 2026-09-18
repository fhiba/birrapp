-- La bienvenida de una cuenta nueva.
--
-- ## Por qué una columna y no `localStorage`
--
-- Hasta acá "¿ya vio la bienvenida?" se guardaba en el navegador. Alcanzaba
-- cuando la pantalla ofrecía sólo birras favoritas: volver a ofrecerlas en otra
-- computadora no rompe nada. Ahora la bienvenida también decide el nombre
-- público y la foto, que son datos de la persona y no de esta instalación, así
-- que la marca tiene que viajar con la cuenta. Si no, entrar desde otro
-- teléfono te vuelve a pedir lo que ya elegiste.
ALTER TABLE users ADD COLUMN onboarded_at timestamptz;

-- Los que ya están quedan marcados como si la hubieran hecho.
--
-- No es un detalle: `onboarded_at IS NULL` es lo que de acá en más significa
-- "cuenta recién creada", y de eso cuelga el alias automático de abajo. Sin
-- este relleno, la próxima vez que entre cualquiera de los que ya usan la app
-- se le asignaría un alias derivado de su nombre de Google — que es
-- exactamente la publicación silenciosa que V20 decidió no hacer.
UPDATE users SET onboarded_at = now();
