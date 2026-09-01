package com.birrapp.ui.map

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.maps.android.compose.*
import com.birrapp.R
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sqrt
import com.birrapp.data.model.BarPin
import com.birrapp.data.model.BeerStyle
import com.birrapp.ui.common.FreshnessColors
import com.birrapp.ui.common.GlassPanel
import com.birrapp.ui.common.PintLoader
import com.birrapp.ui.common.GlassPill
import com.birrapp.ui.common.formatPrice
import com.birrapp.ui.theme.Ink
import com.birrapp.ui.theme.PricePin
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource

@OptIn(MapsComposeExperimentalApi::class)
@Composable
fun MapScreen(
    viewModel: MapViewModel,
    onBarClick: (Long) -> Unit,
    onAddBar: (Double, Double) -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    // El mapa es la fuente del blur: todo el vidrio de arriba lo refracta.
    val hazeState = remember { HazeState() }

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(
            LatLng(state.center.first, state.center.second), 15f,
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> if (granted) viewModel.refreshLocationThenLoad(recenter = true) }

    // Centrar en la ubicación cuando el usuario lo pide. Antes esto sólo
    // actualizaba el estado y recargaba la lista, pero la cámara no se movía:
    // el botón parecía no hacer nada.
    LaunchedEffect(state.recenterToken) {
        if (state.recenterToken > 0) {
            val update = CameraUpdateFactory.newLatLngZoom(
                LatLng(state.center.first, state.center.second), 15f,
            )
            if (state.recenterAnimated) {
                cameraPositionState.animate(update, durationMs = 700)
            } else {
                cameraPositionState.move(update)
            }
        }
    }

    LaunchedEffect(cameraPositionState.isMoving) {
        if (!cameraPositionState.isMoving) {
            val t = cameraPositionState.position.target
            viewModel.onMapMoved(t.latitude, t.longitude, cameraPositionState.position.zoom)
        }
    }

    val zoom = cameraPositionState.position.zoom

    val mapStyle = remember {
        MapStyleOptions.loadRawResourceStyle(context, R.raw.map_style_night)
    }

    Box(Modifier.fillMaxSize().background(Ink.Base)) {

        // Hasta resolver la ubicación no se dibuja nada. Antes se mostraba el
        // Obelisco por un segundo y después saltaba: prefiero una espera
        // honesta a un lugar equivocado, aunque sea por un instante.
        if (!state.locationResolved) {
            PintLoader(
                message = "Buscando dónde estás…",
                modifier = Modifier.align(Alignment.Center),
            )
            return@Box
        }

        GoogleMap(
            modifier = Modifier.fillMaxSize().hazeSource(hazeState),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(
                isMyLocationEnabled = state.hasLocationPermission,
                mapStyleOptions = mapStyle,
            ),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                myLocationButtonEnabled = false,
                mapToolbarEnabled = false,
                compassEnabled = false,
            ),
            // Mantener apretado deja un punto para explorar otra zona; un
            // toque simple lo saca. Es el gesto que ya usa Google Maps, así
            // que no hay nada nuevo que aprender.
            onMapLongClick = { viewModel.setSimulated(it.latitude, it.longitude) },
            onMapClick = { viewModel.clearSimulated() },
        ) {
            // Alejado, las etiquetas de precio se amontonan y no se lee ninguna.
            // Por debajo de este zoom todo pasa a ser punto: el mapa muestra
            // dónde hay datos, y el precio aparece al acercarse.
            val showLabels = zoom >= 14.5f

            // Descarte de etiquetas superpuestas.
            //
            // El zIndex decide quién queda arriba, pero no evita que dos
            // cápsulas se pisen: la de abajo queda cortada y no se lee. Acá
            // se recorren los bares del más barato al más caro y se le da
            // etiqueta sólo al que no cae encima de una ya puesta; el resto
            // queda como punto. Es lo que hacen los mapas con sus propias
            // etiquetas de POI, y es la razón por la que se leen.
            val labelled = remember(state.bars, zoom) {
                // Metros por dp al zoom actual (proyección Web Mercator).
                val metersPerDp =
                    156543.03392 * cos(Math.toRadians(state.center.first)) / 2.0.pow(zoom.toDouble())
                val minSep = 132.0 * metersPerDp   // ~ancho de una cápsula de precio
                val kept = mutableListOf<BarPin>()
                state.bars.asSequence()
                    .filter { it.fromPrice != null }
                    .sortedBy { it.fromPrice }
                    .forEach { candidate ->
                        val collides = kept.any { k ->
                            // Equirectangular: a estas distancias el error es
                            // despreciable y evita trigonometría por par.
                            val dLat = (k.lat - candidate.lat) * 111_320.0
                            val dLng = (k.lng - candidate.lng) * 111_320.0 *
                                cos(Math.toRadians(candidate.lat))
                            sqrt(dLat * dLat + dLng * dLng) < minSep
                        }
                        if (!collides) kept += candidate
                    }
                kept.mapTo(HashSet()) { it.id }
            }

            // Entre los que sí llevan etiqueta, el más barato va arriba.
            val maxPrice = state.bars.mapNotNull { it.fromPrice }.maxOrNull() ?: 1.0

            state.simulated?.let { (sLat, sLng) ->
                MarkerComposable(
                    keys = arrayOf<Any>("simulated", sLat, sLng),
                    state = rememberUpdatedMarkerState(position = LatLng(sLat, sLng)),
                    anchor = Offset(0.5f, 0.5f),
                    zIndex = 100f,
                ) {
                    Box(
                        Modifier.size(26.dp).clip(RoundedCornerShape(50))
                            .background(Ink.Cream.copy(alpha = 0.28f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            Modifier.size(13.dp).clip(RoundedCornerShape(50))
                                .background(Ink.Cream)
                        )
                    }
                }
            }

            state.bars.forEach { bar ->
                val z = when {
                    bar.fromPrice == null -> 0f
                    else -> 1f + (1f - (bar.fromPrice / maxPrice).toFloat())
                }
                MarkerComposable(
                    keys = arrayOf<Any>(
                        bar.id, bar.fromPrice ?: -1.0, bar.freshestAgeDays ?: -1,
                        showLabels && bar.id in labelled,
                    ),
                    state = rememberUpdatedMarkerState(position = LatLng(bar.lat, bar.lng)),
                    onClick = { onBarClick(bar.id); true },
                    zIndex = z,
                    anchor = Offset(0.5f, 0.5f),
                ) {
                    PricePin(bar, showLabels && bar.id in labelled)
                }
            }
        }

        // ---- capa flotante de vidrio ----
        Column(
            Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Orden y radio en la misma fila: son dos controles chicos y el
            // mapa es el contenido, no los controles.
            Row(
                Modifier.padding(horizontal = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SortSelector(hazeState, state.sort, viewModel::setSort)
                RadiusControl(hazeState, state.radiusMeters, viewModel::setRadius)
            }

            if (state.styles.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                StyleFilterRow(hazeState, state.styles, state.styleFilter, viewModel::setStyleFilter)
            }

            // El aviso de zoom se queda: sin él la pantalla queda vacía sin
            // explicación. Los de "buscando" se fueron: el usuario ya ve que
            // los pines cambian, y tres carteles simultáneos tapaban el mapa.
            AnimatedVisibility(state.tooZoomedOut, enter = fadeIn(), exit = fadeOut()) {
                Box(Modifier.padding(top = 8.dp)) {
                    GlassPanel(hazeState, shape = RoundedCornerShape(50)) {
                        Text(
                            "Acercá el mapa para ver bares",
                            Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                            color = Ink.Muted, fontSize = 12.sp,
                        )
                    }
                }
            }
        }

        state.error?.let { message ->
            GlassPanel(
                hazeState,
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 16.dp)
                    .navigationBarsPadding()
                    .padding(bottom = 84.dp),
                shape = RoundedCornerShape(20.dp),
                tint = Ink.Danger,
            ) {
                Row(
                    Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(message, Modifier.weight(1f), color = Ink.Cream, fontSize = 13.sp)
                    TextButton(onClick = { viewModel.load(force = true) }) {
                        Text(stringResource(R.string.retry), color = Ink.Amber)
                    }
                }
            }
        }

        // Ubicación a la izquierda, agregar a la derecha. Antes estaban
        // apilados en la misma esquina y se leían como un solo control.
        GlassPanel(
            hazeState,
            Modifier
                .align(Alignment.BottomStart)
                .navigationBarsPadding()
                .padding(start = 14.dp, bottom = 84.dp)
                .size(48.dp)
                .clickable {
                    if (state.hasLocationPermission) {
                        viewModel.refreshLocationThenLoad(recenter = true)
                    } else {
                        permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                    }
                },
            shape = RoundedCornerShape(50),
        ) {
            Icon(
                Icons.Default.LocationOn,
                stringResource(R.string.recenter),
                Modifier.align(Alignment.Center).size(21.dp),
                tint = if (state.hasLocationPermission) Ink.Amber else Ink.Muted,
            )
        }

        Box(
            Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(end = 14.dp, bottom = 84.dp)
                .size(52.dp)
                .clip(RoundedCornerShape(50))
                .background(Ink.Amber)
                .clickable {
                    val t = cameraPositionState.position.target
                    onAddBar(t.latitude, t.longitude)
                },
        ) {
            Icon(
                Icons.Default.Add,
                stringResource(R.string.add_this_bar),
                Modifier.align(Alignment.Center).size(25.dp),
                tint = Ink.Base,
            )
        }
    }
}

/**
 * Radio de búsqueda.
 *
 * Colapsado muestra sólo la distancia; se despliega al tocarlo. Un slider
 * siempre visible se come el ancho de la pantalla para algo que se ajusta una
 * vez y no se toca más.
 */
@Composable
private fun RadiusControl(
    hazeState: HazeState,
    radiusMeters: Int,
    onChange: (Int) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val label = if (radiusMeters >= 1000) "%.1f km".format(radiusMeters / 1000f).replace(".0", "")
                else "$radiusMeters m"

    GlassPanel(hazeState, shape = RoundedCornerShape(22.dp)) {
        Column(
            Modifier
                .animateContentSize()
                .padding(horizontal = 13.dp, vertical = 9.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(
                Modifier.clickable { open = !open },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Default.Search, null,
                    Modifier.size(14.dp), tint = Ink.Muted,
                )
                Spacer(Modifier.width(6.dp))
                Text(label, color = Ink.Amber, style = MaterialTheme.typography.labelLarge)
            }
            if (open) {
                Spacer(Modifier.height(4.dp))
                Slider(
                    value = radiusMeters.toFloat(),
                    onValueChange = { onChange(it.toInt()) },
                    // Hasta 15 km: más que eso deja de ser "cerca" y la
                    // consulta empieza a traer media ciudad.
                    valueRange = 300f..15_000f,
                    steps = 28,
                    modifier = Modifier.width(230.dp),
                    colors = SliderDefaults.colors(
                        thumbColor = Ink.Amber,
                        activeTrackColor = Ink.Amber,
                        inactiveTrackColor = Ink.Hairline,
                    ),
                )
            }
        }
    }
}

/**
 * El pin: cápsula de vidrio con el precio.
 *
 * El color viene de la frescura, así que un mapa lleno de pines grises se lee
 * de un vistazo como "estos datos están viejos" sin tener que abrir nada. Un
 * bar sin precio queda como punto tenue: presente pero sin reclamar atención.
 */
@Composable
private fun PricePin(bar: BarPin, showLabel: Boolean) {
    if (bar.fromPrice == null || !showLabel) {
        val hasPrice = bar.fromPrice != null
        Box(
            Modifier
                .size(if (hasPrice) 13.dp else 9.dp)
                .clip(RoundedCornerShape(50))
                .background(
                    if (hasPrice) FreshnessColors.ofAge(bar.freshestAgeDays)
                    else Color.White.copy(alpha = 0.20f)
                )
        )
        return
    }
    GlassPill(accent = FreshnessColors.ofAge(bar.freshestAgeDays)) {
        Text(
            formatPrice(bar.fromPrice),
            Modifier.padding(horizontal = 11.dp, vertical = 5.dp),
            color = Ink.Base,
            style = PricePin,
        )
    }
}

/** Segmentado flotante. Reemplaza al TabRow de Material, que se ve genérico. */
@Composable
private fun SortSelector(
    hazeState: HazeState,
    sort: SortMode,
    onSort: (SortMode) -> Unit,
) {
    GlassPanel(hazeState, shape = RoundedCornerShape(50)) {
        Row(Modifier.padding(4.dp)) {
            SegmentChip(stringResource(R.string.sort_distance), sort == SortMode.DISTANCE) {
                onSort(SortMode.DISTANCE)
            }
            SegmentChip(stringResource(R.string.sort_cheapest), sort == SortMode.CHEAPEST) {
                onSort(SortMode.CHEAPEST)
            }
        }
    }
}

@Composable
private fun SegmentChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) Ink.Amber else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 9.dp),
    ) {
        Text(
            label,
            color = if (selected) Ink.Base else Ink.Cream.copy(alpha = 0.75f),
            style = MaterialTheme.typography.labelLarge,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun StyleFilterRow(
    hazeState: HazeState,
    styles: List<BeerStyle>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        contentPadding = PaddingValues(horizontal = 14.dp),
    ) {
        item { StyleChip(hazeState, "Todos", selected == null) { onSelect(null) } }
        items(styles, key = { it.slug }) { style ->
            StyleChip(hazeState, style.name, selected == style.slug) {
                onSelect(if (selected == style.slug) null else style.slug)
            }
        }
    }
}

@Composable
private fun StyleChip(
    hazeState: HazeState,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    if (selected) {
        Box(
            Modifier
                .clip(RoundedCornerShape(50))
                .background(Ink.Cream)
                .clickable(onClick = onClick)
                .padding(horizontal = 14.dp, vertical = 7.dp),
        ) {
            Text(label, color = Ink.Base, fontSize = 12.sp,
                style = MaterialTheme.typography.labelLarge)
        }
    } else {
        GlassPanel(
            hazeState,
            Modifier.clickable(onClick = onClick),
            shape = RoundedCornerShape(50),
            intensity = 0.8f,
        ) {
            Text(
                label,
                Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                color = Ink.Cream.copy(alpha = 0.8f),
                fontSize = 12.sp,
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
}
