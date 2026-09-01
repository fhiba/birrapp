package com.birrapp.ui.bar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import com.birrapp.R
import com.birrapp.data.api.ApiClient
import com.birrapp.data.model.BarPin
import com.birrapp.data.model.NewBarRequest
import com.birrapp.data.places.PlaceSearch
import com.birrapp.data.places.PlaceSuggestion
import com.birrapp.data.places.ResolvedPlace
import com.birrapp.ui.common.formatDistance
import com.birrapp.ui.theme.Ink

/**
 * Alta de bar, en tres capas y en este orden:
 *
 *  1. **Lo que ya está cargado.** Si el bar existe, el usuario lo ve y sigue
 *     de largo. Es la defensa más barata contra el mismo bar cargado cinco
 *     veces con cinco grafías distintas.
 *  2. **Google.** Completa los datos y prueba que el lugar existe, así que
 *     esos entran aprobados.
 *  3. **A mano, siempre disponible.** Google no tiene todo, y quedarse sin
 *     salida es peor que un bar pendiente de revisión. Estos piden dirección
 *     —sin ella un moderador no puede verificar nada— y pasan por la cola.
 */
@Composable
fun AddBarScreen(
    api: ApiClient,
    lat: Double,
    lng: Double,
    onBack: () -> Unit,
    onDone: () -> Unit,
    onOpenBar: (Long) -> Unit,
) {
    val context = LocalContext.current
    val search = remember { PlaceSearch(context) }
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }

    var query by remember { mutableStateOf("") }
    var existing by remember { mutableStateOf<List<BarPin>>(emptyList()) }
    var suggestions by remember { mutableStateOf<List<PlaceSuggestion>>(emptyList()) }
    var chosen by remember { mutableStateOf<ResolvedPlace?>(null) }
    var manual by remember { mutableStateOf(false) }
    var manualAddress by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var searching by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { search.startSession() }

    LaunchedEffect(query) {
        if (chosen != null || query.length < 2) {
            existing = emptyList(); suggestions = emptyList(); return@LaunchedEffect
        }
        searching = true
        delay(350)
        // Primero la base propia: es gratis, instantánea y evita duplicados.
        existing = runCatching { api.searchBars(query, lat, lng) }.getOrDefault(emptyList())
        // Después Google, para lo que falta.
        suggestions = search.suggest(query, lat, lng)
        searching = false
    }

    Scaffold(
        containerColor = Ink.Base,
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().statusBarsPadding()) {

            Row(
                Modifier.fillMaxWidth().padding(14.dp, 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(38.dp).clip(RoundedCornerShape(50))
                        .background(Ink.Elevated).clickable(onClick = onBack),
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack, "Volver",
                        Modifier.align(Alignment.Center).size(19.dp), tint = Ink.Cream,
                    )
                }
                Spacer(Modifier.width(12.dp))
                Text(
                    stringResource(R.string.new_bar),
                    style = MaterialTheme.typography.headlineSmall, color = Ink.Cream,
                )
            }

            if (chosen != null) {
                ConfirmedPlace(chosen!!) { chosen = null; query = "" }
            } else {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it; manual = false },
                    label = { Text("¿Cómo se llama?", color = Ink.Faint) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp),
                    colors = fieldColors(),
                    trailingIcon = {
                        if (searching) CircularProgressIndicator(
                            Modifier.size(16.dp), strokeWidth = 2.dp, color = Ink.Amber,
                        )
                    },
                )

                LazyColumn(Modifier.weight(1f).padding(horizontal = 18.dp)) {

                    if (existing.isNotEmpty()) {
                        item { SectionLabel("Ya está en birrapp") }
                        items(existing, key = { "e${it.id}" }) { bar ->
                            Row(
                                Modifier.fillMaxWidth()
                                    .clickable { onOpenBar(bar.id) }
                                    .padding(vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Default.CheckCircle, null,
                                    Modifier.size(18.dp), tint = Ink.Fresh)
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(bar.name, color = Ink.Cream,
                                        style = MaterialTheme.typography.titleMedium)
                                    formatDistance(bar.distanceMeters)?.let {
                                        Text(it, color = Ink.Faint, fontSize = 12.sp)
                                    }
                                }
                                Text("Ver", color = Ink.Amber, fontSize = 13.sp)
                            }
                            HorizontalDivider(color = Ink.Hairline)
                        }
                    }

                    if (suggestions.isNotEmpty()) {
                        item { SectionLabel("Encontrados en Google") }
                        items(suggestions, key = { it.placeId }) { s ->
                            Row(
                                Modifier.fillMaxWidth()
                                    .clickable {
                                        scope.launch {
                                            chosen = search.resolve(s.placeId)
                                            if (chosen == null) {
                                                error = "No pudimos obtener la ubicación de ese lugar."
                                            }
                                        }
                                    }
                                    .padding(vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Default.Place, null,
                                    Modifier.size(18.dp), tint = Ink.Amber)
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(s.primary, color = Ink.Cream,
                                        style = MaterialTheme.typography.titleMedium)
                                    Text(s.secondary, color = Ink.Faint, fontSize = 12.sp)
                                }
                            }
                            HorizontalDivider(color = Ink.Hairline)
                        }
                    }

                    // La salida a mano está SIEMPRE, no sólo cuando no hay
                    // resultados: Google no tiene todo y quedarse trabado es
                    // peor que un bar esperando revisión.
                    if (query.length >= 2 && !searching) {
                        item {
                            Spacer(Modifier.height(16.dp))
                            if (!manual) {
                                Row(
                                    Modifier.fillMaxWidth()
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(Ink.Elevated)
                                        .clickable { manual = true }
                                        .padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(Icons.Default.Add, null,
                                        Modifier.size(18.dp), tint = Ink.Amber)
                                    Spacer(Modifier.width(10.dp))
                                    Column {
                                        Text("Agregar \"$query\"", color = Ink.Cream,
                                            style = MaterialTheme.typography.titleMedium)
                                        Text("Lo revisa un moderador antes de publicarse",
                                            color = Ink.Faint, fontSize = 11.sp)
                                    }
                                }
                            } else {
                                Text("Agregar \"$query\"", color = Ink.Cream,
                                    style = MaterialTheme.typography.titleMedium)
                                Spacer(Modifier.height(10.dp))
                                OutlinedTextField(
                                    value = manualAddress,
                                    onValueChange = { manualAddress = it.take(300) },
                                    label = { Text("Dirección", color = Ink.Faint) },
                                    placeholder = {
                                        Text("Calle y altura, o esquina", color = Ink.Faint)
                                    },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = fieldColors(),
                                )
                                Spacer(Modifier.height(8.dp))
                                Text(
                                    // La dirección no es opcional acá: sin ella
                                    // el moderador no tiene con qué verificar.
                                    "Hace falta la dirección para que un moderador pueda " +
                                        "verificar que el bar existe.",
                                    color = Ink.Faint, fontSize = 11.sp, lineHeight = 15.sp,
                                )
                            }
                        }
                    }

                    item { Spacer(Modifier.height(20.dp)) }
                }
            }

            error?.let {
                Text(it, Modifier.padding(horizontal = 18.dp),
                    color = Ink.Danger, fontSize = 13.sp)
            }

            val canSend = chosen != null || (manual && manualAddress.isNotBlank())
            Box(
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(18.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(if (canSend) Ink.Amber else Ink.Elevated)
                    .clickable(enabled = canSend && !sending) {
                        sending = true; error = null
                        scope.launch {
                            val body = chosen?.let {
                                NewBarRequest(
                                    name = it.name, lat = it.lat, lng = it.lng,
                                    address = it.address, googlePlaceId = it.placeId,
                                )
                            } ?: NewBarRequest(
                                name = query.trim(), lat = lat, lng = lng,
                                address = manualAddress.trim(),
                            )
                            runCatching { api.addBar(body) }
                                .onSuccess {
                                    sending = false
                                    snackbar.showSnackbar(
                                        if (chosen != null) "¡Listo! Ya está en el mapa."
                                        else "Listo. Un moderador lo revisa."
                                    )
                                    onDone()
                                }
                                .onFailure { e -> sending = false; error = e.message }
                        }
                    }
                    .padding(vertical = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (sending) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp,
                        color = Ink.Base)
                } else {
                    Text(
                        stringResource(R.string.send),
                        color = if (canSend) Ink.Base else Ink.Faint,
                        style = MaterialTheme.typography.labelLarge, fontSize = 15.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text.uppercase(),
        Modifier.padding(top = 18.dp, bottom = 6.dp),
        color = Ink.Faint, fontSize = 10.sp, letterSpacing = 1.2.sp,
        style = MaterialTheme.typography.labelLarge,
    )
}

@Composable
private fun ConfirmedPlace(place: ResolvedPlace, onClear: () -> Unit) {
    Column(Modifier.padding(horizontal = 18.dp)) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                .background(Ink.Fresh.copy(alpha = 0.10f)).padding(14.dp),
        ) {
            Icon(Icons.Default.CheckCircle, null, Modifier.size(20.dp), tint = Ink.Fresh)
            Spacer(Modifier.width(10.dp))
            Column {
                Text(place.name, color = Ink.Cream,
                    style = MaterialTheme.typography.titleMedium)
                place.address?.let { Text(it, color = Ink.Muted, fontSize = 12.sp) }
                Spacer(Modifier.height(6.dp))
                Text("Verificado en Google Maps · se publica al instante",
                    color = Ink.Fresh, fontSize = 11.sp)
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("¿No es este?", Modifier.clickable(onClick = onClear),
            color = Ink.Amber, fontSize = 13.sp)
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Ink.Amber,
    unfocusedBorderColor = Ink.Hairline,
    focusedTextColor = Ink.Cream,
    unfocusedTextColor = Ink.Cream,
    cursorColor = Ink.Amber,
)
