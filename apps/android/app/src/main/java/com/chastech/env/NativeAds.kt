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
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import com.google.android.libraries.ads.mobile.sdk.common.AdLoadCallback
import com.google.android.libraries.ads.mobile.sdk.common.LoadAdError
import com.google.android.libraries.ads.mobile.sdk.common.RequestConfiguration
import com.chastech.env.data.ToolRecord
import com.google.android.libraries.ads.mobile.sdk.initialization.InitializationConfig
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.PrivacyOptionsRequirementStatus
import com.google.android.ump.UserMessagingPlatform
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

internal object NativeAdsPolicy {
    private val toolIdPattern = Regex("[a-z0-9][a-z0-9-]{0,119}")
    val adsSelectionEnabled: Boolean get() = BuildConfig.ENV_ADS_ENABLED
    val adDisplayConfigured: Boolean get() = BuildConfig.ENV_ADS_ENABLED &&
        BuildConfig.ENV_ADS_PRIVACY_CONFIGURED &&
        BuildConfig.ENV_ADMOB_APP_ID.matches(Regex("ca-app-pub-[0-9]{16}~[0-9]{10}")) &&
        BuildConfig.ENV_ADMOB_BANNER_AD_UNIT_ID.matches(Regex("ca-app-pub-[0-9]{16}/[0-9]{10}"))

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
        return adDisplayConfigured &&
            tool.id in allowlistedIds &&
            tool.id in crossPlatformMeteredIds(context) &&
            tool.status == "active" &&
            tool.clientSide &&
            !tool.requiresBackend &&
            !tool.requiresAuth &&
            tool.category !in restrictedCategories &&
            !tool.id.startsWith("finance-") &&
            (tool.disclaimer == null || tool.disclaimer !in restrictedDisclaimers)
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
        if (!NativeAdsPolicy.adDisplayConfigured || refreshing) return
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
    if (!NativeAdsPolicy.adDisplayConfigured || !NativeAdsPrivacyManager.privacyOptionsRequired || activity == null) return
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
        NativeAdsPolicy.isHybridTool(context, tool) &&
            runCatching { com.chastech.env.billing.OfflineWalletJournal(context).isEligibleTool(context, toolId) }.getOrDefault(false)
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
