package com.birrapp.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Ámbar de cerveza. Legible sobre el mapa, que es donde vive casi toda la app.
private val Amber = Color(0xFFC77800)
private val AmberDark = Color(0xFFFFB74D)

private val LightColors = lightColorScheme(
    primary = Amber,
    onPrimary = Color.White,
    secondary = Color(0xFF6D4C41),
    background = Color(0xFFFDFCFB),
    surface = Color.White,
)

private val DarkColors = darkColorScheme(
    primary = AmberDark,
    onPrimary = Color(0xFF3E2600),
    secondary = Color(0xFFBCAAA4),
    background = Color(0xFF121212),
    surface = Color(0xFF1E1E1E),
)

@Composable
fun BirrappTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
