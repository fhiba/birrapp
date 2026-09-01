package com.birrapp.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.birrapp.ui.theme.Ink

/**
 * Explica la regla de frescura.
 *
 * No es relleno: si alguien no entiende por qué un precio más barato no
 * aparece primero, o por qué hay precios en gris, va a pensar que la app
 * está rota. Es más barato explicarlo una vez acá que perder la confianza.
 */
@Composable
fun AboutScreen(onBack: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .background(Ink.Base)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 22.dp),
    ) {
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier.size(38.dp).clip(RoundedCornerShape(50))
                .background(Ink.Elevated).clickable(onClick = onBack),
        ) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack, "Volver",
                Modifier.align(Alignment.Center).size(19.dp), tint = Ink.Cream,
            )
        }

        Spacer(Modifier.height(22.dp))
        Text(
            "Cómo funcionan los precios",
            style = MaterialTheme.typography.displaySmall, color = Ink.Cream,
        )

        Section(
            "La antigüedad importa tanto como el precio",
            "Con la inflación, un precio de hace dos meses no dice mucho. Por eso " +
                "birrapp nunca muestra un precio sin decirte de cuándo es.",
        )
        FreshnessRow(Ink.Fresh, "Menos de 14 días", "Confiable.")
        FreshnessRow(Ink.Aging, "Entre 14 y 45 días", "Probablemente subió un poco.")
        FreshnessRow(Ink.Stale, "Más de 45 días", "Tomalo como referencia nomás.")

        Section(
            "Por qué el más barato no siempre aparece primero",
            "Al ordenar por «más barata» se ignoran los precios de más de 45 días. " +
                "Un precio viejo y barato no puede ganarle a uno reciente y honesto: " +
                "te mandaría a cruzar la ciudad por un número que ya no existe.",
        )

        Section(
            "«Sigue igual» es el botón más útil",
            "Confirmar que un precio no cambió lleva un toque y lo vuelve a poner " +
                "en verde. Si nadie confirma, todo el mapa envejece.",
        )

        Section(
            "De dónde salen los bares",
            "La base inicial viene de OpenStreetMap, y la comunidad agrega los que " +
                "faltan. Los precios los carga siempre la gente: no hay ninguno " +
                "estimado ni calculado por nosotros.",
        )

        Spacer(Modifier.height(30.dp))
        Text(
            "Datos de bares © colaboradores de OpenStreetMap, bajo licencia ODbL.",
            color = Ink.Faint, fontSize = 11.sp, lineHeight = 16.sp,
        )
        Spacer(Modifier.height(40.dp))
    }
}

@Composable
private fun Section(title: String, body: String) {
    Spacer(Modifier.height(26.dp))
    Text(title, style = MaterialTheme.typography.titleMedium, color = Ink.Cream)
    Spacer(Modifier.height(6.dp))
    Text(body, color = Ink.Muted, style = MaterialTheme.typography.bodyMedium)
}

@Composable
private fun FreshnessRow(color: androidx.compose.ui.graphics.Color, label: String, note: String) {
    Row(
        Modifier.fillMaxWidth().padding(top = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(9.dp).clip(RoundedCornerShape(50)).background(color))
        Spacer(Modifier.width(12.dp))
        Column {
            Text(label, color = Ink.Cream, fontSize = 14.sp)
            Text(note, color = Ink.Faint, fontSize = 12.sp)
        }
    }
}
