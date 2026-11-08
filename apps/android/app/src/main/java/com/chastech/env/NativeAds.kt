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
import com.google.android.libraries.ads.mobile.sdk.banner.AdLoadCallback
import com.google.android.libraries.ads.mobile.sdk.banner.AdSize
import com.google.android.libraries.ads.mobile.sdk.banner.AdView
import com.google.android.libraries.ads.mobile.sdk.banner.BannerAd
import com.google.android.libraries.ads.mobile.sdk.banner.BannerAdRequest
import com.google.android.libraries.ads.mobile.sdk.common.LoadAdError
import com.google.android.libraries.ads.mobile.sdk.initialization.InitializationConfig
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.PrivacyOptionsRequirementStatus
import com.google.android.ump.UserMessagingPlatform
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONObject

internal object NativeAdsPolicy {
    private val toolIdPattern = Regex("[a-z0-9][a-z0-9-]{0,119}")
    val adsSelectionEnabled: Boolean get() = BuildConfig.ENV_ADS_ENABLED
    val adDisplayConfigured: Boolean get() = BuildConfig.ENV_ADS_ENABLED &&
        BuildConfig.ENV_ADS_PRIVACY_CONFIGURED &&
        BuildConfig.ENV_ADMOB_APP_ID.matches(Regex("ca-app-pub-[0-9]{16}~[0-9]{10}")) &&
        BuildConfig.ENV_ADMOB_BANNER_AD_UNIT_ID.isNotBlank()

    private val allowlistedIds: Set<String> by lazy {
        BuildConfig.ENV_AD_SUPPORTED_TOOL_IDS.split(",").map { it.trim() }.filter { toolIdPattern.matches(it) }.toSet()
    }

    private val crossPlatformMeteredIds: Set<String> by lazy {
        runCatching {
            val json = JSONObject(
                javaClass.classLoader?.getResourceAsStream("offline-eligible-tools.json")
                    ?.bufferedReader()?.use { it.readText() }
                    ?: return@runCatching emptySet<String>()
            )
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
    }

    fun isHybridTool(context: Context, toolId: String): Boolean =
        adsSelectionEnabled && toolId in allowlistedIds && toolId in crossPlatformMeteredIds

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

    fun refreshConsent(activity: Activity) {
        if (!NativeAdsPolicy.adDisplayConfigured) return
        val information = UserMessagingPlatform.getConsentInformation(activity)
        val parameters = ConsentRequestParameters.Builder().build()
        information.requestConsentInfoUpdate(
            activity,
            parameters,
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) {
                    updateConsentAndInitialize(activity, information)
                }
            },
            {
                // A failed refresh never grants new permission. Cached UMP permission is used
                // only when the SDK itself still reports that ads may be requested.
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
            if (error != null) canRequestAds = false
            val information = UserMessagingPlatform.getConsentInformation(activity)
            canRequestAds = error == null && information.canRequestAds()
            privacyOptionsRequired = information.privacyOptionsRequirementStatus ==
                PrivacyOptionsRequirementStatus.REQUIRED
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
internal fun NativeToolAdSlot(toolId: String) {
    val context = LocalContext.current
    val preview = LocalInspectionMode.current
    val supported = remember(toolId) {
        NativeAdsPolicy.isHybridTool(context, toolId) &&
            runCatching { com.chastech.env.billing.OfflineWalletJournal(context).isEligibleTool(context, toolId) }.getOrDefault(false)
    }
    val network = rememberValidatedAdNetwork(context)
    if (preview || !supported || !network || !NativeAdsPolicy.adDisplayConfigured ||
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
