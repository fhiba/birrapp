package com.birrapp.ui.common

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import com.birrapp.ui.theme.Ink
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect

/**
 * Vidrio.
 *
 * Tres capas, y las tres importan — sacá una y deja de parecer vidrio:
 *
 *  1. **Refracción**: blur de lo que está DETRÁS (haze). `Modifier.blur()` no
 *     sirve acá: difumina el propio composable, no el fondo.
 *  2. **Reflejo especular**: un borde superior claro que simula la luz pegando
 *     en el canto. Es el detalle que más hace, y el que casi nadie pone.
 *  3. **Tinte**: una veladura cálida para que el vidrio tenga cuerpo y el
 *     texto encima mantenga contraste.
 *
 * Debajo de API 31 no hay `RenderEffect`, así que el blur se cae solo. En ese
 * caso se sube la opacidad del tinte: pierde la refracción pero conserva la
 * jerarquía visual, que es lo que realmente comunica.
 */
private val blurSupported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

@Composable
fun GlassPanel(
    hazeState: HazeState,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(26.dp),
    tint: Color = Color.White,
    /** Cuánto "cuerpo" tiene el vidrio. Más alto = más opaco. */
    intensity: Float = 1f,
    content: @Composable BoxScope.() -> Unit,
) {
    val tintAlpha = (if (blurSupported) 0.10f else 0.30f) * intensity

    Box(
        modifier
            .clip(shape)
            .then(
                if (blurSupported) {
                    Modifier.hazeEffect(
                        state = hazeState,
                        style = HazeStyle(
                            blurRadius = 32.dp,
                            backgroundColor = Ink.Base,
                            tints = listOf(HazeTint(tint.copy(alpha = tintAlpha))),
                        ),
                    )
                } else {
                    Modifier.background(Ink.Raised.copy(alpha = 0.94f))
                }
            )
            // Reflejo: claro arriba, se apaga hacia abajo. Sin esto el panel
            // parece un rectángulo semitransparente, no vidrio.
            .background(
                Brush.verticalGradient(
                    0f to Color.White.copy(alpha = 0.10f),
                    0.45f to Color.White.copy(alpha = 0.02f),
                    1f to Color.Transparent,
                )
            )
            .border(
                width = 0.8.dp,
                brush = Brush.linearGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.38f),
                        Color.White.copy(alpha = 0.06f),
                        Color.White.copy(alpha = 0.14f),
                    ),
                    start = Offset.Zero,
                    end = Offset.Infinite,
                ),
                shape = shape,
            ),
        content = content,
    )
}

/**
 * Vidrio coloreado, para el pin de precio.
 *
 * El pin tiene que leerse de un vistazo sobre el mapa, así que lleva más
 * saturación y menos transparencia que un panel: acá manda la legibilidad,
 * no el efecto.
 */
@Composable
fun GlassPill(
    modifier: Modifier = Modifier,
    accent: Color,
    shape: Shape = RoundedCornerShape(50),
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier
            .clip(shape)
            .background(
                Brush.verticalGradient(
                    listOf(
                        accent.copy(alpha = 0.96f),
                        accent.copy(alpha = 0.80f),
                    )
                )
            )
            .border(
                width = 0.8.dp,
                brush = Brush.verticalGradient(
                    listOf(
                        Color.White.copy(alpha = 0.55f),
                        Color.White.copy(alpha = 0.10f),
                    )
                ),
                shape = shape,
            ),
        content = content,
    )
}
