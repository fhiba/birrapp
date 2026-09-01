# SETUP — lo que falta de tu lado

Todo lo demás ya está construido y funciona. Esto es lo único que necesita
que entres a una consola web, porque no se puede automatizar.

## 0. Datos que ya te dejo calculados

**Package name:** `com.birrapp`

**SHA-1 del debug keystore** (`~/.android/debug.keystore`, ya generado):

```
B1:34:0A:7D:A4:6A:47:7E:4B:30:3D:73:C4:4A:35:B0:50:DE:3D:83
```

Para regenerarlo si hiciera falta:
```bash
keytool -list -v -keystore ~/.android/debug.keystore \
        -alias androiddebugkey -storepass android | grep SHA1
```

> Ojo: este SHA-1 es sólo el de **debug**. Cuando publiquemos en Play va a
> haber otro (el de release / Play App Signing) y hay que agregarlo también,
> o el login y el mapa funcionan en tu build local y fallan en producción.

---

## 1. Proyecto en Google Cloud

https://console.cloud.google.com/ → nuevo proyecto, `birrapp`.

## 2. Habilitar el Maps SDK

APIs & Services → Library → **Maps SDK for Android** → Enable.

Es gratis e ilimitado para mapas en móvil, pero **igual hay que tener
billing habilitado en el proyecto** o las tiles vuelven en gris.
Habilitá también **Places API (New)** — no la vieja "Places API", que es
otra: el SDK usa la nueva. Sirve para buscar bares que no están en
OpenStreetMap y para validar que existen.

De Places sólo guardamos el `place_id`, que es lo único que sus términos
permiten almacenar de forma permanente.

## 3. API key del mapa

APIs & Services → Credentials → Create credentials → **API key**.

Restringirla, si no queda abierta a cualquiera:
- *Application restrictions* → **Android apps** → agregar
  package `com.birrapp` + el SHA-1 de arriba.
- *API restrictions* → **Maps SDK for Android** y **Places API (New)**.

> Ojo: si la key quedó restringida sólo a "Maps SDK for Android", habilitar
> Places en el proyecto no alcanza — la key igual rechaza las llamadas.
> Hay que agregar Places a la lista de APIs permitidas de esa misma key.

Pegar en `app/local.properties` (gitignoreado):
```properties
MAPS_API_KEY=AIza...
```

## 4. Clientes OAuth

APIs & Services → OAuth consent screen primero (External, completar nombre
de la app y mail de soporte). Después Credentials → Create credentials →
**OAuth client ID**, dos veces:

**a) Android**
- Package name: `com.birrapp`
- SHA-1: el de arriba
- No hay que copiar su client ID a ningún lado. Sólo tiene que existir:
  es lo que autoriza a *este* APK a pedir tokens.

**b) Web application**
- Sin redirect URIs.
- **Este client ID sí hay que copiarlo, en dos lugares:**

```properties
# app/local.properties
GOOGLE_WEB_CLIENT_ID=123...apps.googleusercontent.com
```
```bash
# backend/.env
GOOGLE_WEB_CLIENT_ID=123...apps.googleusercontent.com
```

Tiene que ser **el mismo string en los dos**. La app lo manda como
`serverClientId` al pedir el ID token, y el backend verifica que el
campo `aud` del token coincida. Si no coinciden, el login falla con
401 y el mensaje va a decir exactamente eso.

## 5. Secreto de JWT

Nada que ver con Google — es para firmar los tokens propios de birrapp:

```bash
cd backend && cp ../.env.example .env
echo "JWT_SECRET=$(openssl rand -base64 48)" >> .env
```

## 6. El teléfono

Ajustes → Acerca del teléfono → tocar *Número de compilación* 7 veces →
Opciones de desarrollador → **Depuración por USB**.

```bash
export ANDROID_HOME=$HOME/Android/Sdk
$ANDROID_HOME/platform-tools/adb devices   # tiene que aparecer como "device", no "unauthorized"
cd app && ./gradlew installDebug
```

---

## Chequeo

```bash
cd backend && ./gradlew run
```

Al arrancar valida la config y si falta algo te lo dice por nombre en vez
de fallar más adelante con algo críptico. Con todo cargado:

- Mapa con tiles (no gris) → paso 3 OK
- "Continuar con Google" y volvés logueado → paso 4 OK
- Si el mapa carga pero el login tira 401 → el Web client ID no coincide
  entre `local.properties` y `.env`
