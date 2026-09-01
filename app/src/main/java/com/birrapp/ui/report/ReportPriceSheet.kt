package com.birrapp.ui.report

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.birrapp.R
import com.birrapp.data.model.BeerStyle
import com.birrapp.ui.theme.Ink
import com.birrapp.ui.theme.PriceLarge
import java.text.NumberFormat
import java.util.Locale

/**
 * Carga de precio: una sola pantalla, teclado propio.
 *
 * El contexto de uso manda todo el diseño: se usa parado en un bar, con una
 * mano, con poca luz. De ahí las decisiones:
 *
 *  - **Teclado propio, no el del sistema.** El del sistema tapa media pantalla
 *    y sus teclas son chicas. Acá las teclas ocupan lo que sobra y el monto
 *    queda siempre visible mientras se escribe.
 *  - **Tecla `000`.** Los precios argentinos tienen tres ceros. Sin ella,
 *    cargar $7.200 son cinco toques; con ella, tres.
 *  - **Separador de miles en vivo.** `7200` sin puntos se lee mal y es donde
 *    se cuela el error de un cero de más.
 *  - **El tamaño escondido detrás de un toggle.** El 90% de los casos es una
 *    pinta de 473 ml. Cada campo visible de más es gente que abandona.
 *  - **Sin scroll.** Todo entra; no hay nada que buscar.
 */
@Composable
fun ReportPriceSheet(
    styles: List<BeerStyle>,
    preselected: String?,
    barName: String? = null,
    onDismiss: () -> Unit,
    onSubmit: (styleSlug: String, price: Double, sizeMl: Int) -> Unit,
) {
    var selectedStyle by remember { mutableStateOf(preselected ?: styles.firstOrNull()?.slug) }
    // El monto se guarda como dígitos crudos y se formatea al mostrar: así
    // no hay que parsear puntos ni pelear con el cursor.
    var digits by remember { mutableStateOf("") }
    var sizeText by remember { mutableStateOf("473") }
    var editingSize by remember { mutableStateOf(false) }

    val price = digits.toDoubleOrNull() ?: 0.0
    val sizeMl = sizeText.toIntOrNull() ?: 473
    val valid = selectedStyle != null && price > 0 && sizeMl in 100..2000

    fun press(key: String) {
        val target = if (editingSize) sizeText else digits
        val next = when (key) {
            "⌫" -> target.dropLast(1)
            "000" -> if (target.isEmpty()) target else target + "000"
            else -> target + key
        }.trimStart('0').take(if (editingSize) 4 else 8)
        if (editingSize) sizeText = next else digits = next
    }

    Surface(Modifier.fillMaxSize(), color = Ink.Base) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {

            Row(
                Modifier.fillMaxWidth().padding(12.dp, 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(50))
                        .background(Ink.Elevated)
                        .clickable(onClick = onDismiss),
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.cancel),
                        Modifier.align(Alignment.Center).size(19.dp), tint = Ink.Cream,
                    )
                }
                Spacer(Modifier.width(12.dp))
                barName?.let {
                    Text(it, style = MaterialTheme.typography.titleMedium,
                        color = Ink.Cream, maxLines = 1)
                }
            }

            // Estilo
            LazyRow(
                Modifier.padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                contentPadding = PaddingValues(horizontal = 14.dp),
            ) {
                items(styles, key = { it.slug }) { style ->
                    val on = selectedStyle == style.slug
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(50))
                            .background(if (on) Ink.Cream else Ink.Elevated)
                            .clickable { selectedStyle = style.slug }
                            .padding(horizontal = 15.dp, vertical = 9.dp),
                    ) {
                        Text(
                            style.name,
                            color = if (on) Ink.Base else Ink.Muted,
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
            }

            // Monto: lo más grande de la pantalla.
            Column(
                Modifier.fillMaxWidth().weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    if (digits.isEmpty()) "$ 0" else "$ " + groupThousands(digits),
                    style = PriceLarge.copy(fontSize = 52.sp, letterSpacing = (-2).sp),
                    color = if (digits.isEmpty()) Ink.Faint else Ink.Cream,
                )
                Spacer(Modifier.height(14.dp))
                Box(
                    Modifier
                        .clip(RoundedCornerShape(50))
                        .background(if (editingSize) Ink.AmberSoft else Color.Transparent)
                        .clickable { editingSize = !editingSize }
                        .padding(horizontal = 14.dp, vertical = 7.dp),
                ) {
                    Text(
                        if (editingSize) "$sizeText ml · tocá para volver al precio"
                        else "$sizeText ml · cambiar",
                        color = if (editingSize) Ink.Amber else Ink.Faint,
                        fontSize = 13.sp,
                    )
                }
            }

            // Teclado
            Column(Modifier.padding(horizontal = 22.dp)) {
                listOf(
                    listOf("1", "2", "3"),
                    listOf("4", "5", "6"),
                    listOf("7", "8", "9"),
                    listOf("000", "0", "⌫"),
                ).forEach { row ->
                    Row(Modifier.fillMaxWidth()) {
                        row.forEach { key ->
                            Box(
                                Modifier
                                    .weight(1f)
                                    .padding(5.dp)
                                    .clip(RoundedCornerShape(18.dp))
                                    .background(Ink.Raised)
                                    .clickable { press(key) }
                                    .padding(vertical = 16.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    key,
                                    style = PriceLarge.copy(fontSize = if (key == "000") 20.sp else 24.sp),
                                    color = if (key == "⌫") Ink.Muted else Ink.Cream,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    }
                }
            }

            Box(
                Modifier
                    .fillMaxWidth()
                    .padding(22.dp, 12.dp, 22.dp, 18.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(if (valid) Ink.Amber else Ink.Elevated)
                    .clickable(enabled = valid) { onSubmit(selectedStyle!!, price, sizeMl) }
                    .padding(vertical = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(R.string.send),
                    color = if (valid) Ink.Base else Ink.Faint,
                    style = MaterialTheme.typography.labelLarge,
                    fontSize = 15.sp,
                )
            }
        }
    }
}

/** 7200 -> 7.200. Formatea sin decimales: los centavos acá no significan nada. */
private fun groupThousands(digits: String): String {
    val n = digits.toLongOrNull() ?: return digits
    return NumberFormat.getIntegerInstance(Locale.forLanguageTag("es-AR")).format(n)
}
