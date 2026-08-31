package news.inkan.birrapp.ui.report

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import news.inkan.birrapp.R
import news.inkan.birrapp.data.model.BeerStyle

/**
 * Carga de precio. Objetivo: dos taps y listo.
 *
 * El tamaño viene con 473 ml precargado (la pinta estándar) y está colapsado
 * detrás de un toggle: el 90% de los casos no lo toca. Cada campo visible de
 * más es gente que abandona a mitad de camino.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportPriceSheet(
    styles: List<BeerStyle>,
    preselected: String?,
    onDismiss: () -> Unit,
    onSubmit: (styleSlug: String, price: Double, sizeMl: Int) -> Unit,
) {
    var selectedStyle by remember { mutableStateOf(preselected ?: styles.firstOrNull()?.slug) }
    var priceText by remember { mutableStateOf("") }
    var sizeText by remember { mutableStateOf("473") }
    var showSize by remember { mutableStateOf(false) }

    val price = priceText.replace(".", "").replace(",", ".").toDoubleOrNull()
    val sizeMl = sizeText.toIntOrNull() ?: 473
    val valid = selectedStyle != null && price != null && price > 0 && sizeMl in 100..2000

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(20.dp, 0.dp, 20.dp, 32.dp)) {

            Text(stringResource(R.string.which_style), fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(8.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(styles, key = { it.slug }) { style ->
                    FilterChip(
                        selected = selectedStyle == style.slug,
                        onClick = { selectedStyle = style.slug },
                        label = { Text(style.name, fontSize = 12.sp) },
                    )
                }
            }

            Spacer(Modifier.height(20.dp))
            OutlinedTextField(
                value = priceText,
                onValueChange = { priceText = it.filter { c -> c.isDigit() || c == ',' || c == '.' } },
                label = { Text(stringResource(R.string.how_much)) },
                prefix = { Text("$") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(8.dp))
            if (showSize) {
                OutlinedTextField(
                    value = sizeText,
                    onValueChange = { sizeText = it.filter(Char::isDigit).take(4) },
                    label = { Text(stringResource(R.string.size_ml)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                TextButton(onClick = { showSize = true }) {
                    Text("¿No es una pinta de 473 ml?", fontSize = 13.sp)
                }
            }

            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.cancel))
                }
                Button(
                    onClick = { onSubmit(selectedStyle!!, price!!, sizeMl) },
                    enabled = valid,
                    modifier = Modifier.weight(1f),
                ) { Text(stringResource(R.string.send)) }
            }
        }
    }
}
