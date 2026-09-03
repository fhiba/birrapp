package com.birrapp.ui.bar

import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import com.birrapp.data.model.PricePoint
import com.birrapp.ui.theme.PriceMedium
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.birrapp.R
import com.birrapp.data.compressImage
import com.birrapp.data.model.Freshness
import com.birrapp.data.model.Photo
import com.birrapp.data.model.RatingComment
import com.birrapp.ui.common.Stars
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
    var viewingPhoto by remember { mutableStateOf<Int?>(null) }
    var killPhoto by remember { mutableStateOf<Photo?>(null) }
    var killComment by remember { mutableStateOf<RatingComment?>(null) }
    var modMode by remember { mutableStateOf(false) }
    var badPrice by remember { mutableStateOf<StylePrice?>(null) }
    val state by viewModel.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var reportingStyle by remember { mutableStateOf<String?>(null) }
    var reportingBrand by remember { mutableStateOf<String?>(null) }
    var showReportSheet by remember { mutableStateOf(false) }
    // La birra elegida se guarda como (estilo, marca) y no como un índice: al
    // cargar un precio la lista se reordena y un índice apuntaría a otra
    // cerveza.
    var tab by remember { mutableStateOf<Pair<String, String?>?>(null) }

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

                            // Modo moderador: un interruptor, no un menú.
                            // Prendido aparecen todas las herramientas
                            // destructivas juntas; apagado, un moderador ve
                            // exactamente lo mismo que cualquiera. Así no hay
                            // botones de borrar acechando todo el tiempo.
                            if (isModerator) {
                                Box(
                                    Modifier
                                        .size(38.dp)
                                        .clip(RoundedCornerShape(50))
                                        .background(
                                            if (modMode) Ink.Amber
                                            else Color.White.copy(alpha = 0.07f)
                                        )
                                        .clickable { modMode = !modMode },
                                ) {
                                    Icon(
                                        painterResource(
                                            if (modMode) R.drawable.ic_eye
                                            else R.drawable.ic_eye_off
                                        ),
                                        if (modMode) "Salir del modo moderador"
                                        else "Modo moderador",
                                        Modifier.align(Alignment.Center).size(19.dp),
                                        tint = if (modMode) Ink.Base else Ink.Muted,
                                    )
                                }
                            }
                        }

                        if (modMode) {
                            Spacer(Modifier.height(14.dp))
                            Text(
                                "Modo moderador — las acciones de esta vista no " +
                                    "se pueden deshacer",
                                Modifier
                                    .clip(RoundedCornerShape(11.dp))
                                    .background(Ink.AmberSoft)
                                    .padding(13.dp, 9.dp),
                                color = Ink.Amber, fontSize = 12.sp, lineHeight = 16.sp,
                            )
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
                    // Las birras vienen agrupadas por estilo desde la API, con
                    // las marcas de un mismo estilo contiguas. Acá sólo se
                    // parten en grupos: el orden lo decide el servidor y
                    // duplicarlo del lado del cliente sería una segunda fuente
                    // de verdad para lo mismo.
                    val groups = groupByStyle(bar.prices)

                    // Dos niveles de repliegue: la birra exacta, si no la
                    // primera de ese estilo, si no la primera de todas. Hace
                    // falta porque la lista cambia bajo los pies —se carga un
                    // precio, se borra otro— y una marca elegida puede dejar
                    // de existir.
                    val group = groups.firstOrNull { it.styleSlug == tab?.first }
                        ?: groups.first()
                    val active = activeBeerOf(bar.prices, tab)!!

                    item {
                        BeerTabs(
                            groups = groups,
                            group = group,
                            active = active,
                            onStyle = { g -> tab = g.styleSlug to g.beers.first().brandSlug },
                            onBrand = { b -> tab = group.styleSlug to b.brandSlug },
                            onAddBeer = {
                                if (isSignedIn) {
                                    reportingStyle = null; reportingBrand = null
                                    showReportSheet = true
                                } else onNeedSignIn()
                            },
                            onAddBrand = {
                                if (isSignedIn) {
                                    reportingStyle = group.styleSlug; reportingBrand = null
                                    showReportSheet = true
                                } else onNeedSignIn()
                            },
                        )
                    }

                    item {
                        PriceRow(
                            price = active,
                            busy = state.busyBeer == active.key,
                            modMode = modMode,
                            onRemove = { active.id?.let { viewModel.removePrice(it) } },
                            onConfirm = {
                                if (isSignedIn) viewModel.confirmPrice(active)
                                else onNeedSignIn()
                            },
                            onUpdate = {
                                if (isSignedIn) {
                                    reportingStyle = active.styleSlug
                                    reportingBrand = active.brandSlug
                                    showReportSheet = true
                                } else onNeedSignIn()
                            },
                            onHistory = { viewModel.openHistory(active) },
                            onFlag = {
                                if (isSignedIn) badPrice = active else onNeedSignIn()
                            },
                        )
                    }

                    // Nota, comentarios y fotos de la birra que se está
                    // mirando. Van pegados al precio y no en una sección
                    // aparte: son de esa birra, no del bar.
                    item {
                        val photos = state.photos.filter {
                            it.styleSlug == active.styleSlug && it.brandSlug == active.brandSlug
                        }
                        Column(Modifier.padding(horizontal = 18.dp)) {
                            BeerRatingRow(
                                price = active,
                                myRating = viewModel.myRatingOf(active),
                                onRate = { n ->
                                    if (isSignedIn) viewModel.openComments(active, n)
                                    else onNeedSignIn()
                                },
                                onOpen = { viewModel.openComments(active) },
                            )

                            PhotoStrip(
                                photos = photos,
                                canAdd = isSignedIn,
                                busy = state.uploadingPhoto,
                                onAdd = { uri ->
                                    scope.launch {
                                        runCatching {
                                            withContext(Dispatchers.IO) {
                                                compressImage(context, uri)
                                            }
                                        }
                                            .onSuccess { viewModel.uploadPhoto(active, it) }
                                            .onFailure {
                                                snackbar.showSnackbar(
                                                    "No se pudo procesar la foto",
                                                )
                                            }
                                    }
                                },
                                onOpen = { viewingPhoto = it },
                            )
                            Spacer(Modifier.height(6.dp))
                        }
                        HorizontalDivider(color = Color.White.copy(alpha = 0.06f))
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

    state.history?.let { h ->
        PriceHistoryDialog(h) { viewModel.closeHistory() }
    }

    badPrice?.let { price ->
        AlertDialog(
            onDismissRequest = { badPrice = null },
            containerColor = Ink.Raised,
            title = { Text("¿Reportar este precio?", color = Ink.Cream) },
            text = {
                Text(
                    "Vas a avisar que el precio de ${price.beerName} está mal " +
                        "cargado. Un moderador lo revisa.\n\n" +
                        "Si sólo cambió, es mejor usar Actualizar: reportar es para " +
                        "precios que nunca fueron ciertos.",
                    color = Ink.Muted,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    // Sólo se ofrece denunciar desde una fila con precio, así
                    // que acá no puede faltar ninguno de los dos.
                    viewModel.reportBadPrice(
                        price.id!!, "${price.beerName} a ${formatPrice(price.price!!)}",
                    )
                    badPrice = null
                }) { Text("Reportar", color = Ink.Amber) }
            },
            dismissButton = {
                TextButton(onClick = { badPrice = null }) {
                    Text(stringResource(R.string.cancel), color = Ink.Muted)
                }
            },
        )
    }

    state.commentsFor?.let { beer ->
        BeerCommentsSheet(
            title = beer.beerName,
            comments = state.comments,
            myRating = viewModel.myRatingOf(beer),
            canWrite = isSignedIn,
            modMode = modMode,
            busy = state.commentsBusy,
            error = state.commentsError,
            onRate = { viewModel.rate(beer, it) },
            onComment = { viewModel.comment(beer, it) },
            onDelete = { killComment = it },
            onDismiss = { viewModel.closeComments() },
        )
    }

    viewingPhoto?.let { index ->
        val active = activeBeerOf(state.bar?.prices.orEmpty(), tab)
        val shown = state.photos.filter {
            active != null && it.styleSlug == active.styleSlug &&
                it.brandSlug == active.brandSlug
        }
        if (shown.isNotEmpty()) {
            PhotoViewer(
                photos = shown,
                start = index,
                modMode = modMode,
                onClose = { viewingPhoto = null },
                onRemove = { viewingPhoto = null; killPhoto = it },
            )
        }
    }

    killPhoto?.let { photo ->
        AlertDialog(
            onDismissRequest = { killPhoto = null },
            containerColor = Ink.Raised,
            title = {
                Text(
                    if (photo.mine) "¿Borrar tu foto?" else "¿Eliminar esta foto?",
                    color = Ink.Cream,
                )
            },
            text = {
                Text(
                    "Se borra el archivo del bucket, no sólo de la lista.\n\n" +
                        "Las fotos se sirven desde una URL pública: mientras el " +
                        "archivo exista, cualquiera con el link la sigue viendo. " +
                        "Por eso hay que borrarlo, y por eso no se puede deshacer.",
                    color = Ink.Muted,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deletePhoto(photo); killPhoto = null
                }) { Text(if (photo.mine) "Borrar" else "Eliminar", color = Ink.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { killPhoto = null }) {
                    Text(stringResource(R.string.cancel), color = Ink.Muted)
                }
            },
        )
    }

    killComment?.let { comment ->
        val beer = state.commentsFor
        AlertDialog(
            onDismissRequest = { killComment = null },
            containerColor = Ink.Raised,
            title = {
                Text(
                    if (comment.mine) "¿Borrar tu comentario?"
                    else "¿Eliminar este comentario?",
                    color = Ink.Cream,
                )
            },
            text = {
                Text(
                    if (comment.mine)
                        "Se borra sólo el texto. Tu puntaje de esta birra queda " +
                            "como está: borrar lo que escribiste no es retirar tu voto."
                    else
                        "Se baja el comentario de ${comment.authorName}. Su puntaje " +
                            "no se toca: bajar un texto no debería cambiar el " +
                            "promedio de la birra.",
                    color = Ink.Muted,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    beer?.let { viewModel.deleteComment(it, comment) }
                    killComment = null
                }) { Text(if (comment.mine) "Borrar" else "Eliminar", color = Ink.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { killComment = null }) {
                    Text(stringResource(R.string.cancel), color = Ink.Muted)
                }
            },
        )
    }

    if (showReportSheet) {
        ReportPriceSheet(
            styles = state.styles,
            brands = state.brands,
            preselected = reportingStyle,
            preselectedBrand = reportingBrand,
            barName = state.bar?.name,
            onDismiss = { showReportSheet = false },
            onCreateBrand = { name ->
                viewModel.createBrand(name).also { viewModel.addBrand(it) }
            },
            onSubmit = { slug, brandSlug, price, sizeMl ->
                // La birra cargada pasa a ser la que se mira: si no, se carga
                // la segunda IPA y la pantalla se queda mostrando la primera,
                // como si no hubiera pasado nada.
                tab = slug to brandSlug
                viewModel.reportPrice(slug, brandSlug, price, sizeMl)
                showReportSheet = false
            },
        )
    }
}

/**
 * La birra que se está mirando: la solapa elegida, con dos repliegues.
 *
 * Vive acá y no dentro de la lista porque el visor de fotos y los diálogos
 * están fuera de ella y necesitan la misma respuesta. Dos formas de calcular
 * "cuál está seleccionada" es la manera segura de que un día devuelvan
 * distinto.
 */
private fun activeBeerOf(
    prices: List<StylePrice>,
    tab: Pair<String, String?>?,
): StylePrice? {
    if (prices.isEmpty()) return null
    val groups = groupByStyle(prices)
    val group = groups.firstOrNull { it.styleSlug == tab?.first } ?: groups.first()
    return group.beers.firstOrNull { it.brandSlug == tab?.second } ?: group.beers.first()
}

/** Un estilo con todas sus marcas en ese bar. */
private data class BeerGroup(
    val styleSlug: String,
    val styleName: String,
    val beers: List<StylePrice>,
)

/**
 * Parte la lista en grupos por estilo.
 *
 * Las birras vienen ya ordenadas desde la API, con las marcas de un mismo
 * estilo contiguas. Acá sólo se cortan: el orden lo decide el servidor y
 * duplicarlo del lado del cliente sería una segunda fuente de verdad para lo
 * mismo.
 */
private fun groupByStyle(prices: List<StylePrice>): List<BeerGroup> {
    val out = mutableListOf<BeerGroup>()
    prices.forEach { p ->
        val last = out.lastOrNull()
        if (last != null && last.styleSlug == p.styleSlug) {
            out[out.size - 1] = last.copy(beers = last.beers + p)
        } else {
            out += BeerGroup(p.styleSlug, p.styleName, listOf(p))
        }
    }
    return out
}

/**
 * Las dos filas de solapas: el estilo arriba, sus marcas abajo.
 *
 * Se ve una birra por vez y se alterna entre ellas. Dos precios juntos bajo el
 * rótulo "IPA" es exactamente lo que hacía que el número no significara nada:
 * el bar tiene dos IPA distintas y el precio que mostraba no correspondía a
 * ninguna de las dos.
 *
 * Las dos filas muestran su "+" aunque haya una sola opción. Un control que
 * aparece y desaparece según cuántas haya es un control que no se encuentra
 * cuando se lo necesita.
 */
@Composable
private fun BeerTabs(
    groups: List<BeerGroup>,
    group: BeerGroup,
    active: StylePrice,
    onStyle: (BeerGroup) -> Unit,
    onBrand: (StylePrice) -> Unit,
    onAddBeer: () -> Unit,
    onAddBrand: () -> Unit,
) {
    Column {
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            contentPadding = PaddingValues(horizontal = 18.dp),
        ) {
            items(groups, key = { it.styleSlug }) { g ->
                val on = g.styleSlug == group.styleSlug
                Row(
                    Modifier
                        .clip(RoundedCornerShape(50))
                        .background(if (on) Ink.Amber else Color.White.copy(alpha = 0.07f))
                        .clickable { onStyle(g) }
                        .padding(horizontal = 14.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        g.styleName,
                        color = if (on) Ink.Base else Ink.Muted,
                        style = MaterialTheme.typography.labelLarge,
                        fontSize = 13.sp,
                    )
                    // Cuántas marcas esconde esta solapa. Sin esto, que una
                    // tenga tres cervezas y otra una sola no se ve hasta
                    // entrar.
                    if (g.beers.size > 1) {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            "${g.beers.size}",
                            color = if (on) Ink.Base.copy(alpha = 0.6f) else Ink.Faint,
                            fontSize = 11.sp,
                        )
                    }
                }
            }

            item {
                DashedPill("Otra birra", Ink.Amber, onAddBeer)
            }
        }

        Spacer(Modifier.height(8.dp))

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            contentPadding = PaddingValues(horizontal = 18.dp),
        ) {
            items(group.beers, key = { it.brandSlug ?: "_" }) { beer ->
                val on = beer.brandSlug == active.brandSlug
                Row(
                    Modifier
                        .clip(RoundedCornerShape(50))
                        .background(
                            if (on) Ink.AmberSoft else Color.Transparent
                        )
                        .clickable { onBrand(beer) }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        beer.brandName ?: "Sin marca",
                        color = if (on) Ink.Amber else Ink.Faint,
                        style = MaterialTheme.typography.labelLarge,
                        fontSize = 12.5.sp,
                    )
                    beer.price?.let {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            formatPrice(it),
                            color = if (on) Ink.Amber.copy(alpha = 0.75f) else Ink.Faint,
                            fontSize = 12.sp,
                        )
                    }
                }
            }

            item {
                DashedPill("Otra marca", Ink.Muted, onAddBrand)
            }
        }
    }
}

@Composable
private fun DashedPill(label: String, tint: Color, onClick: () -> Unit) {
    Row(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(Color.White.copy(alpha = 0.04f))
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("+", color = tint, fontSize = 14.sp)
        Spacer(Modifier.width(5.dp))
        Text(
            label, color = tint,
            style = MaterialTheme.typography.labelLarge, fontSize = 12.5.sp,
        )
    }
}

/**
 * Nota de una birra: estrellas, cuántos votaron y el ícono de comentarios.
 *
 * Las estrellas van en ámbar si ya votaste y en gris si no — de un vistazo se
 * ve dónde falta tu voto. Tocar una la vota; antes eran decorativas y puntuar
 * obligaba a encontrar el ícono de comentarios, que es lo último donde alguien
 * lo busca.
 *
 * Se muestra `ratingRaw` y no `ratingAvg`: el segundo lleva shrinkage hacia la
 * media global y sirve para ordenar, pero enseñarle 3,8 a alguien que acaba de
 * poner cinco estrellas hace que el número parezca roto, y con razón.
 */
@Composable
private fun BeerRatingRow(
    price: StylePrice,
    myRating: Int?,
    onRate: (Int) -> Unit,
    onOpen: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(top = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Stars(
            value = myRating?.toDouble() ?: price.ratingRaw,
            mine = myRating != null,
            size = 19.sp,
            onRate = onRate,
        )
        Spacer(Modifier.width(10.dp))

        Text(
            if (price.ratingCount > 0) {
                buildString {
                    append("%.1f".format(price.ratingRaw ?: 0.0))
                    append(" · ")
                    append(if (price.ratingCount == 1) "1 voto" else "${price.ratingCount} votos")
                    // La nota tampoco se muestra sin su edad: una vieja sobre
                    // una canilla que ya cambió dice menos de lo que aparenta.
                    if ((price.ratingAgeDays ?: 0) > 45) append(" · sin votos nuevos")
                }
            } else "Sin votos",
            color = Ink.Faint, fontSize = 12.5.sp,
        )

        Spacer(Modifier.weight(1f))
        Box(
            Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(50))
                .background(Color.White.copy(alpha = 0.07f))
                .clickable(onClick = onOpen),
        ) {
            Text(
                "💬", Modifier.align(Alignment.Center),
                fontSize = 15.sp, textAlign = TextAlign.Center,
            )
        }
    }
}

/**
 * El rótulo que dice qué birra es esta.
 *
 * El estilo en gris y la marca en ámbar: son dos datos de distinto peso, y
 * leerlos como una sola frase ("IPA · Antares") es más rápido que buscar cuál
 * de las dos solapas está encendida.
 */
@Composable
private fun BeerLabel(price: StylePrice) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            price.styleName.uppercase(),
            style = MaterialTheme.typography.labelLarge,
            color = Ink.Faint, fontSize = 11.sp, letterSpacing = 1.2.sp,
        )
        Spacer(Modifier.width(7.dp))
        Text(
            // "Sin marca" se dice, no se omite: en un bar con dos IPA, una con
            // marca y otra sin, el silencio se lee como que falta el dato.
            price.brandName ?: "Sin marca",
            style = MaterialTheme.typography.labelLarge,
            color = if (price.brandName != null) Ink.Amber else Ink.Muted,
            fontSize = 13.sp,
        )
        if (price.brandCraft == true) {
            Spacer(Modifier.width(7.dp))
            Text(
                "ARTESANAL",
                Modifier
                    .clip(RoundedCornerShape(50))
                    .background(Color.White.copy(alpha = 0.07f))
                    .padding(horizontal = 7.dp, vertical = 2.dp),
                style = MaterialTheme.typography.labelLarge,
                color = Ink.Faint, fontSize = 9.5.sp, letterSpacing = 0.8.sp,
            )
        }
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
    modMode: Boolean,
    onRemove: () -> Unit,
    onConfirm: () -> Unit,
    onUpdate: () -> Unit,
    onHistory: () -> Unit,
    onFlag: () -> Unit,
) {
    // Una birra puede tener nota y fotos sin precio vigente: pasa cuando un
    // moderador baja el reporte. Antes esa birra desaparecía de la pantalla.
    if (price.price == null) {
        Column(Modifier.fillMaxWidth().padding(18.dp, 16.dp)) {
            BeerLabel(price)
            Spacer(Modifier.height(10.dp))
            Text(
                "Esta birra no tiene precio cargado.",
                color = Ink.Muted, style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(14.dp))
            PrimaryAction("Cargar su precio", onUpdate)
        }
        return
    }

    val accent = FreshnessColors.of(price.fresh)
    val dimmed = price.fresh == Freshness.stale

    Column(Modifier.fillMaxWidth().padding(18.dp, 16.dp)) {
        // Estilo y marca sobre el precio.
        // Cuando el estilo era toda la identidad esto lo decía la solapa de
        // arriba, pero con dos IPA a precios distintos el número suelto no
        // dice de cuál es, y las filas de solapas se pueden haber corrido de
        // lado. Un precio sin su birra no significa nada.
        BeerLabel(price)
        Spacer(Modifier.height(8.dp))

        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
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
                    Text(
                        ageLabel(price.ageDays ?: 0, price.fresh),
                        fontSize = 12.sp, color = accent,
                    )
                }
                if (price.sizeMl != null && price.sizeMl != 473) {
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
        }

        // Acciones secundarias en su propia línea, alineadas a la izquierda.
        // Antes iban apretadas contra el borde derecho, debajo de la fecha,
        // y competían visualmente con ella.
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Ver historial",
                Modifier.clickable(onClick = onHistory),
                fontSize = 12.sp, color = Ink.Muted,
            )
            Text("  ·  ", fontSize = 12.sp, color = Ink.Faint)
            // Reportar lo puede usar cualquiera, no sólo moderadores: quien ve
            // el precio mal es el que está parado en el bar.
            Text(
                "Reportar precio",
                Modifier.clickable(onClick = onFlag),
                fontSize = 12.sp, color = Ink.Muted,
            )
            if (modMode) {
                Spacer(Modifier.weight(1f))
                Text(
                    "Eliminar",
                    Modifier.clickable(enabled = !busy, onClick = onRemove),
                    fontSize = 12.sp, color = Ink.Danger,
                )
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


/**
 * Historial de un precio.
 *
 * Sale gratis del modelo append-only: cada bar ya tiene su serie completa sin
 * haber hecho nada extra. Con inflación es lo interesante — no sólo cuánto
 * sale hoy, sino cuánto subió.
 */
@Composable
private fun PriceHistoryDialog(state: HistoryState, onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = Ink.Raised,
        title = { Text(state.title, color = Ink.Cream) },
        text = {
            val pts = state.points
            when {
                pts == null -> Box(Modifier.fillMaxWidth().padding(20.dp)) {
                    CircularProgressIndicator(
                        Modifier.align(Alignment.Center).size(22.dp),
                        color = Ink.Amber, strokeWidth = 2.dp,
                    )
                }
                pts.size < 2 -> Text(
                    "Todavía no hay suficientes reportes para mostrar una evolución. " +
                        "Hace falta al menos un segundo precio.",
                    color = Ink.Muted,
                )
                else -> {
                    // Del más viejo al más nuevo: la API los devuelve al revés.
                    val series = pts.reversed()
                    val values = series.map { it.price }
                    val min = values.min()
                    val max = values.max()
                    val span = (max - min).takeIf { it > 0 } ?: 1.0

                    Column {
                        Canvas(Modifier.fillMaxWidth().height(90.dp)) {
                            val stepX =
                                if (series.size > 1) size.width / (series.size - 1) else 0f
                            val path = Path()
                            series.forEachIndexed { i, p ->
                                val x = stepX * i
                                val y = size.height -
                                    ((p.price - min) / span).toFloat() * (size.height - 12f) - 6f
                                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
                                drawCircle(Ink.Amber, radius = 4f, center = Offset(x, y))
                            }
                            drawPath(
                                path, Ink.Amber,
                                style = Stroke(width = 5f, cap = StrokeCap.Round),
                            )
                        }
                        Spacer(Modifier.height(14.dp))
                        val first = series.first()
                        val last = series.last()
                        val change =
                            if (first.price > 0)
                                (((last.price - first.price) / first.price) * 100).toInt()
                            else null
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            HistoryBox("Primero", formatPrice(first.price), Modifier.weight(1f))
                            HistoryBox("Ahora", formatPrice(last.price), Modifier.weight(1f))
                            if (change != null) {
                                HistoryBox(
                                    "Variación",
                                    (if (change > 0) "+" else "") + "$change%",
                                    Modifier.weight(1f),
                                    if (change > 0) Ink.Danger else Ink.Fresh,
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onClose) { Text("Cerrar", color = Ink.Amber) }
        },
    )
}

@Composable
private fun HistoryBox(
    label: String, value: String, modifier: Modifier = Modifier, color: Color = Ink.Cream,
) {
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.05f))
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(value, style = PriceMedium.copy(fontSize = 15.sp), color = color)
        Spacer(Modifier.height(2.dp))
        Text(label, fontSize = 10.sp, color = Ink.Faint)
    }
}
