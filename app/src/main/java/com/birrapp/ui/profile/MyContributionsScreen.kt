package com.birrapp.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.birrapp.data.api.ApiClient
import com.birrapp.data.model.*
import com.birrapp.ui.common.formatPrice
import com.birrapp.ui.theme.Ink

data class ContributionsUiState(
    val data: MyContributions? = null,
    val error: String? = null,
    val toast: String? = null,
)

class ContributionsViewModel(private val api: ApiClient) : ViewModel() {
    private val _state = MutableStateFlow(ContributionsUiState())
    val state = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            runCatching { api.myContributions() }
                .onSuccess { d -> _state.update { it.copy(data = d, error = null) } }
                .onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }

    fun removePrice(id: Long) = act("Precio borrado") { api.removeMyPrice(id) }
    fun removePhoto(id: Long) = act("Foto borrada") { api.removeMyPhoto(id) }
    fun removeComment(id: Long) = act("Comentario borrado") { api.removeMyComment(id) }

    private fun act(done: String, block: suspend () -> Any) {
        viewModelScope.launch {
            runCatching { block() }
                .onSuccess { _state.update { it.copy(toast = done) }; load() }
                .onFailure { e -> _state.update { it.copy(toast = e.message) } }
        }
    }

    fun clearToast() = _state.update { it.copy(toast = null) }
}

/**
 * Todo lo que cargó una persona, en un solo lugar.
 *
 * Existe porque la única forma de encontrar algo propio mal cargado era
 * acordarse en qué bar fue y navegar hasta ahí. Con veinte aportes eso no
 * escala.
 *
 * Los bares no se pueden borrar desde acá a propósito: un bar que creaste puede
 * tener precios y fotos de otra gente, así que borrarlo no deshace tu aporte,
 * borra el de terceros. Para eso está la denuncia, que la revisa un moderador.
 */
@Composable
fun MyContributionsScreen(
    viewModel: ContributionsViewModel,
    onBack: () -> Unit,
    onOpenBar: (Long) -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var kill by remember { mutableStateOf<Pair<String, () -> Unit>?>(null) }

    LaunchedEffect(state.toast) {
        state.toast?.let { snackbar.showSnackbar(it); viewModel.clearToast() }
    }

    Scaffold(
        containerColor = Ink.Base,
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            val d = state.data

            LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
                item {
                    Column(Modifier.statusBarsPadding().padding(18.dp, 8.dp, 18.dp, 0.dp)) {
                        Box(
                            Modifier
                                .size(38.dp)
                                .clip(RoundedCornerShape(50))
                                .background(Color.White.copy(alpha = 0.07f))
                                .clickable(onClick = onBack),
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack, "Volver",
                                Modifier.align(Alignment.Center).size(19.dp), tint = Ink.Cream,
                            )
                        }
                        Spacer(Modifier.height(18.dp))
                        Text(
                            "Mis aportes",
                            style = MaterialTheme.typography.displaySmall, color = Ink.Cream,
                        )
                        state.error?.let {
                            Spacer(Modifier.height(8.dp))
                            Text(it, color = Ink.Danger, fontSize = 13.sp)
                        }
                    }
                }

                if (d == null) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(40.dp)) {
                            CircularProgressIndicator(
                                Modifier.align(Alignment.Center).size(24.dp),
                                color = Ink.Amber, strokeWidth = 2.dp,
                            )
                        }
                    }
                } else if (d.prices.isEmpty() && d.photos.isEmpty() &&
                    d.comments.isEmpty() && d.bars.isEmpty()
                ) {
                    item {
                        Text(
                            "Todavía no cargaste nada.",
                            Modifier.fillMaxWidth().padding(40.dp),
                            color = Ink.Muted,
                        )
                    }
                } else {
                    if (d.prices.isNotEmpty()) {
                        item { SectionHead("Precios · ${d.prices.size}") }
                        items(d.prices, key = { "p-${it.id}" }) { p ->
                            Entry(
                                title = listOfNotNull(
                                    formatPrice(p.price), p.styleName, p.brandName,
                                ).joinToString(" · "),
                                sub = p.barName + if (p.sizeMl != 473) " · ${p.sizeMl} ml" else "",
                                ageDays = p.ageDays,
                                highlight = p.isCurrent,
                                tag = if (p.isConfirmation) "confirmación" else null,
                                onOpen = { onOpenBar(p.barId) },
                                onRemove = {
                                    kill = (
                                        if (p.isCurrent)
                                            "Es el precio que la app muestra hoy. Al borrarlo " +
                                                "queda el reporte anterior si lo hay, y si no, " +
                                                "el bar se queda sin ese precio."
                                        else
                                            "Es un reporte viejo: no cambia lo que se ve hoy, " +
                                                "sale del historial."
                                        ) to { viewModel.removePrice(p.id) }
                                },
                            )
                        }
                    }

                    if (d.comments.isNotEmpty()) {
                        item { SectionHead("Comentarios · ${d.comments.size}") }
                        items(d.comments, key = { "c-${it.id}" }) { c ->
                            Entry(
                                title = listOfNotNull(c.styleName, c.brandName)
                                    .joinToString(" · "),
                                sub = "${c.barName} — ${c.body}",
                                ageDays = c.ageDays,
                                onOpen = { onOpenBar(c.barId) },
                                onRemove = {
                                    kill = (
                                        "Se borra sólo el texto. Tu puntaje de esa birra queda " +
                                            "como está: borrar lo que escribiste no es retirar " +
                                            "tu voto."
                                        ) to { viewModel.removeComment(c.id) }
                                },
                            )
                        }
                    }

                    if (d.photos.isNotEmpty()) {
                        item { SectionHead("Fotos · ${d.photos.size}") }
                        items(d.photos, key = { "f-${it.id}" }) { f ->
                            Entry(
                                title = listOfNotNull(f.styleName, f.brandName)
                                    .joinToString(" · "),
                                sub = f.barName,
                                ageDays = f.ageDays,
                                thumb = f.url,
                                onOpen = { onOpenBar(f.barId) },
                                onRemove = {
                                    kill = (
                                        "Se borra el archivo del bucket, no sólo de la lista. " +
                                            "Mientras exista, cualquiera con el link la sigue " +
                                            "viendo: por eso hay que borrarlo."
                                        ) to { viewModel.removePhoto(f.id) }
                                },
                            )
                        }
                    }

                    if (d.bars.isNotEmpty()) {
                        item { SectionHead("Bares · ${d.bars.size}") }
                        items(d.bars, key = { "b-${it.id}" }) { b ->
                            Entry(
                                title = b.name,
                                sub = when (b.status) {
                                    "pending" -> "Esperando aprobación"
                                    "rejected" -> "Rechazado"
                                    else -> "Publicado"
                                },
                                ageDays = b.ageDays,
                                onOpen = { onOpenBar(b.id) },
                            )
                        }
                        item {
                            Text(
                                "Los bares no se borran desde acá: pueden tener precios y fotos " +
                                    "de otra gente, así que borrarlos no deshace tu aporte, " +
                                    "borra el de terceros. Si uno está mal cargado, reportalo " +
                                    "desde el bar.",
                                Modifier.padding(18.dp, 14.dp, 18.dp, 0.dp),
                                color = Ink.Faint, fontSize = 11.5.sp, lineHeight = 16.sp,
                            )
                        }
                    }
                }
            }
        }
    }

    kill?.let { (message, confirm) ->
        AlertDialog(
            onDismissRequest = { kill = null },
            containerColor = Ink.Raised,
            title = { Text("¿Borrar esto?", color = Ink.Cream) },
            text = { Text("$message\n\nNo se puede deshacer.", color = Ink.Muted) },
            confirmButton = {
                TextButton(onClick = { confirm(); kill = null }) {
                    Text("Borrar", color = Ink.Danger)
                }
            },
            dismissButton = {
                TextButton(onClick = { kill = null }) { Text("Cancelar", color = Ink.Muted) }
            },
        )
    }
}

@Composable
private fun SectionHead(text: String) {
    Text(
        text.uppercase(),
        Modifier.padding(18.dp, 26.dp, 18.dp, 8.dp),
        style = MaterialTheme.typography.labelLarge,
        color = Ink.Faint, fontSize = 10.sp, letterSpacing = 1.2.sp,
    )
}

@Composable
private fun Entry(
    title: String,
    sub: String,
    ageDays: Int,
    highlight: Boolean = false,
    tag: String? = null,
    thumb: String? = null,
    onOpen: () -> Unit,
    onRemove: (() -> Unit)? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen)
            .padding(18.dp, 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        thumb?.let {
            AsyncImage(
                model = it,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Ink.Elevated),
            )
            Spacer(Modifier.width(12.dp))
        }

        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    title,
                    color = if (highlight) Ink.Cream else Ink.Muted,
                    style = MaterialTheme.typography.labelLarge, fontSize = 15.sp,
                )
                if (highlight) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "vigente",
                        Modifier
                            .clip(RoundedCornerShape(50))
                            .background(Ink.AmberSoft)
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                        color = Ink.Amber, fontSize = 10.sp,
                    )
                }
                tag?.let {
                    Spacer(Modifier.width(8.dp))
                    Text(it, color = Ink.Faint, fontSize = 10.5.sp)
                }
            }
            Spacer(Modifier.height(2.dp))
            Text(
                sub + " · " + when {
                    ageDays <= 0 -> "hoy"
                    ageDays == 1 -> "ayer"
                    else -> "hace $ageDays d"
                },
                color = Ink.Faint, fontSize = 12.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }

        onRemove?.let {
            Spacer(Modifier.width(10.dp))
            Text(
                "Borrar",
                Modifier.clickable(onClick = it),
                color = Ink.Danger, fontSize = 12.sp,
            )
        }
    }
    HorizontalDivider(color = Color.White.copy(alpha = 0.06f))
}
