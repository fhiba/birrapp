package com.birrapp.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.birrapp.R

/**
 * Bricolage Grotesque para todo lo que es número y título.
 *
 * Elegida a propósito en vez de Inter/Roboto: esta app es básicamente una
 * grilla de precios, y los números son el contenido. Un grotesk con carácter
 * hace que $7.200 se lea como un dato, no como texto de formulario.
 */
val Display = FontFamily(
    Font(R.font.bricolage_medium, FontWeight.Medium),
    Font(R.font.bricolage_bold, FontWeight.Bold),
)

/** Tracking negativo en los números grandes: los aprieta y se ven más sólidos. */
val PriceLarge = TextStyle(
    fontFamily = Display, fontWeight = FontWeight.Bold,
    fontSize = 30.sp, letterSpacing = (-1.2).sp, lineHeight = 32.sp,
)
val PriceMedium = TextStyle(
    fontFamily = Display, fontWeight = FontWeight.Bold,
    fontSize = 19.sp, letterSpacing = (-0.6).sp,
)
val PricePin = TextStyle(
    fontFamily = Display, fontWeight = FontWeight.Bold,
    fontSize = 13.sp, letterSpacing = (-0.3).sp,
)

val BirrappTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = Display, fontWeight = FontWeight.Bold,
        fontSize = 28.sp, letterSpacing = (-1).sp, lineHeight = 32.sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = Display, fontWeight = FontWeight.Bold,
        fontSize = 20.sp, letterSpacing = (-0.5).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = Display, fontWeight = FontWeight.Medium,
        fontSize = 16.sp, letterSpacing = (-0.2).sp,
    ),
    labelLarge = TextStyle(
        fontFamily = Display, fontWeight = FontWeight.Medium,
        fontSize = 13.sp, letterSpacing = 0.sp,
    ),
    // El texto corrido queda en la fuente del sistema: mejor legibilidad en
    // párrafos y no infla el APK.
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
)
