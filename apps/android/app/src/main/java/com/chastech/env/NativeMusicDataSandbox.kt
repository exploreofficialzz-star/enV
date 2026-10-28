package com.chastech.env

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import android.util.AtomicFile
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Headset
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.chastech.env.ui.EnVLogo
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

private val nativeSandboxAudioExt = setOf("mp3", "m4a", "aac", "wav", "flac", "ogg", "oga", "opus", "aiff", "aif", "3gp", "mp4", "amr", "webm")
private val nativeSandboxLists = setOf("language", "mood", "theme", "setting", "vocals", "flow", "instruments", "standout", "descriptions")
private fun nativeSandboxId(value: String): String = value.lowercase(Locale.ROOT).replace(Regex("[^a-z0-9_-]+"), "_").trim('_', '-').take(90).ifEmpty { "song" }
private fun nativeSandboxString(json: JSONObject, key: String): String = when (val value = json.opt(key)) {
    is JSONArray -> (0 until value.length()).map { value.optString(it) }.joinToString(", ")
    null, JSONObject.NULL -> ""
    else -> value.toString()
}
private fun nativeSandboxValues(value: String): JSONArray = JSONArray(value.split(",").map { it.trim() }.filter { it.isNotEmpty() }.distinct())
private fun nativeSandboxEntries(array: JSONArray): List<JSONObject> = (0 until array.length()).mapNotNull { array.optJSONObject(it) }
internal fun validateNativeSandboxTags(tags: JSONObject) {
    for (key in nativeSandboxLists) if (tags.has(key)) {
        val list = tags.optJSONArray(key) ?: error("$key must be a list of strings.")
        require((0 until list.length()).all { list.opt(it) is String }) { "$key must be a list of strings." }
    }
    for (key in listOf("id", "genre", "sub_style", "key", "time_signature", "tempo_band", "energy", "format", "license", "source"))
        if (tags.has(key)) require(tags.opt(key) is String) { "$key must be text." }
    for (key in listOf("tempo_bpm", "duration_seconds", "sample_rate_hz", "channels", "bit_depth"))
        if (tags.has(key) && !tags.isNull(key)) require(tags.opt(key) is Number && (tags.opt(key) as Number).toDouble().isFinite()) { "$key must be a number or null." }
}

/** Metadata and audio are stored together in app-private files; AtomicFile protects the index. */
private class NativeSandboxStore(context: Context) {
    val root = File(context.filesDir, "music-data-sandbox").apply { mkdirs() }
    private val index = AtomicFile(File(root, "workspace.json"))
    fun read(): JSONObject = if (index.baseFile.exists() || File(root, "workspace.json.bak").exists()) JSONObject(index.readFully().toString(Charsets.UTF_8))
        else JSONObject().put("folders", JSONArray()).put("tracks", JSONArray())
    fun write(workspace: JSONObject) {
        val output = index.startWrite()
        try { output.write(workspace.toString().toByteArray(Charsets.UTF_8)); index.finishWrite(output) }
        catch (error: Throwable) { index.failWrite(output); throw error }
    }
    fun audio(name: String): File = File(root, File(name).name)
}

internal fun sandboxNativeDescendants(folderId: String, folders: List<JSONObject>): Set<String> {
    val result = mutableSetOf(folderId)
    var changed: Boolean
    do {
        changed = false
        for (folder in folders) if (folder.optString("parent") in result && result.add(folder.getString("id"))) changed = true
    } while (changed)
    return result
}
private fun sandboxNativePath(folderId: String, folders: List<JSONObject>): String {
    val names = mutableListOf<String>()
    val seen = mutableSetOf<String>()
    var current = folderId
    while (current.isNotBlank() && seen.add(current)) {
        val folder = folders.firstOrNull { it.optString("id") == current } ?: break
        names.add(0, nativeSandboxId(folder.optString("name")))
        current = folder.optString("parent")
    }
    return names.joinToString("/")
}
internal fun sandboxNativeReady(track: JSONObject): Boolean {
    val tags = track.optJSONObject("tags") ?: return false
    val descriptions = tags.optJSONArray("descriptions") ?: JSONArray()
    val id = tags.optString("id")
    val tempo = if (tags.isNull("tempo_bpm")) null else tags.optDouble("tempo_bpm")
    val duration = if (tags.isNull("duration_seconds")) null else tags.optDouble("duration_seconds")
    return track.optBoolean("reviewed") && !track.has("tagsDraft") && Regex("^[a-z0-9][a-z0-9_-]{0,119}$").matches(id) && tags.optString("genre").isNotBlank() &&
        (tempo == null || tempo.isFinite() && tempo in 1.0..400.0) && (duration == null || duration.isFinite() && duration > 0) &&
        (track.optBoolean("instrumental") || nativeSandboxString(tags, "language").isNotBlank()) &&
        track.optString("clearance") == "cleared" && tags.optString("license") in listOf("owned", "written permission", "CC-BY", "royalty-free") &&
        tags.optString("source").isNotBlank() && (track.optString("audio").isNotBlank() || track.optString("lyrics").isNotBlank()) &&
        (track.optBoolean("instrumental") || track.optString("lyrics").isNotBlank()) &&
        (track.optString("audio").isBlank() || (0 until descriptions.length()).count { descriptions.optString(it).isNotBlank() } >= 2)
}
private fun nativeSandboxNewFolder(name: String, parent: String): JSONObject = JSONObject().put("id", UUID.randomUUID().toString())
    .put("name", name.trim()).put("parent", parent).put("maxSongs", 100).put("maxMB", 250)
internal fun nativeSandboxCaption(tags: JSONObject): String {
    val values = mutableListOf<String>()
    for (field in listOf("genre", "sub_style")) nativeSandboxString(tags, field).takeIf(String::isNotBlank)?.let(values::add)
    nativeSandboxString(tags, "tempo_band").takeIf(String::isNotBlank)?.let { values.add("$it tempo") }
    nativeSandboxString(tags, "energy").takeIf(String::isNotBlank)?.let { values.add("$it energy") }
    for (field in listOf("mood", "theme", "vocals", "flow", "instruments", "standout")) {
        val array = tags.optJSONArray(field) ?: JSONArray()
        for (index in 0 until array.length()) array.optString(index).takeIf(String::isNotBlank)?.let(values::add)
    }
    val languages = tags.optJSONArray("language") ?: JSONArray()
    if (languages.length() > 0) values.add("sung in " + (0 until languages.length()).map { languages.optString(it) }.joinToString(" and "))
    return values.joinToString(", ")
}
internal fun nativeSandboxLyrics(lyrics: String): String = Regex("\\[([^]]+)]").replace(lyrics) { match ->
    val base = match.groupValues[1].substringBefore('|').trim().replace(Regex("\\s+\\d+$"), "").lowercase(Locale.ROOT)
    "[" + when (base) { "pre-chorus" -> "Pre-Chorus"; "post-chorus" -> "Post-Chorus"; else -> base.replaceFirstChar { it.uppercase() } } + "]"
}
internal fun nativeSandboxFolderCapacity(folderId: String, folders: List<JSONObject>, tracks: List<JSONObject>, bytes: Long) {
    var id = folderId
    val seen = mutableSetOf<String>()
    while (id.isNotEmpty() && seen.add(id)) {
        val folder = folders.firstOrNull { it.optString("id") == id } ?: error("Folder is unavailable.")
        val ids = sandboxNativeDescendants(id, folders)
        val existing = tracks.filter { it.optString("folder") in ids }
        require(existing.size + 1 <= folder.optInt("maxSongs", 100)) { "Folder song limit reached." }
        require(existing.sumOf { it.optLong("size") } + bytes <= folder.optInt("maxMB", 250) * 1024L * 1024L) { "Folder storage limit reached." }
        id = folder.optString("parent")
    }
}

@Composable
fun NativeMusicDataSandboxScreen() {
    val context = LocalContext.current
    val deviceConfiguration = LocalConfiguration.current
    val panelHeight = (deviceConfiguration.screenHeightDp - 100).coerceIn(440, 650).dp
    val store = remember { NativeSandboxStore(context) }
    val scope = rememberCoroutineScope()
    val loaded = remember { runCatching { store.read() } }
    var workspace by remember { mutableStateOf(loaded.getOrElse { JSONObject().put("folders", JSONArray()).put("tracks", JSONArray()) }) }
    val storageFailure = loaded.exceptionOrNull()
    var welcome by remember { mutableStateOf(true) }
    var folderId by remember { mutableStateOf("") }
    var selectedId by remember { mutableStateOf("") }
    var screen by remember { mutableIntStateOf(0) }
    var page by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf(storageFailure?.let { "Could not open saved workspace: ${it.message}" } ?: "") }
    var creatingFolder by remember { mutableStateOf(false) }
    var folderName by remember { mutableStateOf("") }
    var folderLimit by remember { mutableStateOf("100") }
    var folderMB by remember { mutableStateOf("250") }
    var editingFolder by remember { mutableStateOf(false) }
    var moving by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var folderChoicePage by remember { mutableIntStateOf(0) }
    var jsonDraft by remember { mutableStateOf("") }
    var editorMenu by remember { mutableStateOf(false) }
    var clearanceMenu by remember { mutableStateOf(false) }
    var trainingExport by remember { mutableStateOf(false) }
    var choosingExport by remember { mutableStateOf(false) }
    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var playing by remember { mutableStateOf(false) }
    DisposableEffect(Unit) { onDispose { player?.release() } }

    val folders = nativeSandboxEntries(workspace.optJSONArray("folders") ?: JSONArray())
    val tracks = nativeSandboxEntries(workspace.optJSONArray("tracks") ?: JSONArray())
    val selected = tracks.firstOrNull { it.optString("id") == selectedId }
    val folder = folders.firstOrNull { it.optString("id") == folderId }
    fun commit(value: JSONObject): Boolean = try { check(storageFailure == null) { "Saved workspace could not be opened; no changes were written." }; store.write(value); workspace = value; true }
        catch (error: Exception) { message = error.message ?: "Could not save on this device."; false }
    fun edit(change: (JSONObject) -> Unit) {
        val copy = JSONObject(workspace.toString())
        val item = nativeSandboxEntries(copy.getJSONArray("tracks")).firstOrNull { it.optString("id") == selectedId } ?: return
        change(item); item.put("reviewed", false); commit(copy)
    }
    fun editTag(key: String, value: String) = edit { item ->
        val tags = item.getJSONObject("tags")
        tags.put(key, when {
            key == "tempo_bpm" -> value.toDoubleOrNull() ?: JSONObject.NULL
            key in nativeSandboxLists -> nativeSandboxValues(value)
            else -> value
        })
        if (key == "tempo_bpm") { item.put("tempoEstimated", false); item.put("tempoEdited", true) }
        if (key == "key") { item.put("keyEstimated", false); item.put("keyEdited", true) }
    }
    fun createBlankRecord() {
        try {
            val next = JSONObject(workspace.toString())
            var destination = folderId
            if (destination.isEmpty()) {
                val root = nativeSandboxEntries(next.getJSONArray("folders")).firstOrNull { it.optString("parent").isEmpty() }
                    ?: nativeSandboxNewFolder("My first collection", "").also { next.getJSONArray("folders").put(it) }
                destination = root.getString("id")
            }
            val allFolders = nativeSandboxEntries(next.getJSONArray("folders")); val allTracks = nativeSandboxEntries(next.getJSONArray("tracks"))
            nativeSandboxFolderCapacity(destination, allFolders, allTracks, 0)
            val used = allTracks.map { it.getJSONObject("tags").optString("id") }.toSet()
            var number = allTracks.size + 1; var id = "song_${number.toString().padStart(4, '0')}"
            while (id in used) { number++; id = "song_${number.toString().padStart(4, '0')}" }
            val record = JSONObject().put("id", UUID.randomUUID().toString()).put("folder", destination).put("title", "Untitled record")
                .put("audio", "").put("size", 0).put("tags", JSONObject().put("id", id)).put("reviewed", false)
                .put("clearance", "pending").put("instrumental", false).put("lyrics", "")
            next.getJSONArray("tracks").put(record)
            if (commit(next)) { folderId = destination; selectedId = record.getString("id"); screen = 0; message = "" }
        } catch (error: Exception) { message = error.message ?: "Could not create a record." }
    }
    val importer = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty() && !busy) scope.launch {
            busy = true; message = "Adding music…"
            try {
                val sources = withContext(Dispatchers.IO) { collectUriSources(context, uris, true) }
                val groups = sources.filter { source -> source.name.substringAfterLast('.', "").lowercase(Locale.ROOT) in nativeSandboxAudioExt || source.name.endsWith(".tags.json", true) || source.name.endsWith(".lyrics.txt", true) }
                    .groupBy { source -> source.name.replace(Regex("(?i)\\.(tags\\.json|lyrics\\.txt|mp3|m4a|aac|wav|flac|ogg|oga|opus|aiff|aif|3gp|mp4|amr|webm)$"), "") }
                require(groups.isNotEmpty()) { "No audio, tags or lyrics found." }
                require(groups.size <= 50) { "Add up to 50 songs at a time." }
                var next = JSONObject(workspace.toString())
                var currentFolders = nativeSandboxEntries(next.getJSONArray("folders"))
                var destination = folderId
                if (destination.isBlank()) {
                    val created = nativeSandboxNewFolder("My first collection", "")
                    next.getJSONArray("folders").put(created); currentFolders = nativeSandboxEntries(next.getJSONArray("folders")); destination = created.getString("id")
                }
                var added = 0
                for ((stem, group) in groups) {
                    val audioSource = group.firstOrNull { it.name.substringAfterLast('.', "").lowercase(Locale.ROOT) in nativeSandboxAudioExt }
                    val tagSource = group.firstOrNull { it.name.endsWith(".tags.json", true) }
                    val lyricSource = group.firstOrNull { it.name.endsWith(".lyrics.txt", true) }
                    if (audioSource == null && tagSource == null && lyricSource == null) continue
                    suspend fun bytes(source: NativeSongSource): ByteArray = source.bytes ?: withContext(Dispatchers.IO) {
                        (context.contentResolver.openInputStream(source.uri ?: error("File unavailable.")) ?: error("File unavailable.")).use { readBoundedContent(it, 20L * 1024 * 1024) }
                    }
                    var target = destination
                    val parts = stem.substringBeforeLast('/', "").split('/').filter { it.isNotBlank() }
                    require(parts.size <= 12 && parts.all { it.length <= 80 && it != "." && it != ".." && it.none { char -> char == '\\' || char.code < 32 } }) { "Invalid folder path." }
                    for (part in parts) {
                        var child = currentFolders.firstOrNull { it.optString("parent") == target && it.optString("name").equals(part, true) }
                        if (child == null) { child = nativeSandboxNewFolder(part, target); next.getJSONArray("folders").put(child); currentFolders = nativeSandboxEntries(next.getJSONArray("folders")) }
                        target = child.getString("id")
                    }
                    val audioBytes = audioSource?.let { bytes(it) }
                    nativeSandboxFolderCapacity(target, currentFolders, nativeSandboxEntries(next.getJSONArray("tracks")), (audioBytes?.size ?: 0).toLong())
                    val tags = if (tagSource != null) { val content = bytes(tagSource); require(content.size <= 1024 * 1024); JSONObject(content.toString(Charsets.UTF_8)) } else JSONObject()
                    validateNativeSandboxTags(tags)
                    val used = nativeSandboxEntries(next.getJSONArray("tracks")).map { it.getJSONObject("tags").optString("id") }.toSet()
                    val base = nativeSandboxId(tags.optString("id").ifBlank { stem.substringAfterLast('/') })
                    var id = base; var suffix = 2
                    while (id in used) { id = "${base}_${suffix.toString().padStart(3, '0')}"; suffix++ }
                    tags.put("id", id)
                    val audioFile = audioSource?.let { UUID.randomUUID().toString() + "." + it.name.substringAfterLast('.').lowercase(Locale.ROOT) } ?: ""
                    val item = JSONObject().put("id", UUID.randomUUID().toString()).put("folder", target).put("title", stem.substringAfterLast('/'))
                        .put("audio", audioFile).put("size", audioBytes?.size ?: 0).put("tags", tags).put("reviewed", false)
                        .put("clearance", "pending").put("instrumental", false).put("lyrics", if (lyricSource != null) bytes(lyricSource).also { require(it.size <= 1024 * 1024) }.toString(Charsets.UTF_8) else "")
                    var saved = false
                    try {
                        if (audioBytes != null && audioSource != null) {
                            withContext(Dispatchers.IO) { store.audio(audioFile).writeBytes(audioBytes) }
                            try {
                                val report = withContext(Dispatchers.IO) { analyzeSandboxSong(context, audioSource.copy(bytes = audioBytes, uri = null, sizeBytes = audioBytes.size.toLong())) }
                                if (tags.isNull("tempo_bpm") && !report.isNull("tempo_bpm")) { tags.put("tempo_bpm", report.opt("tempo_bpm")); item.put("tempoEstimated", true) }
                                if (tags.optString("key").isBlank() && !report.isNull("key")) { tags.put("key", report.optString("key")); item.put("keyEstimated", true) }
                                val technical = report.optJSONObject("technical")
                                if (technical != null) {
                                    item.put("technical", technical)
                                    for (field in listOf("duration_seconds", "sample_rate_hz", "channels", "bit_depth")) if (!technical.isNull(field)) tags.put(field, technical.opt(field))
                                    if (!technical.isNull("codec")) tags.put("format", technical.optString("codec"))
                                }
                            } catch (error: Exception) { if (error is CancellationException) throw error; item.put("analysisNote", "Analysis unavailable. Add details manually.") }
                        }
                        next.getJSONArray("tracks").put(item)
                        check(commit(next)) { "Saving the import failed." }
                        saved = true
                    } finally { if (!saved && audioFile.isNotBlank()) store.audio(audioFile).delete() }
                    next = JSONObject(next.toString()); currentFolders = nativeSandboxEntries(next.getJSONArray("folders")); added++
                }
                folderId = destination; page = 0; message = "$added songs added. Check BPM and key by ear."
            } catch (error: Exception) { if (error is CancellationException) throw error; message = error.message ?: "Could not import files." }
            finally { busy = false }
        }
    }
    val audioAttacher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && !busy && selected != null) scope.launch {
            busy = true; message = "Adding audio…"; player?.release(); player = null; playing = false
            var newFile = ""; var saved = false
            try {
                val source = withContext(Dispatchers.IO) { collectUriSources(context, listOf(uri)).singleOrNull() } ?: error("Choose a supported audio file.")
                val bytes = source.bytes ?: withContext(Dispatchers.IO) { (context.contentResolver.openInputStream(uri) ?: error("Cannot open audio.")).use { readBoundedContent(it, 20L * 1024 * 1024) } }
                require(bytes.isNotEmpty()) { "Audio is empty." }
                nativeSandboxFolderCapacity(selected.optString("folder"), folders, tracks.filterNot { it.optString("id") == selectedId }, bytes.size.toLong())
                newFile = UUID.randomUUID().toString() + "." + source.name.substringAfterLast('.').lowercase(Locale.ROOT)
                withContext(Dispatchers.IO) { store.audio(newFile).writeBytes(bytes) }
                val next = JSONObject(workspace.toString()); val item = nativeSandboxEntries(next.getJSONArray("tracks")).first { it.optString("id") == selectedId }
                val oldFile = item.optString("audio"); val tags = item.getJSONObject("tags")
                if (item.optBoolean("tempoEstimated")) { tags.put("tempo_bpm", JSONObject.NULL); item.put("tempoEstimated", false) }
                if (item.optBoolean("keyEstimated")) { tags.put("key", ""); item.put("keyEstimated", false) }
                item.put("audio", newFile).put("size", bytes.size).put("reviewed", false)
                try {
                    val report = withContext(Dispatchers.IO) { analyzeSandboxSong(context, source.copy(bytes = bytes, uri = null, sizeBytes = bytes.size.toLong())) }
                    if (!item.optBoolean("tempoEdited") && tags.isNull("tempo_bpm") && !report.isNull("tempo_bpm")) { tags.put("tempo_bpm", report.opt("tempo_bpm")); item.put("tempoEstimated", true) }
                    if (!item.optBoolean("keyEdited") && tags.optString("key").isBlank() && !report.isNull("key")) { tags.put("key", report.optString("key")); item.put("keyEstimated", true) }
                    report.optJSONObject("technical")?.let { technical ->
                        item.put("technical", technical)
                        for (field in listOf("duration_seconds", "sample_rate_hz", "channels", "bit_depth")) tags.put(field, technical.opt(field) ?: JSONObject.NULL)
                        tags.put("format", nativeSandboxString(technical, "codec"))
                    }
                } catch (error: Exception) { if (error is CancellationException) throw error; item.put("analysisNote", "Analysis unavailable. Add details manually.") }
                check(commit(next)) { "Saving audio failed." }; saved = true
                if (oldFile.isNotBlank()) store.audio(oldFile).delete()
                message = "Audio saved. Check BPM and key by ear."
            } catch (error: Exception) { if (error is CancellationException) throw error; message = error.message ?: "Could not add audio." }
            finally { if (!saved && newFile.isNotBlank()) store.audio(newFile).delete(); busy = false }
        }
    }
    val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        if (uri != null && !busy) scope.launch {
            busy = true
            try {
                val ids = if (folderId.isBlank()) folders.map { it.optString("id") }.toSet() else sandboxNativeDescendants(folderId, folders)
                val chosen = tracks.filter { it.optString("folder") in ids && (!trainingExport || (it.optString("audio").isNotBlank() && sandboxNativeReady(it))) }
                require(chosen.isNotEmpty()) { "No songs to export." }
                val exportedIds = chosen.map { it.getJSONObject("tags").optString("id") }
                require(chosen.none { it.has("tagsDraft") }) { "Apply pending tags JSON before exporting." }
                require(exportedIds.all { Regex("^[a-z0-9][a-z0-9_-]{0,119}$").matches(it) } && exportedIds.distinct().size == exportedIds.size) { "Use unique lowercase record IDs before exporting." }
                require(chosen.sumOf { it.optLong("size") + it.optString("lyrics").toByteArray().size + it.getJSONObject("tags").toString().toByteArray().size } <= 28L * 1024 * 1024) { "Export smaller folders, up to 28 MB at a time." }
                withContext(Dispatchers.IO) {
                    ZipOutputStream(context.contentResolver.openOutputStream(uri) ?: error("Cannot create ZIP.")).use { zip ->
                        val manifest = StringBuilder("id,folder,audio,license_status,reviewed\n")
                        val dataset = mutableListOf<String>()
                        for (track in chosen) {
                            val tags = track.getJSONObject("tags"); val id = tags.getString("id"); val path = sandboxNativePath(track.optString("folder"), folders)
                            val base = "$path/$id"; val file = track.optString("audio")
                            fun entry(name: String, bytes: ByteArray) { zip.putNextEntry(ZipEntry(name)); zip.write(bytes); zip.closeEntry() }
                            if (file.isNotEmpty()) entry("$base.${file.substringAfterLast('.')}", store.audio(file).readBytes())
                            val lyrics = if (trainingExport) nativeSandboxLyrics(track.optString("lyrics")) else track.optString("lyrics")
                            entry("$base.lyrics.txt", lyrics.toByteArray(Charsets.UTF_8))
                            if (trainingExport) {
                                val caption = nativeSandboxCaption(tags)
                                require(caption.length <= 500) { "Shorten the caption for $id." }
                                val annotation = JSONObject().put("caption", caption).put("bpm", tags.opt("tempo_bpm") ?: JSONObject.NULL)
                                    .put("keyscale", tags.optString("key")).put("timesignature", tags.optString("time_signature"))
                                    .put("vocal_language", if (track.optBoolean("instrumental")) "instrumental" else "unknown").put("duration", tags.opt("duration_seconds") ?: JSONObject.NULL)
                                entry("$base.caption.txt", caption.toByteArray(Charsets.UTF_8))
                                entry("$base.json", annotation.toString(2).toByteArray(Charsets.UTF_8))
                                dataset.add(JSONObject(annotation.toString()).put("audio", "$base.${file.substringAfterLast('.')}").put("lyrics", "$base.lyrics.txt").toString())
                            } else entry("$base.tags.json", tags.toString(2).toByteArray(Charsets.UTF_8))
                            manifest.append("$id,$path,${if (file.isEmpty()) "" else "$base.${file.substringAfterLast('.')}"},${track.optString("clearance")},${track.optBoolean("reviewed")}\n")
                        }
                        zip.putNextEntry(ZipEntry("manifest.csv")); zip.write(manifest.toString().toByteArray(Charsets.UTF_8)); zip.closeEntry()
                        if (trainingExport) { zip.putNextEntry(ZipEntry("dataset.jsonl")); zip.write(dataset.joinToString("\n").toByteArray(Charsets.UTF_8)); zip.closeEntry() }
                    }
                }
                message = "ZIP exported."
            } catch (error: Exception) { message = error.message ?: "Export failed." }
            finally { busy = false }
        }
    }
    if (choosingExport) {
        AlertDialog(onDismissRequest = { choosingExport = false }, title = { Text("Export") }, text = { Text("Choose files to prepare.") },
            confirmButton = { TextButton(onClick = { trainingExport = true; choosingExport = false; exporter.launch("music-training.zip") }) { Text("Training") } },
            dismissButton = { TextButton(onClick = { trainingExport = false; choosingExport = false; exporter.launch("music-sandbox.zip") }) { Text("Master backup") } })
    }
    if (deleting && selected != null) {
        AlertDialog(onDismissRequest = { deleting = false }, title = { Text("Delete this record?") }, text = { Text("Its saved audio will also be removed.") },
            confirmButton = { TextButton(onClick = { val next = JSONObject(workspace.toString()); val remaining = nativeSandboxEntries(next.getJSONArray("tracks")).filterNot { it.optString("id") == selectedId }; next.put("tracks", JSONArray(remaining)); if (commit(next)) { player?.release(); player = null; playing = false; store.audio(selected.optString("audio")).takeIf { selected.optString("audio").isNotBlank() }?.delete(); selectedId = ""; screen = 0 }; deleting = false }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { deleting = false }) { Text("Cancel") } })
    }
    if (moving && selected != null) {
        AlertDialog(onDismissRequest = { moving = false }, title = { Text("Move to folder") }, text = { Column {
            folders.drop(folderChoicePage * 4).take(4).forEach { target -> TextButton(onClick = {
                try {
                    nativeSandboxFolderCapacity(target.optString("id"), folders, tracks.filterNot { it.optString("id") == selectedId }, selected.optLong("size"))
                    edit { it.put("folder", target.optString("id")) }; moving = false
                } catch (error: Exception) { message = error.message ?: "Could not move record." }
            }) { Text(sandboxNativePath(target.optString("id"), folders)) } }
            Row { TextButton(onClick = { folderChoicePage-- }, enabled = folderChoicePage > 0) { Text("Previous") }; TextButton(onClick = { folderChoicePage++ }, enabled = (folderChoicePage + 1) * 4 < folders.size) { Text("Next") } }
        } }, confirmButton = { TextButton(onClick = { moving = false }) { Text("Close") } })
    }
    if (creatingFolder || editingFolder) {
        AlertDialog(onDismissRequest = { creatingFolder = false; editingFolder = false }, title = { Text(if (editingFolder) "Folder settings" else "New folder") },
            text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = folderName, onValueChange = { folderName = it }, label = { Text("Folder name") }, singleLine = true)
                OutlinedTextField(value = folderLimit, onValueChange = { folderLimit = it }, label = { Text("Maximum songs") }, singleLine = true)
                OutlinedTextField(value = folderMB, onValueChange = { folderMB = it }, label = { Text("Maximum MB") }, singleLine = true)
            } }, confirmButton = { TextButton(onClick = {
                try {
                    val name = folderName.trim(); val count = folderLimit.toIntOrNull() ?: 0; val mb = folderMB.toIntOrNull() ?: 0
                    require(name.isNotBlank() && name.length <= 80 && name.none { it == '/' || it == '\\' || it.code < 32 } && count in 1..500 && mb in 10..2000) { "Enter a valid name, 1–500 songs and 10–2000 MB." }
                    val next = JSONObject(workspace.toString())
                    val parent = if (editingFolder) folder?.optString("parent") ?: "" else folderId
                    require(nativeSandboxEntries(next.getJSONArray("folders")).none { it.optString("parent") == parent && (!editingFolder || it.optString("id") != folderId) && nativeSandboxId(it.optString("name")) == nativeSandboxId(name) }) { "A folder with this name already exists." }
                    val target = if (editingFolder) nativeSandboxEntries(next.getJSONArray("folders")).first { it.optString("id") == folderId }
                        else nativeSandboxNewFolder(name, folderId).also { next.getJSONArray("folders").put(it) }
                    target.put("name", name).put("maxSongs", count).put("maxMB", mb)
                    val descendants = sandboxNativeDescendants(target.getString("id"), nativeSandboxEntries(next.getJSONArray("folders")))
                    val contained = nativeSandboxEntries(next.getJSONArray("tracks")).filter { it.optString("folder") in descendants }
                    require(contained.size <= count && contained.sumOf { it.optLong("size") } <= mb * 1024L * 1024L) { "The new limit is below the folder's current contents." }
                    if (commit(next)) { folderId = target.getString("id"); creatingFolder = false; editingFolder = false; page = 0 }
                } catch (error: Exception) { message = error.message ?: "Could not save folder." }
            }) { Text("Save") } }, dismissButton = { TextButton(onClick = { creatingFolder = false; editingFolder = false }) { Text("Cancel") } })
    }
    val panelSizing = if (deviceConfiguration.fontScale > 1.15f || deviceConfiguration.screenHeightDp < 540) Modifier.heightIn(min = panelHeight) else Modifier.height(panelHeight)
    Column(Modifier.widthIn(max = 430.dp).fillMaxWidth().then(panelSizing), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (welcome) {
            Spacer(Modifier.weight(1f))
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                EnVLogo(Modifier.width(150.dp).height(80.dp), darkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f, homeHero = true)
                Icon(Icons.Default.Headset, contentDescription = null, modifier = Modifier.size(42.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("AI Music Data Sandbox.", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                Button(onClick = { welcome = false }) { Text("Enter sandbox") }
            }
            Spacer(Modifier.weight(1f))
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("By", style = MaterialTheme.typography.labelSmall)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Image(painterResource(R.drawable.rumuo_mark), contentDescription = null, modifier = Modifier.size(20.dp).clip(RoundedCornerShape(6.dp)))
                    Text("Rumuo", style = MaterialTheme.typography.titleSmall)
                }
            }
        } else if (selected != null) {
            val tags = selected.getJSONObject("tags")
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { player?.release(); player = null; playing = false; selectedId = ""; screen = 0 }, enabled = !busy) { Text("‹ Back") }
                Text(selected.optString("title"), modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (sandboxNativeReady(selected)) "Ready" else "Draft", style = MaterialTheme.typography.labelSmall)
            }
            if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3)
            if (selected.optString("audio").isNotBlank()) TextButton(onClick = {
                try {
                    if (playing) { player?.pause(); playing = false }
                    else { if (player == null) player = MediaPlayer().apply { setDataSource(store.audio(selected.optString("audio")).absolutePath); prepare(); setOnCompletionListener { playing = false } }; player?.start(); playing = true }
                }
                catch (error: Exception) { message = error.message ?: "Cannot play audio." }
            }) { Text(if (playing) "Pause audio" else "Play audio") }
            val sectionNames = listOf("Track", "Tempo & key", "Style", "Sound", "Descriptions", "Lyrics", "Permission", "Extra tags", "All tags", "File facts", "File format")
            Box {
                OutlinedButton(onClick = { editorMenu = true }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Edit: ${sectionNames[screen]}") }
                DropdownMenu(expanded = editorMenu, onDismissRequest = { editorMenu = false }) {
                    listOf(0, 1, 2, 5, 6, 7, 8, 9).forEach { destination ->
                        DropdownMenuItem(text = { Text(sectionNames[destination]) }, onClick = { if (destination == 8) jsonDraft = if (selected.has("tagsDraft")) selected.optString("tagsDraft") else tags.toString(2); screen = destination; editorMenu = false })
                    }
                }
            }
            @Composable fun Field(label: String, value: String, onValue: (String) -> Unit) {
                OutlinedTextField(value = value, onValueChange = onValue, label = { Text(label) }, modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = !busy)
            }
            when (screen) {
                0 -> { Field("Title", selected.optString("title")) { edit { item -> item.put("title", it) } }; Field("Record ID", tags.optString("id")) { value -> editTag("id", value) }; Row { TextButton(onClick = { folderChoicePage = 0; moving = true }, enabled = !busy) { Text("Move") }; TextButton(onClick = { audioAttacher.launch(arrayOf("audio/*")) }, enabled = !busy) { Text(if (selected.optString("audio").isEmpty()) "Attach audio" else "Replace audio") } } }
                1 -> { Field("Tempo (BPM)", nativeSandboxString(tags, "tempo_bpm")) { editTag("tempo_bpm", it) }; Field("Musical key", nativeSandboxString(tags, "key")) { editTag("key", it) }; Field("Time signature", nativeSandboxString(tags, "time_signature")) { editTag("time_signature", it) }; Text("BPM and key are estimates. Check by ear.", style = MaterialTheme.typography.labelSmall); selected.optJSONObject("technical")?.let { technical -> Text("${nativeSandboxString(technical, "sample_rate_hz")} Hz · ${nativeSandboxString(technical, "channels")} channels · Peak ${nativeSandboxString(technical, "peak_dbfs")} dBFS · RMS ${nativeSandboxString(technical, "rms_dbfs")} dBFS", style = MaterialTheme.typography.labelSmall, maxLines = 2) } }
                2 -> { Field("Genre", nativeSandboxString(tags, "genre")) { editTag("genre", it) }; Field("Sub-style", nativeSandboxString(tags, "sub_style")) { editTag("sub_style", it) }; Field("Languages", nativeSandboxString(tags, "language")) { editTag("language", it) } }
                3 -> { Field("Mood", nativeSandboxString(tags, "mood")) { editTag("mood", it) }; Field("Voice", nativeSandboxString(tags, "vocals")) { editTag("vocals", it) }; Field("Instruments", nativeSandboxString(tags, "instruments")) { editTag("instruments", it) } }
                4 -> { for (i in 0..2) Field("Description ${i + 1}", tags.optJSONArray("descriptions")?.optString(i) ?: "") { value -> edit { item -> val existing = item.getJSONObject("tags").optJSONArray("descriptions") ?: JSONArray(); val descriptions = JSONArray(); for (index in 0..2) descriptions.put(if (index == i) value else existing.optString(index)); item.getJSONObject("tags").put("descriptions", descriptions) } } }
                5 -> { Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = selected.optBoolean("instrumental"), onCheckedChange = { value -> edit { it.put("instrumental", value) } }); Text("Instrumental") }; OutlinedTextField(value = selected.optString("lyrics"), onValueChange = { value -> edit { it.put("lyrics", value) } }, label = { Text("Lyrics") }, modifier = Modifier.fillMaxWidth().height(170.dp), maxLines = 7) }
                6 -> { Field("License", tags.optString("license")) { editTag("license", it) }; Field("Source & permission", tags.optString("source")) { editTag("source", it) }; Box { OutlinedButton(onClick = { clearanceMenu = true }, enabled = !busy) { Text("Clearance: ${selected.optString("clearance", "pending")}") }; DropdownMenu(expanded = clearanceMenu, onDismissRequest = { clearanceMenu = false }) { listOf("pending", "cleared", "not cleared").forEach { value -> DropdownMenuItem(text = { Text(value) }, onClick = { edit { it.put("clearance", value) }; clearanceMenu = false }) } } }; Text("License: owned, written permission, CC-BY or royalty-free", style = MaterialTheme.typography.labelSmall) }
                7 -> { Field("Theme", nativeSandboxString(tags, "theme")) { editTag("theme", it) }; Field("Flow", nativeSandboxString(tags, "flow")) { editTag("flow", it) }; Field("Energy", nativeSandboxString(tags, "energy")) { editTag("energy", it) } }
                8 -> { OutlinedTextField(value = jsonDraft, onValueChange = { value -> jsonDraft = value; edit { it.put("tagsDraft", value) } }, label = { Text("Tags JSON") }, modifier = Modifier.fillMaxWidth().height(160.dp)); Row { TextButton(onClick = { try { require(jsonDraft.toByteArray().size <= 1024 * 1024); val newTags = JSONObject(jsonDraft); validateNativeSandboxTags(newTags); edit { it.put("tags", newTags); it.remove("tagsDraft"); it.put("tempoEstimated", false); it.put("keyEstimated", false); it.put("tempoEdited", true); it.put("keyEdited", true) }; message = "Tags saved." } catch (error: Exception) { message = error.message ?: "Invalid tags JSON." } }) { Text("Apply") }; TextButton(onClick = { deleting = true }) { Text("Delete") } } }
                9 -> { Field("Duration (seconds)", nativeSandboxString(tags, "duration_seconds")) { value -> edit { it.getJSONObject("tags").put("duration_seconds", value.toDoubleOrNull() ?: JSONObject.NULL) } }; Field("Sample rate (Hz)", nativeSandboxString(tags, "sample_rate_hz")) { value -> edit { it.getJSONObject("tags").put("sample_rate_hz", value.toIntOrNull() ?: JSONObject.NULL) } }; Field("Channels", nativeSandboxString(tags, "channels")) { value -> edit { it.getJSONObject("tags").put("channels", value.toIntOrNull() ?: JSONObject.NULL) } } }
                else -> { Field("Format / codec", nativeSandboxString(tags, "format")) { editTag("format", it) }; Field("Bit depth", nativeSandboxString(tags, "bit_depth")) { value -> edit { it.getJSONObject("tags").put("bit_depth", value.toIntOrNull() ?: JSONObject.NULL) } } }
            }
            Spacer(Modifier.weight(1f))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { screen = (screen - 1).coerceAtLeast(0) }, enabled = screen > 0 && !busy) { Text("Previous") }
                Text("${screen + 1} / 11", style = MaterialTheme.typography.labelSmall)
                TextButton(onClick = { if (screen == 7) jsonDraft = if (selected.has("tagsDraft")) selected.optString("tagsDraft") else tags.toString(2); screen = (screen + 1).coerceAtMost(10) }, enabled = screen < 10 && !busy) { Text("Next") }
                Button(onClick = { val copy = JSONObject(workspace.toString()); val all = nativeSandboxEntries(copy.getJSONArray("tracks")); val item = all.first { it.optString("id") == selectedId }; item.put("reviewed", true); val id = item.getJSONObject("tags").optString("id"); if (sandboxNativeReady(item) && all.count { it.getJSONObject("tags").optString("id") == id } == 1) { if (commit(copy)) message = "Reviewed and saved." } else message = "Check ID, genre, languages, descriptions, lyrics and permission." }, enabled = !busy) { Text("Ready") }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                EnVLogo(Modifier.width(48.dp).height(35.dp), darkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f)
                Text("AI Music Data Sandbox", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, maxLines = 1)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (folderId.isNotBlank()) TextButton(onClick = { folderId = folder?.optString("parent") ?: ""; page = 0 }) { Text("‹ Back") }
                Text(folder?.optString("name") ?: "Music library", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1)
                if (folder != null) TextButton(onClick = { folderName = folder.optString("name"); folderLimit = folder.optInt("maxSongs", 100).toString(); folderMB = folder.optInt("maxMB", 250).toString(); editingFolder = true }) { Text("Settings") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { importer.launch(arrayOf("audio/*", "application/zip", "application/x-zip-compressed", "application/json", "text/plain")) }, enabled = !busy && storageFailure == null, modifier = Modifier.weight(1f)) { Text(if (busy) "Adding…" else "Add music") }
                OutlinedButton(onClick = { folderName = ""; folderLimit = "100"; folderMB = "250"; creatingFolder = true }, enabled = !busy && storageFailure == null) { Text("New folder") }
            }
            if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
            val children = folders.filter { it.optString("parent") == folderId }
            val visibleTracks = if (folderId.isBlank()) tracks.filterNot(::sandboxNativeReady) else tracks.filter { it.optString("folder") == folderId }
            val rows = children.map { "folder" to it } + visibleTracks.map { "track" to it }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(if (folderId.isBlank()) "Folders & drafts" else "Songs & subfolders", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                TextButton(onClick = { createBlankRecord() }, enabled = !busy && storageFailure == null) { Text("Blank record") }
            }
            rows.drop(page * 4).take(4).forEach { (kind, item) ->
                OutlinedButton(onClick = { if (kind == "folder") { folderId = item.optString("id"); page = 0 } else { selectedId = item.optString("id"); screen = 0; message = "" } }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                    Text(if (kind == "folder") "📁  ${item.optString("name")}" else "♫  ${item.optString("title")}", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("›")
                }
            }
            if (rows.isEmpty()) Text("No songs yet", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.weight(1f))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { page = (page - 1).coerceAtLeast(0) }, enabled = page > 0) { Text("Previous") }
                Text("${page + 1} / ${((rows.size + 3) / 4).coerceAtLeast(1)}", style = MaterialTheme.typography.labelSmall)
                TextButton(onClick = { page++ }, enabled = (page + 1) * 4 < rows.size) { Text("Next") }
                OutlinedButton(onClick = { choosingExport = true }, enabled = tracks.isNotEmpty() && !busy) { Text("Export") }
            }
        }
    }
}
