# Backlog

Ideas acordadas, sin fecha. Cada una con lo que hay que decidir antes de
empezar — para no llegar a la mitad y descubrir el problema difícil.

## Producto

### 1. Marca de la cerveza / si es artesanal
Hoy el precio se carga por *estilo* (IPA, Rubia). Falta la marca y si es
industrial o artesanal.

A decidir: ¿marca como texto libre o vocabulario controlado? Texto libre
fragmenta los datos igual que pasaría con los estilos ("Quilmes" / "quilmes" /
"Qulimes") y rompe la comparación. Probablemente convenga una lista curada de
las marcas comunes más un "otra" que caiga en moderación.

Ojo: sumar campos alarga la carga de precio, que hoy son dos taps. Conviene
que marca y artesanal sean opcionales, no obligatorios.

### 2. Rating de la cerveza, ligado al del bar
Idea clave del usuario: **esto es todo cerveza tirada**, así que si te la
tiran mal, el problema es el bar, no la marca. El rating de la birra es en
buena medida un rating del bar.

**Decidido (2026-09-01): se ratea por `(bar, estilo)`**, la misma clave que ya
usa el precio, y la nota del bar sale como agregado de sus birras.

Por qué esa clave y no la marca: es la observación de arriba llevada hasta el
final. Si es todo tirada, la misma IPA no es la misma birra en dos bares — una
nota global por marca borra justo lo que distingue. Además es la unidad que el
usuario ya está tocando: ratear queda a un tap de reportar el precio, en la
pantalla donde ya está, y nadie tiene que puntuar dos veces. Cuando llegue la
marca (punto 1), la clave se extiende a `(bar, marca, estilo)` con marca
nullable, sin invalidar lo cargado.

Consecuencias, todas a resolver **antes** de la primera línea de código:

- **`reviews` pierde su número.** Hoy es rating 1-5 + texto por bar, con
  `UNIQUE (bar_id, user_id)`. Si la nota pasa a la birra, `reviews` queda como
  comentario del lugar sin nota propia. Hay **0 filas** cargadas: hacerlo ahora
  es una migración, hacerlo con datos encima es otra cosa.
- **Promedio simple no alcanza.** Un 5,0 con un voto y un 4,2 con treinta se
  ven igual y no valen lo mismo. Va promedio bayesiano con shrinkage hacia la
  media global, o un mínimo de votos antes de mostrar nota.
- **La regla que no se negocia aplica igual.** Una nota sin antigüedad es una
  nota falsa, por lo mismo que un precio sin antigüedad: un 5 de hace dos años
  sobre una birra que el bar ya no tira igual miente. Edad al lado, o
  ponderación por recencia, o las dos.
- **El voto se pisa, no se acumula.** Los precios son append-only porque el
  historial *es* el dato; un rating viejo del mismo usuario no sirve para nada.
  UPSERT sobre `UNIQUE (bar_id, style_id, user_id)`.

**Forma de la pantalla, decidida con el usuario (2026-09-01):**

- El **mapa no cambia**: sigue mostrando sólo precios. La nota no compite con
  el precio por el mismo pin.
- El **detalle del bar** abre con el promedio general arriba.
- **Al lado de cada birra cargada, su nota propia** en cinco estrellas. Color
  distinto según la hayas rateado vos o no — así se ve de un vistazo dónde
  falta tu voto sin tener que abrir nada.
- **A la derecha de las estrellas, un ícono de comentario** que abre un modal
  con los comentarios de *esa* birra. Los comentarios no están nunca a la
  vista por defecto: el contenido de la pantalla es el precio y la nota, no el
  texto.

**Ratear obliga a actualizar el precio.** Es el mejor gancho del diseño:
convierte cada voto en una confirmación de precio, que es justo el gesto que
hoy nadie hace por sí solo. La estructura ya existe — `is_confirmation` en
`price_reports`, y "Sigue igual" cuesta un tap.

Cuidado al implementarlo: el rating es UPSERT (uno por usuario y birra) pero el
precio es append-only, así que re-ratear agrega otra fila de confirmación.
Es lo deseable, pero abre la puerta a inflar la frescura votando en loop.
Necesita límite de tasa por usuario, no sólo por IP.

Queda abierto: si la nota del bar se muestra sola (agregando todas sus birras)
o siempre desglosada por estilo.

### 3. Favoritos
Marcar bares para que aparezcan destacados, y **filtrar la lista por
favoritos**.

**Decidido (2026-09-01): sincronizado con la cuenta, no local.** El argumento
de "local no necesita login" no aplica acá: *todo* aporte ya exige sesión
(`Routes.kt`, bloque `authenticate("jwt")`), así que no se agrega fricción
nueva. Y unos favoritos que no sobreviven al cambio de teléfono pierden la
mitad de su valor.

Forma: tabla `favorites (user_id, bar_id, created_at)` con clave primaria
compuesta. El filtro de la lista es un JOIN, no un campo más en `bars`.

### 4. Fotos de la birra
Que la gente suba una foto de lo que se tomó.

**Dónde, decidido (2026-09-01): Cloudflare R2**, no la infra actual ni S3.

- Neon son 0,5 GB y es una base: los blobs le comen la cuota (~2.500 fotos) e
  inflan cada backup y cada dump.
- El filesystem de Railway es efímero, se borra en cada deploy.
- S3 tiene la capa gratis limitada en el tiempo y **cobra egress**. Una foto se
  sirve muchas más veces de las que se sube, así que el costo que importa no es
  guardar sino servir.
- R2 son 10 GB gratis, API compatible con S3 y **egress gratis sin tope**: un
  bar que se vuelve viral no genera factura. Backblaze B2 es equivalente.

Los números no son el problema: una foto a 1280px en WebP q80 pesa ~200 KB, así
que 740 bares × 5 fotos son ~740 MB y en 10 GB entran ~50.000 fotos.

Las dos decisiones que importan más que el proveedor:

1. **Las fotos no pasan por el backend.** El servidor firma una URL de subida
   y el navegador sube directo al bucket. Si los bytes atraviesan Railway se
   paga el ancho de banda dos veces y se le pone carga de CPU a un contenedor
   que hoy resuelve consultas en milisegundos.
2. **Redimensionar en el cliente antes de subir.** Una foto de teléfono son
   3-5 MB y a 1280px son 200 KB. Y re-encodear en un canvas **borra el EXIF**,
   que trae las coordenadas GPS de dónde se sacó: subir el original publica la
   ubicación de los usuarios.

A decidir antes de empezar: moderación. `flag_target` hoy es
`('bar', 'price', 'review')` y hace falta sumar las fotos. Una foto denunciada
tiene que dejar de servirse de inmediato, no en la próxima pasada de un
moderador — y son fotos sacadas dentro de bares, así que va a haber gente en
ellas.

### 5. Canal de soporte
A resolver. Lo más barato es un mail o un formulario que caiga en la cola de
moderación. **Ojo que Apple y Google exigen un medio de contacto publicado**
para apps con contenido de usuarios, así que esto no es opcional si se quiere
publicar.

### 6. Precio por consenso, no por último reporte
Hoy `v_current_prices` hace `DISTINCT ON` ordenado por fecha: **el último que
reporta gana**, aunque sea uno solo contra veinte. Alcanza con que alguien
cargue un valor falso para que ese sea *el* precio del bar.

Idea del usuario (2026-09-01): usar los reportes como votos. Sale casi gratis
en la base — `PriceRepo.confirm` ya inserta una fila completa con el valor
actual y `is_confirmation = true`, así que cada "Sigue igual" **ya es un voto
por un número**. Sólo cambia cómo se lee, no cómo se guarda.

Cómo hacerlo, si se hace:

- **Mediana, no promedio.** Un valor absurdo entre cinco honestos no mueve la
  mediana; al promedio lo arrastra.
- **Deduplicar por usuario ANTES de la mediana.** Es lo que decide si esto
  sirve: sin ese paso, el atacante reporta diez veces y *es* el consenso, y el
  modelo queda más manipulable que el actual, no menos. Se toma el reporte más
  reciente de cada usuario dentro de la ventana y sobre eso va la mediana.
- **Ventana corta, ~21 días.** Una mediana sobre 45 días en Argentina mezcla
  dos niveles de precio y devuelve un número que no existió nunca. Con menos de
  3 usuarios distintos, caer al reporte más reciente como hoy.
- **Mostrar el desacuerdo.** Si los reportes están muy dispersos, eso *es*
  información; un número solo es precisión falsa.

Efecto lateral bueno: las confirmaciones pasan a valer más, no menos. Hoy sólo
rejuvenecen la fecha; con consenso son peso detrás de un valor.

Ojo con `AGENTS.md`: tocar `v_current_prices` obliga a correr `FreshnessTest` y
`PriceReportTest`. Y hay que revisar `v_bar_headline`, que se construye encima.

## Deuda técnica detectada

### Un voto moderado se revive re-votando
`RatingRepo.upsert` hace `ON CONFLICT ... SET status = 'active'`, con el
argumento de que editar un voto es contenido nuevo y no el que se moderó. El
costo: si un moderador baja un comentario abusivo, su autor lo vuelve a mandar
y queda publicado otra vez. Para precios pasa lo mismo y se convive con eso,
pero un comentario de texto libre es un vector bastante peor.

Salidas posibles: no revivir si lo bajó un moderador (hace falta guardar quién
lo bajó, hoy no se guarda), o apoyarse en `users.banned_at`, que ya existe.

### `/bars` no tiene límite de tasa
Cualquiera se baja la base entera con un `curl`. Mientras el backend vivía
detrás del Funnel en una máquina propia era teórico; con la API pública en
Railway es real. Si el plan incluye vender datos agregados, esto va primero.

### Vincular los bares de OSM con su place_id de Google
Los ~738 bares que vinieron de OpenStreetMap no tienen `google_place_id`. La
deduplicación exacta al cargar un bar sólo funciona cuando ambos lo tienen, así
que hoy alguien puede agregar desde Google un bar que ya está cargado desde OSM
y crear un duplicado. Se detectó con "Venice Bar Acassuso".

Haría falta un proceso que busque cada bar de OSM en Places y guarde el ID.
Tiene costo por llamada, así que conviene correrlo una vez y no en vivo.

## Hecho

- **Frontend web / PWA** — React + Vite, desplegada en Vercel (2026-09-01).
  Llega a iOS sin App Store: sin los US$99/año ni el requisito de una Mac. El
  backend se reusó tal cual y el login por navegador ya estaba hecho.
- **Deploy fuera de la máquina propia** — Neon (PostGIS) + Railway + Vercel.
  Las trampas, en docs/DEPLOY.md.
- Historial de precios por bar y estilo (sale gratis del modelo append-only)
- Cualquiera puede reportar un precio mal cargado, no sólo moderadores
- Layout de escritorio acotado
- Favicon

## Requisitos para publicar (bloqueantes)

- [x] Borrado de cuenta dentro de la app — hecho en 0.2.0
- [ ] Política de privacidad publicada
- [ ] Declaración de datos (Data Safety en Play, nutrition labels en Apple)
- [ ] Medio de contacto publicado (ver punto 5)
- [ ] Bloqueo entre usuarios
- [ ] En iOS: Sign in with Apple, obligatorio si se ofrece login de Google
