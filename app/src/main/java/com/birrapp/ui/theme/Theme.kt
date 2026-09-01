package com.birrapp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Paleta oscura y cálida, fija — no sigue el tema del sistema.
 *
 * Dos motivos: (1) la app vive sobre un mapa oscuro y un modo claro rompería
 * el contraste de los pines; (2) se usa de noche, en un bar. Un fondo blanco
 * a las 2 AM es agresivo.
 *
 * Nada de violetas ni gradientes de moda. El acento es ámbar porque es el
 * color de lo que la app vende, y se gana el lugar contra el gris del mapa.
 */
object Ink {
    val Base       = Color(0xFF0B0A09)   // negro cálido, no azulado
    val Raised     = Color(0xFF16130F)
    val Amber      = Color(0xFFFFB020)   // acento
    val AmberDeep  = Color(0xFFC77800)
    val Cream      = Color(0xFFF5EFE6)   // texto principal
    val Muted      = Color(0xFF9A9086)   // texto secundario
    val Faint      = Color(0xFF5C554E)   // texto terciario / stale
    val Danger     = Color(0xFFFF6B5A)

    // Frescura. Verde y ámbar se leen sin pensar; el stale es gris apagado
    // a propósito: tiene que parecer apagado, no un estado más.
    val Fresh      = Color(0xFF6BD68A)
    val Aging      = Color(0xFFFFB020)
    val Stale      = Color(0xFF6E6862)
}

private val Scheme = darkColorScheme(
    primary = Ink.Amber,
    onPrimary = Color(0xFF2A1A00),
    secondary = Ink.Cream,
    onSecondary = Ink.Base,
    background = Ink.Base,
    onBackground = Ink.Cream,
    surface = Ink.Raised,
    onSurface = Ink.Cream,
    onSurfaceVariant = Ink.Muted,
    error = Ink.Danger,
    outline = Color(0x33FFFFFF),
)

@Composable
fun BirrappTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = Scheme,
        typography = BirrappTypography,
        content = content,
    )
}
