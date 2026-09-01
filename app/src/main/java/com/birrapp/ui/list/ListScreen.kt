package com.birrapp.ui.list

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.items
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
import com.birrapp.R
import com.birrapp.data.model.BarPin
import com.birrapp.ui.common.FreshnessColors
import com.birrapp.ui.common.formatDistance
import com.birrapp.ui.common.formatPrice
import com.birrapp.ui.map.MapViewModel
import com.birrapp.ui.map.SortMode
import com.birrapp.ui.theme.Ink
import com.birrapp.ui.theme.PriceMedium

/**
 * La misma data del mapa, en lista. Comparte ViewModel a propósito: cambiar el
 * orden acá tiene que verse en el mapa.
 *
 * Sin tarjetas. Filas al ras separadas por hairlines: una tarjeta por bar
 * mete dos bordes y una sombra por fila y convierte una lista de precios en
 * un muro de cajas. Lo que tiene que saltar es el número.
 */
@Composable
fun ListScreen(viewModel: MapViewModel, onBarClick: (Long) -> Unit) {
    val state by viewModel.state.collectAsState()
    val listState = rememberLazyListState()

    // Al cambiar el orden o el filtro, la lista es otra: quedarse a mitad de
    // scroll deja al usuario mirando el bar número 40 de un ranking nuevo.
    //
    // No alcanza con scrollear al cambiar el orden: en ese instante la lista
    // vieja sigue en pantalla, y cuando llega la nueva el LazyColumn reancla
    // el scroll usando las `key` de los ítems y vuelve a bajar. Hay que
    // esperar a que lleguen los datos nuevos.
    var pendingReset by remember { mutableStateOf(false) }
    LaunchedEffect(state.sort, state.styleFilter) { pendingReset = true }
    LaunchedEffect(state.bars, pendingReset) {
        if (pendingReset && !state.loading) {
            listState.scrollToItem(0)
            pendingReset = false
        }
    }

    Column(Modifier.fillMaxSize().background(Ink.Base)) {

        Row(
            Modifier
                .statusBarsPadding()
                .padding(horizontal = 18.dp)
                .padding(top = 14.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                if (state.sort == SortMode.CHEAPEST) "Más baratas" else "Cerca tuyo",
                style = MaterialTheme.typography.displaySmall,
                color = Ink.Cream,
            )
            Spacer(Modifier.weight(1f))
            Text(
                "${state.bars.size}",
                style = MaterialTheme.typography.displaySmall,
                color = Ink.Faint,
            )
        }

        Row(
            Modifier.padding(horizontal = 18.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SortPill(stringResource(R.string.sort_distance), state.sort == SortMode.DISTANCE) {
                viewModel.setSort(SortMode.DISTANCE)
            }
            SortPill(stringResource(R.string.sort_cheapest), state.sort == SortMode.CHEAPEST) {
                viewModel.setSort(SortMode.CHEAPEST)
            }
        }

        // Radio de búsqueda. Estaba fijo en 2 km, que en zona norte deja
        // afuera casi todo. Cuando hay un punto simulado, el radio se mide
        // desde ahí, no desde el usuario.
        Column(Modifier.padding(horizontal = 18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (state.simulated != null) {
                    // Acá sí conviene el aviso: en la lista no se ve el mapa,
                    // así que sin esto no hay forma de saber desde dónde se
                    // están midiendo las distancias.
                    Row(
                        Modifier
                            .clip(RoundedCornerShape(50))
                            .background(Ink.AmberSoft)
                            .clickable { viewModel.clearSimulated() }
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Desde el punto elegido", color = Ink.Amber, fontSize = 12.sp)
                        Spacer(Modifier.width(6.dp))
                        Text("✕", color = Ink.Amber, fontSize = 12.sp)
                    }
                } else {
                    Text("Desde tu ubicación", color = Ink.Faint, fontSize = 12.sp)
                }
                Spacer(Modifier.weight(1f))
                Text(
                    if (state.radiusMeters >= 1000)
                        "%.1f km".format(state.radiusMeters / 1000f).replace(".0", "")
                    else "${state.radiusMeters} m",
                    color = Ink.Amber, style = MaterialTheme.typography.labelLarge,
                )
            }
            Slider(
                value = state.radiusMeters.toFloat(),
                onValueChange = { viewModel.setRadius(it.toInt()) },
                valueRange = 300f..15_000f,
                steps = 28,
                colors = SliderDefaults.colors(
                    thumbColor = Ink.Amber,
                    activeTrackColor = Ink.Amber,
                    inactiveTrackColor = Ink.Hairline,
                ),
            )
        }

        if (state.loading) {
            LinearProgressIndicator(
                Modifier.fillMaxWidth().height(1.dp),
                color = Ink.Amber,
                trackColor = Color.Transparent,
            )
        }

        if (!state.loading && state.bars.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    stringResource(R.string.empty_nearby),
                    Modifier.padding(40.dp),
                    color = Ink.Muted,
                )
            }
        }

        LazyColumn(
            state = listState,
            contentPadding = PaddingValues(bottom = 120.dp),
        ) {
            items(state.bars, key = { it.id }) { bar ->
                BarRow(bar) { onBarClick(bar.id) }
                HorizontalDivider(color = Color.White.copy(alpha = 0.06f))
            }
        }
    }
}

@Composable
private fun SortPill(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) Ink.Cream else Color.White.copy(alpha = 0.07f))
            .clickable(onClick = onClick)
            .padding(horizontal = 15.dp, vertical = 8.dp),
    ) {
        Text(
            label,
            color = if (selected) Ink.Base else Ink.Muted,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
private fun BarRow(bar: BarPin, onClick: () -> Unit) {
    val accent = FreshnessColors.ofAge(bar.freshestAgeDays)
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(18.dp, 15.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Barra de frescura: sustituye al punto de color. Ocupa el alto de la
        // fila y se escanea en vertical sin leer nada.
        Box(
            Modifier
                .width(3.dp)
                .height(34.dp)
                .clip(RoundedCornerShape(50))
                .background(if (bar.fromPrice != null) accent else Color.White.copy(alpha = 0.12f))
        )
        Spacer(Modifier.width(14.dp))

        Column(Modifier.weight(1f)) {
            Text(
                bar.name,
                style = MaterialTheme.typography.titleMedium,
                color = Ink.Cream,
                maxLines = 1,
            )
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                formatDistance(bar.distanceMeters)?.let {
                    Text(it, fontSize = 12.sp, color = Ink.Faint)
                }
                bar.freshestAgeDays?.let { d ->
                    Text(" · ", fontSize = 12.sp, color = Ink.Faint)
                    Text(
                        when { d <= 0 -> "hoy"; d == 1 -> "ayer"; else -> "hace $d d" },
                        fontSize = 12.sp,
                        color = accent,
                    )
                }
            }
        }

        if (bar.fromPrice != null) {
            Text(formatPrice(bar.fromPrice), style = PriceMedium, color = Ink.Cream)
        } else {
            Text(
                stringResource(R.string.no_price_yet),
                fontSize = 12.sp,
                color = Ink.Faint,
            )
        }
    }
}
