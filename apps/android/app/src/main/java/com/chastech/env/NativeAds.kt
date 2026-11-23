package com.chastech.env

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.chastech.env.data.ToolRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Native hybrid-tool policy only. Android ad delivery is not part of this release.
 * This policy keeps the pre-existing signed offline-wallet boundary independent
 * from advertising configuration.
 */
internal object NativeToolAccessPolicy {
    @Volatile private var cachedCrossPlatformMeteredIds: Set<String>? = null

    private fun crossPlatformMeteredIds(context: Context): Set<String> {
        cachedCrossPlatformMeteredIds?.let { return it }
        val loaded = runCatching {
            val json = JSONObject(context.assets.open("offline-eligible-tools.json").bufferedReader().use { it.readText() })
            val profiles = json.getJSONArray("profiles")
            buildSet {
                for (index in 0 until profiles.length()) {
                    val profile = profiles.getJSONObject(index)
                    val platforms = profile.getJSONArray("platforms")
                    val hasAllPlatforms = listOf("web", "android", "ios").all { platform ->
                        (0 until platforms.length()).any { platforms.getString(it) == platform }
                    }
                    if (profile.optString("billingKey").startsWith("local.") && hasAllPlatforms) {
                        add(profile.optString("toolId"))
                    }
                }
            }
        }.getOrDefault(emptySet())
        synchronized(this) { cachedCrossPlatformMeteredIds = loaded }
        return loaded
    }

    fun isHybridTool(context: Context, tool: ToolRecord): Boolean {
        val restrictedDisclaimers = setOf("health", "finance", "earnings")
        val restrictedCategories = setOf("fitness", "personal")
        return tool.id in crossPlatformMeteredIds(context) &&
            tool.status == "active" &&
            tool.clientSide &&
            !tool.requiresBackend &&
            !tool.requiresAuth &&
            tool.category !in restrictedCategories &&
            !tool.id.startsWith("finance-") &&
            (tool.disclaimer?.let { it !in restrictedDisclaimers } ?: true)
    }

    suspend fun isApplicationOnline(context: Context): Boolean = withContext(Dispatchers.IO) {
        if (!hasValidatedInternet(context)) return@withContext false
        val connection = (URL("https://envtools.store/").openConnection() as? HttpURLConnection)
            ?: return@withContext false
        try {
            connection.requestMethod = "HEAD"
            connection.connectTimeout = 2500
            connection.readTimeout = 2500
            connection.useCaches = false
            connection.responseCode in 200..399 && connection.url.host == "envtools.store"
        } catch (_: Exception) {
            false
        } finally {
            connection.disconnect()
        }
    }

    fun hasValidatedInternet(context: Context): Boolean {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val network: Network = manager.activeNetwork ?: return false
        val caps: NetworkCapabilities = manager.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}

/** Native ad access is intentionally absent until a separate Android launch. */
internal val LocalNativeToolAccessCompletion = androidx.compose.runtime.staticCompositionLocalOf<(Boolean) -> Unit> { {} }

@androidx.compose.runtime.Composable
internal fun NativeToolAccessContainer(content: @androidx.compose.runtime.Composable () -> Unit) {
    content()
}
