package com.birrapp.ui.list

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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

        LazyColumn(contentPadding = PaddingValues(bottom = 110.dp)) {
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
