package com.birrapp.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.tasks.await

/** Obelisco. Fallback cuando no hay permiso ni ubicación conocida. */
val BUENOS_AIRES_CENTER = -34.6037 to -58.3816

class LocationProvider(private val context: Context) {

    fun hasPermission(): Boolean = hasFine() || hasCoarse()

    fun hasFine(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun hasCoarse(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    /**
     * Última ubicación conocida, o el centro de CABA si no hay.
     *
     * Nunca bloquea esperando un fix de GPS: el mapa tiene que abrir ya. Si
     * la ubicación llega después, la pantalla se actualiza sola.
     */
    @SuppressLint("MissingPermission")
    suspend fun current(): Pair<Double, Double> {
        if (!hasPermission()) return BUENOS_AIRES_CENTER
        val client = LocationServices.getFusedLocationProviderClient(context)

        // Orden deliberado, de lo más rápido a lo más preciso.
        //
        // Antes se pedía PRIORITY_HIGH_ACCURACY primero, y eso intenta GPS:
        // adentro de un bar puede tardar o directamente fallar, y se caía al
        // Obelisco aunque el teléfono supiera perfectamente dónde estaba.
        // La última posición conocida es instantánea y casi siempre está.
        runCatching { client.lastLocation.await() }.getOrNull()
            ?.let { return it.latitude to it.longitude }

        // Sin posición previa: BALANCED usa wifi y antenas, responde en
        // segundos y adentro de un edificio funciona; GPS no.
        runCatching {
            client.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, null).await()
        }.getOrNull()?.let { return it.latitude to it.longitude }

        // Último intento antes de rendirse.
        if (hasFine()) {
            runCatching {
                client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null).await()
            }.getOrNull()?.let { return it.latitude to it.longitude }
        }

        return BUENOS_AIRES_CENTER
    }
}
