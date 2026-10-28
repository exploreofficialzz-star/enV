package com.chastech.env

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import android.util.AtomicFile
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chastech.env.ui.EnVLogo
import com.chastech.env.ui.EnVIcon
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
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
internal fun nativeSandboxTempoBand(tempo: Double): String = when {
    !tempo.isFinite() || tempo < 1 || tempo > 400 -> ""
    tempo < 90 -> "slow"
    tempo < 130 -> "mid"
    else -> "fast"
}
internal fun nativeSandboxSuggestTempoBand(track: JSONObject) {
    val tags = track.optJSONObject("tags") ?: return
    if (track.optBoolean("tempoBandEdited")) return
    if (tags.optString("tempo_band").isNotBlank() && !track.optBoolean("tempoBandEstimated")) return
    val band = nativeSandboxTempoBand(tags.optDouble("tempo_bpm", Double.NaN))
    if (band.isNotBlank() || track.optBoolean("tempoBandEstimated")) { tags.put("tempo_band", band); track.put("tempoBandEstimated", true) }
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
fun NativeMusicDataSandboxScreen(startInWorkspace: Boolean = false) {
    val roundedShapes = remember {
        Shapes(
            extraSmall = RoundedCornerShape(12.dp),
            small = RoundedCornerShape(14.dp),
            medium = RoundedCornerShape(16.dp),
            large = RoundedCornerShape(20.dp),
            extraLarge = RoundedCornerShape(24.dp),
        )
    }
    MaterialTheme(shapes = roundedShapes) { NativeMusicDataSandboxContent(startInWorkspace) }
}

@Composable
private fun NativeMusicDataSandboxContent(startInWorkspace: Boolean) {
    val context = LocalContext.current
    val deviceConfiguration = LocalConfiguration.current
    val panelHeight = (deviceConfiguration.screenHeightDp - 100).coerceIn(440, 650).dp
    val store = remember { NativeSandboxStore(context) }
    val scope = rememberCoroutineScope()
    val loaded = remember { runCatching { store.read() } }
    var workspace by remember { mutableStateOf(loaded.getOrElse { JSONObject().put("folders", JSONArray()).put("tracks", JSONArray()) }) }
    val storageFailure = loaded.exceptionOrNull()
    var welcome by remember { mutableStateOf(!startInWorkspace) }
    var folderId by remember { mutableStateOf("") }
    var selectedId by remember { mutableStateOf("") }
    var screen by remember { mutableIntStateOf(0) }
    var libraryView by remember { mutableIntStateOf(0) }
    var showRawJson by remember { mutableStateOf(false) }
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
    LaunchedEffect(selectedId) {
        val draft = nativeSandboxEntries(workspace.optJSONArray("tracks") ?: JSONArray()).firstOrNull { it.optString("id") == selectedId }?.takeIf { it.has("tagsDraft") }?.optString("tagsDraft")
        showRawJson = draft != null; jsonDraft = draft ?: ""; if (draft != null) screen = 2
    }
    var clearanceMenu by remember { mutableStateOf(false) }
    var licenseMenu by remember { mutableStateOf(false) }
    var trainingExport by remember { mutableStateOf(false) }
    var choosingExport by remember { mutableStateOf(false) }
    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var playing by remember { mutableStateOf(false) }
    var audioPosition by remember { mutableIntStateOf(0) }
    var audioDuration by remember { mutableIntStateOf(0) }
    LaunchedEffect(playing, player) {
        while (playing && player != null) {
            audioPosition = runCatching { player?.currentPosition ?: 0 }.getOrDefault(0)
            delay(500)
        }
    }
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
        if (key == "tempo_bpm") { item.put("tempoEstimated", false); item.put("tempoEdited", true); if (item.optBoolean("tempoBandEstimated")) nativeSandboxSuggestTempoBand(item) }
        if (key == "tempo_band") { item.put("tempoBandEstimated", false); item.put("tempoBandEdited", true) }
        if (key == "key") { item.put("keyEstimated", false); item.put("keyEdited", true) }
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
                            nativeSandboxSuggestTempoBand(item)
                        }
                        next.getJSONArray("tracks").put(item)
                        check(commit(next)) { "Saving the import failed." }
                        saved = true
                    } finally { if (!saved && audioFile.isNotBlank()) store.audio(audioFile).delete() }
                    next = JSONObject(next.toString()); currentFolders = nativeSandboxEntries(next.getJSONArray("folders")); added++
                }
                folderId = destination; page = 0; message = "$added songs added."
            } catch (error: Exception) { if (error is CancellationException) throw error; message = error.message ?: "Could not import files." }
            finally { busy = false }
        }
    }
    val audioAttacher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && !busy && selected != null) scope.launch {
            busy = true; message = "Adding audio…"; player?.release(); player = null; playing = false; audioPosition = 0; audioDuration = 0
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
                if (item.optBoolean("tempoBandEstimated")) { tags.put("tempo_band", "") }
                item.remove("technical"); item.remove("analysisNote")
                for (field in listOf("duration_seconds", "sample_rate_hz", "channels", "bit_depth", "format")) tags.remove(field)
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
                nativeSandboxSuggestTempoBand(item)
                check(commit(next)) { "Saving audio failed." }; saved = true
                if (oldFile.isNotBlank()) store.audio(oldFile).delete()
                message = "Audio saved. Check BPM and key by ear."
            } catch (error: Exception) { if (error is CancellationException) throw error; message = error.message ?: "Could not add audio." }
            finally { if (!saved && newFile.isNotBlank()) store.audio(newFile).delete(); busy = false }
        }
    }
    val lyricsImporter = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null && !busy && selected != null) scope.launch {
            val targetId = selectedId
            busy = true
            try {
                val text = withContext(Dispatchers.IO) {
                    (context.contentResolver.openInputStream(uri) ?: error("Cannot open lyrics.")).use { readBoundedContent(it, 1024L * 1024).toString(Charsets.UTF_8) }
                }
                check(selectedId == targetId) { "The selected record changed. Import the lyrics again." }
                edit { it.put("lyrics", text) }; message = "Lyrics imported."
            } catch (error: Exception) { if (error is CancellationException) throw error; message = error.message ?: "Could not import lyrics." }
            finally { busy = false }
        }
    }
    val exporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        if (uri != null && !busy) scope.launch {
            busy = true
            try {
                val ids = if (folderId.isBlank()) folders.map { it.optString("id") }.toSet() else sandboxNativeDescendants(folderId, folders)
                val chosen = tracks.filter {
                    it.optString("folder") in ids &&
                        (!trainingExport || (it.optString("audio").isNotBlank() && sandboxNativeReady(it)))
                }
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
    @Composable fun SandboxBottomNavigation() {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            // Keep every label readable at large text sizes or very narrow widths.
            val scrollNavigation = deviceConfiguration.fontScale > 1.15f || maxWidth < 250.dp
            val scroll = rememberScrollState()
            val rowModifier = if (scrollNavigation) Modifier.fillMaxWidth().horizontalScroll(scroll) else Modifier.fillMaxWidth()
            Row(rowModifier, horizontalArrangement = Arrangement.SpaceEvenly) {
                listOf("LayoutDashboard", "Folder", "FilePenLine", "FileCheck").zip(listOf("Overview", "Folders", "Drafts", "Ready to export")).forEachIndexed { index, (icon, label) ->
                    val active = libraryView == index && selectedId.isBlank()
                    val tint = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
                    val itemModifier = if (scrollNavigation) Modifier.widthIn(min = if (index == 3) 112.dp else 76.dp) else Modifier.weight(if (index == 3) 1.55f else 1f)
                    val labelSize = if (!scrollNavigation && deviceConfiguration.screenWidthDp < 360) 10.sp else MaterialTheme.typography.labelSmall.fontSize
                    TextButton(onClick = {
                        player?.release(); player = null; playing = false; audioPosition = 0; audioDuration = 0
                        selectedId = ""; screen = 0; libraryView = index; folderId = ""; page = 0; message = ""
                    }, modifier = itemModifier.heightIn(min = 48.dp), shape = RoundedCornerShape(12.dp), contentPadding = PaddingValues(horizontal = 4.dp, vertical = 2.dp), enabled = !busy,
                        colors = ButtonDefaults.textButtonColors(contentColor = tint, containerColor = if (active) MaterialTheme.colorScheme.surfaceVariant else Color.Transparent)) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            EnVIcon(icon, modifier = Modifier.size(20.dp), tint = tint)
                            Text(label, style = MaterialTheme.typography.labelSmall, fontSize = labelSize, maxLines = 1, softWrap = false, textAlign = TextAlign.Center)
                        }
                    }
                }
            }
        }
    }
    // The editor contains a scroll area, so it must always receive a finite height.
    // Larger text gets extra room and the enclosing tool page can scroll as needed.
    val panelSizing = Modifier.height(if (deviceConfiguration.fontScale > 1.15f) panelHeight + 160.dp else panelHeight)
    Column(Modifier.widthIn(max = 430.dp).fillMaxWidth().then(panelSizing), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (welcome) {
            Spacer(Modifier.weight(1f))
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                EnVLogo(Modifier.width(150.dp).height(80.dp), darkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f, homeHero = true)
                EnVIcon("Headphones", modifier = Modifier.size(42.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("AI Music Data Sandbox.", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                Button(onClick = { welcome = false }) { Text("Enter sandbox") }
            }
            Spacer(Modifier.weight(1f))
        } else if (selected != null) {
            val tags = selected.getJSONObject("tags")
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { player?.release(); player = null; playing = false; audioPosition = 0; audioDuration = 0; selectedId = ""; screen = 0 }, enabled = !busy) { EnVIcon("ArrowLeft", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface); Spacer(Modifier.width(4.dp)); Text("Back") }
                Text(selected.optString("title"), modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (sandboxNativeReady(selected)) "Ready" else "Draft", style = MaterialTheme.typography.labelSmall)
            }
            if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3)
            if (selected.optString("audio").isNotBlank()) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = {
                        try {
                            if (playing) { player?.pause(); playing = false }
                            else {
                                if (player == null) player = MediaPlayer().apply {
                                    setDataSource(store.audio(selected.optString("audio")).absolutePath); prepare()
                                    audioDuration = duration; setOnCompletionListener { seekTo(0); audioPosition = 0; playing = false }
                                }
                                player?.start(); playing = true
                            }
                        } catch (error: Exception) { message = error.message ?: "Cannot play audio." }
                    }) { EnVIcon(if (playing) "Pause" else "Play", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary); Spacer(Modifier.width(4.dp)); Text(if (playing) "Pause" else "Play") }
                    Slider(value = audioPosition.coerceAtMost(audioDuration).toFloat(), onValueChange = { value -> audioPosition = value.toInt(); player?.seekTo(audioPosition) }, valueRange = 0f..audioDuration.coerceAtLeast(1).toFloat(), modifier = Modifier.weight(1f), enabled = player != null)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf("FileAudio" to "Music", "FileText" to "lyrics.txt", "FileJson" to "tags.json").forEachIndexed { index, (icon, label) ->
                    val tint = if (screen == index) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                    TextButton(onClick = { if (selected.has("tagsDraft") && index != 2) message = "Apply or discard the JSON changes before switching sections." else { screen = index; message = "" } }, modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 2.dp), colors = ButtonDefaults.textButtonColors(contentColor = tint)) { EnVIcon(icon, Modifier.size(16.dp), tint = tint); Spacer(Modifier.width(4.dp)); Text(label, maxLines = 1, style = MaterialTheme.typography.labelMedium) }
                }
            }
            @Composable fun Field(label: String, value: String, onValue: (String) -> Unit) {
                var focused by remember(selectedId, label) { mutableStateOf(false) }
                var raw by remember(selectedId, label) { mutableStateOf(value) }
                LaunchedEffect(value, focused) { if (!focused) raw = value }
                OutlinedTextField(value = raw, onValueChange = { raw = it; onValue(it) }, label = { Text(label) }, modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused }, singleLine = true, enabled = !busy)
            }
            Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                when (screen) {
                    0 -> {
                        Field("Title", selected.optString("title")) { edit { item -> item.put("title", it) } }
                        Row { TextButton(onClick = { folderChoicePage = 0; moving = true }) { Text("Move") }; TextButton(onClick = { audioAttacher.launch(arrayOf("audio/*")) }) { Text(if (selected.optString("audio").isEmpty()) "Add audio" else "Replace audio") } }
                        Text("Check estimates by ear.", style = MaterialTheme.typography.labelSmall)
                        Field("Tempo (BPM)", nativeSandboxString(tags, "tempo_bpm")) { editTag("tempo_bpm", it) }
                        Field("Musical key", nativeSandboxString(tags, "key")) { editTag("key", it) }
                        Field("Time signature", nativeSandboxString(tags, "time_signature")) { editTag("time_signature", it) }
                        Field("Duration (seconds)", nativeSandboxString(tags, "duration_seconds")) { value -> edit { it.getJSONObject("tags").put("duration_seconds", value.toDoubleOrNull() ?: JSONObject.NULL) } }
                        Field("Sample rate (Hz)", nativeSandboxString(tags, "sample_rate_hz")) { value -> edit { it.getJSONObject("tags").put("sample_rate_hz", value.toIntOrNull() ?: JSONObject.NULL) } }
                        Field("Channels", nativeSandboxString(tags, "channels")) { value -> edit { it.getJSONObject("tags").put("channels", value.toIntOrNull() ?: JSONObject.NULL) } }
                        Field("Format / codec", nativeSandboxString(tags, "format")) { editTag("format", it) }
                        Field("Bit depth", nativeSandboxString(tags, "bit_depth")) { value -> edit { it.getJSONObject("tags").put("bit_depth", value.toIntOrNull() ?: JSONObject.NULL) } }
                        selected.optJSONObject("technical")?.let { technical -> Text("Peak ${nativeSandboxString(technical, "peak_dbfs")} dBFS · RMS ${nativeSandboxString(technical, "rms_dbfs")} dBFS", style = MaterialTheme.typography.labelSmall) }
                        if (selected.optString("analysisNote").isNotBlank()) Text(selected.optString("analysisNote"), style = MaterialTheme.typography.labelSmall)
                    }
                    1 -> {
                        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = selected.optBoolean("instrumental"), onCheckedChange = { value -> edit { it.put("instrumental", value) } }); Text("This track is instrumental") }
                        OutlinedTextField(value = selected.optString("lyrics"), onValueChange = { value -> edit { it.put("lyrics", value) } }, label = { Text("Lyrics") }, modifier = Modifier.fillMaxWidth().height(200.dp))
                        OutlinedButton(onClick = { lyricsImporter.launch(arrayOf("text/plain")) }) { Text("Import lyrics text") }
                    }
                    else -> {
                        Text("Separate tags with commas.", style = MaterialTheme.typography.labelSmall)
                        if (selected.has("tagsDraft")) Text("Apply or discard the JSON draft before editing fields.", color = MaterialTheme.colorScheme.error)
                        val editable = !selected.has("tagsDraft")
                        listOf("id" to "Record ID · required", "genre" to "Genre · required", "sub_style" to "Sub-style", "language" to "Languages", "tempo_bpm" to "Tempo (BPM)", "key" to "Musical key", "time_signature" to "Time signature", "tempo_band" to "Tempo band", "mood" to "Mood", "theme" to "Theme", "setting" to "Setting", "vocals" to "Voice & delivery", "flow" to "Flow", "instruments" to "Instruments", "standout" to "Standout details", "energy" to "Energy").forEach { (key, label) ->
                            var focused by remember(selectedId, key) { mutableStateOf(false) }
                            var raw by remember(selectedId, key) { mutableStateOf(nativeSandboxString(tags, key)) }
                            val stored = nativeSandboxString(tags, key)
                            LaunchedEffect(stored, focused) { if (!focused) raw = stored }
                            OutlinedTextField(value = raw, onValueChange = { value -> raw = value; editTag(key, value) }, label = { Text(label) }, modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused }, singleLine = true, enabled = editable)
                        }
                        for (i in 0..2) OutlinedTextField(value = tags.optJSONArray("descriptions")?.optString(i) ?: "", onValueChange = { value -> edit { item -> val existing = item.getJSONObject("tags").optJSONArray("descriptions") ?: JSONArray(); val descriptions = JSONArray(); for (index in 0..2) descriptions.put(if (index == i) value else existing.optString(index)); item.getJSONObject("tags").put("descriptions", descriptions) } }, label = { Text("Description ${i + 1}${if (i == 2) " (optional)" else ""}") }, modifier = Modifier.fillMaxWidth(), enabled = editable)
                        Box {
                            OutlinedButton(onClick = { licenseMenu = true }, modifier = Modifier.fillMaxWidth(), enabled = editable) {
                                Text("License: ${tags.optString("license").ifBlank { "Choose" }}", Modifier.weight(1f))
                                EnVIcon("ChevronDown", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            DropdownMenu(expanded = licenseMenu, onDismissRequest = { licenseMenu = false }) {
                                listOf("owned", "written permission", "CC-BY", "royalty-free").forEach { value ->
                                    DropdownMenuItem(text = { Text(value) }, onClick = { editTag("license", value); licenseMenu = false })
                                }
                            }
                        }
                        OutlinedTextField(value = tags.optString("source"), onValueChange = { editTag("source", it) }, label = { Text("Source & permission · required") }, modifier = Modifier.fillMaxWidth(), enabled = editable)
                        Box { OutlinedButton(onClick = { clearanceMenu = true }, enabled = editable) { Text("Clearance: ${selected.optString("clearance", "pending")}") }; DropdownMenu(expanded = clearanceMenu, onDismissRequest = { clearanceMenu = false }) { listOf("pending", "cleared", "not cleared").forEach { value -> DropdownMenuItem(text = { Text(value) }, onClick = { edit { it.put("clearance", value) }; clearanceMenu = false }) } } }
                        TextButton(onClick = { if (!showRawJson) jsonDraft = if (selected.has("tagsDraft")) selected.optString("tagsDraft") else tags.toString(2); showRawJson = !showRawJson }) { Text(if (showRawJson) "Hide advanced JSON" else "Advanced JSON") }
                        if (showRawJson) {
                            OutlinedTextField(value = jsonDraft, onValueChange = { value -> jsonDraft = value; edit { it.put("tagsDraft", value) } }, label = { Text("Tags JSON") }, modifier = Modifier.fillMaxWidth().height(180.dp))
                            Row { TextButton(onClick = { try { require(jsonDraft.toByteArray().size <= 1024 * 1024); val newTags = JSONObject(jsonDraft); validateNativeSandboxTags(newTags); edit { item ->
                                val oldTags = item.getJSONObject("tags")
                                if (nativeSandboxString(newTags, "tempo_bpm") != nativeSandboxString(oldTags, "tempo_bpm")) { item.put("tempoEstimated", false); item.put("tempoEdited", true) }
                                if (nativeSandboxString(newTags, "key") != nativeSandboxString(oldTags, "key")) { item.put("keyEstimated", false); item.put("keyEdited", true) }
                                if (nativeSandboxString(newTags, "tempo_band") != nativeSandboxString(oldTags, "tempo_band")) { item.put("tempoBandEstimated", false); item.put("tempoBandEdited", true) }
                                item.put("tags", newTags); item.remove("tagsDraft")
                            }; message = "Tags saved." } catch (error: Exception) { message = error.message ?: "Invalid tags JSON." } }) { Text("Apply JSON") }; TextButton(onClick = { edit { it.remove("tagsDraft") }; jsonDraft = tags.toString(2); message = "JSON changes discarded." }) { Text("Discard") } }
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { deleting = true }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { EnVIcon("Trash2", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.error); Spacer(Modifier.width(4.dp)); Text("Delete") }
                Button(onClick = { val copy = JSONObject(workspace.toString()); val all = nativeSandboxEntries(copy.getJSONArray("tracks")); val item = all.first { it.optString("id") == selectedId }; item.put("reviewed", true); val id = item.getJSONObject("tags").optString("id"); if (sandboxNativeReady(item) && all.count { it.getJSONObject("tags").optString("id") == id } == 1) { if (commit(copy)) message = "Reviewed and saved." } else message = "Check ID, genre, languages, descriptions, lyrics and permission." }, enabled = !busy && !selected.has("tagsDraft")) { EnVIcon("CircleCheck", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onPrimary); Spacer(Modifier.width(4.dp)); Text("Mark ready") }
            }
            SandboxBottomNavigation()
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                EnVLogo(Modifier.width(48.dp).height(35.dp), darkTheme = MaterialTheme.colorScheme.background.luminance() < 0.5f)
                Text("AI Music Data Sandbox", Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, maxLines = 1)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (folderId.isNotBlank()) TextButton(onClick = { folderId = folder?.optString("parent") ?: ""; page = 0 }) { EnVIcon("ArrowLeft", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface); Spacer(Modifier.width(4.dp)); Text("Back") }
                Text(folder?.optString("name") ?: "Music library", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { importer.launch(arrayOf("audio/*", "application/zip", "application/x-zip-compressed", "application/json", "text/plain")) }, enabled = !busy && storageFailure == null, modifier = Modifier.weight(1f)) { EnVIcon("FileAudio", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onPrimary); Spacer(Modifier.width(5.dp)); Text(if (busy) "Adding…" else "Add music") }
                OutlinedButton(onClick = { folderName = ""; folderLimit = "100"; folderMB = "250"; creatingFolder = true }, enabled = !busy && storageFailure == null) { EnVIcon("FolderPlus", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary); Spacer(Modifier.width(5.dp)); Text("New folder") }
            }
            if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
            val children = if (libraryView <= 1) folders.filter { it.optString("parent") == folderId } else emptyList()
            val visibleTracks = when {
                folderId.isNotBlank() -> tracks.filter { it.optString("folder") == folderId }
                libraryView == 1 -> emptyList()
                libraryView == 2 -> tracks.filterNot(::sandboxNativeReady)
                libraryView == 3 -> tracks.filter(::sandboxNativeReady)
                else -> tracks.filterNot(::sandboxNativeReady)
            }
            val rows = children.map { "folder" to it } + visibleTracks.map { "track" to it }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(if (folderId.isNotBlank()) "Songs & subfolders" else listOf("Folders & drafts", "Folders", "Drafts", "Ready to export")[libraryView], Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
            }
            rows.drop(page * 4).take(4).forEach { (kind, item) ->
                OutlinedButton(onClick = { if (kind == "folder") { folderId = item.optString("id"); page = 0 } else { selectedId = item.optString("id"); screen = 0; message = "" } }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                    EnVIcon(if (kind == "folder") "Folder" else "FileAudio", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(8.dp))
                    Text(if (kind == "folder") item.optString("name") else item.optString("title"), Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    EnVIcon("ChevronRight", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (rows.isEmpty()) Text(if (libraryView == 3) "No ready songs" else "No songs yet", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.weight(1f))
            if (rows.size > 4 || libraryView == 3) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                if (rows.size > 4) {
                    TextButton(onClick = { page = (page - 1).coerceAtLeast(0) }, enabled = page > 0) { Text("Previous") }
                    Text("${page + 1} / ${((rows.size + 3) / 4).coerceAtLeast(1)}", style = MaterialTheme.typography.labelSmall)
                    TextButton(onClick = { page++ }, enabled = (page + 1) * 4 < rows.size) { Text("Next") }
                }
                Spacer(Modifier.weight(1f))
                if (libraryView == 3) OutlinedButton(onClick = { choosingExport = true }, enabled = tracks.isNotEmpty() && !busy) { EnVIcon("ArrowDownToLine", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary); Spacer(Modifier.width(4.dp)); Text("Export") }
            }
            SandboxBottomNavigation()
        }
    }
}
