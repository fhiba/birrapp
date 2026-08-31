package news.inkan.birrapp.ui.list

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import news.inkan.birrapp.R
import news.inkan.birrapp.data.model.BarPin
import news.inkan.birrapp.ui.common.FreshnessColors
import news.inkan.birrapp.ui.common.formatDistance
import news.inkan.birrapp.ui.common.formatPrice
import news.inkan.birrapp.ui.map.MapViewModel
import news.inkan.birrapp.ui.map.SortMode

/**
 * Misma data que el mapa, en lista. Comparte el ViewModel a propósito:
 * cambiar el orden en una pantalla tiene que reflejarse en la otra.
 */
@Composable
fun ListScreen(viewModel: MapViewModel, onBarClick: (Long) -> Unit) {
    val state by viewModel.state.collectAsState()

    Column(Modifier.fillMaxSize()) {
        PrimaryTabRow(selectedTabIndex = if (state.sort == SortMode.DISTANCE) 0 else 1) {
            Tab(
                selected = state.sort == SortMode.DISTANCE,
                onClick = { viewModel.setSort(SortMode.DISTANCE) },
                text = { Text(stringResource(R.string.sort_distance)) },
            )
            Tab(
                selected = state.sort == SortMode.CHEAPEST,
                onClick = { viewModel.setSort(SortMode.CHEAPEST) },
                text = { Text(stringResource(R.string.sort_cheapest)) },
            )
        }

        if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())

        if (!state.loading && state.bars.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    stringResource(R.string.empty_nearby),
                    Modifier.padding(32.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        LazyColumn {
            items(state.bars, key = { it.id }) { bar ->
                BarRow(bar) { onBarClick(bar.id) }
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun BarRow(bar: BarPin, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(bar.name, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Spacer(Modifier.height(2.dp))
            Text(
                formatDistance(bar.distanceMeters) ?: "",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            if (bar.fromPrice != null) {
                Text(
                    formatPrice(bar.fromPrice),
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = FreshnessColors.ofAge(bar.freshestAgeDays),
                )
                // Nunca un precio sin su edad al lado.
                Text(
                    bar.freshestAgeDays?.let { d ->
                        when { d <= 0 -> "hoy"; d == 1 -> "ayer"; else -> "hace $d días" }
                    } ?: "",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text(
                    stringResource(R.string.no_price_yet),
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
