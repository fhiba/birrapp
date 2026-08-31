package com.birrapp.auth

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import com.birrapp.data.model.SessionResponse
import com.birrapp.data.model.UserDto

private val Context.dataStore by preferencesDataStore("birrapp_session")

/**
 * Guarda la sesión en DataStore.
 *
 * Sobre seguridad: los tokens quedan en el almacenamiento privado de la app,
 * que en Android es aislado por UID. EncryptedSharedPreferences está
 * deprecado y en un teléfono con root no cambia nada. Lo que sí importa,
 * y está: el access token dura 30 min y el refresh es rotativo, así que
 * robar el archivo tiene ventana corta y el robo se detecta cuando el token
 * viejo deja de andar.
 */
class SessionStore(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true }

    private val accessKey = stringPreferencesKey("access_token")
    private val refreshKey = stringPreferencesKey("refresh_token")
    private val userKey = stringPreferencesKey("user")

    val userFlow: Flow<UserDto?> = context.dataStore.data.map { prefs ->
        prefs[userKey]?.let { runCatching { json.decodeFromString<UserDto>(it) }.getOrNull() }
    }

    suspend fun accessToken(): String? = context.dataStore.data.first()[accessKey]
    suspend fun refreshToken(): String? = context.dataStore.data.first()[refreshKey]
    suspend fun currentUser(): UserDto? = userFlow.first()

    suspend fun save(session: SessionResponse) {
        context.dataStore.edit { prefs ->
            prefs[accessKey] = session.accessToken
            prefs[refreshKey] = session.refreshToken
            prefs[userKey] = json.encodeToString(session.user)
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}
