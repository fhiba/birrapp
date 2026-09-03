package com.birrapp.ui.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.birrapp.data.model.UserDto
import com.birrapp.ui.theme.Ink

/**
 * Foto de perfil.
 *
 * La de Google se sigue usando como punto de partida y la propia la pisa. El
 * servidor guarda las dos por separado, así que sacar la propia devuelve la de
 * Google en vez de dejar a la persona sin nada.
 *
 * La foto misma es el botón, con un lápiz encima: en un teléfono es el objetivo
 * más fácil de acertar, y un botón al lado sería un control de más para algo
 * que ya se ve.
 */
@Composable
fun AvatarPicker(
    user: UserDto,
    busy: Boolean,
    onPick: (android.net.Uri) -> Unit,
    onRemove: () -> Unit,
) {
    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri -> uri?.let(onPick) }

    fun choose() = picker.launch(
        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
    )

    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(50))
                .background(Ink.Elevated)
                .clickable(enabled = !busy) { choose() },
        ) {
            if (user.avatarUrl != null) {
                AsyncImage(
                    model = user.avatarUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Text(
                    user.displayName.trim().take(1).uppercase().ifBlank { "?" },
                    Modifier.align(Alignment.Center),
                    color = Ink.Muted, fontSize = 24.sp,
                )
            }

            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .size(22.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Ink.Amber),
            ) {
                if (busy) {
                    CircularProgressIndicator(
                        Modifier.align(Alignment.Center).size(11.dp),
                        strokeWidth = 2.dp, color = Ink.Base,
                    )
                } else {
                    Text("✎", Modifier.align(Alignment.Center), color = Ink.Base, fontSize = 11.sp)
                }
            }
        }

        Spacer(Modifier.width(14.dp))

        Column {
            Text(
                if (busy) "Subiendo…"
                else if (user.avatarUrl != null) "Cambiar foto" else "Poner una foto",
                Modifier.clickable(enabled = !busy) { choose() },
                color = Ink.Amber, fontSize = 13.sp,
            )

            // Sólo si hay algo propio que sacar: la de Google no es nuestra
            // para borrarla.
            if (user.avatarUrl?.contains("/avatar/") == true) {
                Spacer(Modifier.height(4.dp))
                Text(
                    "Sacarla",
                    Modifier.clickable(enabled = !busy, onClick = onRemove),
                    color = Ink.Muted, fontSize = 13.sp,
                )
            }
        }
    }
}
