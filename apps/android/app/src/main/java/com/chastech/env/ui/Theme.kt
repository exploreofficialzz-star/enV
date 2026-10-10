package com.chastech.env.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.graphics.Color

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

private const val EnVFontScale = 1.265f

@Composable
fun EnVTheme(darkTheme: Boolean = false, content: @Composable () -> Unit) {
    val systemDensity = LocalDensity.current
    val scaledDensity = Density(systemDensity.density, systemDensity.fontScale * EnVFontScale)
    CompositionLocalProvider(LocalDensity provides scaledDensity) {
        MaterialTheme(
            colorScheme = if (darkTheme) EnVDarkColors else EnVLightColors,
            typography = Typography(),
            content = content,
        )
    }
}
