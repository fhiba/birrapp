package com.birrapp.ui.common

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.birrapp.R

/**
 * Abre el bar en una app de mapas.
 *
 * Se usa el esquema `geo:` estándar en vez de linkear a Google Maps o Waze
 * directo: así el sistema ofrece las apps que el usuario realmente tiene y
 * respeta la que tenga por defecto. Codificar una sola app sería una decisión
 * nuestra sobre algo que le corresponde al usuario.
 */
fun openDirections(context: Context, lat: Double, lng: Double, name: String) {
    val label = Uri.encode(name)
    val intent = Intent(
        Intent.ACTION_VIEW,
        // El par lat,lng antes del `q` hace que la app tenga a dónde ir aun
        // cuando no reconozca el nombre.
        Uri.parse("geo:$lat,$lng?q=$lat,$lng($label)"),
    )
    try {
        context.startActivity(
            Intent.createChooser(intent, context.getString(R.string.choose_app))
        )
    } catch (e: ActivityNotFoundException) {
        Toast.makeText(context, R.string.no_maps_app, Toast.LENGTH_SHORT).show()
    }
}
