package news.inkan.birrapp.ui.profile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import news.inkan.birrapp.BuildConfig
import news.inkan.birrapp.R
import news.inkan.birrapp.data.model.UserDto

@Composable
fun ProfileScreen(
    user: UserDto?,
    signingIn: Boolean,
    authError: String?,
    onSignIn: () -> Unit,
    onSignOut: () -> Unit,
    onOpenModeration: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(40.dp))

        if (user == null) {
            Text(
                stringResource(R.string.sign_in_why),
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(20.dp))
            Button(onClick = onSignIn, enabled = !signingIn) {
                if (signingIn) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                else Text(stringResource(R.string.sign_in))
            }

            // Aviso claro de configuración faltante en vez de un fallo opaco.
            if (BuildConfig.GOOGLE_WEB_CLIENT_ID == "REPLACE_ME") {
                Spacer(Modifier.height(24.dp))
                SetupWarning(stringResource(R.string.setup_missing_oauth))
            }

            authError?.let {
                Spacer(Modifier.height(16.dp))
                Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }
        } else {
            Text(user.displayName, fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Text(user.email, fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            AssistChip(
                onClick = {},
                label = {
                    Text(
                        when (user.role) {
                            "admin" -> stringResource(R.string.role_admin)
                            "moderator" -> stringResource(R.string.role_moderator)
                            else -> stringResource(R.string.role_user)
                        }
                    )
                },
            )

            if (user.isModerator) {
                Spacer(Modifier.height(24.dp))
                Button(onClick = onOpenModeration, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.tab_moderation))
                }
            }

            Spacer(Modifier.height(32.dp))
            OutlinedButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.sign_out))
            }
        }

        Spacer(Modifier.weight(1f))
        if (BuildConfig.MAPS_KEY_MISSING) {
            SetupWarning(stringResource(R.string.setup_missing_maps))
        }
        Text(
            "birrapp ${BuildConfig.VERSION_NAME} · datos de bares © OpenStreetMap",
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SetupWarning(message: String) {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(Modifier.padding(12.dp)) {
            Text(
                stringResource(R.string.setup_missing_title),
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
            )
            Spacer(Modifier.height(4.dp))
            Text(message, fontSize = 12.sp)
        }
    }
}
