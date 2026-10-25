package com.chastech.env

import android.app.DownloadManager
import android.content.Context
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

private const val MUSIC_TRACK_LIMIT = 50L * 1024L * 1024L
private const val MUSIC_BATCH_LIMIT = 200L * 1024L * 1024L
private val musicAudioExtensions = setOf("mp3", "m4a", "aac", "wav", "flac", "ogg", "oga", "opus", "aiff", "aif", "wma")

private data class DirectMusicTrack(val title: String, val url: String, val extension: String)

private fun musicSafeName(raw: String, fallback: String): String =
    raw.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "-").trim().take(90).ifBlank { fallback }

private fun musicProtectedHost(host: String): Boolean {
    val domains = listOf("spotify.com", "apple.com", "music.youtube.com", "youtube.com", "youtu.be", "youtube-nocookie.com", "audiomack.com", "boomplay.com", "deezer.com", "amazon.com", "tidal.com", "soundcloud.com", "pandora.com", "mixcloud.com", "anghami.com", "qobuz.com", "napster.com", "jiosaavn.com", "iheart.com")
    return domains.any { host == it || host.endsWith(".$it") }
}

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
        val parsed = runCatching { URI(value) }.getOrElse { throw IllegalArgumentException("Line ${index + 1}: enter a valid direct URL.") }
        require(parsed.scheme.equals("https", ignoreCase = true) && !parsed.host.isNullOrBlank() && parsed.userInfo == null) {
            "Line ${index + 1}: use a public HTTPS URL without embedded credentials."
        }
        val host = parsed.host.lowercase(Locale.ROOT)
        require(host != "localhost" && !host.endsWith(".localhost") && !host.endsWith(".local") && !Regex("^\\d{1,3}(\\.\\d{1,3}){3}$").matches(host)) {
            "Line ${index + 1}: local and IP-literal hosts are not supported."
        }
        require(!musicProtectedHost(host)) {
            "Line ${index + 1}: streaming-service page links are not direct audio downloads. Use the service's official offline feature or a rights-holder-provided audio URL."
        }
        val extension = parsed.path.substringAfterLast('/', "").substringAfterLast('.', "").lowercase(Locale.ROOT)
        require(extension in musicAudioExtensions) {
            "Line ${index + 1}: use a direct URL ending in a supported audio extension such as .mp3, .m4a, .flac or .wav."
        }
        val track = DirectMusicTrack(title.ifBlank { parsed.path.substringAfterLast('/').ifBlank { "track-${index + 1}.$extension" } }, parsed.toString(), extension)
        tracks.putIfAbsent(track.url.lowercase(Locale.ROOT), track)
    }
    require(tracks.isNotEmpty()) { "Add at least one direct audio-file URL." }
    require(tracks.size <= 50) { "A batch can contain at most 50 tracks. Split larger playlists into smaller batches." }
    return tracks.values.toList()
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

    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Music Downloader", style = MaterialTheme.typography.titleLarge)
                Text("Download direct, authorized audio URLs online or import tracks into enV's offline library.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                        FilterChip(selected = collectionType == option, onClick = { collectionType = option }, label = { Text(option) })
                    }
                }
            }
        }
        OutlinedTextField(collectionName, { collectionName = it.take(100) }, label = { Text("Album or playlist name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)

        if (mode == "Online downloads") {
            OutlinedTextField(urls, { urls = it; rightsConfirmed = false }, label = { Text("Direct audio URLs") }, placeholder = { Text("https://cdn.example.com/track.mp3\nTrack name | https://cdn.example.com/track.m4a") }, modifier = Modifier.fillMaxWidth().height(150.dp), minLines = 4)
            Text("One public HTTPS audio-file URL per line. Use “Track title | URL” to name a track. Playlist and album batches save each track to the device's Music folder.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Checkbox(checked = rightsConfirmed, onCheckedChange = { rightsConfirmed = it })
                Text("I own these tracks or am authorized to download them.", style = MaterialTheme.typography.bodySmall)
            }
            Button(onClick = {
                error = ""
                status = ""
                if (!rightsConfirmed) {
                    error = "Confirm that you own the tracks or have permission to download them."
                    return@Button
                }
                val tracks = runCatching { parseDirectMusicTracks(urls) }.getOrElse {
                    error = it.message ?: "The audio URL list is invalid."
                    return@Button
                }
                if (collectionType == "Track" && tracks.size != 1) {
                    error = "For a single-track download, provide exactly one URL. Choose Album or Playlist for a batch."
                    return@Button
                }
                busy = true
                scope.launch {
                    val queued = withContext(Dispatchers.IO) {
                        runCatching {
                            var checkedBytes = 0L
                            tracks.forEach { track ->
                                checkedBytes += preflightMusicTrack(track)
                                require(checkedBytes <= MUSIC_BATCH_LIMIT) { "The online batch exceeds 200 MB. Split it into smaller batches." }
                            }
                            val manager = context.getSystemService(DownloadManager::class.java)
                            val queuedIds = mutableListOf<Long>()
                            try {
                                tracks.forEachIndexed { index, track ->
                                    val sourceName = musicSafeName(track.title, "track-${index + 1}")
                                    val base = musicSafeName(collectionName, "music")
                                    val rawName = "enV-" + base + "-" + sourceName
                                    val cleanName = rawName.take(140)
                                    val fileName = if (cleanName.endsWith("." + track.extension, true)) cleanName else cleanName + "." + track.extension
                                    val request = DownloadManager.Request(Uri.parse(track.url))
                                        .setTitle(track.title)
                                        .setDescription("enV Music Downloader · " + collectionType.lowercase(Locale.ROOT))
                                        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                                        .setAllowedOverMetered(true)
                                        .setAllowedOverRoaming(false)
                                        .setDestinationInExternalPublicDir(Environment.DIRECTORY_MUSIC, fileName)
                                    queuedIds += manager.enqueue(request)
                                }
                            } catch (failure: Throwable) {
                                if (queuedIds.isNotEmpty()) manager.remove(*queuedIds.toLongArray())
                                throw failure
                            }
                            queuedIds.size
                        }
                    }
                    queued.onSuccess { count -> status = "Queued $count track(s). Android will show system download notifications; completed files remain available offline in Music." }
                        .onFailure { failure -> error = failure.message ?: "Android could not queue these downloads." }
                    busy = false
                }
            }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Queueing downloads…" else if (collectionType == "Track") "Download track" else "Download " + collectionType.lowercase(Locale.ROOT)) }
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
        Text("Protected streaming pages from Spotify, Apple Music, YouTube Music, Audiomack, Boomplay, Deezer, Amazon Music, TIDAL, SoundCloud, Pandora, Mixcloud, Anghami, Qobuz, Napster, JioSaavn and iHeartRadio are not extracted. Use each service's official offline/download option, or supply direct audio from a rights holder. Limits: 50 tracks, 50 MB per track, 200 MB per import.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
