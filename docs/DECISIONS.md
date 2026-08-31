# Decisiones y por qué

Formato: qué se decidió, por qué, y qué se rechazó. Si el motivo deja de valer,
se puede reevaluar sin arqueología.

## Producto

**El producto es la frescura del precio, no el mapa.**
Los clones de afuera (Beer Me AU, Pint Prices UK) trabajan en monedas donde un
precio de hace seis meses sigue siendo aproximadamente cierto. En pesos no. Un
precio sin edad visible manda a alguien a cruzar la ciudad por un número que
venció. De ahí: append-only, edad siempre en pantalla, stale excluido del
ranking, y confirmar a un tap.

**No se ajusta por inflación (todavía).**
Tentador, pero mostrar un número calculado como si alguien lo hubiera visto es
mentir, y es justo lo que la app existe para no hacer. Se puede revisar más
adelante como señal de *ranking*, nunca como precio mostrado.

**Precio por estilo, no un precio único por bar.**
Decisión del usuario. Cuesta más de cargar, pero es lo que la gente
efectivamente quiere saber. El pin muestra "desde $X" para que el mapa siga
siendo legible de un vistazo.

**Vocabulario de estilos cerrado.**
Texto libre fragmentaría los datos ("IPA" / "ipa" / "India Pale Ale") y rompería
toda comparación. Editable por admin vía API.

## Datos

**Bares desde OpenStreetMap, no Google Places.**
Los términos de Places prohíben guardar datos de lugares más de 30 días (sólo
`place_id` está exento). No se puede construir una base propia con eso. OSM es
ODbL: se guarda, con atribución. Arrancamos con 592 bares reales de CABA en vez
de un mapa vacío.

**El mapa sí es de Google.**
El Maps SDK for Android es gratis e ilimitado. Sólo el *dato* está restringido,
no el renderizado.

## Stack

**Kotlin + Ktor en el backend.**
El usuario pidió "lo que dé más performance". Para esta carga el lenguaje no es
la variable: todos los candidatos resuelven la consulta en milisegundos de un
dígito. Lo que manda es (1) el índice GiST, (2) el tamaño del payload, (3) el
caché en el cliente y (4) **la región de hosting** — São Paulo vs US-East son
~100 ms reales, más que cualquier benchmark de lenguaje. Elegido por desempate:
empata en velocidad y deja el proyecto en un solo lenguaje con la app.

**Sin ORM. JDBC + SQL crudo.**
Flyway ya es dueño del esquema, así que el DDL del ORM no se usa; y las consultas
que importan (`ST_DWithin`, `DISTINCT ON`, `percentile_cont`) van en SQL igual.
Exposed sumaba una dependencia con API en movimiento a cambio de casi nada.
Rechazado también `exposed-postgis` (v0.8, un solo mantenedor).

**Sin Room en la app.**
Room necesita KSP, y KSP va una versión de Kotlin atrás (2.3.x vs 2.4.10), lo que
ataría la versión de Kotlin de todo el proyecto. Y un caché persistente de
precios es contraproducente: mostraría precios viejos sin avisar. Quedó un caché
en memoria de 60 s, sólo para que rotar la pantalla no dispare otra request.

**Sin Hilt.**
Seis objetos sin ciclos. `AppContainer` a mano alcanza.

**Sin material-icons-extended.**
Google la congeló en 1.7.8. Se usan tres iconos del core en su lugar.

## Seguridad

**El ID token de Google no es la sesión.**
Se canjea una vez y el backend emite su propio JWT con el rol adentro. Google no
puede decir "este tipo es moderador" — eso lo decide nuestra base.

**El rol no se toca en el upsert de login.**
Volver a loguear no puede promover ni degradar a nadie. Testeado.

**Los chequeos de rol viven en el servidor.**
La app esconde la UI de moderación, pero esconder no es controlar.

**Refresh tokens hasheados y rotativos.**
Se guarda SHA-256, nunca el token en claro.

**Anti-abuso desde el día uno.**
Una base de precios comunitaria es trivial de envenenar: cooldown de 6 h por
(usuario, bar, estilo), y todo lo que se aleje 3x de la mediana del estilo queda
retenido y va a la cola de moderación en vez de publicarse. La comparación se
normaliza a precio por litro, si no una pinta de 473 ml contra un schop de 330 ml
daría falso positivo siempre.

## Operación

**El backend arranca sin las credenciales de Google.**
Avisa qué falta y deshabilita sólo el login; el mapa público anda igual. Frenar
todo el servidor obligaría a tener las credenciales antes de poder trabajar en
nada.

**Puerto 8090, no 8080.**
El 8080 ya estaba ocupado en esta máquina.

**Postgres en 5433.**
El 5432 ya tiene un Postgres 15 local.

**compileSdk 37.**
Todo el stack de AndroidX actual (Compose 1.12, core 1.19, lifecycle 2.11,
nav 2.10, maps-compose 8.4) lo exige. El paquete del SDK se llama
`platforms;android-37.0`, no `android-37`.
