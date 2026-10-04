package com.chastech.env

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.chastech.env.data.ToolRecord
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Exact web-engine bridge for tools whose implementation depends on browser APIs,
 * rich media codecs, or the existing server-backed web engine. The native shell,
 * navigation policy, and lifecycle remain Kotlin; the tool implementation is the
 * canonical web engine rather than a reimplemented approximation.
 */
private const val WEB_APP_ORIGIN = "https://en-v-6h2l.vercel.app"

@Composable
fun NativeWebFallbackTool(tool: ToolRecord) {
    val url = toolUrl(tool)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            "Exact web engine in native shell · online",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            "This tool uses the canonical enV web engine because its implementation depends on browser APIs, media processing, or the existing backend.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        AndroidView(
            modifier = Modifier.fillMaxWidth().height(620.dp),
            factory = { context -> createWebView(context, url) },
            update = { view -> if (view.url != url) view.loadUrl(url) },
        )
    }
}

private fun toolUrl(tool: ToolRecord): String {
    val category = URLEncoder.encode(tool.category, StandardCharsets.UTF_8.toString()).replace("+", "%20")
    val slug = URLEncoder.encode(tool.slug, StandardCharsets.UTF_8.toString()).replace("+", "%20")
    return "$WEB_APP_ORIGIN/tools/$category/$slug"
}

private fun createWebView(context: Context, url: String): WebView = WebView(context).apply {
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.allowFileAccess = false
    settings.allowContentAccess = false
    settings.setSupportMultipleWindows(false)
    settings.javaScriptCanOpenWindowsAutomatically = false
    webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = handleUrl(context, request.url)
        @Suppress("DEPRECATION")
        override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = handleUrl(context, Uri.parse(url))
    }
    loadUrl(url)
}

private fun handleUrl(context: Context, uri: Uri): Boolean {
    val sameOrigin = uri.scheme == "https" && uri.host == Uri.parse(WEB_APP_ORIGIN).host
    if (sameOrigin) return false
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
    return true
}
