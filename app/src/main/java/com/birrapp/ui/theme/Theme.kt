package com.birrapp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Oscuro cálido, pero levantado.
 *
 * La primera versión era casi negro puro (#0B0A09) y quedaba severa: se veía
 * cara, no acogedora. Un bar de noche no es una cueva, tiene luz tibia. Así
 * que el fondo sube a un marrón oscuro con temperatura, las superficies se
 * separan más entre sí, y el ámbar gana saturación para que el acento
 * realmente invite en vez de sólo señalar.
 *
 * Sigue siendo tema fijo, no sigue al sistema: la app vive sobre un mapa
 * oscuro y un modo claro rompería el contraste de los pines.
 */
object Ink {
    val Base      = Color(0xFF1A1410)   // marrón muy oscuro, con temperatura
    val Raised    = Color(0xFF261E18)   // tarjetas / hojas
    val Elevated  = Color(0xFF332822)   // controles sobre Raised
    val Hairline  = Color(0x1FFFFFFF)

    val Amber     = Color(0xFFFFB627)   // acento principal, más saturado
    val AmberSoft = Color(0x33FFB627)
    val AmberDeep = Color(0xFFD98C00)

    val Cream     = Color(0xFFFBF6EE)   // texto principal
    val Muted     = Color(0xFFB6A899)   // secundario — más claro que antes
    val Faint     = Color(0xFF8A7B6D)   // terciario
    val Danger    = Color(0xFFFF7A66)

    // Frescura. El verde se aclaró para que se lea sobre el fondo tibio.
    val Fresh     = Color(0xFF5FD98D)
    val Aging     = Color(0xFFFFB627)
    val Stale     = Color(0xFF9C8C7C)
}

private val Scheme = darkColorScheme(
    primary = Ink.Amber,
    onPrimary = Color(0xFF2E1C00),
    primaryContainer = Ink.AmberSoft,
    secondary = Ink.Cream,
    onSecondary = Ink.Base,
    background = Ink.Base,
    onBackground = Ink.Cream,
    surface = Ink.Raised,
    onSurface = Ink.Cream,
    surfaceVariant = Ink.Elevated,
    onSurfaceVariant = Ink.Muted,
    error = Ink.Danger,
    outline = Ink.Hairline,
)

@Composable
fun BirrappTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = Scheme,
        typography = BirrappTypography,
        content = content,
    )
}
