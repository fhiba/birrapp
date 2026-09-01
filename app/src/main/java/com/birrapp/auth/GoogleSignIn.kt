package com.birrapp.auth

import android.app.Activity
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.birrapp.BuildConfig

sealed interface SignInResult {
    data class Success(val idToken: String) : SignInResult
    data object Cancelled : SignInResult
    /** [message] es para mostrar; [technical] va sólo al log. */
    data class Failure(val message: String, val technical: String? = null) : SignInResult
}

/**
 * Sign in with Google vía Credential Manager.
 *
 * Se usa Credential Manager y no la API vieja `GoogleSignIn` porque esa está
 * deprecada y Google la está sacando del SDK de Play Services.
 *
 * **La Activity es obligatoria.** Credential Manager abre un diálogo del
 * sistema y necesita una ventana donde anclarlo; con el context de la
 * aplicación falla con "Failed to launch the selector UI". Por eso la Activity
 * se pasa en cada llamada en vez de guardarse en el constructor: retenerla
 * filtraría memoria cuando la pantalla se destruye.
 *
 * Devuelve el ID token de Google. Ese token NO es la sesión: se canjea contra
 * el backend, que emite el JWT propio con el rol adentro.
 */
class GoogleSignInClient {

    val isConfigured: Boolean
        get() = BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank() &&
            BuildConfig.GOOGLE_WEB_CLIENT_ID != "REPLACE_ME"

    suspend fun signIn(activity: Activity): SignInResult {
        if (!isConfigured) {
            return SignInResult.Failure(
                "El inicio de sesión no está disponible por ahora.",
                technical = "GOOGLE_WEB_CLIENT_ID sin configurar en el build",
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
            val response = CredentialManager.create(activity).getCredential(activity, request)
            val credential = response.credential
            if (credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                SignInResult.Success(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            } else {
                SignInResult.Failure(
                    "No pudimos iniciar sesión con esa cuenta.",
                    technical = "tipo de credencial inesperado: ${credential.type}",
                )
            }
        } catch (e: GetCredentialCancellationException) {
            SignInResult.Cancelled
        } catch (e: NoCredentialException) {
            SignInResult.Failure(
                "No hay ninguna cuenta de Google en este teléfono. " +
                    "Agregá una desde Ajustes y volvé a intentar.",
                technical = e.message,
            )
        } catch (e: GetCredentialException) {
            Log.w("GoogleSignIn", "fallo de Credential Manager", e)
            SignInResult.Failure(
                "No pudimos iniciar sesión. Probá de nuevo en un momento.",
                technical = e.message,
            )
        }
    }
}
