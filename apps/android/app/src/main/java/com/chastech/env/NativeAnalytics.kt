package com.chastech.env

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/**
 * Native Android analytics client. Consent is device-local, events are metadata-only,
 * and the network queue is bounded. Nothing is sent before an explicit grant.
 */
object NativeAnalytics {
    private const val PREFS = "env.analytics.preferences.v1"
    private const val CONSENT_KEY = "consent"
    private const val SUBJECT_KEY = "subject"
    private const val SESSION_KEY = "session"
    private const val QUEUE_KEY = "queue"
    private const val REVOKE_KEY = "revoke"
    private const val POLICY_VERSION = "2026-10-30.v1"
    private const val MAX_QUEUE = 25
    private const val MAX_AGE_MS = 30L * 24L * 60L * 60L * 1000L

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val base get() = BuildConfig.ENV_API_BASE_URL.trimEnd('/')

    private fun network(context: Context): Pair<Boolean, String> {
        return runCatching {
            val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val active = manager.activeNetwork
            val capabilities = active?.let { manager.getNetworkCapabilities(it) }
            val online = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
            val type = when {
                capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "wifi"
                capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "cellular"
                capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true -> "ethernet"
                else -> "unknown"
            }
            online to type
        }.getOrDefault(false to "unknown")
    }

    private fun session(context: Context): String = prefs(context).getString(SESSION_KEY, null)
        ?.takeIf { runCatching { UUID.fromString(it) }.isSuccess }
        ?: UUID.randomUUID().toString().also { prefs(context).edit().putString(SESSION_KEY, it).apply() }

    private fun post(path: String, payload: JSONObject, sessionId: String? = null): JSONObject {
        require(base.startsWith("https://")) { "enV analytics requires a secure API connection." }
        val connection = (URL("$base$path").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 12_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
            if (sessionId != null) setRequestProperty("x-env-analytics-session", sessionId)
        }
        try {
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val raw = stream?.use { it.readBytes().toString(Charsets.UTF_8) }.orEmpty()
            val result = runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
            if (status !in 200..299 || !result.optBoolean("ok")) {
                throw IllegalStateException(result.optString("message").ifBlank { "Analytics request failed (HTTP $status)." })
            }
            return result.optJSONObject("data") ?: JSONObject()
        } finally { connection.disconnect() }
    }

    suspend fun chooseConsent(context: Context, granted: Boolean) = withContext(Dispatchers.IO) {
        val store = prefs(context)
        val oldSubject = store.getString(SUBJECT_KEY, null)
        val subject = oldSubject ?: UUID.randomUUID().toString()
        if (granted) {
            post(
                "/api/analytics/consent",
                JSONObject().put("subjectId", subject).put("platform", "android")
                    .put("granted", true).put("policyVersion", POLICY_VERSION),
            )
            store.edit().putString(SUBJECT_KEY, subject).putString(CONSENT_KEY, "granted").remove(REVOKE_KEY).apply()
        } else {
            // Opt-out takes effect locally even when offline; retry revocation on a later connection.
            store.edit().putString(CONSENT_KEY, "denied").remove(QUEUE_KEY).remove(SESSION_KEY)
                .remove(SUBJECT_KEY).apply()
            if (oldSubject != null) {
                runCatching {
                    post("/api/analytics/consent", JSONObject().put("subjectId", oldSubject).put("platform", "android")
                        .put("granted", false).put("policyVersion", POLICY_VERSION))
                    store.edit().remove(REVOKE_KEY).apply()
                }.onFailure {
                    store.edit().putString(REVOKE_KEY, oldSubject).apply()
                }
            }
        }
    }

    fun consentChoice(context: Context): String = prefs(context).getString(CONSENT_KEY, "unset") ?: "unset"

    fun record(context: Context, name: String, toolId: String? = null, outcome: String = "unknown", durationMs: Long? = null, errorCode: String? = null) {
        val store = prefs(context)
        if (store.getString(CONSENT_KEY, "unset") != "granted") return
        val subject = store.getString(SUBJECT_KEY, null) ?: return
        if (name !in setOf("app_opened","tool_viewed","tool_started","tool_completed","tool_failed","tool_cancelled","tool_abandoned","feedback_submitted","update_viewed","offline_sync_succeeded","offline_sync_failed")) return
        val (online, networkType) = network(context)
        val metrics = context.resources.displayMetrics
        val widthDp = metrics.widthPixels / metrics.density
        val deviceClass = if (widthDp < 600) "phone" else "tablet"
        val item = JSONObject()
            .put("eventId", UUID.randomUUID().toString())
            .put("name", name)
            .put("occurredAt", java.time.Instant.now().toString())
            .put("outcome", outcome)
            .put("isOffline", !online)
            .put("networkType", networkType)
            .put("networkEffectiveType", "unknown")
            .put("deviceClass", deviceClass)
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("properties", JSONObject().put("surface", "native"))
        if (toolId != null) item.put("toolId", toolId)
        if (durationMs != null && durationMs in 0..3_600_000) item.put("durationMs", durationMs)
        if (errorCode != null && errorCode.matches(Regex("[A-Z0-9_]{1,64}"))) item.put("errorCode", errorCode)
        synchronized(this) {
            val queue = runCatching { JSONArray(store.getString(QUEUE_KEY, "[]")) }.getOrElse { JSONArray() }
            queue.put(item)
            val bounded = JSONArray()
            for (i in (queue.length() - MAX_QUEUE).coerceAtLeast(0) until queue.length()) {
                val event = queue.optJSONObject(i) ?: continue
                val date = event.optString("occurredAt")
                val timestamp = runCatching { java.time.Instant.parse(date).toEpochMilli() }.getOrDefault(0L)
                if (timestamp >= System.currentTimeMillis() - MAX_AGE_MS) bounded.put(event)
            }
            store.edit().putString(QUEUE_KEY, bounded.toString()).apply()
        }
    }

    suspend fun flush(context: Context) = withContext(Dispatchers.IO) {
        val store = prefs(context)
        val revoke = store.getString(REVOKE_KEY, null)
        if (!revoke.isNullOrBlank()) {
            runCatching {
                post("/api/analytics/consent", JSONObject().put("subjectId", revoke).put("platform", "android")
                    .put("granted", false).put("policyVersion", POLICY_VERSION))
                store.edit().remove(REVOKE_KEY).apply()
            }
        }
        if (store.getString(CONSENT_KEY, "unset") != "granted") return@withContext
        val subject = store.getString(SUBJECT_KEY, null) ?: return@withContext
        val queue = runCatching { JSONArray(store.getString(QUEUE_KEY, "[]")) }.getOrElse { JSONArray() }
        if (queue.length() == 0) return@withContext
        val batch = JSONArray()
        for (i in 0 until minOf(MAX_QUEUE, queue.length())) batch.put(queue.getJSONObject(i))
        val payload = JSONObject().put("subjectId", subject).put("platform", "android")
            .put("policyVersion", POLICY_VERSION).put("events", batch)
        post("/api/analytics/events", payload, session(context))
        val sent = batch.length()
        val remaining = JSONArray()
        for (i in sent until queue.length()) remaining.put(queue.getJSONObject(i))
        store.edit().putString(QUEUE_KEY, remaining.toString()).apply()
    }

    fun startNewSession(context: Context) {
        prefs(context).edit().putString(SESSION_KEY, UUID.randomUUID().toString()).apply()
    }
}
