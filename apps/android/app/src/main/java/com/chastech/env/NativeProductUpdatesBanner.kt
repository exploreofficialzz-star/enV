package com.chastech.env

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.browser.customtabs.CustomTabsIntent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

private data class NativeProductUpdate(
    val id: String,
    val title: String,
    val summary: String,
    val body: String,
    val type: String,
    val severity: String,
)

private object NativeProductUpdatesClient {
    fun load(): List<NativeProductUpdate> {
        val base = BuildConfig.ENV_API_BASE_URL.trimEnd('/')
        require(base.startsWith("https://")) { "Product updates require a secure API connection." }
        val version = URLEncoder.encode(BuildConfig.VERSION_NAME, "UTF-8")
        val url = URL("$base/api/updates?platform=android&channel=stable&version=$version&limit=5")
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("Accept", "application/json")
        }
        try {
            val status = connection.responseCode
            if (status !in 200..299) return emptyList()
            val payload = connection.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
            val envelope = JSONObject(payload)
            if (!envelope.optBoolean("ok")) return emptyList()
            val rows = envelope.optJSONObject("data")?.optJSONArray("updates") ?: JSONArray()
            return (0 until rows.length()).mapNotNull { index ->
                val row = rows.optJSONObject(index) ?: return@mapNotNull null
                NativeProductUpdate(
                    id = row.optString("id"),
                    title = row.optString("title"),
                    summary = row.optString("summary"),
                    body = row.optString("body"),
                    type = row.optString("type", "update"),
                    severity = row.optString("severity", "info"),
                ).takeIf { it.id.isNotBlank() && it.title.isNotBlank() }
            }
        } finally { connection.disconnect() }
    }
}

@Composable
fun NativeProductUpdatesBanner() {
    val context = LocalContext.current
    var updates by remember { mutableStateOf(emptyList<NativeProductUpdate>()) }
    var dismissed by remember {
        mutableStateOf(context.getSharedPreferences("env.product-updates", Context.MODE_PRIVATE).getStringSet("dismissed", emptySet()).orEmpty())
    }
    var expanded by remember { mutableStateOf(false) }
    val current = updates.firstOrNull { it.id !in dismissed }

    LaunchedEffect(Unit) {
        updates = runCatching { withContext(Dispatchers.IO) { NativeProductUpdatesClient.load() } }.getOrDefault(emptyList())
        if (updates.isNotEmpty() && BuildConfig.ANALYTICS_ENABLED) NativeAnalytics.record(context, "update_viewed")
        if (BuildConfig.ANALYTICS_ENABLED) runCatching { NativeAnalytics.flush(context) }
    }

    val item = current ?: return
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(item.type.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                    Text(item.title, style = MaterialTheme.typography.titleSmall)
                }
                TextButton(onClick = {
                    val next = (dismissed + item.id).toSet()
                    dismissed = next
                    context.getSharedPreferences("env.product-updates", Context.MODE_PRIVATE).edit().putStringSet("dismissed", next).apply()
                    expanded = false
                }) { Text("Dismiss") }
            }
            Text(item.summary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (expanded) Text(item.body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "Show less" else "Read update") }
                TextButton(onClick = {
                    runCatching {
                        CustomTabsIntent.Builder().setShowTitle(true).build()
                            .launchUrl(context, android.net.Uri.parse("https://updates.envtools.store"))
                    }.onFailure {
                        context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://envtools.store/updates")))
                    }
                }) { Text("All updates") }
            }
        }
    }
}


@Composable
fun NativeFeedbackEntry() {
    val context = LocalContext.current
    OutlinedButton(
        modifier = Modifier.fillMaxWidth(),
        onClick = {
            val uri = android.net.Uri.parse("https://feedback.envtools.store")
            runCatching {
                CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, uri)
            }.onFailure {
                context.startActivity(Intent(Intent.ACTION_VIEW, uri))
            }
        },
        shape = RoundedCornerShape(12.dp),
    ) {
        Text("Send feedback to enV")
    }
}
