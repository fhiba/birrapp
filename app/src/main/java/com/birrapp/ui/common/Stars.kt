package com.birrapp.ui.common

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.birrapp.ui.theme.Ink

/**
 * Estrellas.
 *
 * En ámbar si la nota es tuya y en gris si es el promedio de todos: de un
 * vistazo se ve dónde falta tu voto. Con `onRate`, tocar una estrella la vota
 * — es la acción más barata que tiene la app y no debería costar un botón
 * aparte.
 */
@Composable
fun Stars(
    value: Double?,
    mine: Boolean,
    size: TextUnit = 18.sp,
    onRate: ((Int) -> Unit)? = null,
) {
    val filled = value ?: 0.0
    Row {
        (1..5).forEach { i ->
            // Media estrella para arriba se pinta llena: con 4,6 se ven cinco,
            // que es lo que la gente lee de un promedio redondeado.
            val on = filled >= i - 0.5
            Text(
                "★",
                if (onRate != null) Modifier.clickable { onRate(i) } else Modifier,
                color = when {
                    !on -> Ink.Faint.copy(alpha = 0.35f)
                    mine -> Ink.Amber
                    else -> Ink.Muted
                },
                fontSize = size,
            )
        }
    }
}
