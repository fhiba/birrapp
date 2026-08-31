package news.inkan.birrapp.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import news.inkan.birrapp.BuildConfig

sealed interface SignInResult {
    data class Success(val idToken: String) : SignInResult
    data object Cancelled : SignInResult
    data class Failure(val message: String) : SignInResult
}

/**
 * Sign in with Google vía Credential Manager.
 *
 * Se usa Credential Manager y no la API vieja `GoogleSignIn` porque esa está
 * deprecada y Google la está sacando del SDK de Play Services.
 *
 * Devuelve el ID token de Google. Ese token NO es la sesión: se canjea contra
 * el backend, que emite el JWT propio de birrapp con el rol adentro.
 */
class GoogleSignInClient(private val context: Context) {

    val isConfigured: Boolean
        get() = BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank() &&
            BuildConfig.GOOGLE_WEB_CLIENT_ID != "REPLACE_ME"

    suspend fun signIn(): SignInResult {
        if (!isConfigured) {
            return SignInResult.Failure(
                "Falta GOOGLE_WEB_CLIENT_ID en local.properties. Ver docs/SETUP.md paso 4b.",
            )
        }

        val option = GetGoogleIdOption.Builder()
            // false = mostrar todas las cuentas del teléfono, no sólo las que
            // ya usaron la app. En el primer login no hay ninguna previa, así
            // que filtrar dejaría el diálogo vacío.
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .setAutoSelectEnabled(true)
            .build()

        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()

        return try {
            val response = CredentialManager.create(context).getCredential(context, request)
            val credential = response.credential
            if (credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                val google = GoogleIdTokenCredential.createFrom(credential.data)
                SignInResult.Success(google.idToken)
            } else {
                SignInResult.Failure("Tipo de credencial inesperado: ${credential.type}")
            }
        } catch (e: GetCredentialCancellationException) {
            SignInResult.Cancelled
        } catch (e: NoCredentialException) {
            SignInResult.Failure("No hay cuentas de Google en este teléfono.")
        } catch (e: GetCredentialException) {
            // El caso más común acá es que el SHA-1 del APK no esté cargado
            // en el cliente OAuth de Android en Google Cloud.
            SignInResult.Failure(
                "No se pudo iniciar sesión: ${e.message ?: e::class.simpleName}. " +
                    "Verificá que el SHA-1 del build esté cargado en Google Cloud " +
                    "(docs/SETUP.md paso 4a).",
            )
        }
    }
}
