package com.birrapp.ui.bar

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.birrapp.data.model.Photo
import com.birrapp.ui.theme.Ink

/**
 * Carrusel de fotos de una birra, con el botón de agregar al final.
 *
 * Scroll horizontal y no una grilla: en un teléfono el gesto natural es
 * arrastrar, y una grilla obligaría a decidir cuántas filas mostrar cuando el
 * bar tiene doce fotos de una birra y ninguna de otra.
 *
 * El botón abre el selector del sistema (Photo Picker), que no pide permiso de
 * almacenamiento: ofrece cámara y galería sin que la app tenga que pedir
 * acceso a todas las fotos del teléfono para subir una.
 */
@Composable
fun PhotoStrip(
    photos: List<Photo>,
    canAdd: Boolean,
    busy: Boolean,
    onAdd: (android.net.Uri) -> Unit,
    onOpen: (Int) -> Unit,
) {
    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri -> uri?.let(onAdd) }

    if (photos.isEmpty() && !canAdd) return

    LazyRow(
        Modifier.padding(top = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        itemsIndexed(photos, key = { _, p -> p.id }) { i, photo ->
            AsyncImage(
                model = photo.url,
                contentDescription = "Foto de la birra",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(88.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Ink.Elevated)
                    .clickable { onOpen(i) },
            )
        }

        if (canAdd) {
            item {
                Box(
                    Modifier
                        .size(88.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White.copy(alpha = 0.05f))
                        .clickable(enabled = !busy) {
                            picker.launch(
                                PickVisualMediaRequest(
                                    ActivityResultContracts.PickVisualMedia.ImageOnly,
                                ),
                            )
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    if (busy) {
                        CircularProgressIndicator(
                            Modifier.size(20.dp), strokeWidth = 2.dp, color = Ink.Amber,
                        )
                    } else {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("+", color = Ink.Amber, fontSize = 22.sp)
                            Text("Foto", color = Ink.Faint, fontSize = 11.sp)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Foto ampliada.
 *
 * Un diálogo a pantalla completa y no abrir la URL en el navegador: eso salía
 * de la app, mostraba un dominio `r2.dev` que no le dice nada a nadie, y para
 * volver había que usar el botón de atrás del sistema.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhotoViewer(
    photos: List<Photo>,
    start: Int,
    modMode: Boolean,
    onClose: () -> Unit,
    onRemove: (Photo) -> Unit,
) {
    if (photos.isEmpty()) return
    var i by remember(start) { mutableIntStateOf(start.coerceIn(0, photos.lastIndex)) }
    val photo = photos.getOrNull(i) ?: return

    Surface(
        Modifier.fillMaxSize(),
        color = Color.Black.copy(alpha = 0.94f),
    ) {
        Box(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            AsyncImage(
                model = photo.url,
                contentDescription = "Foto de la birra",
                contentScale = ContentScale.Fit,
                modifier = Modifier.align(Alignment.Center).fillMaxWidth().padding(16.dp),
            )

            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(14.dp)
                    .size(40.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Color.White.copy(alpha = 0.14f))
                    .clickable(onClick = onClose),
            ) {
                Text("×", Modifier.align(Alignment.Center), color = Ink.Cream, fontSize = 22.sp)
            }

            Column(
                Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (photos.size > 1) {
                    Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                        ViewerArrow("‹", i > 0) { i-- }
                        ViewerArrow("›", i < photos.lastIndex) { i++ }
                    }
                    Spacer(Modifier.height(12.dp))
                }

                Text(
                    buildString {
                        photo.authorName?.let {
                            append(if (photo.mine) "Tu foto" else it)
                            append(" · ")
                        }
                        append(
                            when {
                                photo.ageDays <= 0 -> "hoy"
                                photo.ageDays == 1 -> "ayer"
                                else -> "hace ${photo.ageDays} d"
                            },
                        )
                        if (photos.size > 1) append(" · ${i + 1}/${photos.size}")
                    },
                    color = Ink.Muted, fontSize = 12.5.sp,
                )

                // Lo propio se borra siempre, sin ser moderador: es tu foto.
                if (photo.mine || modMode) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        if (photo.mine) "Borrar tu foto" else "Eliminar esta foto",
                        Modifier
                            .clip(RoundedCornerShape(50))
                            .background(Ink.Danger.copy(alpha = 0.16f))
                            .clickable { onRemove(photo) }
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        color = Ink.Danger, fontSize = 12.5.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun ViewerArrow(glyph: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(50))
            .background(Color.White.copy(alpha = if (enabled) 0.14f else 0.05f))
            .clickable(enabled = enabled, onClick = onClick),
    ) {
        Text(
            glyph, Modifier.align(Alignment.Center),
            color = if (enabled) Ink.Cream else Ink.Faint, fontSize = 22.sp,
        )
    }
}
