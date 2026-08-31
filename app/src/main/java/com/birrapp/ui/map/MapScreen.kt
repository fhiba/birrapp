package com.birrapp.ui.map

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*
import com.birrapp.R
import com.birrapp.data.model.BarPin
import com.birrapp.ui.common.FreshnessColors
import com.birrapp.ui.common.formatPrice

@OptIn(MapsComposeExperimentalApi::class)
@Composable
fun MapScreen(
    viewModel: MapViewModel,
    onBarClick: (Long) -> Unit,
    onAddBar: (Double, Double) -> Unit,
) {
    val state by viewModel.state.collectAsState()

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(
            LatLng(state.center.first, state.center.second), 14f,
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) viewModel.refreshLocationThenLoad() }

    // Al terminar de mover el mapa, recargar la zona visible.
    LaunchedEffect(cameraPositionState.isMoving) {
        if (!cameraPositionState.isMoving) {
            val target = cameraPositionState.position.target
            viewModel.onMapMoved(target.latitude, target.longitude)
        }
    }

    Box(Modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(isMyLocationEnabled = state.hasLocationPermission),
            uiSettings = MapUiSettings(zoomControlsEnabled = false, myLocationButtonEnabled = false),
        ) {
            state.bars.forEach { bar ->
                MarkerComposable(
                    keys = arrayOf<Any>(bar.id, bar.fromPrice ?: -1.0, bar.freshestAgeDays ?: -1),
                    state = rememberUpdatedMarkerState(position = LatLng(bar.lat, bar.lng)),
                    onClick = { onBarClick(bar.id); true },
                ) {
                    PricePin(bar)
                }
            }
        }

        // Controles superpuestos
        Column(
            Modifier.align(Alignment.TopCenter).padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            SortToggle(
                sort = state.sort,
                onSort = viewModel::setSort,
            )
            if (state.styles.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                StyleFilterRow(
                    styles = state.styles,
                    selected = state.styleFilter,
                    onSelect = viewModel::setStyleFilter,
                )
            }
        }

        if (state.loading) {
            LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
        }

        state.error?.let { message ->
            Surface(
                Modifier.align(Alignment.BottomCenter).padding(16.dp),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.errorContainer,
            ) {
                Row(
                    Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(message, Modifier.weight(1f), fontSize = 13.sp)
                    TextButton(onClick = { viewModel.load(force = true) }) {
                        Text(stringResource(R.string.retry))
                    }
                }
            }
        }

        Column(
            Modifier.align(Alignment.BottomEnd).padding(16.dp),
            horizontalAlignment = Alignment.End,
        ) {
            SmallFloatingActionButton(onClick = {
                if (state.hasLocationPermission) {
                    viewModel.refreshLocationThenLoad()
                } else {
                    permissionLauncher.launch(Manifest.permission.ACCESS_COARSE_LOCATION)
                }
            }) {
                Icon(Icons.Default.LocationOn, stringResource(R.string.recenter))
            }
            Spacer(Modifier.height(12.dp))
            ExtendedFloatingActionButton(
                onClick = {
                    val t = cameraPositionState.position.target
                    onAddBar(t.latitude, t.longitude)
                },
                text = { Text(stringResource(R.string.add_this_bar)) },
                icon = { Text("+", fontSize = 20.sp) },
            )
        }
    }
}

/**
 * El pin. Muestra el precio directamente sobre el mapa — esa es la app
 * entera: no hay que tocar nada para ver cuánto sale.
 *
 * El color codifica frescura, así que un mapa lleno de pines grises se lee
 * de un vistazo como "estos datos están viejos".
 */
@Composable
private fun PricePin(bar: BarPin) {
    val color = FreshnessColors.ofAge(bar.freshestAgeDays)
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (bar.fromPrice != null) color else Color(0xFFBDBDBD),
        shadowElevation = 3.dp,
    ) {
        Text(
            text = bar.fromPrice?.let { formatPrice(it) } ?: "?",
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
        )
    }
}

@Composable
private fun SortToggle(sort: SortMode, onSort: (SortMode) -> Unit) {
    Surface(shape = RoundedCornerShape(20.dp), shadowElevation = 2.dp) {
        Row(Modifier.padding(3.dp)) {
            SortChip(stringResource(R.string.sort_distance), sort == SortMode.DISTANCE) {
                onSort(SortMode.DISTANCE)
            }
            SortChip(stringResource(R.string.sort_cheapest), sort == SortMode.CHEAPEST) {
                onSort(SortMode.CHEAPEST)
            }
        }
    }
}

@Composable
private fun SortChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val bg = if (selected) MaterialTheme.colorScheme.primary else Color.Transparent
    val fg = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
    Box(
        Modifier
            .clip(RoundedCornerShape(18.dp))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(label, color = fg, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun StyleFilterRow(
    styles: List<com.birrapp.data.model.BeerStyle>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    androidx.compose.foundation.lazy.LazyRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        item {
            FilterChip(
                selected = selected == null,
                onClick = { onSelect(null) },
                label = { Text("Todos", fontSize = 12.sp) },
            )
        }
        items(styles.size) { i ->
            val style = styles[i]
            FilterChip(
                selected = selected == style.slug,
                onClick = { onSelect(if (selected == style.slug) null else style.slug) },
                label = { Text(style.name, fontSize = 12.sp) },
            )
        }
    }
}
