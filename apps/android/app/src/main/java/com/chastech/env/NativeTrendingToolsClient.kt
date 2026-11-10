package com.chastech.env

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Read-only public aggregate ranking for Home. It does not enable or collect
 * analytics; the server only returns tool IDs from consented aggregate activity.
 */
object NativeTrendingToolsClient {
    suspend fun fetchToolIds(): List<String> = withContext(Dispatchers.IO) {
        val base = BuildConfig.ENV_API_BASE_URL.trimEnd('/')
        if (!base.startsWith("https://", ignoreCase = true)) return@withContext emptyList()

        var connection: HttpURLConnection? = null
        try {
            val activeConnection = (URL("$base/api/analytics/trending").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8_000
                readTimeout = 10_000
                setRequestProperty("Accept", "application/json")
            }
            connection = activeConnection
            if (activeConnection.responseCode !in 200..299) return@withContext emptyList()

            val envelope = activeConnection.inputStream.bufferedReader(Charsets.UTF_8).use {
                JSONObject(it.readText())
            }
            if (!envelope.optBoolean("ok")) return@withContext emptyList()
            val ids = envelope.optJSONObject("data")?.optJSONArray("toolIds")
                ?: return@withContext emptyList()
            val seen = linkedSetOf<String>()
            for (index in 0 until ids.length()) {
                val id = ids.optString(index, "")
                if (id.matches(Regex("[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}"))) seen.add(id)
            }
            seen.take(12)
        } catch (_: Exception) {
            emptyList()
        } finally {
            connection?.disconnect()
        }
    }
}
