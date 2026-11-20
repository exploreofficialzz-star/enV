package com.chastech.env

import android.app.Activity
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.TextButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.CompositionLocalProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.libraries.ads.mobile.sdk.MobileAds
import com.google.android.libraries.ads.mobile.sdk.banner.AdSize
import com.google.android.libraries.ads.mobile.sdk.banner.AdView
import com.google.android.libraries.ads.mobile.sdk.banner.BannerAd
import com.google.android.libraries.ads.mobile.sdk.banner.BannerAdRequest
import com.google.android.libraries.ads.mobile.sdk.common.AdRequest
import com.google.android.libraries.ads.mobile.sdk.common.AdLoadCallback
import com.google.android.libraries.ads.mobile.sdk.common.LoadAdError
import com.google.android.libraries.ads.mobile.sdk.common.RequestConfiguration
import com.chastech.env.data.ToolRecord
import com.google.android.libraries.ads.mobile.sdk.initialization.InitializationConfig
import com.google.android.libraries.ads.mobile.sdk.rewarded.RewardedAd
import com.google.android.libraries.ads.mobile.sdk.rewarded.RewardedAdEventCallback
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.ConsentInformation.PrivacyOptionsRequirementStatus
import com.google.android.ump.UserMessagingPlatform
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

internal val LocalNativeToolAccessCompletion = staticCompositionLocalOf<(Boolean) -> Unit> { {} }
private val NativeToolAccessCleanupScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

internal object NativeAdsPolicy {
    private val toolIdPattern = Regex("[a-z0-9][a-z0-9-]{0,119}")
    val adsSelectionEnabled: Boolean get() = BuildConfig.ENV_ADS_ENABLED
    val privacySetupConfigured: Boolean get() = BuildConfig.ENV_ADS_ENABLED &&
        BuildConfig.ENV_ADS_PRIVACY_CONFIGURED &&
        BuildConfig.ENV_ADMOB_APP_ID.matches(Regex("ca-app-pub-[0-9]{16}~[0-9]{10}"))
    val adDisplayConfigured: Boolean get() = privacySetupConfigured &&
        BuildConfig.ENV_ADMOB_BANNER_AD_UNIT_ID.matches(Regex("ca-app-pub-[0-9]{16}/[0-9]{10}"))
    val rewardedUnitId: String get() = BuildConfig.ENV_ADMOB_REWARDED_AD_UNIT_ID.trim()
    private val rewardedToolIds: Set<String> by lazy {
        BuildConfig.ENV_AD_ACCESS_TOOL_IDS.split(",").map { it.trim() }.filter { toolIdPattern.matches(it) }.toSet()
    }
    val rewardedAccessConfigured: Boolean get() = BuildConfig.ENV_AD_ACCESS_GATE_ENABLED
    val rewardedAdsConfigured: Boolean get() = rewardedAccessConfigured &&
        privacySetupConfigured && rewardedUnitId.matches(Regex("/[A-Za-z0-9_./-]{3,180}"))
    fun isRewardedAccessTool(tool: ToolRecord): Boolean =
        rewardedAccessConfigured && tool.id in rewardedToolIds && isAdEligibleTool(tool)

    private val allowlistedIds: Set<String> by lazy {
        BuildConfig.ENV_AD_SUPPORTED_TOOL_IDS.split(",").map { it.trim() }.filter { toolIdPattern.matches(it) }.toSet()
    }

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
        return tool.id in allowlistedIds &&
            tool.id in crossPlatformMeteredIds(context) &&
            tool.status == "active" &&
            tool.clientSide &&
            !tool.requiresBackend &&
            !tool.requiresAuth &&
            tool.category !in restrictedCategories &&
            !tool.id.startsWith("finance-") &&
            (tool.disclaimer?.let { it !in restrictedDisclaimers } ?: true)
    }

    /**
     * Native advertising eligibility is separate from the offline-wallet cohort.
     * Only active, public, device-local tools qualify; Studio, AI and Lab/Sandbox
     * experiences remain excluded. This policy never grants offline execution.
     */
    fun isAdEligibleTool(tool: ToolRecord): Boolean {
        val restrictedDisclaimers = setOf("health", "finance", "earnings")
        val restrictedCategories = setOf(
            "health", "finance", "earnings", "fitness", "personal",
            "ai", "developer", "accessibility", "lab", "labs",
        )
        val localEngineTypes = setOf(
            "calculator", "converter", "datetime", "text", "codec", "color", "qr",
            "barcode", "generator", "image", "cssgen", "mockup", "post", "device",
            "seo", "file-converter", "developer", "pdf", "mime", "security",
            "creator", "business", "audio", "network", "video", "document",
        )
        val localCustomCategories = setOf(
            "career", "celebrations", "communication", "ecommerce", "events", "food",
            "gaming", "interactive", "marketing", "mockups", "photography",
            "productivity", "relationships", "screenshots", "social", "streaming", "files",
            "travel", "webdesign",
        )
        val localDocumentIds = setOf(
            "pdf-merger", "pdf-metadata-viewer", "pdf-metadata-tool", "pdf-page-extractor",
            "pdf-splitter", "pdf-rotator", "docx-text-extractor", "text-to-docx",
            "txt-to-docx", "markdown-to-docx",
        )
        val remoteAudioOperations = setOf(
            "server-mp3", "server-wav", "server-ogg", "server-flac", "server-volume",
            "server-bitrate", "server-sample-rate", "server-channels", "server-merge",
        )
        val remoteVideoOperations = setOf(
            "video-merge", "video-replace-audio", "video-to-mp4", "video-to-mp3",
            "video-to-gif", "video-to-webm", "video-to-mov", "video-to-avi",
            "video-resize", "video-crop", "video-rotate", "video-mute", "video-fps",
            "video-bitrate", "video-resolution-presets", "video-audio-volume",
        )
        val remoteToolIds = setOf(
            "audio-to-mp3-server", "audio-to-wav-server", "audio-to-ogg-server",
            "audio-to-flac-server", "audio-bitrate-converter", "audio-merger",
            "audio-to-text", "audio-to-subtitles", "video-merger", "video-audio-replacer",
            "video-to-mp4", "video-to-mp3", "video-to-gif", "video-to-webm", "video-to-mov",
            "video-to-avi", "video-resize", "video-crop", "video-rotate", "video-mute",
            "video-fps", "video-bitrate", "video-resolution-presets", "video-audio-volume",
            "video-cropper", "video-to-text", "video-to-subtitles", "youtube-audio-extractor",
            "url-media-inspector", "video-url-downloader", "youtube-video-downloader",
            "tiktok-video-downloader", "facebook-video-downloader", "instagram-video-downloader",
            "x-video-downloader", "whois-lookup", "dns-lookup", "website-screenshot",
            "media-backend-checker",
        )

        val engineType = tool.engine.type.lowercase()
        val operation = tool.engine.extras["op"]?.lowercase().orEmpty()
        val identity = (
            listOf(tool.id, tool.name, tool.subcategory.orEmpty(), engineType, tool.engine.id) +
                tool.tags + tool.keywords
            ).joinToString(" ")
            .lowercase()
            .replace('-', ' ')
            .replace('_', ' ')
        val excludedConcept = Regex(
            """\b(studio|studios|lab|labs|laboratory|laboratories|sandbox|ai|artificial intelligence)\b"""
        ).containsMatchIn(identity)
        val localExecution = engineType in localEngineTypes ||
            (engineType == "custom" && tool.category in localCustomCategories) ||
            (engineType == "document-backend" && tool.id in localDocumentIds)
        val remoteExecution = engineType in setOf("url-media", "url-media-info") ||
            operation in remoteAudioOperations ||
            operation in remoteVideoOperations ||
            tool.id in remoteToolIds

        return tool.status == "active" &&
            tool.clientSide &&
            !tool.requiresBackend &&
            !tool.requiresAuth &&
            tool.category.lowercase() !in restrictedCategories &&
            !tool.id.startsWith("finance-") &&
            (tool.disclaimer?.lowercase()?.let { it !in restrictedDisclaimers } ?: true) &&
            engineType != "ai" &&
            localExecution &&
            !remoteExecution &&
            !excludedConcept
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
            val status = connection.responseCode
            status in 200..399 && connection.url.host == "envtools.store"
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

internal object NativeAdsPrivacyManager {
    var canRequestAds by mutableStateOf(false)
        private set
    var privacyOptionsRequired by mutableStateOf(false)
        private set
    var sdkReady by mutableStateOf(false)
        private set
    private var initializing = false
    private var refreshing = false

    fun refreshConsent(activity: Activity) {
        if (!NativeAdsPolicy.privacySetupConfigured || refreshing) return
        refreshing = true
        val information = UserMessagingPlatform.getConsentInformation(activity)
        val parameters = ConsentRequestParameters.Builder().build()
        information.requestConsentInfoUpdate(
            activity,
            parameters,
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) {
                    refreshing = false
                    updateConsentAndInitialize(activity, information)
                }
            },
            {
                // A failed refresh never grants new permission. Cached UMP permission is used
                // only when the SDK itself still reports that ads may be requested.
                refreshing = false
                updateConsentAndInitialize(activity, information)
            },
        )
    }

    private fun updateConsentAndInitialize(activity: Activity, information: ConsentInformation) {
        canRequestAds = information.canRequestAds()
        privacyOptionsRequired = information.privacyOptionsRequirementStatus ==
            PrivacyOptionsRequirementStatus.REQUIRED
        if (!canRequestAds || initializing || sdkReady) return
        initializing = true
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            runCatching {
                MobileAds.setRequestConfiguration(
                    RequestConfiguration.Builder()
                        .setPublisherPrivacyPersonalizationState(RequestConfiguration.PublisherPrivacyPersonalizationState.DISABLED)
                        .build(),
                )
                MobileAds.initialize(
                    activity.applicationContext,
                    InitializationConfig.Builder(BuildConfig.ENV_ADMOB_APP_ID).build(),
                ) {
                    Handler(Looper.getMainLooper()).post {
                        sdkReady = true
                        initializing = false
                    }
                }
            }.onFailure {
                Handler(Looper.getMainLooper()).post { initializing = false; sdkReady = false; canRequestAds = false }
            }
        }
    }

    fun showPrivacyOptions(activity: Activity) {
        if (!privacyOptionsRequired) return
        UserMessagingPlatform.showPrivacyOptionsForm(activity) { error ->
            val information = UserMessagingPlatform.getConsentInformation(activity)
            if (error != null) {
                canRequestAds = false
                privacyOptionsRequired = information.privacyOptionsRequirementStatus ==
                    PrivacyOptionsRequirementStatus.REQUIRED
            } else {
                updateConsentAndInitialize(activity, information)
            }
        }
    }
}

@Composable
internal fun NativeAdsPrivacyOptionsButton() {
    val context = LocalContext.current
    val activity = context as? Activity
    if (!NativeAdsPolicy.privacySetupConfigured || !NativeAdsPrivacyManager.privacyOptionsRequired || activity == null) return
    Button(onClick = { NativeAdsPrivacyManager.showPrivacyOptions(activity) }, modifier = Modifier.fillMaxWidth()) {
        Text("Advertising privacy options")
    }
}

@Composable
internal fun NativeToolAdSlot(tool: ToolRecord) {
    val toolId = tool.id
    val context = LocalContext.current
    val preview = LocalInspectionMode.current
    val supported = remember(toolId) {
        NativeAdsPolicy.isAdEligibleTool(tool)
    }
    val network = rememberValidatedAdNetwork(context)
    var applicationOnline by remember(toolId) { mutableStateOf(false) }
    LaunchedEffect(network, toolId) {
        if (!network) {
            applicationOnline = false
        } else {
            while (true) {
                applicationOnline = NativeAdsPolicy.isApplicationOnline(context)
                delay(15_000L)
            }
        }
    }
    if (preview || !supported || !applicationOnline || !NativeAdsPolicy.adDisplayConfigured ||
        !NativeAdsPrivacyManager.canRequestAds || !NativeAdsPrivacyManager.sdkReady) return
    val adView = remember(toolId) { AdView(context) }
    val widthDp = remember(context) {
        (context.resources.displayMetrics.widthPixels / context.resources.displayMetrics.density).toInt().coerceAtLeast(320)
    }
    val adSize = remember(widthDp) { AdSize.getLargeAnchoredAdaptiveBannerAdSize(context, widthDp) }
    DisposableEffect(adView) { onDispose { adView.destroy() } }
    LaunchedEffect(adView, adSize, toolId) {
        adView.loadAd(
            BannerAdRequest.Builder(BuildConfig.ENV_ADMOB_BANNER_AD_UNIT_ID, adSize).build(),
            object : AdLoadCallback<BannerAd> {
                override fun onAdLoaded(ad: BannerAd) = Unit
                override fun onAdFailedToLoad(adError: LoadAdError) = Unit
            },
        )
    }
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text("Advertisement", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        AndroidView(
            modifier = Modifier.fillMaxWidth().wrapContentWidth(),
            factory = { adView },
        )
    }
}

private object NativeRewardedAdProgress {
    private const val PREFS = "env_rewarded_ad_progress_v1"
    private const val WINDOW_MS = 30L * 24L * 60L * 60L * 1_000L

    fun recordCompletion(context: Context, now: Long = System.currentTimeMillis()): Boolean {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val storedStart = prefs.getLong("period_started_at", 0L)
        val expired = storedStart <= 0L || now < storedStart || now - storedStart >= WINDOW_MS
        val start = if (expired) now else storedStart
        val count = (if (expired) 0 else prefs.getInt("completed", 0)).coerceAtLeast(0) + 1
        val offerShown = if (expired) false else prefs.getBoolean("offer_shown", false)
        val shouldShowOffer = count >= 3 && !offerShown
        val saved = prefs.edit()
            .putLong("period_started_at", start)
            .putInt("completed", count)
            .putBoolean("offer_shown", offerShown || shouldShowOffer)
            .commit()
        return saved && shouldShowOffer
    }
}

@Composable
internal fun NativeRewardedToolAccessGate(
    tool: ToolRecord,
    onOpenWallet: () -> Unit,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val preview = LocalInspectionMode.current
    val scope = rememberCoroutineScope()
    val consentReady = NativeAdsPrivacyManager.canRequestAds && NativeAdsPrivacyManager.sdkReady
    val network = rememberValidatedAdNetwork(context)
    var originReachable by remember(tool.id) { mutableStateOf(false) }
    var originCheckComplete by remember(tool.id) { mutableStateOf(false) }
    var unlocked by rememberSaveable(tool.id) { mutableStateOf(false) }
    var busy by rememberSaveable(tool.id) { mutableStateOf(false) }
    var feedback by rememberSaveable(tool.id) { mutableStateOf<String?>(null) }
    var showAdFreeOffer by rememberSaveable(tool.id) { mutableStateOf(false) }
    var pendingReservation by remember(tool.id) { mutableStateOf<com.chastech.env.billing.OfflineWalletNativeApi.ToolAccessReservation?>(null) }
    var activeReservation by remember(tool.id) { mutableStateOf<com.chastech.env.billing.OfflineWalletNativeApi.ToolAccessReservation?>(null) }

    LaunchedEffect(network, tool.id) {
        originCheckComplete = false
        originReachable = network && NativeAdsPolicy.isApplicationOnline(context)
        originCheckComplete = true
    }

    // Offline or origin-unreachable runs remain governed by the existing
    // signed allowance/journal path inside the native tool execution boundary.
    if (preview || !NativeAdsPolicy.isRewardedAccessTool(tool) || !network) {
        content()
        return
    }
    if (!originCheckComplete) {
        Column(Modifier.fillMaxWidth().padding(24.dp)) {
            Text("Checking enV connection…", style = MaterialTheme.typography.bodyMedium)
        }
        return
    }
    if (!originReachable) {
        content()
        return
    }

    suspend fun reserveTokenAccess() {
        if (busy) return
        if (!com.chastech.env.billing.OfflineWalletNativeApi.isPaired(context)) {
            feedback = "Sign in to enV and pair this device from your Web Wallet before using tokens."
            onOpenWallet()
            return
        }
        busy = true
        feedback = null
        try {
            pendingReservation = com.chastech.env.billing.OfflineWalletNativeApi.reserveToolAccess(
                context,
                tool.id,
                java.util.UUID.randomUUID().toString(),
            )
        } catch (failure: Exception) {
            feedback = failure.message ?: "A reviewed token price is not available for this tool. No tokens were charged."
        } finally {
            busy = false
        }
    }

    fun completeTokenSession(success: Boolean) {
        val reservation = activeReservation ?: return
        if (busy) return
        busy = true
        unlocked = false
        scope.launch {
            try {
                if (success) {
                    com.chastech.env.billing.OfflineWalletNativeApi.settleToolAccess(context, tool.id, reservation.reservationId)
                } else {
                    com.chastech.env.billing.OfflineWalletNativeApi.releaseToolAccess(context, tool.id, reservation.reservationId)
                }
                activeReservation = null
                feedback = null
            } catch (failure: Exception) {
                feedback = "Token settlement could not be verified. Access is paused to prevent another charge. " +
                    (failure.message ?: "Reconnect and contact support before retrying.")
            } finally {
                busy = false
            }
        }
    }

    DisposableEffect(tool.id) {
        onDispose {
            val reservation = activeReservation ?: pendingReservation
            if (reservation != null && !busy) {
                NativeToolAccessCleanupScope.launch {
                    runCatching {
                        com.chastech.env.billing.OfflineWalletNativeApi.releaseToolAccess(context, tool.id, reservation.reservationId)
                    }
                }
            }
        }
    }

    if (unlocked) {
        CompositionLocalProvider(LocalNativeToolAccessCompletion provides ::completeTokenSession) {
            content()
        }
    } else {
        Column(
            modifier = Modifier.fillMaxWidth().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Continue to " + tool.name, style = MaterialTheme.typography.titleMedium)
            Text(
                "Watch a complete rewarded video to use this tool for this visit, or choose a reviewed token price for ad-free access.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(
                onClick = {
                    if (activity == null || busy) return@Button
                    busy = true
                    feedback = null
                    RewardedAd.load(
                        AdRequest.Builder(NativeAdsPolicy.rewardedUnitId).build(),
                        object : AdLoadCallback<RewardedAd> {
                            override fun onAdLoaded(ad: RewardedAd) {
                                var rewardEarned = false
                                ad.adEventCallback = object : RewardedAdEventCallback {
                                    override fun onAdDismissedFullScreenContent() {
                                        Handler(Looper.getMainLooper()).post {
                                            busy = false
                                            if (!rewardEarned) feedback = "The rewarded ad was closed before completion. No access was unlocked."
                                        }
                                    }

                                    override fun onAdFailedToShowFullScreenContent(error: com.google.android.libraries.ads.mobile.sdk.common.FullScreenContentError) {
                                        Handler(Looper.getMainLooper()).post {
                                            busy = false
                                            feedback = "The rewarded ad could not be shown. Try again or use tokens."
                                        }
                                    }
                                }
                                runCatching {
                                    ad.show(activity) {
                                        rewardEarned = true
                                        val offer = NativeRewardedAdProgress.recordCompletion(context)
                                        Handler(Looper.getMainLooper()).post {
                                            unlocked = true
                                            busy = false
                                            showAdFreeOffer = offer
                                        }
                                    }
                                }.onFailure {
                                    busy = false
                                    feedback = "The rewarded ad could not be shown. Try again or use tokens."
                                }
                            }

                            override fun onAdFailedToLoad(error: LoadAdError) {
                                Handler(Looper.getMainLooper()).post {
                                    busy = false
                                    feedback = "A rewarded ad is unavailable. Check your connection or advertising settings, then try again."
                                }
                            }
                        },
                    )
                },
                enabled = !busy && activity != null && network && originReachable && consentReady && NativeAdsPolicy.rewardedAdsConfigured,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (busy) "Loading rewarded ad…" else "Watch an ad to continue")
            }
            Button(
                onClick = { scope.launch { reserveTokenAccess() } },
                enabled = !busy && network && originReachable,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (busy) "Checking reviewed token price…" else "Use enV tokens (ad-free)")
            }
            Button(onClick = onOpenWallet, modifier = Modifier.fillMaxWidth()) {
                Text("Open Wallet / sign in")
            }
            if (!consentReady) {
                Text("Google advertising privacy choices must permit ads before a rewarded video can load.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            feedback?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
        }
    }

    pendingReservation?.let { reservation ->
        AlertDialog(
            onDismissRequest = {
                pendingReservation = null
                scope.launch {
                    runCatching {
                        com.chastech.env.billing.OfflineWalletNativeApi.releaseToolAccess(context, tool.id, reservation.reservationId)
                    }
                }
            },
            title = { Text("Confirm token access") },
            text = {
                Text("This tool costs " + reservation.reservedTokens.toString() + " enV tokens " +
                    reservation.unitLabel + ". Tokens are deducted only after a successful tool result.")
            },
            confirmButton = {
                Button(onClick = {
                    activeReservation = reservation
                    pendingReservation = null
                    unlocked = true
                    feedback = null
                }) { Text("Confirm and continue") }
            },
            dismissButton = {
                TextButton(onClick = {
                    pendingReservation = null
                    scope.launch {
                        runCatching {
                            com.chastech.env.billing.OfflineWalletNativeApi.releaseToolAccess(context, tool.id, reservation.reservationId)
                        }
                    }
                }) { Text("Cancel without charge") }
            },
        )
    }

    if (showAdFreeOffer) {
        AlertDialog(
            onDismissRequest = { showAdFreeOffer = false },
            title = { Text("Ready to go ad-free?") },
            text = { Text("You completed three rewarded ads in the last 30 days. Use the reviewed token price for individual tools.") },
            confirmButton = {
                Button(onClick = { showAdFreeOffer = false; scope.launch { reserveTokenAccess() } }) { Text("Use enV tokens") }
            },
            dismissButton = {
                TextButton(onClick = { showAdFreeOffer = false }) { Text("Keep using ads") }
            },
        )
    }
}

@Composable
private fun rememberValidatedAdNetwork(context: Context): Boolean {
    var connected by remember(context) { mutableStateOf(NativeAdsPolicy.hasValidatedInternet(context)) }
    DisposableEffect(context) {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { connected = NativeAdsPolicy.hasValidatedInternet(context) }
            override fun onLost(network: Network) { connected = NativeAdsPolicy.hasValidatedInternet(context) }
            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                connected = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            }
        }
        runCatching { manager?.registerDefaultNetworkCallback(callback) }
        onDispose { runCatching { manager?.unregisterNetworkCallback(callback) } }
    }
    return connected
}

@Composable
internal fun NativeAdsPrivacyDisclosure() {
    if (!NativeAdsPolicy.adDisplayConfigured) return
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("Advertising on selected tools", style = MaterialTheme.typography.titleSmall)
        Text(
            "Google Mobile Ads may load on selected, allowlisted tools while online. Google may process request context and technical identifiers for ad delivery, fraud prevention, frequency capping and reporting. Advertising uses separate privacy choices presented by Google’s User Messaging Platform.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
