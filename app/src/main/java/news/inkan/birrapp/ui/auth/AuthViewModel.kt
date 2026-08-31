package news.inkan.birrapp.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import news.inkan.birrapp.auth.GoogleSignInClient
import news.inkan.birrapp.auth.SessionStore
import news.inkan.birrapp.auth.SignInResult
import news.inkan.birrapp.data.api.ApiClient
import news.inkan.birrapp.data.model.UserDto

data class AuthUiState(
    val user: UserDto? = null,
    val signingIn: Boolean = false,
    val error: String? = null,
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
                runCatching { api.me() }
                    .onSuccess { fresh -> _state.update { it.copy(user = fresh) } }
                    .onFailure { session.clear(); _state.update { it.copy(user = null) } }
            }
        }
    }

    fun signIn() {
        viewModelScope.launch {
            _state.update { it.copy(signingIn = true, error = null) }
            when (val result = googleSignIn.signIn()) {
                is SignInResult.Cancelled ->
                    _state.update { it.copy(signingIn = false) }

                is SignInResult.Failure ->
                    _state.update { it.copy(signingIn = false, error = result.message) }

                is SignInResult.Success -> {
                    runCatching { api.loginWithGoogle(result.idToken) }
                        .onSuccess { sessionResponse ->
                            session.save(sessionResponse)
                            _state.update {
                                it.copy(signingIn = false, user = sessionResponse.user)
                            }
                        }
                        .onFailure { e ->
                            _state.update { it.copy(signingIn = false, error = e.message) }
                        }
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
