package com.birrapp.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.birrapp.R
import com.birrapp.data.model.Freshness
import java.text.NumberFormat
import java.util.Locale

private val AR = Locale.forLanguageTag("es-AR")

/**
 * Formato de precio argentino: `$4.500`, sin decimales.
 *
 * Los centavos no significan nada con estos montos y sólo agregan ruido.
 */
fun formatPrice(value: Double): String =
    NumberFormat.getCurrencyInstance(AR).apply {
        maximumFractionDigits = 0
        minimumFractionDigits = 0
    }.format(value)

/**
 * Edad en texto. La regla de oro de la app: ningún precio se muestra sin esto
 * al lado. Un precio sin edad, en pesos, es información falsa.
 */
@Composable
fun ageLabel(ageDays: Int, freshness: Freshness): String {
    val ctx = LocalContext.current
    return when {
        freshness == Freshness.stale -> ctx.getString(R.string.age_stale, ageDays)
        ageDays <= 0 -> ctx.getString(R.string.age_today)
        ageDays == 1 -> ctx.getString(R.string.age_yesterday)
        else -> ctx.getString(R.string.age_days, ageDays)
    }
}

fun formatDistance(meters: Double?): String? {
    if (meters == null) return null
    return if (meters < 1000) "a ${meters.toInt()} m"
    else "a ${"%.1f".format(AR, meters / 1000)} km"
}

/**
 * Color por frescura. Verde/ámbar/gris.
 *
 * El gris del stale es deliberado: tiene que leerse como "esto no es
 * confiable", no como un precio más.
 */
object FreshnessColors {
    val fresh = Color(0xFF2E7D32)
    val aging = Color(0xFFB26A00)
    val stale = Color(0xFF9E9E9E)

    fun of(f: Freshness): Color = when (f) {
        Freshness.fresh -> fresh
        Freshness.aging -> aging
        Freshness.stale -> stale
    }

    /** Color del pin según la edad del precio más fresco del bar. */
    fun ofAge(ageDays: Int?): Color = when {
        ageDays == null -> stale
        ageDays < 14 -> fresh
        ageDays < 45 -> aging
        else -> stale
    }
}
