package com.chastech.env.ui

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

private val imageCache = mutableMapOf<String, androidx.compose.ui.graphics.ImageBitmap>()

private fun loadNativeImage(context: Context, assetPath: String) = synchronized(imageCache) {
    imageCache[assetPath] ?: runCatching {
        context.assets.open(assetPath).use { BitmapFactory.decodeStream(it)?.asImageBitmap() }
    }.getOrNull()?.also { imageCache[assetPath] = it }
}

private fun iconAssetName(name: String): String =
    name.replace(Regex("([a-z0-9])([A-Z])"), "\$1_\$2").lowercase()

/** A native-tinted rendering of the same 24px Lucide source used by the web app. */
@Composable
fun EnVIcon(
    name: String,
    modifier: Modifier = Modifier.size(20.dp),
    tint: Color,
    contentDescription: String? = null,
) {
    val context = LocalContext.current
    val image = remember(name) { loadNativeImage(context, "native-icons/icons/${iconAssetName(name)}.png") }
    if (image != null) {
        Image(
            bitmap = image,
            contentDescription = contentDescription,
            modifier = modifier,
            contentScale = ContentScale.Fit,
            colorFilter = ColorFilter.tint(tint),
        )
    } else {
        Spacer(modifier = modifier.semantics { this.contentDescription = contentDescription ?: "Tool" })
    }
}

/** Uses the exact header image used by src/components/brand/logo.tsx. */
@Composable
fun EnVLogo(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val image = remember { loadNativeImage(context, "native-icons/logo-header-transparent.png") }
    if (image != null) {
        Image(image, contentDescription = "enV home", modifier = modifier, contentScale = ContentScale.Fit)
    }
}
