-- El programa de puntos: bares afiliados, tickets de ARCA, puntos y canjes.
--
-- Esto es el modelo de datos de la PoC. No hay endpoints todavía: primero el
-- esquema, porque es lo que decide qué se puede y qué no se puede hacer mal
-- después. Las reglas que protegen plata viven acá adentro como constraints y
-- no en Kotlin — un chequeo previo en el código es una carrera esperando a
-- pasar; un índice único o un CHECK es la última palabra.
--
-- ## Las cuatro garantías que da este esquema
--
--  1. Un comprobante de ARCA acredita puntos **una sola vez**, aunque dos
--     personas lo escaneen en el mismo milisegundo (índice único parcial).
--  2. El saldo de puntos **no puede quedar negativo**, aunque dos canjes
--     entren a la vez (CHECK sobre `points_balance`, más el lock de fila que
--     da actualizarlo).
--  3. El stock de un beneficio **no puede quedar negativo**, por lo mismo.
--  4. Un código de canje **sirve una sola vez** (índice único parcial sobre
--     los pendientes, más la transición de estado).
--
-- ## Sólo Argentina, por ahora
--
-- La validación cuelga de ARCA, así que el programa es argentino. El resto de
-- la app ya es multi-país (`bars.country_code`): el corte se hace en la capa
-- de aplicación, no acá, para no tener que rehacer el esquema el día que haya
-- un equivalente en otro lado.

-- ---------------------------------------------------------------------------
-- El bar afiliado
-- ---------------------------------------------------------------------------
--
-- Tabla aparte y no columnas en `bars`. `bars` es el mapa comunitario: lo
-- carga cualquiera, lo edita un moderador y no tiene dueño —`created_by` es
-- quien lo agregó, no quien lo administra—. Un bar afiliado es una relación
-- comercial con datos fiscales y una cuenta que factura. Mezclarlas obligaría
-- a que cada consulta del mapa arrastre columnas que no le importan, y a que
-- el día que un bar se dé de baja haya que decidir qué hacer con el pin.
--
-- El vínculo es 1 a 1 y el pin sigue siendo el mismo: la ficha del bar va a
-- mostrar que está afiliado, no va a ser otro bar.
CREATE TYPE partner_status AS ENUM ('onboarding', 'active', 'paused', 'left');

CREATE TABLE partner_bars (
    id         bigserial PRIMARY KEY,
    -- RESTRICT y no CASCADE: borrar del mapa un bar que tiene tickets y canjes
    -- atrás no puede ser un efecto colateral de una moderación.
    bar_id     bigint NOT NULL UNIQUE REFERENCES bars (id) ON DELETE RESTRICT,
    -- El CUIT es la llave con la que se reconoce un ticket como de este bar.
    -- Único: dos afiliados con el mismo CUIT harían ambiguo a quién acreditar.
    cuit       char(11) NOT NULL UNIQUE CHECK (cuit ~ '^[0-9]{11}$'),
    legal_name text NOT NULL,
    status     partner_status NOT NULL DEFAULT 'onboarding',
    joined_at  timestamptz NOT NULL DEFAULT now(),
    -- Cuándo dejó el programa. Los puntos que emitió siguen vivos hasta que
    -- vencen, y eso es deliberado: la deuda es del programa, no del bar.
    left_at    timestamptz,
    CHECK (left_at IS NULL OR status = 'left')
);

-- ---------------------------------------------------------------------------
-- Las cuentas del bar
-- ---------------------------------------------------------------------------
--
-- Primera vez que la app maneja credenciales propias. Hasta acá todo el login
-- era Google, y para el mozo no sirve: el celular del bar es del bar, no de la
-- persona, y hacer que cada mozo ponga su cuenta de Google ahí es pedirle que
-- deje su sesión personal abierta en el mostrador.
--
-- El dueño entra con usuario y clave, y da de alta a sus mozos. Cada mozo tiene
-- su propia cuenta porque el canje necesita saber **quién** lo confirmó: sin
-- eso, "el bar" canjeó y no hay auditoría posible.
--
-- `password_hash` guarda un string auto-descriptivo —algoritmo, parámetros,
-- sal y hash— para poder cambiar de algoritmo sin migrar la columna. Cuál se
-- usa se decide en el código, no acá.
CREATE TYPE staff_role AS ENUM ('owner', 'staff');

CREATE TABLE partner_staff (
    id            bigserial PRIMARY KEY,
    partner_id    bigint NOT NULL REFERENCES partner_bars (id) ON DELETE CASCADE,
    email         text NOT NULL,
    password_hash text NOT NULL,
    display_name  text NOT NULL,
    role          staff_role NOT NULL DEFAULT 'staff',
    -- Se deshabilita, no se borra: los canjes que confirmó tienen que seguir
    -- apuntando a alguien. Un mozo que se fue es una cuenta apagada.
    disabled_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Único en toda la tabla y no por bar: el mail es con lo que se entra, así que
-- dos cuentas con el mismo mail harían ambiguo el login.
CREATE UNIQUE INDEX idx_partner_staff_email ON partner_staff (lower(email));
CREATE INDEX idx_partner_staff_partner ON partner_staff (partner_id) WHERE disabled_at IS NULL;

-- ---------------------------------------------------------------------------
-- Los tickets
-- ---------------------------------------------------------------------------
--
-- Se guardan los rechazados también, y por dos razones: para poder mirar qué
-- está fallando en el onboarding de un bar —si sus tickets no traen QR, se ve
-- acá— y para que el antifraude tenga contra qué contar intentos.
--
-- Pero el índice único es **parcial sobre los aprobados**. Si cubriera todas
-- las filas, un rechazo de ARCA por un problema transitorio quemaría el
-- comprobante para siempre y la persona no podría reintentar con un ticket que
-- es legítimo.
CREATE TYPE claim_status AS ENUM ('approved', 'rejected');

CREATE TABLE ticket_claims (
    id         bigserial PRIMARY KEY,
    user_id    bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Puede ser NULL en un rechazo por "ese CUIT no está afiliado": ahí no hay
    -- socio al que apuntar, y la fila igual sirve para contar el intento.
    partner_id bigint REFERENCES partner_bars (id) ON DELETE RESTRICT,

    -- La identidad del comprobante, tal como viene en el QR. Estos cuatro son
    -- los que lo hacen único ante ARCA.
    cuit       char(11) NOT NULL CHECK (cuit ~ '^[0-9]{11}$'),
    pto_vta    int      NOT NULL CHECK (pto_vta > 0),
    cbte_tipo  int      NOT NULL CHECK (cbte_tipo > 0),
    cbte_nro   bigint   NOT NULL CHECK (cbte_nro > 0),

    cbte_fecha date          NOT NULL,
    importe    numeric(14,2) NOT NULL CHECK (importe > 0),
    moneda     char(3)       NOT NULL DEFAULT 'PES',
    cod_aut    text          NOT NULL,

    -- El payload crudo del QR. Ocupa poco y es lo único que permite auditar
    -- un claim dudoso meses después sin depender de que ARCA conserve nada.
    qr_payload text NOT NULL,

    status     claim_status NOT NULL,
    -- Por qué se rechazó, en un código estable para poder contarlos.
    reject_code text,
    -- Qué contestó WSCDC: 'A', 'R', o NULL si no se llegó a preguntar porque
    -- lo frenó una regla propia antes.
    arca_result char(1) CHECK (arca_result IN ('A', 'R')),
    arca_checked_at timestamptz,

    -- Lo que se acreditó. 0 en los rechazos.
    points     int NOT NULL DEFAULT 0 CHECK (points >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),

    CHECK (status = 'rejected' OR (partner_id IS NOT NULL AND points > 0)),
    CHECK (status = 'approved' OR points = 0)
);

-- LA garantía de que un comprobante acredita una sola vez. Parcial sobre los
-- aprobados: ver arriba.
CREATE UNIQUE INDEX idx_ticket_identity
    ON ticket_claims (cuit, pto_vta, cbte_tipo, cbte_nro)
    WHERE status = 'approved';

-- Para el cap diario por persona, que es la otra mitad del antifraude.
CREATE INDEX idx_ticket_claims_user_day ON ticket_claims (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Los puntos
-- ---------------------------------------------------------------------------
--
-- ## Movimientos, no un saldo que se pisa
--
-- El ledger es append-only. Un saldo mutable como única fuente de verdad no
-- deja reconstruir cómo se llegó a él, y con plata de por medio eso es lo
-- primero que hace falta cuando alguien reclama.
--
-- `amount` va **firmado** y el saldo es `SUM(amount)`, sin casos especiales.
--
-- ## Por qué no hay un movimiento de "gasto"
--
-- Reservar ya debita. Si el canje se concreta, no se mueve nada más —la
-- reserva queda—; si vence, entra un `release` que devuelve. Así el saldo
-- disponible es el saldo a secas, sin tener que restar reservas vivas en cada
-- consulta. Qué pasó con cada reserva lo cuenta `redemptions.status`.
--
-- ## El vencimiento viaja con cada acreditación
--
-- `expires_at` se escribe al acreditar, así que cambiar la política más
-- adelante no le mueve la fecha a los puntos que ya están. Vencer es un
-- movimiento más (`expire`, negativo), no un borrado.
CREATE TYPE points_kind AS ENUM ('earn', 'hold', 'release', 'expire', 'adjust');

CREATE TABLE points_ledger (
    id            bigserial PRIMARY KEY,
    user_id       bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind          points_kind NOT NULL,
    amount        int NOT NULL CHECK (amount <> 0),
    ticket_id     bigint REFERENCES ticket_claims (id) ON DELETE RESTRICT,
    -- La FK a `redemptions` se agrega abajo: la tabla todavía no existe.
    redemption_id bigint,
    expires_at    timestamptz,
    -- Para los ajustes a mano: quién y por qué. Sin esto, un ajuste es un
    -- número que apareció.
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),

    -- Cada clase de movimiento tiene su forma, y se exige acá para que no
    -- exista un 'earn' negativo ni un 'hold' sin canje al que pertenecer.
    CHECK (kind <> 'earn'    OR (amount > 0 AND ticket_id IS NOT NULL AND expires_at IS NOT NULL)),
    CHECK (kind <> 'hold'    OR (amount < 0 AND redemption_id IS NOT NULL)),
    CHECK (kind <> 'release' OR (amount > 0 AND redemption_id IS NOT NULL)),
    CHECK (kind <> 'expire'  OR amount < 0)
);

CREATE INDEX idx_points_ledger_user ON points_ledger (user_id, created_at DESC);
-- Para el trabajo de vencimiento: qué acreditaciones ya vencieron.
CREATE INDEX idx_points_ledger_expiry ON points_ledger (expires_at)
    WHERE kind = 'earn' AND expires_at IS NOT NULL;

-- El saldo, que es a la vez el candado.
--
-- Es redundante con el ledger a propósito. Sirve para dos cosas que el ledger
-- solo no da:
--
--  1. **El CHECK.** `balance >= 0` hace imposible un saldo negativo a nivel
--     almacenamiento. Chequear el saldo en Kotlin antes de insertar el `hold`
--     es una carrera: dos canjes simultáneos leen el mismo saldo y los dos
--     pasan. El CHECK no se puede burlar.
--  2. **El lock.** `UPDATE ... WHERE user_id = ?` toma el lock de esa fila, así
--     que dos canjes de la misma persona se serializan solos. Sin una fila
--     común que tocar, no hay nada contra qué serializarlos.
--
-- Se actualiza en la MISMA transacción que el movimiento. Si se separan, hay
-- un instante en que no coinciden y ese instante es el que se explota.
CREATE TABLE points_balance (
    user_id    bigint PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    balance    int NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Los beneficios
-- ---------------------------------------------------------------------------
CREATE TYPE benefit_status AS ENUM ('draft', 'active', 'paused', 'archived');

CREATE TABLE benefits (
    id          bigserial PRIMARY KEY,
    partner_id  bigint NOT NULL REFERENCES partner_bars (id) ON DELETE CASCADE,
    title       text NOT NULL,
    detail      text,
    -- Lo fija el bar: es la palanca con la que se defiende de ser el que
    -- "regala" en un programa de puntos globales.
    cost_points int NOT NULL CHECK (cost_points > 0),
    -- NULL = sin tope. El CHECK es el que impide que se vaya a negativo
    -- cuando dos personas reservan el último a la vez.
    stock       int CHECK (stock IS NULL OR stock >= 0),
    daily_cap   int CHECK (daily_cap IS NULL OR daily_cap > 0),
    starts_at   timestamptz,
    ends_at     timestamptz,
    status      benefit_status NOT NULL DEFAULT 'draft',
    created_at  timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX idx_benefits_partner ON benefits (partner_id, status);

-- ---------------------------------------------------------------------------
-- Los canjes
-- ---------------------------------------------------------------------------
--
-- El código NO se guarda en claro. Son seis dígitos y viven cinco minutos, así
-- que el valor de robarlos es bajo — pero una lectura de la base no tiene por
-- qué entregar códigos vivos, y no cuesta nada evitarlo. Se guarda el hash con
-- una pimienta del servidor, determinístico, porque el mozo tipea el código y
-- hay que poder encontrarlo por él.
--
-- El costo se congela al reservar: si el bar cambia el precio del beneficio
-- mientras el código está vivo, se cobra lo que se prometió.
CREATE TYPE redemption_status AS ENUM ('pending', 'redeemed', 'expired', 'cancelled');

CREATE TABLE redemptions (
    id          bigserial PRIMARY KEY,
    benefit_id  bigint NOT NULL REFERENCES benefits (id) ON DELETE RESTRICT,
    -- Redundante con `benefits.partner_id`, y a propósito: el código se valida
    -- contra el bar del mozo, y esa comparación no puede depender de un JOIN
    -- que alguien podría olvidarse de hacer.
    partner_id  bigint NOT NULL REFERENCES partner_bars (id) ON DELETE RESTRICT,
    user_id     bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    cost_points int NOT NULL CHECK (cost_points > 0),
    code_hash   text NOT NULL,
    status      redemption_status NOT NULL DEFAULT 'pending',
    expires_at  timestamptz NOT NULL,
    redeemed_at timestamptz,
    redeemed_by bigint REFERENCES partner_staff (id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    CHECK (status <> 'redeemed' OR (redeemed_at IS NOT NULL AND redeemed_by IS NOT NULL)),
    CHECK (status = 'redeemed' OR (redeemed_at IS NULL AND redeemed_by IS NULL))
);

-- Un código vivo por bar: dos pendientes con el mismo código en el mismo bar
-- harían ambigua la validación. Parcial sobre los pendientes, así que un
-- código puede volver a salir sorteado una vez que el anterior se cerró.
CREATE UNIQUE INDEX idx_redemption_code
    ON redemptions (partner_id, code_hash)
    WHERE status = 'pending';

CREATE INDEX idx_redemptions_user ON redemptions (user_id, created_at DESC);
CREATE INDEX idx_redemptions_partner ON redemptions (partner_id, created_at DESC);
-- Para el trabajo que libera las reservas vencidas.
CREATE INDEX idx_redemptions_pending ON redemptions (expires_at) WHERE status = 'pending';

-- Se cierra el círculo: el movimiento de reserva apunta al canje.
ALTER TABLE points_ledger
    ADD CONSTRAINT fk_points_ledger_redemption
    FOREIGN KEY (redemption_id) REFERENCES redemptions (id) ON DELETE RESTRICT;
