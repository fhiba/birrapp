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

### 4. Canal de soporte
A resolver. Lo más barato es un mail o un formulario que caiga en la cola de
moderación. **Ojo que Apple y Google exigen un medio de contacto publicado**
para apps con contenido de usuarios, así que esto no es opcional si se quiere
publicar.

## Deuda técnica detectada

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
- [ ] Medio de contacto publicado (ver punto 4)
- [ ] Bloqueo entre usuarios
- [ ] En iOS: Sign in with Apple, obligatorio si se ofrece login de Google
