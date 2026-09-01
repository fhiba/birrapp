package com.birrapp.data.db

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import com.birrapp.data.model.BarPin
import java.io.File

/**
 * Instantánea de bares en disco.
 *
 * Un archivo JSON, no una base: los datos son una lista chata que se lee y
 * escribe entera, sin consultas. Room acá serían tres capas y un procesador
 * de anotaciones para reemplazar dos líneas de serialización.
 *
 * Sólo guarda la geometría y el precio de cabecera, que es lo que necesita el
 * mapa. El detalle del bar siempre se pide fresco: mostrar precios viejos sin
 * avisar es exactamente lo que la app existe para no hacer.
 */
@Serializable
data class BarSnapshot(
    val savedAtMillis: Long,
    val centerLat: Double,
    val centerLng: Double,
    val radiusMeters: Int,
    val bars: List<BarPin>,
)

class BarStore(context: Context) {

    private val json = Json { ignoreUnknownKeys = true }
    private val file = File(context.filesDir, "bars_snapshot.json")

    suspend fun load(): BarSnapshot? = withContext(Dispatchers.IO) {
        runCatching {
            if (!file.exists()) return@runCatching null
            json.decodeFromString<BarSnapshot>(file.readText())
        }.onFailure {
            Log.w("BarStore", "instantánea ilegible, se descarta", it)
            runCatching { file.delete() }
        }.getOrNull()
    }

    suspend fun save(snapshot: BarSnapshot) = withContext(Dispatchers.IO) {
        runCatching {
            // Escritura atómica: si la app muere a mitad, el archivo bueno
            // sigue intacto y no queda un JSON truncado.
            val tmp = File(file.parentFile, "${file.name}.tmp")
            tmp.writeText(json.encodeToString(snapshot))
            tmp.renameTo(file)
        }.onFailure { Log.w("BarStore", "no se pudo guardar la instantánea", it) }
        Unit
    }
}
