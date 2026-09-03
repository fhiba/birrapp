package com.birrapp.ui.bar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.birrapp.data.model.RatingComment
import com.birrapp.ui.common.Stars
import com.birrapp.ui.theme.Ink

/**
 * Nota y comentarios de una birra.
 *
 * No están a la vista por defecto: el contenido de la pantalla es el precio y
 * la nota. El texto es el detalle que se busca cuando ya decidiste que te
 * interesa, y sacarlo de la vista principal es lo que permite meter varias
 * birras en una pantalla sin que sea un muro.
 *
 * La nota y el comentario son dos acciones separadas, y eso se ve. Las
 * estrellas se guardan al tocarlas, sin botón: son una sola por persona y por
 * birra, así que tocarlas de nuevo corrige la anterior. El texto tiene su
 * propio botón, y cada vez que lo usás dejás un comentario más — volviste seis
 * meses después y la canilla cambió, y eso es algo nuevo que decir.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BeerCommentsSheet(
    title: String,
    comments: List<RatingComment>?,
    myRating: Double?,
    canWrite: Boolean,
    modMode: Boolean,
    busy: Boolean,
    error: String?,
    onRate: (Int) -> Unit,
    onComment: (String) -> Unit,
    onDelete: (RatingComment) -> Unit,
    onDismiss: () -> Unit,
) {
    var body by remember { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Ink.Raised,
        dragHandle = { BottomSheetDefaults.DragHandle(color = Ink.Faint) },
    ) {
        Column(
            Modifier
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp)
                .navigationBarsPadding()
                .imePadding(),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge, color = Ink.Cream)
            Spacer(Modifier.height(14.dp))

            if (canWrite) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(Ink.Base)
                        .padding(12.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Stars(
                            value = myRating,
                            mine = myRating != null,
                            size = 26.sp,
                            onRate = onRate,
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            if (myRating != null) "Tu puntaje — tocá otra estrella para cambiarlo"
                            else "Tu puntaje",
                            color = Ink.Faint, fontSize = 12.sp, lineHeight = 15.sp,
                        )
                    }

                    Spacer(Modifier.height(10.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(11.dp))
                            .background(Ink.Raised)
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    ) {
                        if (body.isEmpty()) {
                            Text("Cómo estaba (opcional)", color = Ink.Faint, fontSize = 14.sp)
                        }
                        BasicTextField(
                            value = body,
                            onValueChange = { if (it.length <= 600) body = it },
                            textStyle = MaterialTheme.typography.bodyMedium.copy(color = Ink.Cream),
                            cursorBrush = SolidColor(Ink.Amber),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }

                    Spacer(Modifier.height(8.dp))
                    val canSend = body.isNotBlank() && !busy
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                when {
                                    !body.isNotBlank() -> Ink.Elevated
                                    busy -> Ink.AmberDeep
                                    else -> Ink.Amber
                                },
                            )
                            .clickable(enabled = canSend) { onComment(body.trim()); body = "" }
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            if (busy) "…" else "Comentar",
                            color = if (body.isNotBlank()) Ink.Base else Ink.Faint,
                            style = MaterialTheme.typography.labelLarge,
                            fontSize = 13.5.sp,
                        )
                    }
                }
                Spacer(Modifier.height(16.dp))
            }

            error?.let {
                Text(it, color = Ink.Danger, fontSize = 13.sp)
                Spacer(Modifier.height(8.dp))
            }

            when {
                comments == null -> Box(Modifier.fillMaxWidth().padding(24.dp)) {
                    CircularProgressIndicator(
                        Modifier.align(Alignment.Center).size(22.dp),
                        color = Ink.Amber, strokeWidth = 2.dp,
                    )
                }
                comments.isEmpty() -> Text(
                    "Todavía nadie comentó esta birra.",
                    color = Ink.Muted, style = MaterialTheme.typography.bodyMedium,
                )
                else -> LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    items(comments, key = { it.id }) { c ->
                        CommentRow(c, modMode) { onDelete(c) }
                    }
                }
            }
        }
    }
}

@Composable
private fun CommentRow(c: RatingComment, modMode: Boolean, onDelete: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // La nota puede faltar: se puede comentar sin votar.
            c.rating?.let {
                Stars(value = it, mine = c.mine, size = 13.sp)
                Spacer(Modifier.width(8.dp))
            }
            Text(
                if (c.mine) "Vos" else c.authorName,
                color = if (c.mine) Ink.Amber else Ink.Muted, fontSize = 13.sp,
            )
            Spacer(Modifier.weight(1f))
            // La edad va siempre pegada, igual que con los precios: un
            // comentario de hace dos años sobre una canilla que ya cambió dice
            // menos de lo que parece.
            Text(
                when {
                    c.ageDays <= 0 -> "hoy"
                    c.ageDays == 1 -> "ayer"
                    else -> "hace ${c.ageDays} d"
                },
                color = Ink.Faint, fontSize = 11.5.sp,
            )
        }

        c.body?.let {
            Spacer(Modifier.height(6.dp))
            Text(it, color = Ink.Cream, style = MaterialTheme.typography.bodyMedium)
        }

        // Lo propio se borra siempre, sin ser moderador: son tus palabras.
        if (c.mine || modMode) {
            Spacer(Modifier.height(6.dp))
            Text(
                if (c.mine) "Borrar" else "Eliminar",
                Modifier.clickable(onClick = onDelete),
                color = Ink.Danger, fontSize = 12.sp,
            )
        }
    }
    HorizontalDivider(color = Color.White.copy(alpha = 0.06f))
}
