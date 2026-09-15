-- Alias público y el bar de cada aporte (BIR-9).
--
-- ## Por qué hace falta un alias antes de la página
--
-- `display_name` viene de Google y muy seguido es el nombre y apellido reales.
-- Publicar una tabla con esos nombres no es una feature de interfaz, es un
-- cambio de privacidad: alguien que cargó un precio para que la app funcione
-- no aceptó aparecer en una lista pública con su nombre completo.
--
-- Por eso el alias es **opt-in y sin default**. Sin alias no se aparece en la
-- página, y punto. La alternativa —sembrarlo con el nombre de pila de cada
-- uno— publica a todos y después les avisa, que es el orden equivocado.
--
-- La contra conocida: al principio la tabla va a estar casi vacía. Se prefiere
-- una tabla vacía a una tabla con gente que no pidió estar.
ALTER TABLE users ADD COLUMN alias text;

-- Único sin distinguir mayúsculas: dos "Cervecero" y "cervecero" en la misma
-- tabla pública son dos personas que parecen una.
CREATE UNIQUE INDEX idx_users_alias ON users (lower(alias)) WHERE alias IS NOT NULL;

-- ---------------------------------------------------------------------------
-- `v_contributions` gana el bar.
--
-- El ranking necesita poder toparse: sin el bar no hay forma de distinguir
-- veinte precios en veinte bares de veinte precios en el mismo bar el mismo
-- día, y la segunda es exactamente la forma de inflar el número que la página
-- no puede premiar.
--
-- `CREATE OR REPLACE` con la columna al final: es lo único que Postgres deja
-- agregar sin dropear, y dropear obligaría a recrear lo que cuelga arriba.
CREATE OR REPLACE VIEW v_contributions AS
 SELECT price_reports.reported_by AS user_id,
        CASE
            WHEN price_reports.is_confirmation THEN 'confirmation'::text
            ELSE 'price'::text
        END AS kind,
    price_reports.created_at AS at,
    price_reports.bar_id
   FROM price_reports
  WHERE price_reports.status = 'active'::content_status
    AND price_reports.reported_by IS NOT NULL
UNION ALL
 SELECT bars.created_by AS user_id,
    'bar'::text AS kind,
    bars.created_at AS at,
    bars.id AS bar_id
   FROM bars
  WHERE bars.created_by IS NOT NULL
UNION ALL
 SELECT bar_photos.user_id,
    'photo'::text AS kind,
    bar_photos.created_at AS at,
    bar_photos.bar_id
   FROM bar_photos
  WHERE bar_photos.status = 'active'::content_status AND bar_photos.user_id IS NOT NULL
UNION ALL
 SELECT beer_ratings.user_id,
    'rating'::text AS kind,
    beer_ratings.updated_at AS at,
    beer_ratings.bar_id
   FROM beer_ratings
  WHERE beer_ratings.status = 'active'::content_status;
