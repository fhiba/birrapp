-- Bloqueo entre personas (BIR-17).
--
-- Es requisito de tienda para cualquier app con contenido de usuarios, y es una
-- herramienta distinta del ban: el ban lo aplica un moderador y saca a alguien
-- de la comunidad; el bloqueo lo aplica cualquiera y sólo decide qué ve.
--
-- **Oculta en las dos direcciones.** Si A bloquea a B, A no ve los comentarios
-- de B y B tampoco ve los de A. Una sola dirección deja a quien bloqueó
-- expuesto igual: el otro sigue leyendo lo que escribe y sigue teniendo a quién
-- responderle, que es exactamente el problema que el bloqueo viene a cortar.
-- La regla también es más fácil de explicar: se dejan de ver, punto.
--
-- Clave compuesta y no serial: bloquear dos veces a la misma persona no es un
-- bloqueo nuevo. Con la PK acá, el ON CONFLICT DO NOTHING hace el botón
-- idempotente sin una línea de Kotlin — igual que en `favorites`.
CREATE TABLE user_blocks (
    blocker_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    blocked_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    -- Bloquearse a uno mismo no significa nada y dejaría a la persona sin ver
    -- sus propios comentarios.
    CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

-- El filtro se consulta en las dos direcciones en cada lista de comentarios y
-- de fotos, así que hace falta el índice inverso además de la PK.
CREATE INDEX idx_user_blocks_blocked ON user_blocks (blocked_id, blocker_id);
