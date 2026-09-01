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
        return try {
            val client = LocationServices.getFusedLocationProviderClient(context)
            // Con permiso fino se pide alta precisión: el círculo de
            // precisión en pantalla es el margen de error real, y con
            // BALANCED queda un globo de kilómetros tapando el mapa.
            val priority =
                if (hasFine()) Priority.PRIORITY_HIGH_ACCURACY
                else Priority.PRIORITY_BALANCED_POWER_ACCURACY
            val location = client.getCurrentLocation(priority, null).await()
                ?: client.lastLocation.await()
            location?.let { it.latitude to it.longitude } ?: BUENOS_AIRES_CENTER
        } catch (e: Exception) {
            BUENOS_AIRES_CENTER
        }
    }
}
