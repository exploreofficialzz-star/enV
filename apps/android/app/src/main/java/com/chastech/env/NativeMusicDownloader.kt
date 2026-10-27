package com.chastech.env

import android.app.DownloadManager
import android.content.Context
import android.content.ContentValues
import android.os.Build
import android.provider.MediaStore
import android.net.Uri
import android.os.Environment
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.Locale
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.json.JSONObject

private const val MUSIC_TRACK_LIMIT = 50L * 1024L * 1024L
private const val MUSIC_BATCH_LIMIT = 200L * 1024L * 1024L
private val musicAudioExtensions = setOf("mp3", "m4a", "aac", "wav", "flac", "ogg", "oga", "opus", "aiff", "aif", "wma")

private data class DirectMusicTrack(val title: String, val url: String, val extension: String, val isProviderPage: Boolean = false)

private fun musicSafeName(raw: String, fallback: String): String =
    raw.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "-").trim().take(90).ifBlank { fallback }

private val musicProviderPageDomains = listOf(
    "youtube.com", "youtu.be", "youtube-nocookie.com", "tiktok.com", "facebook.com", "fb.watch",
    "instagram.com", "x.com", "twitter.com", "audiomack.com", "soundcloud.com", "bandcamp.com",
    "mixcloud.com", "audius.co", "jamendo.com", "hearthis.at", "bandlab.com", "boomplay.com",
    "zingmp3.vn", "music.163.com", "music.yandex.com", "music.yandex.ru", "archive.org",
    "audioboom.com", "reverbnation.com", "soundclick.com", "spreaker.com", "podomatic.com", "freesound.org"
)
private val musicProtectedPageDomains = listOf(
    "spotify.com", "apple.com", "deezer.com", "amazon.com", "tidal.com", "pandora.com",
    "anghami.com", "qobuz.com", "napster.com", "jiosaavn.com", "iheart.com"
)
private fun musicHostMatches(host: String, domains: List<String>): Boolean =
    domains.any { host == it || host.endsWith(".$it") }
private fun musicProtectedHost(host: String): Boolean = musicHostMatches(host, musicProtectedPageDomains)
private fun musicSupportedProviderPage(host: String): Boolean =
    musicHostMatches(host, musicProviderPageDomains) && !musicProtectedHost(host)

private fun preflightMusicTrack(track: DirectMusicTrack): Long {
    var current = URL(track.url)
    for (redirectCount in 0..5) {
        require(current.protocol.equals("https", ignoreCase = true)) { "The source redirected away from HTTPS." }
        val host = current.host.lowercase(Locale.ROOT)
        require(host.isNotBlank() && host != "localhost" && !host.endsWith(".localhost") && !host.endsWith(".local") &&
            !Regex("^\\d{1,3}(\\.\\d{1,3}){3}$").matches(host)) {
            "The source redirected to a local or IP-literal host."
        }
        require(!musicProtectedHost(host)) { "The source redirected to a protected streaming-service page." }
        val connection = current.openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false
        connection.requestMethod = "HEAD"
        connection.connectTimeout = 15000
        connection.readTimeout = 15000
        connection.setRequestProperty("Accept", "audio/*, application/octet-stream")
        try {
            val code = connection.responseCode
            if (code in 300..399) {
                require(redirectCount < 5) { "The source redirected too many times." }
                val location = connection.getHeaderField("Location")
                    ?: throw IllegalArgumentException("The source sent a redirect without a destination.")
                current = URL(current, location)
                continue
            }
            require(code in 200..299) { "The source rejected the validation request (HTTP $code). Make sure the direct download URL is public." }
            val mime = (connection.contentType ?: "").substringBefore(';').trim().lowercase(Locale.ROOT)
            require(mime.startsWith("audio/") || mime == "application/octet-stream" || mime == "binary/octet-stream") {
                "The source did not return an audio-file content type. Paste a direct audio download URL, not a web page."
            }
            val size = connection.getHeaderFieldLong("Content-Length", -1L)
            require(size >= 0L) { "The source did not provide a file size, so enV cannot apply the batch safety limit." }
            require(size in 1L..MUSIC_TRACK_LIMIT) { "A track must be non-empty and no larger than 50 MB." }
            return size
        } finally {
            connection.disconnect()
        }
    }
    throw IllegalArgumentException("The source redirected too many times.")
}

private fun parseDirectMusicTracks(raw: String): List<DirectMusicTrack> {
    val tracks = linkedMapOf<String, DirectMusicTrack>()
    raw.lineSequence().forEachIndexed { index, sourceLine ->
        val line = sourceLine.trim()
        if (line.isBlank() || line.startsWith("#")) return@forEachIndexed
        val separator = line.indexOf('|')
        val title = if (separator >= 0) line.substring(0, separator).trim() else ""
        val value = if (separator >= 0) line.substring(separator + 1).trim() else line
        val parsed = runCatching { URI(value) }.getOrElse { throw IllegalArgumentException("Line ${index + 1}: enter a valid URL.") }
        require(parsed.scheme.equals("https", ignoreCase = true) && !parsed.host.isNullOrBlank() && parsed.userInfo == null) {
            "Line ${index + 1}: use a public HTTPS URL without embedded credentials."
        }
        val host = parsed.host.lowercase(Locale.ROOT)
        require(host != "localhost" && !host.endsWith(".localhost") && !host.endsWith(".local") &&
            !Regex("^\\d{1,3}(\\.\\d{1,3}){3}$").matches(host)) {
            "Line ${index + 1}: local and IP-literal hosts are not supported."
        }
        val extension = parsed.path.substringAfterLast('/', "").substringAfterLast('.', "").lowercase(Locale.ROOT)
        val directAudio = extension in musicAudioExtensions && !musicProtectedHost(host)
        val providerPage = !directAudio && musicSupportedProviderPage(host)
        require(directAudio || providerPage) {
            if (musicProtectedHost(host)) {
                "Line ${index + 1}: this service's protected catalog cannot be exported by enV. Use its official offline/download feature or an authorized direct audio-file URL."
            } else {
                "Line ${index + 1}: use a supported public media page or a direct HTTPS audio URL ending in .mp3, .m4a, .flac or .wav."
            }
        }
        val track = DirectMusicTrack(
            title.ifBlank { parsed.path.substringAfterLast('/').ifBlank { "track-${index + 1}" } },
            parsed.toString(),
            if (directAudio) extension else "mp3",
            providerPage
        )
        tracks.putIfAbsent(track.url.lowercase(Locale.ROOT), track)
    }
    require(tracks.isNotEmpty()) { "Add at least one supported public media page or direct audio-file URL." }
    require(tracks.size <= 50) { "A batch can contain at most 50 tracks. Split larger collections into smaller batches." }
    return tracks.values.toList()
}

private fun musicApiBase(): String {
    val base = BuildConfig.ENV_API_BASE_URL.trimEnd('/')
    require(base.startsWith("https://", ignoreCase = true) || BuildConfig.DEBUG) {
        "The enV API must use HTTPS in release builds."
    }
    require(base.isNotBlank()) { "The enV API base URL is not configured in this app build." }
    return base
}

private fun musicApiError(status: Int, body: String): String {
    val parsed = runCatching { JSONObject(body) }.getOrNull()
    val message = parsed?.optString("message")?.takeIf { it.isNotBlank() && it.lowercase(Locale.ROOT) !in setOf("true", "false", "null") }
        ?: parsed?.optString("error")?.takeIf { it.isNotBlank() && it.lowercase(Locale.ROOT) !in setOf("true", "false", "null") }
    return message ?: "enV media service returned HTTP $status. Please retry or use an authorized direct audio URL."
}

private fun postMusicApiJson(path: String, payload: JSONObject): JSONObject {
    val connection = URL(musicApiBase() + path).openConnection() as HttpURLConnection
    connection.requestMethod = "POST"
    connection.connectTimeout = 20000
    connection.readTimeout = 60000
    connection.doOutput = true
    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
    connection.setRequestProperty("Accept", "application/json")
    try {
        connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        if (status !in 200..299) throw IllegalStateException(musicApiError(status, body))
        return runCatching { JSONObject(body) }.getOrElse {
            throw IllegalStateException("enV media service returned invalid metadata. Retry later or use a supported public media URL.")
        }
    } finally {
        connection.disconnect()
    }
}

private fun musicPageIsCollection(raw: String): Boolean {
    val uri = Uri.parse(raw)
    val segments = uri.pathSegments.map { it.lowercase(Locale.ROOT) }
    if (segments.any { it in setOf("album", "albums", "playlist", "playlists", "sets") }) return true
    val host = uri.host?.lowercase(Locale.ROOT).orEmpty()
    return (host == "youtube.com" || host.endsWith(".youtube.com")) && !uri.getQueryParameter("list").isNullOrBlank()
}

private fun resolveProviderMusicPage(track: DirectMusicTrack, includePlaylist: Boolean): List<DirectMusicTrack> {
    val info = try {
        postMusicApiJson(
        "/api/backend/url-media/info",
        JSONObject().put("url", track.url).put("includePlaylist", includePlaylist)
        )
    } catch (failure: Exception) {
        // A provider's metadata endpoint can fail while its audio extractor works.
        // Retry only an individual song, not a whole album/playlist as one track.
        if (musicPageIsCollection(track.url)) throw failure
        return listOf(track)
    }
    val entries = info.optJSONArray("entries")
    if (entries != null && entries.length() > 0) {
        require(entries.length() <= 50) { "This collection has more than 50 tracks. Split it into smaller batches." }
        val resolved = mutableListOf<DirectMusicTrack>()
        for (index in 0 until entries.length()) {
            val entry = entries.optJSONObject(index) ?: continue
            val url = entry.optString("webpageUrl").ifBlank { entry.optString("webpage_url") }
            if (!url.startsWith("https://", ignoreCase = true)) continue
            resolved += DirectMusicTrack(entry.optString("title").ifBlank { "Track ${index + 1}" }, url, "mp3", true)
        }
        if (resolved.isNotEmpty()) return resolved
    }
    require(!info.optBoolean("isPlaylist", false) && !musicPageIsCollection(track.url)) {
        "The album or playlist could not be expanded into public track links."
    }
    return listOf(track.copy(title = info.optString("title").takeIf { it.isNotBlank() && it != "null" } ?: track.title))
}

private fun musicDownloadRetryable(failure: Exception): Boolean {
    val message = failure.message.orEmpty().lowercase(Locale.ROOT)
    return listOf("took too long to respond", "did not respond reliably", "returned an empty or invalid json",
        "returned an invalid metadata response", "track resolver returned a server error or empty response",
        "media api could not be reached", "http 502", "http 503", "http 504").any { it in message }
}

private fun downloadProviderMusicTrack(
    track: DirectMusicTrack,
    folder: File,
    maxBatchRemaining: Long
): Pair<File, Long> {
    require(maxBatchRemaining > 0L) { "The online batch reached the 200 MB limit." }
    folder.mkdirs()
    val payload = JSONObject()
        .put("url", track.url)
        .put("format", "mp3")
        .put("audioOnly", true)
        .put("maxBytes", minOf(MUSIC_TRACK_LIMIT, maxBatchRemaining))
    val connection = URL(musicApiBase() + "/api/backend/url-media/download").openConnection() as HttpURLConnection
    connection.requestMethod = "POST"
    connection.connectTimeout = 20000
    connection.readTimeout = 300000
    connection.doOutput = true
    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
    connection.setRequestProperty("Accept", "audio/mpeg, audio/*, application/octet-stream")
    var temp: File? = null
    try {
        connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        val status = connection.responseCode
        if (status !in 200..299) {
            val body = connection.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            throw IllegalStateException(musicApiError(status, body))
        }
        val mime = (connection.contentType ?: "").substringBefore(';').trim().lowercase(Locale.ROOT)
        require(mime.startsWith("audio/") || mime == "application/octet-stream" || mime == "binary/octet-stream") {
            "enV media service did not return an audio file for ${track.title}."
        }
        val base = musicSafeName(track.title, "track")
        val tempFile = File(folder, ".env-${UUID.randomUUID()}.part")
        temp = tempFile
        var count = 0L
        connection.inputStream.buffered().use { input ->
            FileOutputStream(tempFile).buffered().use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    count += read
                    require(count <= MUSIC_TRACK_LIMIT && count <= maxBatchRemaining) {
                        "The downloaded track or batch exceeds enV's size limit."
                    }
                    output.write(buffer, 0, read)
                }
            }
        }
        require(count > 0L) { "The source returned an empty audio file for ${track.title}." }
        val outputExt = when (mime) {
            "audio/mpeg", "audio/mp3" -> "mp3"
            "audio/mp4", "audio/x-m4a" -> "m4a"
            "audio/flac" -> "flac"
            "audio/wav", "audio/x-wav" -> "wav"
            "audio/aac" -> "aac"
            "audio/ogg" -> "ogg"
            "audio/opus" -> "opus"
            else -> track.extension
        }
        var destination = File(folder, "$base.$outputExt")
        var suffix = 2
        while (destination.exists()) {
            destination = File(folder, "$base ($suffix).$outputExt")
            suffix += 1
        }
        require(tempFile.renameTo(destination)) { "enV could not save ${track.title} to the offline library." }
        return destination to count
    } catch (failure: Throwable) {
        temp?.delete()
        throw failure
    } finally {
        connection.disconnect()
    }
}

private fun downloadProviderMusicTrackWithRetry(
    track: DirectMusicTrack, folder: File, maxBatchRemaining: Long
): Pair<File, Long> {
    return try {
        downloadProviderMusicTrack(track, folder, maxBatchRemaining)
    } catch (failure: Exception) {
        if (!musicDownloadRetryable(failure)) throw failure
        Thread.sleep(700)
        downloadProviderMusicTrack(track, folder, maxBatchRemaining)
    }
}

private fun queryMusicFileName(context: Context, uri: Uri): String {
    val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    }
    return name?.takeIf { it.isNotBlank() } ?: uri.lastPathSegment ?: "audio-file"
}

private fun listOfflineMusic(context: Context): List<File> {
    val root = File(context.filesDir, "music-downloader")
    return root.walkTopDown().filter { it.isFile && it.extension.lowercase(Locale.ROOT) in musicAudioExtensions }
        .sortedBy { it.name.lowercase(Locale.ROOT) }.toList()
}

@Composable
fun NativeMusicDownloaderScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf("Online downloads") }
    var collectionType by remember { mutableStateOf("Playlist") }
    var collectionName by remember { mutableStateOf("My music") }
    var urls by remember { mutableStateOf("") }
    var rightsConfirmed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    val previewTracks = remember { mutableStateListOf<DirectMusicTrack>() }
    var showAllPreview by remember { mutableStateOf(false) }
    var pendingZip by remember { mutableStateOf<File?>(null) }
    val zipSaveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { destination ->
        val archive = pendingZip
        pendingZip = null
        if (archive != null) {
            if (destination == null) {
                archive.delete()
                status = "ZIP save cancelled; tracks remain in your enV offline library."
            } else {
                busy = true
                scope.launch {
                    val saved = withContext(Dispatchers.IO) {
                        runCatching {
                            context.contentResolver.openOutputStream(destination)?.use { output ->
                                archive.inputStream().buffered().use { it.copyTo(output) }
                            } ?: throw IllegalStateException("Unable to save the ZIP at the selected location.")
                        }.also { archive.delete() }
                    }
                    saved.onSuccess { status = "ZIP saved to your selected folder." }
                        .onFailure { error = it.message ?: "ZIP export failed; tracks remain in enV's offline library." }
                    busy = false
                }
            }
        }
    }
    val savedTracks = remember { mutableStateListOf<File>().apply { addAll(listOfflineMusic(context)) } }
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) {
            busy = true
            error = ""
            status = "Importing selected audio for offline use…"
            scope.launch {
                val outcome = withContext(Dispatchers.IO) {
                    runCatching {
                        require(uris.size <= 50) { "Choose at most 50 tracks per import." }
                        val root = File(context.filesDir, "music-downloader/" + musicSafeName(collectionName, "My music"))
                        require(root.canonicalPath.startsWith(File(context.filesDir, "music-downloader").canonicalPath)) { "Invalid collection name." }
                        root.mkdirs()
                        val created = mutableListOf<File>()
                        var batchBytes = 0L
                        try {
                            uris.forEachIndexed { index, uri ->
                                val name = queryMusicFileName(context, uri)
                                val ext = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
                                require(ext in musicAudioExtensions) { "$name is not a supported audio file." }
                                val outputFile = File(root, musicSafeName(name, "track-${index + 1}.$ext"))
                                context.contentResolver.openInputStream(uri).use { input ->
                                    requireNotNull(input) { "Could not open $name." }
                                    FileOutputStream(outputFile).use { output ->
                                        val buffer = ByteArray(64 * 1024)
                                        var fileBytes = 0L
                                        while (true) {
                                            val read = input.read(buffer)
                                            if (read < 0) break
                                            fileBytes += read
                                            require(fileBytes <= MUSIC_TRACK_LIMIT) { "$name exceeds the 50 MB per-track limit." }
                                            batchBytes += read
                                            require(batchBytes <= MUSIC_BATCH_LIMIT) { "This import exceeds the 200 MB batch limit." }
                                            output.write(buffer, 0, read)
                                        }
                                        require(fileBytes > 0) { "$name is empty." }
                                    }
                                }
                                created += outputFile
                            }
                            created
                        } catch (failure: Throwable) {
                            created.forEach { it.delete() }
                            throw failure
                        }
                    }
                }
                outcome.onSuccess { files ->
                    savedTracks.clear()
                    savedTracks.addAll(listOfflineMusic(context))
                    status = "Imported ${files.size} track(s) to the device's enV offline library."
                }.onFailure { failure ->
                    error = failure.message ?: "The selected files could not be imported."
                }
                busy = false
            }
        }
    }

    fun downloadSelectedMusic(selection: List<DirectMusicTrack>, zip: Boolean) {
        if (busy || selection.isEmpty()) return
        busy = true
        error = ""
        status = if (zip) "Preparing ZIP from selected tracks…" else "Downloading ${selection.first().title}…"
        scope.launch {
            val outcome = withContext(Dispatchers.IO) {
                val succeeded = mutableListOf<File>()
                val failures = mutableListOf<String>()
                var bytes = 0L
                var exported = false
                var manualArchive: File? = null
                try {
                    val root = File(context.filesDir, "music-downloader/" + musicSafeName(collectionName, "My music"))
                    for (track in selection) {
                        try {
                            val (file, count) = downloadProviderMusicTrackWithRetry(track, root, MUSIC_BATCH_LIMIT - bytes)
                            succeeded += file
                            bytes += count
                        } catch (cause: Exception) {
                            failures += "${track.title}: ${cause.message ?: "Audio unavailable."}"
                        }
                    }
                    if (zip && succeeded.isNotEmpty()) {
                        val temporary = File(context.cacheDir, "env-music-${UUID.randomUUID()}.zip")
                        try {
                            ZipOutputStream(temporary.outputStream().buffered()).use { archive ->
                                val usedNames = mutableSetOf<String>()
                                succeeded.forEach { file ->
                                    var name = file.name
                                    var suffix = 2
                                    while (!usedNames.add(name.lowercase(Locale.ROOT))) {
                                        name = file.nameWithoutExtension + " ($suffix)." + file.extension
                                        suffix++
                                    }
                                    archive.putNextEntry(ZipEntry(name))
                                    file.inputStream().buffered().use { it.copyTo(archive) }
                                    archive.closeEntry()
                                }
                                if (failures.isNotEmpty()) {
                                    archive.putNextEntry(ZipEntry("failed-downloads.txt"))
                                    archive.write(("These tracks were not included in this partial ZIP:\n\n" + failures.joinToString("\n") + "\n").toByteArray(Charsets.UTF_8))
                                    archive.closeEntry()
                                }
                            }
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                val values = ContentValues().apply {
                                    put(MediaStore.MediaColumns.DISPLAY_NAME, "enV-" + musicSafeName(collectionName, "music") + ".zip")
                                    put(MediaStore.MediaColumns.MIME_TYPE, "application/zip")
                                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                                }
                                val resolver = context.contentResolver
                                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                                    ?: throw IllegalStateException("Android could not create the ZIP in Downloads.")
                                try {
                                    resolver.openOutputStream(uri)?.use { output -> temporary.inputStream().use { it.copyTo(output) } }
                                        ?: throw IllegalStateException("Android could not write the ZIP.")
                                    resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
                                    exported = true
                                } catch (cause: Exception) {
                                    resolver.delete(uri, null, null)
                                    throw cause
                                }
                            } else {
                                // Android 8–9 requires Storage Access Framework to save a ZIP
                                // without asking for broad external storage permissions.
                                manualArchive = temporary
                            }
                        } finally {
                            if (manualArchive != temporary) temporary.delete()
                        }
                    }
                } catch (cause: Exception) {
                    failures += cause.message ?: "Could not finish the collection."
                }
                Triple(succeeded.size, failures, Pair(exported, manualArchive))
            }
            savedTracks.clear()
            savedTracks.addAll(listOfflineMusic(context))
            val (count, failures, exportResult) = outcome
            val (exported, archiveToSave) = exportResult
            status = if (exported) "Saved ZIP to Downloads with $count track(s)." else if (count > 0) "Saved $count track(s) to the enV offline library." else "No audio files were saved."
            if (failures.isNotEmpty()) error = "${failures.size} track(s) unavailable: " + failures.take(3).joinToString("; ")
            busy = false
            if (archiveToSave != null) {
                pendingZip = archiveToSave
                status = "Choose a folder to save the ZIP. Completed tracks are also in your enV library."
                zipSaveLauncher.launch("enV-" + musicSafeName(collectionName, "music") + ".zip")
            }
        }
    }

    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Music Downloader", style = MaterialTheme.typography.titleLarge)
                Text("Download authorized tracks from supported public music pages or direct audio URLs, or import tracks into the enV offline library.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = mode == "Online downloads", onClick = { mode = "Online downloads"; error = "" }, label = { Text("Online") })
                    FilterChip(selected = mode == "Offline library", onClick = { mode = "Offline library"; error = "" }, label = { Text("Offline") })
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text("Collection type", style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf("Track", "Album", "Playlist").forEach { option ->
                        FilterChip(selected = collectionType == option, onClick = { collectionType = option; previewTracks.clear() }, label = { Text(option) })
                    }
                }
            }
        }
        OutlinedTextField(collectionName, { collectionName = it.take(100) }, label = { Text("Album or playlist name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)

        if (mode == "Online downloads") {
            OutlinedTextField(urls, { urls = it; rightsConfirmed = false; previewTracks.clear() }, label = { Text("Music links or direct audio URLs") }, placeholder = { Text("Audiomack, YouTube Music, SoundCloud song/album/playlist URL\nTrack name | https://cdn.example.com/track.mp3") }, modifier = Modifier.fillMaxWidth().height(150.dp), minLines = 4)
            Text("Paste a supported public song, album or playlist link, or a direct HTTPS audio-file URL. Use “Track title | URL” for direct files. Provider downloads are saved to this device’s enV offline library; direct files use Android download notifications.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Checkbox(checked = rightsConfirmed, onCheckedChange = { rightsConfirmed = it })
                Text("I own these tracks or am authorized to download them.", style = MaterialTheme.typography.bodySmall)
            }
            Button(onClick = {
                error = ""
                status = ""
                if (!rightsConfirmed) {
                    error = "Confirm that you have permission and the source permits downloads."
                    return@Button
                }
                val sources = runCatching { parseDirectMusicTracks(urls) }.getOrElse {
                    error = it.message ?: "Enter supported music links."
                    return@Button
                }
                busy = true
                status = "Finding track titles…"
                scope.launch {
                    val outcome = withContext(Dispatchers.IO) {
                        runCatching {
                            val resolved = mutableListOf<DirectMusicTrack>()
                            val warnings = mutableListOf<String>()
                            for (source in sources) {
                                try {
                                    resolved += if (source.isProviderPage) resolveProviderMusicPage(source, true) else listOf(source)
                                } catch (failure: Exception) {
                                    warnings += "${source.title}: ${failure.message ?: "Metadata unavailable."}"
                                }
                            }
                            require(resolved.isNotEmpty()) { warnings.firstOrNull() ?: "No tracks could be previewed." }
                            require(resolved.size <= 50) { "The collection exceeds 50 tracks. Split it into batches." }
                            require(collectionType != "Track" || resolved.size == 1) { "Choose Album or Playlist for multiple tracks." }
                            Pair(resolved.distinctBy { it.url }, warnings)
                        }
                    }
                    outcome.onSuccess { (resolved, warnings) ->
                        previewTracks.clear()
                        previewTracks.addAll(resolved)
                        showAllPreview = false
                        status = "Found ${resolved.size} song(s). Review before downloading." +
                            if (warnings.isNotEmpty()) " ${warnings.size} link(s) could not be inspected." else ""
                    }.onFailure { error = it.message ?: "Unable to preview this collection." }
                    busy = false
                }
            }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Inspecting…" else "Preview songs") }
            if (previewTracks.isNotEmpty()) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${previewTracks.size} tracks · metadata preview", style = MaterialTheme.typography.titleMedium)
                        previewTracks.take(if (showAllPreview) previewTracks.size else 10).forEachIndexed { index, track ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Text("${index + 1}. ${track.title}", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                                Button(onClick = { downloadSelectedMusic(listOf(track), false) }, enabled = !busy) { Text("Download") }
                            }
                        }
                        if (previewTracks.size > 10) {
                            Button(onClick = { showAllPreview = !showAllPreview }, enabled = !busy) {
                                Text(if (showAllPreview) "Show less" else "See more (${previewTracks.size - 10})")
                            }
                        }
                        Text("Track availability is verified when downloading. Unavailable songs will be skipped.", style = MaterialTheme.typography.bodySmall)
                        Button(onClick = { downloadSelectedMusic(previewTracks.toList(), true) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                            Text(if (busy) "Preparing ZIP…" else "Download ZIP (${previewTracks.size} tracks)")
                        }
                    }
                }
            }
        } else {
            Button(onClick = { importLauncher.launch(arrayOf("audio/*")) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Import audio for offline use") }
            Text(savedTracks.size.toString() + " track(s) saved in this device's enV offline library.", style = MaterialTheme.typography.bodyMedium)
            savedTracks.take(20).forEach { file ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(file.name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                    Text((file.length() / 1024L).toString() + " KB", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        if (status.isNotBlank()) Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        Text("Supported public providers are resolved only where their source permits downloading. Protected app-only catalogs such as Spotify, Apple Music, Deezer and TIDAL must use their official offline feature. enV does not sign in, bypass DRM or export restricted offline entitlements. Limits: 50 tracks, 50 MB per track, 200 MB per batch.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
