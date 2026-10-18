package com.chastech.env.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.chastech.env.data.ToolRecord
import kotlin.math.abs
import kotlin.math.roundToInt

/** Native, app-store-style tile for one catalog tool. Colors share the Web/iOS ID hash. */
@Composable
fun EnVToolAppIcon(tool: ToolRecord, modifier: Modifier = Modifier, size: Dp = 40.dp) {
    val colors = remember(tool.id) { toolIconColors(tool.id) }
    val shape = RoundedCornerShape(size * 0.27f)
    Box(
        modifier = modifier
            .size(size)
            .clip(shape)
            .background(Brush.linearGradient(listOf(colors.first, colors.second)))
            .border(0.8.dp, Color.White.copy(alpha = 0.21f), shape),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .size(size * 0.62f)
                .clip(CircleShape)
                .background(colors.second.copy(alpha = 0.28f)),
        )
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .size(width = size * 0.72f, height = size * 0.23f)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.09f)),
        )
        EnVIcon(tool.icon, Modifier.size(size * 0.48f), tint = Color.White)
        Box(
            Modifier
                .align(Alignment.BottomEnd)
                .size(size * 0.075f)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.86f)),
        )
    }
}

private fun toolIconColors(id: String): Pair<Color, Color> {
    val hash = toolIconHash(id)
    val accentHash = toolIconHash("$id:accent")
    val hue = (hash.toDouble() / 0xffffffffL.toDouble()) * 360.0
    val accentHue = (accentHash.toDouble() / 0xffffffffL.toDouble()) * 360.0
    return hslColor(hue, 74.0, 34.0) to hslColor(accentHue, 76.0, 43.0)
}

private fun toolIconHash(value: String): Long {
    var hash = 0x811c9dc5L
    for (byte in value.toByteArray(Charsets.UTF_8)) {
        hash = ((hash xor (byte.toLong() and 0xffL)) * 0x01000193L) and 0xffffffffL
    }
    return hash
}

private fun hslColor(hue: Double, saturation: Double, lightness: Double): Color {
    val s = saturation / 100.0
    val l = lightness / 100.0
    val chroma = (1.0 - abs(2.0 * l - 1.0)) * s
    val h = (((hue % 360.0) + 360.0) % 360.0) / 60.0
    val x = chroma * (1.0 - abs((h % 2.0) - 1.0))
    val (r1, g1, b1) = when {
        h < 1.0 -> Triple(chroma, x, 0.0)
        h < 2.0 -> Triple(x, chroma, 0.0)
        h < 3.0 -> Triple(0.0, chroma, x)
        h < 4.0 -> Triple(0.0, x, chroma)
        h < 5.0 -> Triple(x, 0.0, chroma)
        else -> Triple(chroma, 0.0, x)
    }
    val m = l - chroma / 2.0
    val red = ((r1 + m) * 255.0).roundToInt().coerceIn(0, 255) / 255f
    val green = ((g1 + m) * 255.0).roundToInt().coerceIn(0, 255) / 255f
    val blue = ((b1 + m) * 255.0).roundToInt().coerceIn(0, 255) / 255f
    return Color(red, green, blue, 1f)
}
