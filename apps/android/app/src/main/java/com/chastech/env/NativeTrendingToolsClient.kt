package com.chastech.env

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Fetches only consented real-usage rankings. Each native Home screen supplies
 * its own temporary random catalogue selection until this endpoint has IDs.
 */
data class NativeTrendingFeed(val toolIds: List<String>, val mode: String)

object NativeTrendingToolsClient {
    suspend fun fetchFeed(): NativeTrendingFeed = withContext(Dispatchers.IO) {
        val base = BuildConfig.ENV_API_BASE_URL.trimEnd('/')
        if (!base.startsWith("https://", ignoreCase = true)) return@withContext NativeTrendingFeed(emptyList(), "discovery")

        var connection: HttpURLConnection? = null
        try {
            val activeConnection = (URL("$base/api/analytics/trending").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8_000
                readTimeout = 10_000
                setRequestProperty("Accept", "application/json")
            }
            connection = activeConnection
            if (activeConnection.responseCode !in 200..299) return@withContext NativeTrendingFeed(emptyList(), "discovery")

            val envelope = activeConnection.inputStream.bufferedReader(Charsets.UTF_8).use {
                JSONObject(it.readText())
            }
            if (!envelope.optBoolean("ok")) return@withContext NativeTrendingFeed(emptyList(), "discovery")
            val data = envelope.optJSONObject("data")
                ?: return@withContext NativeTrendingFeed(emptyList(), "discovery")
            val mode = if (data.optString("mode") == "analytics") "analytics" else "discovery"
            val ids = data.optJSONArray("toolIds")
                ?: return@withContext NativeTrendingFeed(emptyList(), mode)
            val seen = linkedSetOf<String>()
            for (index in 0 until ids.length()) {
                val id = ids.optString(index, "")
                if (id.matches(Regex("[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}"))) seen.add(id)
            }
            NativeTrendingFeed(seen.take(500), mode)
        } catch (_: Exception) {
            NativeTrendingFeed(emptyList(), "discovery")
        } finally {
            connection?.disconnect()
        }
    }
}
