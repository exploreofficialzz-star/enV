package com.chastech.env

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
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
    private const val PREFS = "env.analytics.preferences.v2"
    private const val LEGACY_PREFS = "env.analytics.preferences.v1"
    private const val KEY_ALIAS = "com.chastech.env.analytics.aes.v1"
    private const val SECURE_PREFIX = "secure."
    private const val CONSENT_KEY = "consent"
    private const val SUBJECT_KEY = "subject"
    private const val SESSION_KEY = "session"
    private const val QUEUE_KEY = "queue"
    private const val REVOKE_KEY = "revoke"
    private const val POLICY_VERSION = "2026-10-30.v1"
    private const val MAX_QUEUE = 25
    private const val MAX_AGE_MS = 30L * 24L * 60L * 60L * 1000L

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private fun legacyPrefs(context: Context) = context.applicationContext.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)

    private fun encryptionKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build()
        generator.init(spec)
        return generator.generateKey()
    }

    private fun securePutString(context: Context, key: String, value: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
        val encrypted = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        prefs(context).edit()
            .putString(SECURE_PREFIX + key, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .apply()
    }

    private fun secureGetString(context: Context, key: String): String? {
        val storageKey = SECURE_PREFIX + key
        val saved = prefs(context).getString(storageKey, null)
        if (saved != null) {
            return runCatching {
                val packed = Base64.decode(saved, Base64.NO_WRAP)
                require(packed.size > 12) { "Encrypted analytics record is truncated." }
                val iv = packed.copyOfRange(0, 12)
                val ciphertext = packed.copyOfRange(12, packed.size)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, iv))
                cipher.doFinal(ciphertext).toString(Charsets.UTF_8)
            }.getOrElse {
                prefs(context).edit().remove(storageKey).apply()
                null
            }
        }
        // One-time migration from the pre-encryption preference file.
        val legacy = legacyPrefs(context).getString(key, null) ?: return null
        securePutString(context, key, legacy)
        legacyPrefs(context).edit().remove(key).apply()
        return legacy
    }

    private fun secureRemove(context: Context, key: String) {
        prefs(context).edit().remove(SECURE_PREFIX + key).apply()
        legacyPrefs(context).edit().remove(key).apply()
    }

    private fun consentChoiceValue(context: Context): String {
        prefs(context).getString(CONSENT_KEY, null)?.let { return it }
        val legacy = legacyPrefs(context).getString(CONSENT_KEY, null) ?: "unset"
        prefs(context).edit().putString(CONSENT_KEY, legacy).apply()
        legacyPrefs(context).edit().remove(CONSENT_KEY).apply()
        return legacy
    }

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

    private fun session(context: Context): String = secureGetString(context, SESSION_KEY)
        ?.takeIf { runCatching { UUID.fromString(it) }.isSuccess }
        ?: UUID.randomUUID().toString().also { securePutString(context, SESSION_KEY, it) }

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
        val oldSubject = secureGetString(context, SUBJECT_KEY)
        val subject = oldSubject ?: UUID.randomUUID().toString()
        if (granted) {
            post(
                "/api/analytics/consent",
                JSONObject().put("subjectId", subject).put("platform", "android")
                    .put("granted", true).put("policyVersion", POLICY_VERSION),
            )
            securePutString(context, SUBJECT_KEY, subject)
            store.edit().putString(CONSENT_KEY, "granted").apply()
            secureRemove(context, REVOKE_KEY)
        } else {
            // Opt-out takes effect locally even when offline; retry revocation on a later connection.
            store.edit().putString(CONSENT_KEY, "denied").apply()
            secureRemove(context, QUEUE_KEY)
            secureRemove(context, SESSION_KEY)
            secureRemove(context, SUBJECT_KEY)
            if (oldSubject != null) {
                runCatching {
                    post("/api/analytics/consent", JSONObject().put("subjectId", oldSubject).put("platform", "android")
                        .put("granted", false).put("policyVersion", POLICY_VERSION))
                    secureRemove(context, REVOKE_KEY)
                }.onFailure {
                    securePutString(context, REVOKE_KEY, oldSubject)
                }
            }
        }
    }

    fun consentChoice(context: Context): String = consentChoiceValue(context)

    fun record(context: Context, name: String, toolId: String? = null, outcome: String = "unknown", durationMs: Long? = null, errorCode: String? = null) {
        val store = prefs(context)
        if (!BuildConfig.ANALYTICS_ENABLED || store.getString(CONSENT_KEY, "unset") != "granted") return
        val subject = secureGetString(context, SUBJECT_KEY) ?: return
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
            val queue = runCatching { JSONArray(secureGetString(context, QUEUE_KEY) ?: "[]") }.getOrElse { JSONArray() }
            queue.put(item)
            val bounded = JSONArray()
            for (i in (queue.length() - MAX_QUEUE).coerceAtLeast(0) until queue.length()) {
                val event = queue.optJSONObject(i) ?: continue
                val date = event.optString("occurredAt")
                val timestamp = runCatching { java.time.Instant.parse(date).toEpochMilli() }.getOrDefault(0L)
                if (timestamp >= System.currentTimeMillis() - MAX_AGE_MS) bounded.put(event)
            }
            securePutString(context, QUEUE_KEY, bounded.toString())
        }
    }

    suspend fun flush(context: Context) = withContext(Dispatchers.IO) {
        val store = prefs(context)
        val revoke = secureGetString(context, REVOKE_KEY)
        if (!revoke.isNullOrBlank()) {
            runCatching {
                post("/api/analytics/consent", JSONObject().put("subjectId", revoke).put("platform", "android")
                    .put("granted", false).put("policyVersion", POLICY_VERSION))
                secureRemove(context, REVOKE_KEY)
            }
        }
        if (!BuildConfig.ANALYTICS_ENABLED || store.getString(CONSENT_KEY, "unset") != "granted") return@withContext
        val subject = secureGetString(context, SUBJECT_KEY) ?: return@withContext
        val queue = runCatching { JSONArray(secureGetString(context, QUEUE_KEY) ?: "[]") }.getOrElse { JSONArray() }
        if (queue.length() == 0) return@withContext
        val batch = JSONArray()
        for (i in 0 until minOf(MAX_QUEUE, queue.length())) batch.put(queue.getJSONObject(i))
        val payload = JSONObject().put("subjectId", subject).put("platform", "android")
            .put("policyVersion", POLICY_VERSION).put("events", batch)
        post("/api/analytics/events", payload, session(context))
        val sent = batch.length()
        val remaining = JSONArray()
        for (i in sent until queue.length()) remaining.put(queue.getJSONObject(i))
        securePutString(context, QUEUE_KEY, remaining.toString())
    }

    fun startNewSession(context: Context) {
        securePutString(context, SESSION_KEY, UUID.randomUUID().toString())
    }
}
