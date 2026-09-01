package com.birrapp.ui.common

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.birrapp.ui.theme.Ink
import kotlin.math.sin

/**
 * Pantalla de espera: una pinta llenándose.
 *
 * Reemplaza al spinner genérico. La espera existe porque se está resolviendo
 * la ubicación —preferimos demorar a mostrar un lugar equivocado— así que si
 * el usuario va a mirar algo unos segundos, que sea algo de la app y no un
 * círculo de Material que podría ser de cualquier cosa.
 *
 * La cerveza sube y baja en un ciclo lento, con la superficie ondulada: una
 * barra de progreso recta se lee como carga, un líquido se lee como cerveza.
 */
@Composable
fun PintLoader(
    message: String,
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition(label = "pinta")

    val fill by transition.animateFloat(
        initialValue = 0.12f,
        targetValue = 0.88f,
        animationSpec = infiniteRepeatable(
            animation = tween(1900, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "nivel",
    )
    // Fase de la onda: la superficie se mueve aunque el nivel esté quieto en
    // los extremos del ciclo, para que nunca parezca congelado.
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * Math.PI).toFloat(),
        animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing)),
        label = "onda",
    )

    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Canvas(Modifier.size(56.dp, 74.dp)) {
            val w = size.width
            val h = size.height
            val glassW = w * 0.72f
            val left = (w - glassW) / 2f
            val corner = glassW * 0.13f

            // Vaso: levemente cónico, como una pinta de verdad.
            val glass = Path().apply {
                moveTo(left + glassW * 0.06f, 0f)
                lineTo(left + glassW * 0.94f, 0f)
                lineTo(left + glassW * 0.86f, h - corner)
                quadraticTo(left + glassW * 0.84f, h, left + glassW * 0.72f, h)
                lineTo(left + glassW * 0.28f, h)
                quadraticTo(left + glassW * 0.16f, h, left + glassW * 0.14f, h - corner)
                close()
            }

            clipPath(glass) {
                val surfaceY = h * (1f - fill)
                val amp = h * 0.022f
                val liquid = Path().apply {
                    moveTo(0f, h)
                    lineTo(0f, surfaceY)
                    var x = 0f
                    while (x <= w) {
                        lineTo(x, surfaceY + sin(phase + x / w * 6.5f) * amp)
                        x += 3f
                    }
                    lineTo(w, h)
                    close()
                }
                drawPath(liquid, Ink.Amber)

                // Espuma: una franja clara justo sobre la superficie.
                val foam = Path().apply {
                    moveTo(0f, surfaceY)
                    var x = 0f
                    while (x <= w) {
                        lineTo(x, surfaceY + sin(phase + x / w * 6.5f) * amp)
                        x += 3f
                    }
                    lineTo(w, surfaceY - h * 0.055f)
                    lineTo(0f, surfaceY - h * 0.055f)
                    close()
                }
                drawPath(foam, Color(0xFFFFF0D0))

                // Burbujas subiendo.
                listOf(0.3f to 0.55f, 0.62f to 0.3f, 0.45f to 0.8f).forEach { (bx, seed) ->
                    val t = ((phase / (2 * Math.PI).toFloat()) + seed) % 1f
                    val by = h - t * (h - surfaceY)
                    if (by > surfaceY) {
                        drawCircle(
                            Color.White.copy(alpha = 0.30f),
                            radius = w * 0.022f,
                            center = Offset(left + glassW * bx, by),
                        )
                    }
                }
            }

            drawPath(glass, Ink.Cream.copy(alpha = 0.55f), style = Stroke(width = 2.2f))
        }

        Spacer(Modifier.height(18.dp))
        Text(message, color = Ink.Muted, fontSize = 13.sp)
    }
}
