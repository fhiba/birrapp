package com.birrapp.ui.bar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
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
import com.birrapp.data.model.NewBarRequest
import com.birrapp.data.places.PlaceSearch
import com.birrapp.data.places.PlaceSuggestion
import com.birrapp.data.places.ResolvedPlace
import com.birrapp.ui.theme.Ink

/**
 * Alta de bar, con el buscador de Google.
 *
 * Elegir el bar del buscador resuelve dos cosas de una: completa los datos
 * sin tipear, y **prueba que el lugar existe**. Por eso un bar elegido de ahí
 * entra aprobado, y sólo el cargado enteramente a mano pasa por moderación —
 * el riesgo que la moderación cubre es que alguien invente un lugar.
 *
 * De Google se guarda únicamente el `place_id`: sus términos prohíben
 * almacenar el resto del contenido de un lugar. El nombre y la ubicación que
 * terminan en nuestra base son los que el usuario confirmó.
 */
@Composable
fun AddBarScreen(
    api: ApiClient,
    lat: Double,
    lng: Double,
    onBack: () -> Unit,
    onDone: () -> Unit,
) {
    val context = LocalContext.current
    val search = remember { PlaceSearch(context) }
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }

    var query by remember { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<PlaceSuggestion>>(emptyList()) }
    var chosen by remember { mutableStateOf<ResolvedPlace?>(null) }
    var manualName by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var searching by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { search.startSession() }

    // Se espera a que deje de tipear: cada búsqueda es una llamada facturada,
    // y disparar por tecla multiplica el costo sin mejorar el resultado.
    LaunchedEffect(query) {
        if (chosen != null || query.length < 3) { suggestions = emptyList(); return@LaunchedEffect }
        searching = true
        delay(350)
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

            Column(Modifier.padding(horizontal = 18.dp)) {

                if (chosen == null) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        label = { Text("Buscá el bar", color = Ink.Faint) },
                        placeholder = { Text("Nombre del bar…", color = Ink.Faint) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Ink.Amber,
                            unfocusedBorderColor = Ink.Hairline,
                            focusedTextColor = Ink.Cream,
                            unfocusedTextColor = Ink.Cream,
                            cursorColor = Ink.Amber,
                        ),
                        trailingIcon = {
                            if (searching) {
                                CircularProgressIndicator(
                                    Modifier.size(16.dp), strokeWidth = 2.dp, color = Ink.Amber,
                                )
                            }
                        },
                    )

                    if (!search.isAvailable) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "El buscador no está disponible. Podés cargar el bar a mano.",
                            fontSize = 12.sp, color = Ink.Faint,
                        )
                    }

                    LazyColumn(Modifier.weight(1f, fill = false).padding(top = 8.dp)) {
                        items(suggestions, key = { it.placeId }) { s ->
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        scope.launch {
                                            chosen = search.resolve(s.placeId)
                                            if (chosen == null) {
                                                error = "No pudimos obtener la ubicación de ese lugar."
                                            }
                                        }
                                    }
                                    .padding(vertical = 12.dp),
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(s.primary, color = Ink.Cream,
                                        style = MaterialTheme.typography.titleMedium)
                                    Text(s.secondary, color = Ink.Faint, fontSize = 12.sp)
                                }
                            }
                            HorizontalDivider(color = Ink.Hairline)
                        }
                    }

                    if (query.length >= 3 && suggestions.isEmpty() && !searching) {
                        Spacer(Modifier.height(16.dp))
                        Text("¿No aparece?", color = Ink.Muted, fontSize = 13.sp)
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = manualName,
                            onValueChange = { manualName = it.take(200) },
                            label = { Text(stringResource(R.string.bar_name), color = Ink.Faint) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Ink.Amber,
                                unfocusedBorderColor = Ink.Hairline,
                                focusedTextColor = Ink.Cream,
                                unfocusedTextColor = Ink.Cream,
                                cursorColor = Ink.Amber,
                            ),
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Los bares cargados a mano los revisa un moderador antes " +
                                "de aparecer en el mapa.",
                            fontSize = 11.sp, color = Ink.Faint, lineHeight = 15.sp,
                        )
                    }
                } else {
                    // Confirmación
                    val place = chosen!!
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(Ink.Fresh.copy(alpha = 0.10f))
                            .padding(14.dp),
                    ) {
                        Icon(Icons.Default.CheckCircle, null, Modifier.size(20.dp), tint = Ink.Fresh)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(place.name, color = Ink.Cream,
                                style = MaterialTheme.typography.titleMedium)
                            place.address?.let {
                                Text(it, color = Ink.Muted, fontSize = 12.sp)
                            }
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Verificado en Google Maps · se publica al instante",
                                color = Ink.Fresh, fontSize = 11.sp,
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "¿No es este?",
                        Modifier.clickable { chosen = null; query = "" },
                        color = Ink.Amber, fontSize = 13.sp,
                    )
                }

                error?.let {
                    Spacer(Modifier.height(12.dp))
                    Text(it, color = Ink.Danger, fontSize = 13.sp)
                }
            }

            Spacer(Modifier.weight(1f))

            val canSend = chosen != null || manualName.isNotBlank()
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
                                name = manualName.trim(), lat = lat, lng = lng,
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
