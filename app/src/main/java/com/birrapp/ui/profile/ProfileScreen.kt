package com.birrapp.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.birrapp.BuildConfig
import com.birrapp.R
import com.birrapp.data.model.UserDto
import com.birrapp.ui.theme.Ink

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
        Modifier
            .fillMaxSize()
            .background(Ink.Base)
            .statusBarsPadding()
            .padding(horizontal = 22.dp),
    ) {
        Spacer(Modifier.height(28.dp))

        if (user == null) {
            Text("birrapp", style = MaterialTheme.typography.displaySmall, color = Ink.Cream)
            Spacer(Modifier.height(10.dp))
            Text(
                stringResource(R.string.sign_in_why),
                style = MaterialTheme.typography.bodyMedium,
                color = Ink.Muted,
            )
            Spacer(Modifier.height(24.dp))

            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Ink.Cream)
                    .clickable(enabled = !signingIn, onClick = onSignIn)
                    .padding(vertical = 15.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (signingIn) {
                    CircularProgressIndicator(
                        Modifier.size(16.dp), strokeWidth = 2.dp, color = Ink.Base,
                    )
                } else {
                    Text(
                        stringResource(R.string.sign_in),
                        color = Ink.Base,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }

            if (BuildConfig.GOOGLE_WEB_CLIENT_ID == "REPLACE_ME") {
                Spacer(Modifier.height(20.dp))
                SetupWarning(stringResource(R.string.setup_missing_oauth))
            }
            authError?.let {
                Spacer(Modifier.height(16.dp))
                Text(it, color = Ink.Danger, fontSize = 13.sp, lineHeight = 18.sp)
            }
        } else {
            Text(
                user.displayName,
                style = MaterialTheme.typography.displaySmall,
                color = Ink.Cream,
            )
            Spacer(Modifier.height(4.dp))
            Text(user.email, fontSize = 13.sp, color = Ink.Faint)

            Spacer(Modifier.height(14.dp))
            Box(
                Modifier
                    .clip(RoundedCornerShape(50))
                    .background(
                        if (user.isModerator) Ink.Amber.copy(alpha = 0.18f)
                        else Color.White.copy(alpha = 0.07f)
                    )
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(
                    when (user.role) {
                        "admin" -> stringResource(R.string.role_admin)
                        "moderator" -> stringResource(R.string.role_moderator)
                        else -> stringResource(R.string.role_user)
                    },
                    color = if (user.isModerator) Ink.Amber else Ink.Muted,
                    style = MaterialTheme.typography.labelLarge,
                    fontSize = 12.sp,
                )
            }

            Spacer(Modifier.height(28.dp))
            if (user.isModerator) {
                RowAction(stringResource(R.string.tab_moderation), onOpenModeration)
                Spacer(Modifier.height(10.dp))
            }
            RowAction(stringResource(R.string.sign_out), onSignOut, danger = true)
        }

        Spacer(Modifier.weight(1f))

        if (BuildConfig.MAPS_KEY_MISSING) {
            SetupWarning(stringResource(R.string.setup_missing_maps))
            Spacer(Modifier.height(14.dp))
        }
        Text(
            "birrapp ${BuildConfig.VERSION_NAME}\ndatos de bares © colaboradores de OpenStreetMap",
            fontSize = 11.sp, color = Ink.Faint, lineHeight = 15.sp,
        )
        Spacer(Modifier.height(110.dp))
    }
}

@Composable
private fun RowAction(label: String, onClick: () -> Unit, danger: Boolean = false) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White.copy(alpha = 0.06f))
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 15.dp),
    ) {
        Text(
            label,
            color = if (danger) Ink.Danger else Ink.Cream,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
private fun SetupWarning(message: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Ink.Danger.copy(alpha = 0.10f))
            .border(0.8.dp, Ink.Danger.copy(alpha = 0.25f), RoundedCornerShape(14.dp))
            .padding(14.dp),
    ) {
        Text(
            stringResource(R.string.setup_missing_title).uppercase(),
            style = MaterialTheme.typography.labelLarge,
            color = Ink.Danger, fontSize = 10.sp, letterSpacing = 1.2.sp,
        )
        Spacer(Modifier.height(5.dp))
        Text(message, fontSize = 12.sp, color = Ink.Muted, lineHeight = 17.sp)
    }
}
