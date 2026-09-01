package com.birrapp.di

import android.content.Context
import com.birrapp.auth.GoogleSignInClient
import com.birrapp.auth.SessionStore
import com.birrapp.data.api.ApiClient
import com.birrapp.data.repo.BarRepository
import com.birrapp.location.LocationProvider

/**
 * Inyección de dependencias a mano.
 *
 * Son seis objetos sin ciclos. Hilt acá sería procesamiento de anotaciones y
 * un plugin de Gradle para ahorrar veinte líneas. Si el grafo crece, se
 * reevalúa.
 */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext

    val session by lazy { SessionStore(appContext) }
    val api by lazy { ApiClient(session) }
    // Sin context: Credential Manager necesita la Activity, y se le pasa
    // en cada llamada para no retenerla.
    val googleSignIn by lazy { GoogleSignInClient() }
    val location by lazy { LocationProvider(appContext) }
    val bars by lazy { BarRepository(api) }
}
