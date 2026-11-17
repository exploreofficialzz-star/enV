package com.chastech.env

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.MediaController
import android.widget.VideoView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.core.content.ContextCompat
import java.io.File
import java.net.URI
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ---------------------------------------------------------------------------------------------
// Link rules. These mirror src/lib/media/video-link-recording.ts; keep the protected-platform list
// aligned with it (scripts/check-video-link-recorder.mjs verifies that).
// ---------------------------------------------------------------------------------------------

internal sealed interface VideoLinkParse {
    data class Accepted(val url: String, val host: String, val platformLabel: String) : VideoLinkParse
    data class Rejected(val reason: String) : VideoLinkParse
}

private val videoLinkProtectedPlatforms = listOf(
    "Netflix" to listOf("netflix.com"),
    "Disney+" to listOf("disneyplus.com", "hotstar.com"),
    "Prime Video" to listOf("primevideo.com"),
    "Max" to listOf("max.com", "hbomax.com"),
    "Hulu" to listOf("hulu.com"),
    "Apple TV" to listOf("tv.apple.com"),
    "Peacock" to listOf("peacocktv.com"),
    "Paramount+" to listOf("paramountplus.com"),
    "Crunchyroll" to listOf("crunchyroll.com"),
)

private val videoLinkKnownPlatforms = listOf(
    "YouTube" to listOf("youtube.com", "youtu.be", "youtube-nocookie.com"),
    "Vimeo" to listOf("vimeo.com"),
    "Dailymotion" to listOf("dailymotion.com", "dai.ly"),
    "TikTok" to listOf("tiktok.com"),
    "Instagram" to listOf("instagram.com"),
    "Facebook" to listOf("facebook.com", "fb.watch", "fb.com"),
    "X" to listOf("x.com", "twitter.com"),
    "Twitch" to listOf("twitch.tv"),
    "Reddit" to listOf("reddit.com", "redd.it"),
    "LinkedIn" to listOf("linkedin.com"),
)

private fun videoLinkHostMatches(host: String, domains: List<String>): Boolean =
    domains.any { host == it || host.endsWith(".$it") }

internal fun parseVideoLinkNative(raw: String): VideoLinkParse {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return VideoLinkParse.Rejected("Paste the link of the video you want to view and record.")
    val candidate = if (Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(trimmed)) trimmed else "https://$trimmed"
    val uri = try {
        URI(candidate)
    } catch (_: Exception) {
        return VideoLinkParse.Rejected("That does not look like a complete web link.")
    }
    if (!"https".equals(uri.scheme, ignoreCase = true)) {
        return VideoLinkParse.Rejected("Use an HTTPS link. Insecure HTTP and app-specific links are not opened.")
    }
    if (!uri.rawUserInfo.isNullOrEmpty()) {
        return VideoLinkParse.Rejected("Links containing a username or password are not accepted.")
    }
    val host = (uri.host ?: "").lowercase(Locale.ROOT).removePrefix("[").removeSuffix("]").removePrefix("www.")
    if (host.isEmpty()) return VideoLinkParse.Rejected("That does not look like a complete web link.")

    videoLinkProtectedPlatforms.firstOrNull { videoLinkHostMatches(host, it.second) }?.let { protected ->
        return VideoLinkParse.Rejected(
            "${protected.first} protects its video with DRM and does not allow screen recording, so the capture would be blank. " +
                "Use the service's own offline or download feature instead.",
        )
    }
    val isLocal = host == "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") ||
        host == "0.0.0.0" || host.contains(':') || Regex("^\\d{1,3}(\\.\\d{1,3}){3}$").matches(host) || !host.contains('.')
    if (isLocal) return VideoLinkParse.Rejected("Local, private-network and IP-address links are not accepted.")

    val label = videoLinkKnownPlatforms.firstOrNull { videoLinkHostMatches(host, it.second) }?.first ?: host
    return VideoLinkParse.Accepted(uri.toString(), host, label)
}

private fun Context.findActivity(): Activity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return null
}

/** Full-screen size and density to record. Long side is capped at 1920 px and both sides are multiples of 8. */
private fun captureGeometry(context: Context): Triple<Int, Int, Int> {
    val metrics = context.resources.displayMetrics
    var width = metrics.widthPixels
    var height = metrics.heightPixels
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val manager = context.getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager
        val bounds = manager.currentWindowMetrics.bounds
        width = bounds.width()
        height = bounds.height()
    }
    val longSide = maxOf(width, height).toFloat()
    val scale = if (longSide > 1920f) 1920f / longSide else 1f
    fun align(value: Int) = maxOf(8, ((value * scale).toInt() / 8) * 8)
    return Triple(align(width), align(height), metrics.densityDpi)
}

private fun formatClock(millis: Long): String {
    val total = (millis / 1000).coerceAtLeast(0)
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val seconds = total % 60
    return if (hours > 0) String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds)
    else String.format(Locale.US, "%02d:%02d", minutes, seconds)
}

private fun formatSize(bytes: Long): String = when {
    bytes >= 1024L * 1024L * 1024L -> String.format(Locale.US, "%.1f GB", bytes / 1073741824.0)
    bytes >= 1024L * 1024L -> String.format(Locale.US, "%.1f MB", bytes / 1048576.0)
    bytes >= 1024L -> String.format(Locale.US, "%.0f KB", bytes / 1024.0)
    else -> "$bytes B"
}

private data class ProjectionGrant(val resultCode: Int, val data: Intent)

// ---------------------------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------------------------

/**
 * Video Link Screen Recording (Android). The link opens in an in-app WebView, which shows the page
 * the way the platform presents it (video, likes, comments, controls). The system screen-capture
 * prompt is shown before every recording; the MP4 is written to app storage and only leaves the
 * device if the person saves it.
 */
@Composable
fun NativeVideoLinkRecorderScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recorderState by VideoLinkRecordingBus.state.collectAsState()

    var linkText by remember { mutableStateOf("") }
    var loadedLink by remember { mutableStateOf<VideoLinkParse.Accepted?>(null) }
    var error by remember { mutableStateOf("") }
    var notice by remember { mutableStateOf("") }
    var rightsConfirmed by remember { mutableStateOf(false) }
    var includeAudio by remember { mutableStateOf(true) }
    var countdown by remember { mutableStateOf<Int?>(null) }
    var pendingGrant by remember { mutableStateOf<ProjectionGrant?>(null) }
    var saving by remember { mutableStateOf(false) }
    var nowMillis by remember { mutableStateOf(System.currentTimeMillis()) }
    var pendingSave by remember { mutableStateOf<File?>(null) }

    // A previous session's result is not shown again when the person returns to the tool.
    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) { VideoLinkRecordingService.purgeOldRecordings(context) }
        if (VideoLinkRecordingBus.state.value !is VideoLinkRecordingState.Recording) {
            VideoLinkRecordingBus.state.value = VideoLinkRecordingState.Idle
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            if (VideoLinkRecordingBus.state.value is VideoLinkRecordingState.Recording) VideoLinkRecordingService.stop(context)
        }
    }

    val current = recorderState
    LaunchedEffect(current) {
        while (current is VideoLinkRecordingState.Recording) {
            nowMillis = System.currentTimeMillis()
            delay(500)
        }
    }

    val projectionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data
        if (result.resultCode == Activity.RESULT_OK && data != null) {
            pendingGrant = ProjectionGrant(result.resultCode, data)
        } else {
            error = "Screen recording was not allowed, so nothing was recorded."
        }
    }

    fun requestProjection() {
        val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projectionLauncher.launch(manager.createScreenCaptureIntent())
    }

    val audioPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) {
            includeAudio = false
            notice = "Audio recording permission is needed to capture the video's sound. It was declined, so this recording will be video only."
        }
        requestProjection()
    }

    // The person gets a short countdown after approving the system prompt to settle on the video.
    LaunchedEffect(pendingGrant) {
        val grant = pendingGrant ?: return@LaunchedEffect
        for (second in 3 downTo 1) {
            countdown = second
            delay(1000)
        }
        countdown = null
        pendingGrant = null
        val (width, height, dpi) = captureGeometry(context)
        VideoLinkRecordingService.start(context, grant.resultCode, grant.data, width, height, dpi, includeAudio)
    }

    val saveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("video/mp4")) { destination: Uri? ->
        val source = pendingSave
        pendingSave = null
        if (source == null) return@rememberLauncherForActivityResult
        if (destination == null) {
            notice = "Save cancelled. The recording is still available until you leave this tool."
            return@rememberLauncherForActivityResult
        }
        saving = true
        scope.launch {
            val outcome = withContext(Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openOutputStream(destination)?.use { output ->
                        source.inputStream().buffered().use { it.copyTo(output) }
                    } ?: throw IllegalStateException("Unable to write to the selected location.")
                }
            }
            outcome.onSuccess { notice = "Video saved to the location you chose." }
                .onFailure { error = it.message ?: "The video could not be saved." }
            saving = false
        }
    }

    val screenHeightDp = LocalConfiguration.current.screenHeightDp
    val recording = current is VideoLinkRecordingState.Recording
    val finishing = current is VideoLinkRecordingState.Finishing
    val starting = countdown != null || pendingGrant != null
    val busy = recording || finishing || starting

    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Video Link Screen Recording", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Open a video link as it appears on its platform, then record what you see, including likes, comments and controls.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        OutlinedTextField(
            value = linkText,
            onValueChange = { linkText = it; error = "" },
            enabled = !busy,
            singleLine = true,
            label = { Text("Video link") },
            placeholder = { Text("https://www.youtube.com/watch?v=…") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                error = ""
                notice = ""
                when (val parsed = parseVideoLinkNative(linkText)) {
                    is VideoLinkParse.Accepted -> {
                        loadedLink = parsed
                        linkText = parsed.url
                    }
                    is VideoLinkParse.Rejected -> {
                        loadedLink = null
                        error = parsed.reason
                    }
                }
            },
            enabled = !busy && linkText.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Load link") }
        Text(
            "Public HTTPS pages only. Subscription services that use DRM cannot be recorded.",
            style = MaterialTheme.typography.bodySmall,
        )

        val link = loadedLink
        if (link != null) {
            Text("${link.platformLabel} · ${link.host}", style = MaterialTheme.typography.labelLarge)
            VideoLinkWebView(
                url = link.url,
                modifier = Modifier.fillMaxWidth().height((screenHeightDp * 0.62f).dp),
            )
            Text(
                "Sign in inside this view if the platform requires it. Everything visible on screen, including names and comments, is recorded.",
                style = MaterialTheme.typography.bodySmall,
            )

            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Recording", style = MaterialTheme.typography.titleSmall)
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Checkbox(checked = includeAudio, onCheckedChange = { includeAudio = it }, enabled = !busy)
                        Text(
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) "Include the video's sound"
                            else "Video's sound needs Android 10 or newer",
                        )
                    }
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Checkbox(checked = rightsConfirmed, onCheckedChange = { rightsConfirmed = it }, enabled = !busy)
                        Text("I own this video or have permission to record it, and will only use the recording as allowed.")
                    }

                    when {
                        countdown != null -> Text("Recording starts in ${countdown}… Settle on the part you want to capture.", style = MaterialTheme.typography.titleSmall)
                        recording -> {
                            val state = current as VideoLinkRecordingState.Recording
                            Text("● Recording ${formatClock(nowMillis - state.startedAtMillis)}", style = MaterialTheme.typography.titleSmall)
                            if (includeAudio && !state.withAudio) {
                                Text("Sound is not being captured on this device; the recording is video only.", style = MaterialTheme.typography.bodySmall)
                            }
                            Button(onClick = { VideoLinkRecordingService.stop(context) }, modifier = Modifier.fillMaxWidth()) { Text("Stop recording") }
                        }
                        finishing -> Text("Finishing your recording…", style = MaterialTheme.typography.titleSmall)
                        else -> Button(
                            onClick = {
                                error = ""
                                notice = ""
                                VideoLinkRecordingBus.state.value = VideoLinkRecordingState.Idle
                                val needsAudioPermission = includeAudio && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                                    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                                if (needsAudioPermission) audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) else requestProjection()
                            },
                            enabled = rightsConfirmed,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(if (current is VideoLinkRecordingState.Finished) "Record again" else "Start recording") }
                    }
                    Text(
                        "Android asks for permission before every recording and shows a notification while it runs. Nothing is uploaded.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }

        if (current is VideoLinkRecordingState.Finished) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Your recording", style = MaterialTheme.typography.titleSmall)
                    Text("${formatClock(current.durationMillis)} · ${formatSize(current.file.length())} · MP4", style = MaterialTheme.typography.bodySmall)
                    AndroidView(
                        modifier = Modifier.fillMaxWidth().height((screenHeightDp * 0.45f).dp),
                        factory = { viewContext ->
                            VideoView(viewContext).apply {
                                setMediaController(MediaController(viewContext).also { it.setAnchorView(this) })
                                setVideoURI(Uri.fromFile(current.file))
                                setOnPreparedListener { it.isLooping = false; seekTo(1) }
                            }
                        },
                        onRelease = { it.stopPlayback() },
                    )
                    Button(
                        onClick = { pendingSave = current.file; saveLauncher.launch("enV-video-link-recording.mp4") },
                        enabled = !saving,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (saving) "Saving…" else "Save video") }
                    OutlinedButton(
                        onClick = {
                            current.file.delete()
                            VideoLinkRecordingBus.state.value = VideoLinkRecordingState.Idle
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Discard") }
                }
            }
        }

        if (current is VideoLinkRecordingState.Failed) {
            Text(current.message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        }
        if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        if (notice.isNotEmpty()) Text(notice, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(24.dp))
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun VideoLinkWebView(url: String, modifier: Modifier) {
    val fullscreenState = remember { arrayOfNulls<View>(1) }
    val fullscreenCallback = remember { arrayOfNulls<WebChromeClient.CustomViewCallback>(1) }

    AndroidView(
        modifier = modifier,
        factory = { viewContext ->
            WebView(viewContext).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mediaPlaybackRequiresUserGesture = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                settings.setSupportMultipleWindows(false)
                webViewClient = object : WebViewClient() {
                    // Only HTTPS pages are shown; app links, file: and intent: targets are ignored.
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                        !"https".equals(request.url.scheme, ignoreCase = true)
                }
                webChromeClient = object : WebChromeClient() {
                    override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                        val activity = viewContext.findActivity() ?: run { callback.onCustomViewHidden(); return }
                        fullscreenState[0]?.let { callback.onCustomViewHidden(); return }
                        val decor = activity.window.decorView as FrameLayout
                        decor.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                        fullscreenState[0] = view
                        fullscreenCallback[0] = callback
                    }

                    override fun onHideCustomView() {
                        val activity = viewContext.findActivity()
                        val view = fullscreenState[0]
                        if (activity != null && view != null) (activity.window.decorView as FrameLayout).removeView(view)
                        fullscreenState[0] = null
                        fullscreenCallback[0]?.onCustomViewHidden()
                        fullscreenCallback[0] = null
                    }
                }
                loadUrl(url)
                tag = url
            }
        },
        update = { webView ->
            if (webView.tag != url) {
                webView.tag = url
                webView.loadUrl(url)
            }
        },
        onRelease = { webView ->
            fullscreenCallback[0]?.onCustomViewHidden()
            webView.stopLoading()
            webView.destroy()
        },
    )
}
