package com.chastech.env.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val EnVColors = lightColorScheme(
    primary = Color(0xFF0D9F8A),
    onPrimary = Color.White,
    secondary = Color(0xFF4A635E),
    background = Color(0xFFF8FAF9),
    surface = Color.White,
    onSurface = Color(0xFF17201E),
)

@Composable
fun EnVTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = EnVColors, typography = Typography(), content = content)
}
