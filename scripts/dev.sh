#!/bin/sh
#
# Levanta la rama actual entera en esta máquina, para probarla antes de
# mergearla.
#
# Reemplaza al deploy a `dev`: probar en un despliegue tiene un ciclo de
# minutos y expone los errores a quien esté usando la app en ese momento —así
# nos enteramos de que la 0.6.9 estaba rota. Acá el ciclo es de segundos.
#
# Qué levanta, y por qué así:
#
# - **Backend en 8091, no en 8090.** El 8090 lo tiene el jar de
#   `birrapp-deploy`, que es al que le apunta el Funnel y, por lo tanto, los
#   teléfonos con el APK. No se lo toca: si algo sale mal, volver es apagar
#   esto y nada más.
# - **Base `birrapp_dev`, no `birrapp`.** Copia de los bares, estilos, marcas y
#   precios reales, sin usuarios y con el autor de cada precio en NULL. Probar
#   no puede romper datos de nadie, y las migraciones nuevas se estrenan acá.
#   El seed va aparte: `scripts/dev_seed.sh`.
# - **El Funnel se da vuelta a 8091 mientras corre**, y vuelve a 8090 al
#   salir. Hace falta para el login: el redirect de Google está registrado
#   contra `debiansl.tail7fb17e.ts.net`, así que el callback tiene que llegar
#   a este backend y no al otro. **Mientras tanto los teléfonos pegan contra
#   esta rama** — es la contra de este método, y por eso el script restaura el
#   Funnel aunque se lo mate con Ctrl-C.
#
#   Con `DEV_FUNNEL=0` no se toca el Funnel; sirve para probar cualquier cosa
#   que no necesite iniciar sesión.
#
# Uso:  scripts/dev.sh        (Ctrl-C para bajar todo)

set -e

PORT=${DEV_PORT:-8091}
WEB_PORT=${DEV_WEB_PORT:-5173}
LIVE_PORT=${DEV_LIVE_PORT:-8090}      # el jar de siempre, el que se restaura
DB=${DEV_DB:-birrapp_dev}
FUNNEL=${DEV_FUNNEL:-1}

ROOT=$(git rev-parse --show-toplevel)
# El checkout principal: en un worktree, `--git-common-dir` apunta al .git de
# verdad. Los .env están gitignoreados, así que viven sólo ahí.
MAIN=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
cd "$ROOT"

say() { printf '\033[33m▸\033[0m %s\n' "$1"; }

# ---------- 1. base ----------
docker start birrapp-db >/dev/null 2>&1 || true
until docker exec birrapp-db pg_isready -U birrapp -d "$DB" >/dev/null 2>&1; do
  sleep 1
done
say "base $DB lista (puerto 5433)"

# ---------- 2. los .env del checkout principal ----------
# Symlink y no copia: si Felipe cambia una credencial, no hay que acordarse de
# sincronizar cada worktree.
[ -e backend/.env ]   || ln -s "$MAIN/backend/.env" backend/.env
[ -e web/.env.local ] || ln -s "$MAIN/web/.env.local" web/.env.local
[ -d web/node_modules ] || (cd web && npm install --silent)

# ---------- 3. backend ----------
# Todo por variable de entorno: `Config.load` les da prioridad sobre el .env,
# así que el archivo del checkout principal queda intacto.
#
# PUBLIC_BASE_URL se hereda del .env a propósito: es el dominio del Funnel, que
# es contra el que está registrado el redirect de Google.
say "compilando y levantando el backend en $PORT…"
DATABASE_URL="jdbc:postgresql://localhost:5433/$DB" \
PORT="$PORT" \
BIND_HOST=127.0.0.1 \
WEB_APP_URL="http://localhost:$WEB_PORT/app" \
ALLOWED_ORIGINS="http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT" \
  backend/gradlew -p backend run --quiet >/tmp/birrapp-dev-backend.log 2>&1 &
BACKEND=$!

# ---------- limpieza, pase lo que pase ----------
cleanup() {
  trap - INT TERM EXIT
  echo
  [ "$FUNNEL" = "1" ] && {
    say "devolviendo el Funnel a $LIVE_PORT"
    tailscale funnel --bg "$LIVE_PORT" >/dev/null 2>&1 || \
      printf '\033[31m!\033[0m No se pudo restaurar el Funnel. Correr a mano: tailscale funnel --bg %s\n' "$LIVE_PORT"
  }
  kill $BACKEND $VITE 2>/dev/null || true
  # Gradle y npx dejan hijos que sobreviven al padre: matar el pid del wrapper
  # baja el wrapper y deja el java —o el node de vite— corriendo, y el próximo
  # arranque choca con el puerto ocupado. Se los busca por lo que son.
  #
  # El patrón del backend lleva el path de este worktree adelante: sin eso, un
  # `pkill` acá se lleva puesto el backend de otro agente trabajando en otra
  # rama, que es de las cosas más difíciles de diagnosticar que hay.
  pkill -f "$ROOT.*com.birrapp.ApplicationKt" 2>/dev/null || true
  pkill -f "vite --port $WEB_PORT" 2>/dev/null || true
  wait 2>/dev/null || true
  say "listo, todo abajo"
}
trap cleanup INT TERM EXIT

until curl -s -m 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; do
  kill -0 $BACKEND 2>/dev/null || { tail -20 /tmp/birrapp-dev-backend.log; exit 1; }
  sleep 2
done
say "backend arriba — migraciones aplicadas sobre $DB"

# ---------- 4. Funnel ----------
if [ "$FUNNEL" = "1" ]; then
  tailscale funnel --bg "$PORT" >/dev/null
  say "Funnel apuntando a $PORT (los teléfonos también, hasta que salgas)"
fi

# ---------- 5. web ----------
say "PWA en http://localhost:$WEB_PORT/app"
echo
cd web
# El binario directo y no `npx`: npx mete un `sh -c` en el medio, así que el
# pid que queda acá es el del wrapper y no el del servidor. Al bajar todo se
# mataba el wrapper y vite seguía vivo ocupando el puerto.
VITE_API_BASE="http://localhost:$PORT" ./node_modules/.bin/vite \
  --port "$WEB_PORT" --strictPort &
VITE=$!
wait $VITE
