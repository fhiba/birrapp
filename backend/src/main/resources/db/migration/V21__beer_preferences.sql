-- Las birras favoritas de cada uno.
--
-- Para qué: la ficha de un bar mostraba TODOS los estilos en una fila que
-- scrollea, y con seis o siete birras había que arrastrar a la derecha para
-- descubrir que existían. Ahora se muestran tres y el resto vive detrás de un
-- "⋯". Elegir cuáles son esos tres es el problema que esto resuelve: si sabemos
-- qué le gusta a la persona, los tres de adelante son los que iba a buscar.
--
-- Arrays y no dos tablas de relación. Son como mucho un puñado de slugs por
-- persona, se leen siempre enteros y junto con el resto del usuario, y no hay
-- una sola consulta que quiera cruzarlos ni contarlos por estilo. Dos tablas
-- serían dos joins en cada lectura de perfil para guardar seis palabras.
--
-- Se guardan slugs y no ids por lo mismo que los slugs viajan en toda la API:
-- son estables, legibles en un dump y no obligan a resolver nada para
-- entenderlos. Un estilo que se borre deja un slug muerto en la lista, y eso
-- se filtra al leer — es más barato que un FK sobre un array.
ALTER TABLE users
    ADD COLUMN favorite_styles text[] NOT NULL DEFAULT '{}',
    ADD COLUMN favorite_brands text[] NOT NULL DEFAULT '{}';
