package com.birrapp.ui.auth

import android.app.Activity
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.birrapp.auth.GoogleSignInClient
import com.birrapp.auth.SessionStore
import com.birrapp.auth.SignInResult
import com.birrapp.data.api.ApiClient
import com.birrapp.data.api.ApiException
import com.birrapp.data.model.UserDto

data class AuthUiState(
    val user: UserDto? = null,
    val signingIn: Boolean = false,
    val error: String? = null,
    /** URL a abrir en el navegador; la pantalla la consume y la limpia. */
    val browserUrl: String? = null,
    /** true cuando Credential Manager no encontró ninguna cuenta en el equipo. */
    val stats: com.birrapp.data.model.UserStats? = null,
    val deleting: Boolean = false,
)

class AuthViewModel(
    private val api: ApiClient,
    private val session: SessionStore,
    private val googleSignIn: GoogleSignInClient,
) : ViewModel() {

    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    init {
        // Restaurar la sesión guardada al arrancar.
        viewModelScope.launch {
            val cached = session.currentUser()
            _state.update { it.copy(user = cached) }
            if (cached != null) {
                // Revalidar contra el backend: el rol pudo haber cambiado, o
                // la cuenta pudo haber sido suspendida desde el último uso.
                // Sólo se cierra la sesión si el servidor RECHAZA la
                // credencial. Antes cualquier error la borraba, así que un
                // corte de red o un reinicio del backend deslogueaba al
                // usuario aunque su sesión siguiera siendo válida.
                runCatching { api.me() }
                    .onSuccess { fresh ->
                        _state.update { it.copy(user = fresh) }
                        loadStats()
                    }
                    .onFailure { e ->
                        val rejected = e is ApiException && (e.status == 401 || e.status == 403)
                        if (rejected) {
                            session.clear()
                            _state.update { it.copy(user = null) }
                        } else {
                            Log.w("AuthViewModel", "no se pudo revalidar; se conserva la sesión", e)
                        }
                    }
            }
        }
    }

    fun signIn(activity: Activity) {
        viewModelScope.launch {
            _state.update { it.copy(signingIn = true, error = null) }
            when (val result = googleSignIn.signIn(activity)) {
                is SignInResult.Cancelled ->
                    _state.update { it.copy(signingIn = false) }

                is SignInResult.Failure -> {
                    // El detalle técnico va al log, no a la pantalla.
                    result.technical?.let { Log.w("AuthViewModel", "login falló: $it") }

                    if (result.noAccountOnDevice) {
                        // Sin cuenta en el equipo, el navegador no es "otra
                        // opción": es el único camino. Mostrar un error y
                        // pedirle al usuario que elija el otro botón es
                        // hacerle resolver un problema nuestro. Se sigue solo.
                        signInWithBrowser()
                    } else {
                        _state.update {
                            it.copy(signingIn = false, error = result.message)
                        }
                    }
                }

                is SignInResult.Success -> {
                    runCatching { api.loginWithGoogle(result.idToken) }
                        .onSuccess { sessionResponse ->
                            session.save(sessionResponse)
                            _state.update {
                                it.copy(signingIn = false, user = sessionResponse.user)
                            }
                            loadStats()
                        }
                        .onFailure { e ->
                            Log.w("AuthViewModel", "canje de token falló", e)
                            _state.update {
                                it.copy(
                                    signingIn = false,
                                    error = "No pudimos completar el inicio de sesión. " +
                                        "Revisá tu conexión y probá de nuevo.",
                                )
                            }
                        }
                }
            }
        }
    }

    /** Login por navegador: sirve para cualquier cuenta, haya o no en el equipo. */
    fun signInWithBrowser() {
        viewModelScope.launch {
            _state.update { it.copy(signingIn = true, error = null) }
            runCatching { api.startBrowserLogin() }
                .onSuccess { r ->
                    _state.update { it.copy(browserUrl = r.authorizeUrl) }
                }
                .onFailure { e ->
                    Log.w("AuthViewModel", "no se pudo iniciar el login por navegador", e)
                    _state.update {
                        it.copy(
                            signingIn = false,
                            error = "No pudimos abrir el inicio de sesión. " +
                                "Revisá tu conexión y probá de nuevo.",
                        )
                    }
                }
        }
    }

    fun browserUrlConsumed() = _state.update { it.copy(browserUrl = null) }

    /** Canjea el código que llega por el deep link al volver del navegador. */
    fun redeemHandoff(code: String) {
        viewModelScope.launch {
            _state.update { it.copy(signingIn = true, error = null) }
            runCatching { api.redeemHandoff(code) }
                .onSuccess { session ->
                    this@AuthViewModel.session.save(session)
                    _state.update {
                        it.copy(signingIn = false, user = session.user)
                    }
                }
                .onFailure { e ->
                    Log.w("AuthViewModel", "canje de handoff falló", e)
                    _state.update {
                        it.copy(
                            signingIn = false,
                            error = "El inicio de sesión expiró. Probá de nuevo.",
                        )
                    }
                }
        }
    }

    fun onBrowserCancelled() = _state.update { it.copy(signingIn = false) }

    fun loadStats() {
        viewModelScope.launch {
            runCatching { api.myStats() }
                .onSuccess { s -> _state.update { it.copy(stats = s) } }
        }
    }

    /**
     * Borrado de cuenta. Obligatorio para publicar en App Store y Play.
     *
     * Los precios que reportó la persona no se borran, se desvinculan: son
     * observaciones sobre bares, no datos personales, y borrarlos degradaría
     * el mapa para todos los demás.
     */
    fun deleteAccount(onDone: () -> Unit) {
        viewModelScope.launch {
            _state.update { it.copy(deleting = true) }
            runCatching { api.deleteAccount() }
                .onSuccess {
                    _state.update { AuthUiState() }
                    onDone()
                }
                .onFailure { e ->
                    Log.w("AuthViewModel", "no se pudo borrar la cuenta", e)
                    _state.update {
                        it.copy(
                            deleting = false,
                            error = "No pudimos borrar la cuenta. Probá de nuevo.",
                        )
                    }
                }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            api.logout()
            _state.update { it.copy(user = null) }
        }
    }
}
