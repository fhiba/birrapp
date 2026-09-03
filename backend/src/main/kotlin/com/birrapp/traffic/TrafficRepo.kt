package com.birrapp.traffic

import com.birrapp.core.Db
import com.birrapp.core.update
import kotlinx.serialization.Serializable
import java.util.UUID

/** El cuerpo del beacon. El id lo genera el cliente y no significa nada. */
@Serializable
data class TrafficPing(val clientId: String)

class TrafficRepo(private val db: Db) {

    /**
     * Anota que este cliente estuvo hoy.
     *
     * Idempotente por (día, cliente): recargar la app veinte veces no inventa
     * veinte personas, y por eso el front no necesita throttling.
     *
     * `authed` sólo sube hacia true y nunca baja. Alguien que entra anónimo y
     * después inicia sesión es un visitante que convirtió, no dos personas; si
     * se pisara con el último valor, un reload sin token lo devolvería a
     * anónimo y la conversión desaparecería.
     */
    fun record(clientId: UUID, authed: Boolean) = db.conn { c ->
        c.update(
            """
            INSERT INTO traffic_sessions (day, client_id, authed)
            VALUES (current_date, ?, ?)
            ON CONFLICT (day, client_id) DO UPDATE
               SET authed = traffic_sessions.authed OR excluded.authed
            """.trimIndent(),
            clientId, authed,
        )
    }
}
