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

A decidir: ¿un solo rating o dos (birra / lugar)? Y cómo se combinan. Un
promedio simple mezcla "la IPA estaba caliente" con "el baño estaba sucio".

### 3. Favoritos
Marcar bares para que aparezcan destacados.

A decidir: ¿sólo local en el dispositivo, o sincronizado con la cuenta? Local
es gratis y no necesita login; sincronizado necesita tabla y endpoint pero
sobrevive al cambio de teléfono.

### 4. Canal de soporte
A resolver. Lo más barato es un mail o un formulario que caiga en la cola de
moderación. **Ojo que Apple y Google exigen un medio de contacto publicado**
para apps con contenido de usuarios, así que esto no es opcional si se quiere
publicar.

### 5. Frontend web / PWA
Replicar el frontend como web app para llegar a iOS sin App Store.
El backend sirve tal cual y el login por navegador ya está hecho.
A definir con el usuario: alcance y stack (quedó una frase cortada en la
conversación del 2026-09-01).

## Deuda técnica detectada

### Vincular los bares de OSM con su place_id de Google
Los ~738 bares que vinieron de OpenStreetMap no tienen `google_place_id`. La
deduplicación exacta al cargar un bar sólo funciona cuando ambos lo tienen, así
que hoy alguien puede agregar desde Google un bar que ya está cargado desde OSM
y crear un duplicado. Se detectó con "Venice Bar Acassuso".

Haría falta un proceso que busque cada bar de OSM en Places y guarde el ID.
Tiene costo por llamada, así que conviene correrlo una vez y no en vivo.

### PWA para iOS
Ver la conversación del 2026-09-01: el backend y el login por navegador ya
sirven tal cual para una web app. Evitaría los US$99/año y el requisito de
tener una Mac.

## Hecho

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
