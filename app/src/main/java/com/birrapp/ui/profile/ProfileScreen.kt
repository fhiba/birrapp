package com.birrapp.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
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
    stats: com.birrapp.data.model.UserStats?,
    onSignIn: () -> Unit,
    onOpenAbout: () -> Unit,
    onCheckUpdate: () -> Unit,
    onDeleteAccount: () -> Unit,
    onSignInBrowser: () -> Unit,
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
            Spacer(Modifier.height(28.dp))

            // Botón principal, con el logo oficial de Google sobre fondo
            // claro: es el tratamiento que pide su guía de marca.
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Ink.Cream)
                    .clickable(enabled = !signingIn, onClick = onSignIn)
                    .padding(vertical = 15.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (signingIn) {
                    CircularProgressIndicator(
                        Modifier.size(17.dp), strokeWidth = 2.dp, color = Ink.Base,
                    )
                } else {
                    Icon(
                        painterResource(R.drawable.ic_google),
                        contentDescription = null,
                        Modifier.size(18.dp),
                        tint = Color.Unspecified,   // el logo lleva sus 4 colores
                    )
                    Spacer(Modifier.width(11.dp))
                    Text(
                        stringResource(R.string.sign_in),
                        color = Ink.Base,
                        style = MaterialTheme.typography.labelLarge,
                        fontSize = 15.sp,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            // Enlace discreto, no un segundo botón: el camino por navegador ya
            // se toma solo cuando hace falta. Esto queda sólo para el caso de
            // querer entrar con una cuenta distinta a la del teléfono, que es
            // una intención diferente y poco frecuente.
            Text(
                "Entrar con otra cuenta",
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(enabled = !signingIn, onClick = onSignInBrowser)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                color = Ink.Muted,
                fontSize = 13.sp,
            )

            if (BuildConfig.GOOGLE_WEB_CLIENT_ID == "REPLACE_ME") {
                Spacer(Modifier.height(20.dp))
                SetupWarning(stringResource(R.string.setup_missing_oauth))
            }
            authError?.let {
                Spacer(Modifier.height(16.dp))
                Text(it, color = Ink.Danger, fontSize = 13.sp, lineHeight = 18.sp)
            }
        } else {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(
                        user.displayName,
                        style = MaterialTheme.typography.displaySmall, color = Ink.Cream,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(user.email, fontSize = 13.sp, color = Ink.Faint)
                }
                // Salir arriba a la derecha, con su propio color: es una
                // acción de sesión, no una opción más de la lista.
                Box(
                    Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(50))
                        .background(Ink.Danger.copy(alpha = 0.13f))
                        .clickable(onClick = onSignOut),
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.ExitToApp,
                        stringResource(R.string.sign_out),
                        Modifier.align(Alignment.Center).size(19.dp),
                        tint = Ink.Danger,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            Box(
                Modifier
                    .clip(RoundedCornerShape(50))
                    .background(
                        if (user.isModerator) Ink.AmberSoft else Color.White.copy(alpha = 0.07f)
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
                    style = MaterialTheme.typography.labelLarge, fontSize = 12.sp,
                )
            }

            // Aporte de la persona. Es lo único que la app puede devolverle a
            // quien carga datos: ver que lo que hizo cuenta.
            Spacer(Modifier.height(26.dp))
            Text(
                "TU APORTE",
                style = MaterialTheme.typography.labelLarge,
                color = Ink.Faint, fontSize = 10.sp, letterSpacing = 1.2.sp,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile("Precios", stats?.prices, Modifier.weight(1f))
                StatTile("Confirmados", stats?.confirmations, Modifier.weight(1f))
                StatTile("Bares", stats?.bars, Modifier.weight(1f))
            }

            Spacer(Modifier.height(28.dp))
            if (user.isModerator) {
                RowAction(stringResource(R.string.tab_moderation), onOpenModeration)
                Spacer(Modifier.height(10.dp))
            }
            RowAction("Cómo funcionan los precios", onOpenAbout)
            Spacer(Modifier.height(10.dp))
            // Un APK instalado a mano no se actualiza solo: hace falta poder
            // ir a buscar la versión nueva.
            RowAction("Buscar actualización", onCheckUpdate)

            Spacer(Modifier.height(28.dp))
            Text(
                "CUENTA",
                style = MaterialTheme.typography.labelLarge,
                color = Ink.Faint, fontSize = 10.sp, letterSpacing = 1.2.sp,
            )
            Spacer(Modifier.height(10.dp))
            RowAction("Borrar mi cuenta", { onDeleteAccount() }, danger = true)
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
private fun StatTile(label: String, value: Int?, modifier: Modifier = Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White.copy(alpha = 0.05f))
            .padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            value?.toString() ?: "—",
            style = com.birrapp.ui.theme.PriceMedium,
            color = if ((value ?: 0) > 0) Ink.Amber else Ink.Faint,
        )
        Spacer(Modifier.height(3.dp))
        Text(label, color = Ink.Faint, fontSize = 11.sp)
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
