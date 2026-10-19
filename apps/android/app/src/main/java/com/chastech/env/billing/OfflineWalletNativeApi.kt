package com.chastech.env.billing

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.chastech.env.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Native offline-wallet transport. The bearer token is encrypted at rest and scoped to offline routes. */
object OfflineWalletNativeApi {
    private const val PREFS = "env_offline_wallet_v1"
    private const val TOKEN_IV = "native_token_iv"
    private const val TOKEN_CIPHER = "native_token_cipher"
    private const val KEY_ALIAS = "com.chastech.env.offline.session.aesgcm.v1"
    private const val MAX_RESPONSE_BYTES = 512_000
    private val lock = Any()

    data class Result(val ok: Boolean, val message: String, val code: String? = null)
    data class ActivityItem(
        val id: String,
        val type: String,
        val description: String,
        val deltaAvailableSubunits: Double,
        val consumedSubunits: Double,
        val createdAt: String,
    )
    data class WalletDashboard(
        val availableTokens: Double,
        val reservedTokens: Double,
        val lifetimePurchasedTokens: Double,
        val lifetimeConsumedTokens: Double,
        val referralCode: String,
        val referralCount: Int,
        val qualifiedReferrals: Int,
        val videoSignups: Int,
        val videoConversions: Int,
        val referralTokens: Double,
        val affiliateTokens: Double,
        val bonusTokens: Double,
        val totalRewardTokens: Double,
        val activity: List<ActivityItem>,
    )

    private fun preferences(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun apiBase(): String {
        val base = BuildConfig.ENV_API_BASE_URL.trimEnd('/')
        require(base.isNotBlank()) { "The enV API base URL is not configured in this app build." }
        val url = URL(base)
        require(url.protocol == "https" || BuildConfig.DEBUG) { "Offline wallet requests require HTTPS in release builds." }
        return base
    }

    fun isPaired(context: Context): Boolean = sessionToken(context) != null

    fun deviceKeyId(context: Context): String {
        val prefs = preferences(context)
        prefs.getString("device_key_id", null)?.let { return it }
        val created = "native-${UUID.randomUUID().toString().replace("-", "")}" 
        check(prefs.edit().putString("device_key_id", created).commit()) { "Unable to save the device key identifier." }
        return created
    }

    private fun encryptionKey(): SecretKey = synchronized(lock) {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey) ?: run {
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setKeySize(256)
                .build())
            generator.generateKey()
        }
    }

    private fun sessionToken(context: Context): String? {
        val prefs = preferences(context)
        val ivText = prefs.getString(TOKEN_IV, null) ?: return null
        val ciphertextText = prefs.getString(TOKEN_CIPHER, null) ?: return null
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, Base64.decode(ivText, Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(ciphertextText, Base64.NO_WRAP)), StandardCharsets.UTF_8)
                .takeIf { it.matches(Regex("envnative1_[A-Za-z0-9_-]{43}")) }
        } catch (_: Exception) {
            // On key loss/corrupt storage, never attempt a request with an unverified credential.
            prefs.edit().remove(TOKEN_IV).remove(TOKEN_CIPHER).commit()
            null
        }
    }

    private fun storeSessionToken(context: Context, token: String, sessionId: String) {
        require(token.matches(Regex("envnative1_[A-Za-z0-9_-]{43}"))) { "The server returned an invalid native session token." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
        val encrypted = cipher.doFinal(token.toByteArray(StandardCharsets.UTF_8))
        check(preferences(context).edit()
            .putString(TOKEN_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString(TOKEN_CIPHER, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString("native_session_id", sessionId)
            .commit()) { "The paired session could not be stored securely." }
    }

    private data class HttpResult(val status: Int, val body: JSONObject)

    private fun request(path: String, method: String, body: JSONObject? = null, bearer: String? = null): HttpResult {
        val url = URL(apiBase() + path)
        val connection = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 8_000
            readTimeout = 15_000
            useCaches = false
            setRequestProperty("Accept", "application/json")
            if (bearer != null) setRequestProperty("Authorization", "Bearer $bearer")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            if (body != null) {
                val bytes = body.toString().toByteArray(StandardCharsets.UTF_8)
                require(bytes.size <= 256_000) { "The offline wallet request is too large." }
                connection.setFixedLengthStreamingMode(bytes.size)
                connection.outputStream.use { it.write(bytes) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(4096)
                var total = 0
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    total += read
                    require(total <= MAX_RESPONSE_BYTES) { "The offline wallet response exceeded its size limit." }
                    output.write(buffer, 0, read)
                }
                String(output.toByteArray(), StandardCharsets.UTF_8)
            } ?: "{}"
            return HttpResult(status, runCatching { JSONObject(text) }.getOrDefault(JSONObject()))
        } finally { connection.disconnect() }
    }

    private fun requireData(response: HttpResult): JSONObject {
        if (response.status !in 200..299 || !response.body.optBoolean("ok", false)) {
            val code = response.body.optString("error").takeIf { it.isNotBlank() }
            val message = response.body.optString("message").takeIf { it.isNotBlank() }
                ?: "The offline wallet request failed (${response.status})."
            throw IllegalStateException(if (code == null) message else "$message [$code]")
        }
        return response.body.optJSONObject("data") ?: throw IllegalStateException("The offline wallet response was incomplete.")
    }

    suspend fun fetchWalletDashboard(context: Context): WalletDashboard = withContext(Dispatchers.IO) {
        val bearer = sessionToken(context)
            ?: throw IllegalStateException("Pair this device from your signed-in enV web Wallet first.")
        val data = requireData(request("/api/billing/native-wallet", "GET", bearer = bearer))
        val wallet = data.optJSONObject("wallet")
            ?: throw IllegalStateException("The shared wallet response was incomplete.")
        val rewards = data.optJSONObject("rewards")
            ?: throw IllegalStateException("The wallet rewards response was incomplete.")
        val activityJson = data.optJSONArray("activity")
        val activity = (0 until (activityJson?.length() ?: 0)).mapNotNull { index ->
            val row = activityJson?.optJSONObject(index) ?: return@mapNotNull null
            ActivityItem(
                id = row.optString("id"),
                type = row.optString("entry_type", "activity").replace('_', ' '),
                description = row.optString("description", "Wallet activity"),
                deltaAvailableSubunits = row.optDouble("delta_available_subunits", 0.0),
                consumedSubunits = row.optDouble("consumed_subunits", 0.0),
                createdAt = row.optString("created_at"),
            )
        }
        WalletDashboard(
            availableTokens = wallet.optDouble("availableTokens", 0.0),
            reservedTokens = wallet.optDouble("reservedTokens", 0.0),
            lifetimePurchasedTokens = wallet.optDouble("lifetimePurchasedSubunits", 0.0) / 1_000.0,
            lifetimeConsumedTokens = wallet.optDouble("lifetimeConsumedSubunits", 0.0) / 1_000.0,
            referralCode = rewards.optString("referralCode"),
            referralCount = rewards.optInt("referralCount", 0),
            qualifiedReferrals = rewards.optInt("qualifiedReferrals", 0),
            videoSignups = rewards.optInt("videoSignups", 0),
            videoConversions = rewards.optInt("videoConversions", 0),
            referralTokens = rewards.optDouble("referralTokens", 0.0),
            affiliateTokens = rewards.optDouble("affiliateTokens", 0.0),
            bonusTokens = rewards.optDouble("bonusTokens", 0.0),
            totalRewardTokens = rewards.optDouble("totalRewardTokens", 0.0),
            activity = activity,
        )
    }

    suspend fun checkAvailability(): Result = withContext(Dispatchers.IO) {
        try {
            val response = request("/api/billing/offline/status", "GET")
            val data = requireData(response)
            Result(data.optBoolean("enabled", false), data.optString("message", "Offline token spending is paused."), data.optString("code"))
        } catch (error: Exception) {
            Result(false, error.message ?: "Offline wallet service unavailable.")
        }
    }

    suspend fun pair(context: Context, pairingCode: String): Result = withContext(Dispatchers.IO) {
        val deviceKeyId = deviceKeyId(context)
        val publicKey = OfflineWalletDeviceKey.createOrLoadPublicJwk(context, deviceKeyId).toJson()
        val body = JSONObject().put("pairingCode", pairingCode.trim()).put("platform", "android").put("publicKeyJwk", publicKey)
        val data = requireData(request("/api/billing/offline/pairing/redeem", "POST", body))
        val token = data.optString("sessionToken")
        val sessionId = data.optString("sessionId")
        storeSessionToken(context, token, sessionId)
        Result(true, "This Android device is paired to your enV account. Next, reserve an offline token allowance.")
    }

    suspend fun reserveAllowance(context: Context, journal: OfflineWalletJournal): Result = withContext(Dispatchers.IO) {
        val bearer = sessionToken(context) ?: throw IllegalStateException("Pair this device from your signed-in enV web wallet first.")
        val prefs = preferences(context)
        val issueKey = prefs.getString("pending_issue_idempotency", null) ?: "native-offline-${UUID.randomUUID().toString().replace("-", "")}".also {
            check(prefs.edit().putString("pending_issue_idempotency", it).commit()) { "Unable to save the allowance request key." }
        }
        val deviceKeyId = deviceKeyId(context)
        val publicKey = OfflineWalletDeviceKey.createOrLoadPublicJwk(context, deviceKeyId).toJson()
        val data = requireData(request("/api/billing/offline/allowances", "POST",
            JSONObject().put("requestedSubunits", 5_000).put("idempotencyKey", issueKey).put("platform", "android").put("publicKeyJwk", publicKey), bearer))
        val allowance = data.optJSONObject("allowance") ?: throw IllegalStateException("Server did not return an offline allowance.")
        val token = data.optString("allowanceToken")
        journal.installAllowance(
            allowance.optString("allowanceId"), deviceKeyId, token, allowance.optLong("allowanceSubunits"),
            allowance.optString("pricingVersion"), allowance.optString("issuedAt"), allowance.optString("expiresAt"),
        )
        check(prefs.edit().remove("pending_issue_idempotency").commit()) { "Allowance was issued, but its local retry key could not be cleared. Refresh before issuing another allowance." }
        Result(true, "Five tokens are reserved for eligible calculator operations on this device.")
    }

    suspend fun synchronize(context: Context, journal: OfflineWalletJournal, allowanceId: String, finalize: Boolean = false): Result = withContext(Dispatchers.IO) {
        if (finalize) {
            val availability = checkAvailability()
            check(availability.ok && availability.code == "LOCAL_TEST_ONLY") {
                "Finalization is available only in the isolated local-test environment. Server-signed attestation is required before production can release unused reservations."
            }
        }
        val bearer = sessionToken(context) ?: throw IllegalStateException("This device is not paired. Local records have not been removed.")
        val (_, unresolved) = journal.repairFinishingOperations(context, allowanceId)
        require(unresolved == 0) { "An offline calculator operation has an unfinished journal record. Finish or recover it before synchronizing." }
        if (journal.pendingTransactionCount(allowanceId) == 0 && !finalize) return@withContext Result(true, "No pending offline operations need synchronization.")
        val batch = journal.buildSyncBatch(allowanceId, finalize)
        val response = request("/api/billing/offline/sync", "POST", batch.toJson(), bearer)
        val data = response.body.optJSONObject("data")
        if (response.status in 200..299 && response.body.optBoolean("ok", false) && data != null) {
            val status = data.optString("status")
            journal.acknowledgeSyncBatch(allowanceId, batch.batchId, status)
            if (status == "reconciled") Result(true, "Local-test allowance finalized. Accepted usage: ${data.optLong("acceptedSubunits") / 1000.0} tokens; unused test reservation returned: ${data.optLong("releasedSubunits") / 1000.0} tokens.")
            else if (finalize) Result(true, "The next bounded sync batch was accepted. Review the remaining records and finalize again to close this local-test allowance.")
            else Result(true, "Offline records synchronized. Reserved funds remain protected until verified finalization.")
        } else {
            val code = response.body.optString("error")
            if (response.status == 409 && code in setOf("SEQUENCE_GAP", "CHECKPOINT_SEQUENCE_MISMATCH")) {
                journal.prepareRetryAfterRecoverableRejection(allowanceId, batch.batchId, code)
                Result(false, "The server requested a safe batch retry. Local transaction rows and spending counters were preserved.", code)
            } else {
                if (response.status == 409 && data?.optString("status") == "needs_recovery" || code in setOf("INVALID_DEVICE_SIGNATURE", "DEVICE_BINDING_MISMATCH", "INVALID_ALLOWANCE_TOKEN", "IDEMPOTENCY_CONFLICT", "OFFLINE_NEEDS_RECOVERY")) {
                    journal.markNeedsRecovery(allowanceId)
                }
                val message = response.body.optString("message").takeIf { it.isNotBlank() }
                    ?: "Synchronization failed (${response.status}). The journal has been kept for safe retry or recovery."
                Result(false, message, code.takeIf { it.isNotBlank() })
            }
        }
    }
}
