package com.birrapp.ui.bar

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.birrapp.R
import com.birrapp.data.model.Freshness
import com.birrapp.data.model.StylePrice
import com.birrapp.ui.common.FreshnessColors
import com.birrapp.ui.common.ageLabel
import com.birrapp.ui.common.formatDistance
import com.birrapp.ui.common.formatPrice
import com.birrapp.ui.report.ReportPriceSheet

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BarDetailScreen(
    viewModel: BarDetailViewModel,
    isSignedIn: Boolean,
    onBack: () -> Unit,
    onNeedSignIn: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var reportingStyle by remember { mutableStateOf<String?>(null) }
    var showReportSheet by remember { mutableStateOf(false) }

    LaunchedEffect(state.toast) {
        state.toast?.let { snackbar.showSnackbar(it); viewModel.clearToast() }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(state.bar?.name ?: "", maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver")
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())

            state.error?.let { message ->
                Column(Modifier.align(Alignment.Center).padding(24.dp)) {
                    Text(message)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = viewModel::load) { Text(stringResource(R.string.retry)) }
                }
            }

            val bar = state.bar ?: return@Box

            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    Column(Modifier.padding(16.dp)) {
                        bar.address?.let {
                            Text(it, fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        formatDistance(bar.distanceMeters)?.let {
                            Text(it, fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (bar.reviewCount > 0 && bar.avgRating != null) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "★ %.1f · %d reseñas".format(bar.avgRating, bar.reviewCount),
                                fontSize = 13.sp,
                            )
                        }
                    }
                    HorizontalDivider()
                }

                item {
                    Text(
                        stringResource(R.string.prices_title),
                        Modifier.padding(16.dp, 16.dp, 16.dp, 8.dp),
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                    )
                }

                if (bar.prices.isEmpty()) {
                    item {
                        Column(Modifier.padding(16.dp)) {
                            Text(
                                stringResource(R.string.no_prices),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(12.dp))
                            Button(onClick = {
                                if (isSignedIn) { reportingStyle = null; showReportSheet = true }
                                else onNeedSignIn()
                            }) {
                                Text(stringResource(R.string.report_first_price))
                            }
                        }
                    }
                } else {
                    items(bar.prices, key = { it.styleSlug }) { price ->
                        PriceRow(
                            price = price,
                            busy = state.busyStyle == price.styleSlug,
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
                        HorizontalDivider()
                    }
                    item {
                        TextButton(
                            onClick = {
                                if (isSignedIn) { reportingStyle = null; showReportSheet = true }
                                else onNeedSignIn()
                            },
                            modifier = Modifier.padding(horizontal = 8.dp),
                        ) { Text("+ " + stringResource(R.string.report_price)) }
                    }
                }

                if (state.reviews.isNotEmpty()) {
                    item {
                        Text(
                            stringResource(R.string.reviews_title),
                            Modifier.padding(16.dp, 24.dp, 16.dp, 8.dp),
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                        )
                    }
                    items(state.reviews, key = { it.id }) { review ->
                        Column(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("★".repeat(review.rating), fontSize = 13.sp)
                                Spacer(Modifier.width(8.dp))
                                Text(review.authorName, fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium)
                                Spacer(Modifier.weight(1f))
                                IconButton(onClick = {
                                    if (isSignedIn) {
                                        viewModel.flag("review", review.id, "contenido inapropiado")
                                    } else onNeedSignIn()
                                }) {
                                    Icon(Icons.Default.Warning, stringResource(R.string.flag_content),
                                        Modifier.size(16.dp))
                                }
                            }
                            review.body?.let { Text(it, fontSize = 14.sp) }
                        }
                    }
                }

                item { Spacer(Modifier.height(32.dp)) }
            }
        }
    }

    if (showReportSheet) {
        ReportPriceSheet(
            styles = state.styles,
            preselected = reportingStyle,
            onDismiss = { showReportSheet = false },
            onSubmit = { slug, price, sizeMl ->
                viewModel.reportPrice(slug, price, sizeMl)
                showReportSheet = false
            },
        )
    }
}

/**
 * Una fila de precio.
 *
 * "Sigue igual" está primero y es el botón grande a propósito: confirmar
 * tiene que costar menos que actualizar, o nadie refresca los datos.
 */
@Composable
private fun PriceRow(
    price: StylePrice,
    busy: Boolean,
    onConfirm: () -> Unit,
    onUpdate: () -> Unit,
) {
    val color = FreshnessColors.of(price.fresh)
    Column(Modifier.fillMaxWidth().padding(16.dp, 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(price.styleName, fontWeight = FontWeight.Medium, fontSize = 15.sp)
                Text(
                    ageLabel(price.ageDays, price.fresh),
                    fontSize = 12.sp,
                    color = color,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(formatPrice(price.price), fontWeight = FontWeight.Bold, fontSize = 17.sp)
                if (price.sizeMl != 473) {
                    Text("${price.sizeMl} ml", fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        if (price.fresh == Freshness.stale) {
            Spacer(Modifier.height(6.dp))
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
            ) {
                Text(
                    stringResource(R.string.stale_warning),
                    Modifier.padding(8.dp),
                    fontSize = 11.sp,
                )
            }
        }

        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onConfirm, enabled = !busy) {
                if (busy) {
                    CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
                } else {
                    Text(stringResource(R.string.still_the_same), fontSize = 13.sp)
                }
            }
            OutlinedButton(onClick = onUpdate, enabled = !busy) {
                Text(stringResource(R.string.update_price), fontSize = 13.sp)
            }
        }
    }
}
