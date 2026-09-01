package com.birrapp.ui.bar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Warning
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
import com.birrapp.R
import com.birrapp.data.model.Freshness
import com.birrapp.data.model.StylePrice
import com.birrapp.ui.common.FreshnessColors
import com.birrapp.ui.common.ageLabel
import com.birrapp.ui.common.openDirections
import com.birrapp.ui.common.formatDistance
import com.birrapp.ui.common.formatPrice
import com.birrapp.ui.report.ReportPriceSheet
import com.birrapp.ui.theme.Ink
import com.birrapp.ui.theme.PriceLarge

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BarDetailScreen(
    viewModel: BarDetailViewModel,
    isSignedIn: Boolean,
    isModerator: Boolean,
    onBack: () -> Unit,
    onNeedSignIn: () -> Unit,
    onBarDeleted: () -> Unit,
) {
    var confirmDelete by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    val state by viewModel.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    var reportingStyle by remember { mutableStateOf<String?>(null) }
    var showReportSheet by remember { mutableStateOf(false) }

    LaunchedEffect(state.toast) {
        state.toast?.let { snackbar.showSnackbar(it); viewModel.clearToast() }
    }

    Scaffold(
        containerColor = Ink.Base,
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {

            if (state.loading && state.bar == null) {
                LinearProgressIndicator(
                    Modifier.fillMaxWidth().height(1.dp),
                    color = Ink.Amber, trackColor = Color.Transparent,
                )
            }

            state.error?.let { message ->
                Column(
                    Modifier.align(Alignment.Center).padding(28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(message, color = Ink.Muted)
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = viewModel::load,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Ink.Amber, contentColor = Ink.Base,
                        ),
                    ) { Text(stringResource(R.string.retry)) }
                }
            }

            val bar = state.bar ?: return@Box

            LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {

                item {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .statusBarsPadding()
                            .padding(horizontal = 18.dp)
                            .padding(top = 8.dp, bottom = 18.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier
                                    .size(38.dp)
                                    .clip(RoundedCornerShape(50))
                                    .background(Color.White.copy(alpha = 0.07f))
                                    .clickable(onClick = onBack),
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.ArrowBack, "Volver",
                                    Modifier.align(Alignment.Center).size(19.dp),
                                    tint = Ink.Cream,
                                )
                            }

                            Spacer(Modifier.weight(1f))

                            // Moderación en un menú secundario: son acciones
                            // destructivas y poco frecuentes, no merecen un
                            // bloque permanente al final de cada bar.
                            if (isModerator) {
                                Box {
                                    Box(
                                        Modifier
                                            .size(38.dp)
                                            .clip(RoundedCornerShape(50))
                                            .background(
                                                if (menuOpen) Ink.AmberSoft
                                                else Color.White.copy(alpha = 0.07f)
                                            )
                                            .clickable { menuOpen = true },
                                    ) {
                                        Icon(
                                            Icons.Default.MoreVert,
                                            "Opciones de moderación",
                                            Modifier.align(Alignment.Center).size(19.dp),
                                            tint = if (menuOpen) Ink.Amber else Ink.Muted,
                                        )
                                    }
                                    DropdownMenu(
                                        expanded = menuOpen,
                                        onDismissRequest = { menuOpen = false },
                                        containerColor = Ink.Elevated,
                                    ) {
                                        DropdownMenuItem(
                                            text = {
                                                Text(
                                                    "Eliminar bar",
                                                    color = Ink.Danger,
                                                    style = MaterialTheme.typography.labelLarge,
                                                )
                                            },
                                            onClick = {
                                                menuOpen = false
                                                confirmDelete = true
                                            },
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(Modifier.height(20.dp))
                        Text(
                            bar.name,
                            style = MaterialTheme.typography.displaySmall,
                            color = Ink.Cream,
                        )
                        Spacer(Modifier.height(6.dp))

                        val meta = listOfNotNull(
                            formatDistance(bar.distanceMeters),
                            bar.neighbourhood,
                            bar.address,
                        ).joinToString(" · ")
                        if (meta.isNotBlank()) {
                            Text(meta, fontSize = 13.sp, color = Ink.Faint)
                        }
                        if (bar.reviewCount > 0 && bar.avgRating != null) {
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "★ %.1f · %d reseñas".format(bar.avgRating, bar.reviewCount),
                                fontSize = 13.sp, color = Ink.Muted,
                            )
                        }

                        Spacer(Modifier.height(16.dp))
                        Row(
                            Modifier
                                .clip(RoundedCornerShape(12.dp))
                                .background(Ink.Elevated)
                                .clickable {
                                    openDirections(context, bar.lat, bar.lng, bar.name)
                                }
                                .padding(horizontal = 16.dp, vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                Icons.Default.Place, null,
                                Modifier.size(17.dp), tint = Ink.Amber,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                stringResource(R.string.directions),
                                color = Ink.Cream,
                                style = MaterialTheme.typography.labelLarge,
                            )
                        }
                    }
                }

                if (bar.prices.isEmpty()) {
                    item {
                        Column(Modifier.padding(18.dp)) {
                            Text(
                                stringResource(R.string.no_prices),
                                color = Ink.Muted,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            Spacer(Modifier.height(16.dp))
                            PrimaryAction(stringResource(R.string.report_first_price)) {
                                if (isSignedIn) { reportingStyle = null; showReportSheet = true }
                                else onNeedSignIn()
                            }
                        }
                    }
                } else {
                    items(bar.prices, key = { it.styleSlug }) { price ->
                        PriceRow(
                            price = price,
                            busy = state.busyStyle == price.styleSlug,
                            isModerator = isModerator,
                            onRemove = { viewModel.removePrice(price.id) },
                            onConfirm = {
                                if (isSignedIn) viewModel.confirmPrice(price.styleSlug)
                                else onNeedSignIn()
                            },
                            onUpdate = {
                                if (isSignedIn) {
                                    reportingStyle = price.styleSlug; showReportSheet = true
                                } else onNeedSignIn()
                            },
                        )
                        HorizontalDivider(color = Color.White.copy(alpha = 0.06f))
                    }
                    item {
                        Box(Modifier.padding(18.dp)) {
                            PrimaryAction("+  " + stringResource(R.string.report_price)) {
                                if (isSignedIn) { reportingStyle = null; showReportSheet = true }
                                else onNeedSignIn()
                            }
                        }
                    }
                }

                if (state.reviews.isNotEmpty()) {
                    item {
                        Text(
                            stringResource(R.string.reviews_title).uppercase(),
                            Modifier.padding(18.dp, 20.dp, 18.dp, 10.dp),
                            style = MaterialTheme.typography.labelLarge,
                            color = Ink.Faint,
                            letterSpacing = 1.4.sp,
                            fontSize = 11.sp,
                        )
                    }
                    items(state.reviews, key = { it.id }) { review ->
                        Column(Modifier.fillMaxWidth().padding(18.dp, 10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("★".repeat(review.rating), fontSize = 12.sp, color = Ink.Amber)
                                Spacer(Modifier.width(8.dp))
                                Text(review.authorName, fontSize = 13.sp, color = Ink.Muted)
                                Spacer(Modifier.weight(1f))
                                Icon(
                                    Icons.Default.Warning,
                                    stringResource(R.string.flag_content),
                                    Modifier
                                        .size(15.dp)
                                        .clickable {
                                            if (isSignedIn) {
                                                viewModel.flag(
                                                    "review", review.id, "contenido inapropiado",
                                                )
                                            } else onNeedSignIn()
                                        },
                                    tint = Ink.Faint,
                                )
                            }
                            review.body?.let {
                                Spacer(Modifier.height(4.dp))
                                Text(it, color = Ink.Cream,
                                    style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }
        }
    }

    if (confirmDelete) {
        val name = state.bar?.name ?: "este bar"
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            containerColor = Ink.Raised,
            title = { Text("¿Eliminar $name?", color = Ink.Cream) },
            text = {
                Text(
                    "Se borran el bar y todos sus precios. No se puede deshacer.\n\n" +
                        "Si el bar existe pero está mal cargado, conviene corregirlo " +
                        "en vez de borrarlo: los precios son reportes de gente que " +
                        "estuvo ahí.",
                    color = Ink.Muted,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    viewModel.deleteBar(onBarDeleted)
                }) { Text("Eliminar", color = Ink.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) {
                    Text(stringResource(R.string.cancel), color = Ink.Muted)
                }
            },
        )
    }

    if (showReportSheet) {
        ReportPriceSheet(
            styles = state.styles,
            preselected = reportingStyle,
            barName = state.bar?.name,
            onDismiss = { showReportSheet = false },
            onSubmit = { slug, price, sizeMl ->
                viewModel.reportPrice(slug, price, sizeMl)
                showReportSheet = false
            },
        )
    }
}

/**
 * Fila de precio. El número es lo más grande de la pantalla, y la edad va
 * pegada abajo — nunca se muestra uno sin la otra.
 *
 * "Sigue igual" es el botón sólido y "Actualizar" el fantasma: confirmar
 * tiene que costar menos que corregir, o el dataset envejece.
 */
@Composable
private fun PriceRow(
    price: StylePrice,
    busy: Boolean,
    isModerator: Boolean,
    onRemove: () -> Unit,
    onConfirm: () -> Unit,
    onUpdate: () -> Unit,
) {
    val accent = FreshnessColors.of(price.fresh)
    val dimmed = price.fresh == Freshness.stale

    Column(Modifier.fillMaxWidth().padding(18.dp, 16.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text(
                    price.styleName.uppercase(),
                    style = MaterialTheme.typography.labelLarge,
                    color = Ink.Faint,
                    fontSize = 11.sp,
                    letterSpacing = 1.2.sp,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    formatPrice(price.price),
                    style = PriceLarge,
                    color = if (dimmed) Ink.Faint else Ink.Cream,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(6.dp)
                            .clip(RoundedCornerShape(50))
                            .background(accent)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(ageLabel(price.ageDays, price.fresh), fontSize = 12.sp, color = accent)
                }
                if (price.sizeMl != 473) {
                    Spacer(Modifier.height(3.dp))
                    Text("${price.sizeMl} ml", fontSize = 11.sp, color = Ink.Faint)
                }
            }
        }

        if (dimmed) {
            Spacer(Modifier.height(10.dp))
            Row(
                Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(Ink.Danger.copy(alpha = 0.10f))
                    .padding(10.dp),
            ) {
                Text(
                    stringResource(R.string.stale_warning),
                    fontSize = 11.sp, color = Ink.Muted, lineHeight = 15.sp,
                )
            }
        }

        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (busy) Ink.AmberDeep else Ink.Amber)
                    .clickable(enabled = !busy, onClick = onConfirm)
                    .padding(vertical = 11.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (busy) {
                    CircularProgressIndicator(
                        Modifier.size(14.dp), strokeWidth = 2.dp, color = Ink.Base,
                    )
                } else {
                    Text(
                        stringResource(R.string.still_the_same),
                        color = Ink.Base,
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
            Box(
                Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White.copy(alpha = 0.07f))
                    .clickable(enabled = !busy, onClick = onUpdate)
                    .padding(horizontal = 20.dp, vertical = 11.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(R.string.update_price),
                    color = Ink.Cream,
                    style = MaterialTheme.typography.labelLarge,
                )
            }
            // Sólo moderación. El botón vive acá, sobre el precio concreto,
            // en vez de en una pantalla aparte: cuando ves un precio absurdo
            // querés sacarlo en ese momento, no anotarlo para después.
            if (isModerator) {
                Box(
                    Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(Ink.Danger.copy(alpha = 0.14f))
                        .clickable(enabled = !busy, onClick = onRemove)
                        .padding(horizontal = 14.dp, vertical = 11.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.Delete, "Eliminar precio",
                        Modifier.size(17.dp), tint = Ink.Danger)
                }
            }
        }
    }
}

@Composable
private fun PrimaryAction(label: String, onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Ink.Amber)
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Ink.Base, style = MaterialTheme.typography.labelLarge)
    }
}
