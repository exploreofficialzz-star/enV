package com.chastech.env.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight

private val EnVOutfit = FontFamily(
    Font(com.chastech.env.R.font.outfit_regular, FontWeight.Normal),
    Font(com.chastech.env.R.font.outfit_medium, FontWeight.Medium),
    Font(com.chastech.env.R.font.outfit_semibold, FontWeight.SemiBold),
    Font(com.chastech.env.R.font.outfit_bold, FontWeight.Bold),
)

private val EnVLightColors = lightColorScheme(
    primary = Color(0xFF0D9F8A),
    onPrimary = Color.White,
    secondary = Color(0xFF5C636C),
    background = Color(0xFFF7F6F3),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF16181D),
    surfaceVariant = Color(0xFFD8F3EE),
    onSurfaceVariant = Color(0xFF5C636C),
    outline = Color(0xFFE4E0D8),
    outlineVariant = Color(0xFFCFC9BD),
    error = Color(0xFFB42318),
    errorContainer = Color(0xFFFEE4E2),
    onErrorContainer = Color(0xFFB42318),
)

private val EnVDarkColors = darkColorScheme(
    primary = Color(0xFF2EC4B6),
    onPrimary = Color(0xFF06211E),
    secondary = Color(0xFFA7ADB4),
    background = Color(0xFF101214),
    surface = Color(0xFF171B1E),
    onSurface = Color(0xFFEEF0F2),
    surfaceVariant = Color(0xFF14332F),
    onSurfaceVariant = Color(0xFFA7ADB4),
    outline = Color(0xFF2A3036),
    outlineVariant = Color(0xFF3C444C),
    error = Color(0xFFF97066),
    errorContainer = Color(0xFF3B1818),
    onErrorContainer = Color(0xFFF97066),
)

@Composable
fun EnVTheme(darkTheme: Boolean = false, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) EnVDarkColors else EnVLightColors,
        typography = Typography().let { base ->
            base.copy(
                displayLarge = base.displayLarge.copy(fontFamily = EnVOutfit),
                displayMedium = base.displayMedium.copy(fontFamily = EnVOutfit),
                displaySmall = base.displaySmall.copy(fontFamily = EnVOutfit),
                headlineLarge = base.headlineLarge.copy(fontFamily = EnVOutfit),
                headlineMedium = base.headlineMedium.copy(fontFamily = EnVOutfit),
                headlineSmall = base.headlineSmall.copy(fontFamily = EnVOutfit),
                titleLarge = base.titleLarge.copy(fontFamily = EnVOutfit),
                titleMedium = base.titleMedium.copy(fontFamily = EnVOutfit),
                titleSmall = base.titleSmall.copy(fontFamily = EnVOutfit),
                bodyLarge = base.bodyLarge.copy(fontFamily = EnVOutfit),
                bodyMedium = base.bodyMedium.copy(fontFamily = EnVOutfit),
                bodySmall = base.bodySmall.copy(fontFamily = EnVOutfit),
                labelLarge = base.labelLarge.copy(fontFamily = EnVOutfit),
                labelMedium = base.labelMedium.copy(fontFamily = EnVOutfit),
                labelSmall = base.labelSmall.copy(fontFamily = EnVOutfit),
            )
        },
        content = content,
    )
}
