package news.inkan.birrapp.di

import android.content.Context
import news.inkan.birrapp.auth.GoogleSignInClient
import news.inkan.birrapp.auth.SessionStore
import news.inkan.birrapp.data.api.ApiClient
import news.inkan.birrapp.data.repo.BarRepository
import news.inkan.birrapp.location.LocationProvider

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
    val googleSignIn by lazy { GoogleSignInClient(appContext) }
    val location by lazy { LocationProvider(appContext) }
    val bars by lazy { BarRepository(api) }
}
