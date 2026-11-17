package com.chastech.env

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.widget.MediaController
import android.widget.VideoView
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

private const val VIDEO_LINK_MAX_BYTES = 500L * 1024L * 1024L

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
    domains.any { host == it || host.endsWith("." + it) }

internal fun parseVideoLinkNative(raw: String): VideoLinkParse {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return VideoLinkParse.Rejected("Paste a video link first.")
    val candidate = if (Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(trimmed)) trimmed else "https://" + trimmed
    val uri = try { URI(candidate) } catch (_: Exception) {
        return VideoLinkParse.Rejected("That does not look like a complete video link.")
    }
    if (!"https".equals(uri.scheme, ignoreCase = true)) {
        return VideoLinkParse.Rejected("Use a secure HTTPS link.")
    }
    if (!uri.rawUserInfo.isNullOrEmpty()) {
        return VideoLinkParse.Rejected("Links containing a username or password are not accepted.")
    }
    val host = (uri.host ?: "").lowercase(Locale.ROOT).removePrefix("www.")
    if (host.isBlank() || host.contains(":") || Regex("^\\d{1,3}(\\.\\d{1,3}){3}$").matches(host) ||
        host == "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
        host.endsWith(".internal") || !host.contains(".")) {
        return VideoLinkParse.Rejected("Local, private-network and IP-address links are not accepted.")
    }
    videoLinkProtectedPlatforms.firstOrNull { videoLinkHostMatches(host, it.second) }?.let {
        return VideoLinkParse.Rejected(it.first + " protects its video with DRM. enV cannot export protected streams.")
    }
    val label = videoLinkKnownPlatforms.firstOrNull { videoLinkHostMatches(host, it.second) }?.first ?: host
    return VideoLinkParse.Accepted(uri.toString(), host, label)
}

private fun videoProviderFor(host: String): String = when {
    videoLinkHostMatches(host, listOf("youtube.com", "youtu.be", "youtube-nocookie.com")) -> "youtube"
    videoLinkHostMatches(host, listOf("tiktok.com")) -> "tiktok"
    videoLinkHostMatches(host, listOf("facebook.com", "fb.watch", "fb.com")) -> "facebook"
    videoLinkHostMatches(host, listOf("instagram.com")) -> "instagram"
    videoLinkHostMatches(host, listOf("x.com", "twitter.com")) -> "x"
    else -> "generic"
}

private fun videoApiBase(): String {
    val base = BuildConfig.ENV_API_BASE_URL.trimEnd('/')
    require(base.startsWith("https://", ignoreCase = true)) { "The enV API must use HTTPS in release builds." }
    require(base.isNotBlank()) { "The enV media service is not configured in this app build." }
    return base
}

private fun apiErrorMessage(status: Int, body: String): String {
    val json = runCatching { JSONObject(body) }.getOrNull()
    val message = sequenceOf(json?.opt("error"), json?.opt("message"))
        .filterIsInstance<String>().map { it.trim() }
        .firstOrNull { it.isNotEmpty() && it.lowercase(Locale.ROOT) !in setOf("true", "false", "null") }
    return message ?: "The enV media service returned HTTP " + status + ". Please try again."
}

private fun fetchVideoLink(url: String, host: String, context: Context): File {
    val connection = URL(videoApiBase() + "/api/backend/url-media/download").openConnection() as HttpURLConnection
    connection.requestMethod = "POST"
    connection.connectTimeout = 20_000
    connection.readTimeout = 300_000
    connection.doOutput = true
    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
    connection.setRequestProperty("Accept", "video/mp4, video/*, application/octet-stream")
    val payload = JSONObject()
        .put("url", url)
        .put("provider", videoProviderFor(host))
        .put("format", "mp4")
        .put("audioOnly", false)
        .put("maxBytes", VIDEO_LINK_MAX_BYTES)
    var partial: File? = null
    try {
        connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        val status = connection.responseCode
        if (status !in 200..299) {
            val body = connection.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            throw IllegalStateException(apiErrorMessage(status, body))
        }
        val mime = (connection.contentType ?: "").substringBefore(';').trim().lowercase(Locale.ROOT)
        require(mime.startsWith("video/") || mime == "application/octet-stream" || mime == "binary/octet-stream") {
            "The media service response was not a video file."
        }
        val destination = File(context.cacheDir, "enV-video-" + UUID.randomUUID() + ".mp4")
        partial = destination
        var count = 0L
        connection.inputStream.buffered().use { input ->
            FileOutputStream(destination).buffered().use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    count += read
                    require(count <= VIDEO_LINK_MAX_BYTES) { "The video is larger than the 500 MB limit." }
                    output.write(buffer, 0, read)
                }
            }
        }
        require(destination.length() > 0L) { "The media service returned an empty video." }
        return destination
    } catch (failure: Throwable) {
        partial?.delete()
        throw failure
    } finally {
        connection.disconnect()
    }
}

private fun safeVideoName(raw: String): String =
    raw.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "-").take(100).ifBlank { "video.mp4" }

private fun copySelectedVideo(context: Context, uri: Uri): File {
    val resolver = context.contentResolver
    val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    } ?: "video"
    val mime = (resolver.getType(uri) ?: "").lowercase(Locale.ROOT)
    val extension = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
    val knownExtension = extension in setOf("mp4", "m4v", "mov", "webm", "ogv", "mkv", "avi", "3gp")
    require(mime.startsWith("video/") || knownExtension) { "Choose a video file such as MP4, MOV, WebM or MKV." }
    val destination = File(context.cacheDir, "enV-local-" + UUID.randomUUID() + "-" + safeVideoName(name))
    var count = 0L
    try {
        val input = resolver.openInputStream(uri) ?: throw IllegalStateException("The selected video could not be opened.")
        input.use { source ->
            FileOutputStream(destination).buffered().use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = source.read(buffer)
                    if (read < 0) break
                    count += read
                    require(count <= VIDEO_LINK_MAX_BYTES) { "Choose a video file smaller than 500 MB." }
                    output.write(buffer, 0, read)
                }
            }
        }
        require(count > 0L) { "The selected video file is empty." }
        return destination
    } catch (failure: Throwable) {
        destination.delete()
        throw failure
    }
}

@Composable
fun NativeVideoLinkRecorderScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var link by remember { mutableStateOf("") }
    var rightsConfirmed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var output by remember { mutableStateOf<File?>(null) }
    var pendingSave by remember { mutableStateOf<File?>(null) }

    val videoPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                busy = true
                error = ""
                status = "Preparing your video…"
                val result = withContext(Dispatchers.IO) { runCatching { copySelectedVideo(context, uri) } }
                result.onSuccess { output = it; status = "Your video is ready." }
                    .onFailure { error = it.message ?: "The selected video could not be opened."; status = "" }
                busy = false
            }
        }
    }

    val saveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { destination ->
        val source = pendingSave
        pendingSave = null
        if (destination != null && source != null) {
            scope.launch {
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        context.contentResolver.openOutputStream(destination)?.use { target ->
                            source.inputStream().buffered().use { input -> input.copyTo(target) }
                        } ?: throw IllegalStateException("The save location could not be opened.")
                    }
                }
                result.onSuccess { status = "Video saved successfully." }
                    .onFailure { error = it.message ?: "The video could not be saved." }
            }
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("Video Link Screen Recording", style = MaterialTheme.typography.titleMedium)
                Text("Submit a video link or select a video file. enV prepares the video and shows the result here.", style = MaterialTheme.typography.bodyMedium)
            }
        }

        OutlinedTextField(
            value = link,
            onValueChange = { link = it; error = ""; status = "" },
            label = { Text("Video link") },
            placeholder = { Text("Paste a public video link") },
            singleLine = true,
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Checkbox(checked = rightsConfirmed, onCheckedChange = { rightsConfirmed = it }, enabled = !busy)
            Text("I own this video or have permission to save and use it.", style = MaterialTheme.typography.bodySmall)
        }
        Button(
            onClick = {
                error = ""
                status = ""
                val parsed = parseVideoLinkNative(link)
                if (parsed is VideoLinkParse.Rejected) {
                    error = parsed.reason
                } else if (!rightsConfirmed) {
                    error = "Confirm that you own this video or have permission to save and use it."
                } else {
                    val accepted = parsed as VideoLinkParse.Accepted
                    busy = true
                    status = "Retrieving the original video…"
                    scope.launch {
                        val result = withContext(Dispatchers.IO) {
                            runCatching { fetchVideoLink(accepted.url, accepted.host, context) }
                        }
                        result.onSuccess { output = it; status = "Your video is ready." }
                            .onFailure { error = it.message ?: "The video could not be retrieved."; status = "" }
                        busy = false
                    }
                }
            },
            enabled = !busy && link.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (busy) "Processing video…" else "Process video") }

        OutlinedButton(
            onClick = { videoPicker.launch(arrayOf("video/*")) },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Choose a video from this device") }
        Text("Selected files stay on this device and are not uploaded.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        if (busy) Text(status, style = MaterialTheme.typography.bodyMedium)
        if (output != null) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Your video", style = MaterialTheme.typography.titleSmall)
                    AndroidView(
                        modifier = Modifier.fillMaxWidth().height(230.dp),
                        factory = { viewContext ->
                            VideoView(viewContext).apply {
                                tag = output!!.absolutePath
                                setVideoURI(Uri.fromFile(output!!))
                                setMediaController(MediaController(viewContext).also { it.setAnchorView(this) })
                            }
                        },
                        update = { view ->
                            if (view.tag != output!!.absolutePath) {
                                view.tag = output!!.absolutePath
                                view.setVideoURI(Uri.fromFile(output))
                                view.setMediaController(MediaController(context).also { it.setAnchorView(view) })
                            }
                        },
                    )
                    Text(output!!.name, style = MaterialTheme.typography.bodySmall)
                    Button(
                        onClick = { pendingSave = output; saveLauncher.launch(safeVideoName(output!!.name)) },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Save video") }
                }
            }
        }

        if (status.isNotBlank() && !busy) Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (error.isNotBlank()) Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
    }
}
