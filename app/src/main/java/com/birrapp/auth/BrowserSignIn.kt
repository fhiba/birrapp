package com.birrapp.auth

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.graphics.toColorInt

/**
 * Login de Google en el navegador, como alternativa a Credential Manager.
 *
 * Credential Manager sólo ofrece cuentas ya agregadas al teléfono. Este
 * camino sirve para cualquier cuenta, y es el único que funciona en un
 * dispositivo sin cuenta de Google configurada.
 *
 * Va en **Custom Tabs**, no en un WebView: un WebView pidiendo credenciales
 * de Google es indistinguible de un phishing —el usuario no puede ver la
 * barra de direcciones— y Google bloquea ese flujo desde 2021. Custom Tabs
 * muestra la URL real y comparte las cookies del navegador.
 *
 * El intercambio del código lo hace el backend, así que la app nunca ve el
 * client secret.
 */
class BrowserSignInLauncher(private val context: Context) {

    fun launch(authorizeUrl: String) {
        CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setDefaultColorSchemeParams(
                androidx.browser.customtabs.CustomTabColorSchemeParams.Builder()
                    .setToolbarColor("#1A1410".toColorInt())
                    .build()
            )
            .build()
            .launchUrl(context, Uri.parse(authorizeUrl))
    }
}
