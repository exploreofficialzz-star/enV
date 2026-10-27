package com.chastech.env

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AudioFile
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.FolderZip
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chastech.env.engine.NativeAudioWavProcessor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.exp
import kotlin.math.log10
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.log2
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

private const val SONG_MAX_TRACKS = 50
private const val SONG_MAX_TRACK_BYTES = 20 * 1024 * 1024
private const val SONG_MAX_BATCH_BYTES = 60 * 1024 * 1024
private const val SONG_MAX_ZIP_BYTES = 30 * 1024 * 1024
private const val SONG_MAX_ZIP_EXPANDED_BYTES = 60 * 1024 * 1024
private const val SONG_ANALYSIS_RATE = 16_000
private const val SONG_MAX_ANALYSIS_SECONDS = 8 * 60

internal data class NativeSongSource(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val uri: Uri? = null,
    val bytes: ByteArray? = null,
    val sizeBytes: Long,
    val status: String = "Queued",
    val report: JSONObject? = null,
    val error: String? = null,
)

private data class NativeDecodedSong(
    val samples: FloatArray,
    val sampleRateHz: Int,
    val sourceRateHz: Int,
    val channels: Int,
    val durationSeconds: Double,
    val codec: String,
    val bitRate: Int?,
)

private data class NativeSongScan(
    val report: JSONObject,
    val decoded: NativeDecodedSong?,
)

@Composable
fun NativeSongMetadataAnalyzerScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var tracks by remember { mutableStateOf(emptyList<NativeSongSource>()) }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var fullAnalysis by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf(0) }
    var notice by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var currentJob by remember { mutableStateOf<Job?>(null) }

    fun update(id: String, change: (NativeSongSource) -> NativeSongSource) {
        tracks = tracks.map { if (it.id == id) change(it) else it }
    }

    fun updateDatasetTag(id: String, key: String, rawValue: String) {
        val tags = rawValue.split(",").map { it.trim() }.filter { it.isNotEmpty() }.take(80)
        update(id) { item ->
            val original = item.report
            if (original == null) item else {
                val report = JSONObject(original.toString())
                val dataset = JSONObject(report.optJSONObject("dataset_analysis")?.toString() ?: "{}")
                val annotations = JSONObject(dataset.optJSONObject("annotations")?.toString() ?: "{}")
                annotations.put(key, JSONArray(tags)).put("reviewed", false)
                dataset.put("annotations", annotations)
                report.put("dataset_analysis", dataset)
                when (key) {
                    "genre" -> report.put("genre", tags.firstOrNull() ?: JSONObject.NULL)
                    "sub_style" -> report.put("sub_style", tags.firstOrNull() ?: JSONObject.NULL)
                    "language" -> report.put("language", JSONArray(tags))
                    "mood" -> report.put("mood", JSONArray(tags))
                    "vocals" -> report.put("vocals", JSONArray(tags))
                    "instruments" -> report.put("instruments", JSONArray(tags))
                    "themes" -> report.put("theme", JSONArray(tags))
                    "listening_scene" -> report.put("setting", JSONArray(tags))
                }
                val analysis = JSONObject(report.optJSONObject("analysis")?.toString() ?: "{}").put("status", "full_local_needs_review")
                report.put("analysis", analysis)
                item.copy(report = report, status = "Partial")
            }
        }
    }

    fun updateDatasetAnnotationText(id: String, key: String, value: String) {
        update(id) { item ->
            val original = item.report
            if (original == null) item else {
                val report = JSONObject(original.toString())
                val dataset = JSONObject(report.optJSONObject("dataset_analysis")?.toString() ?: "{}")
                val annotations = JSONObject(dataset.optJSONObject("annotations")?.toString() ?: "{}")
                annotations.put(key, value).put("reviewed", false)
                dataset.put("annotations", annotations)
                report.put("dataset_analysis", dataset)
                report.put("analysis", JSONObject(report.optJSONObject("analysis")?.toString() ?: "{}").put("status", "full_local_needs_review"))
                item.copy(report = report, status = "Partial")
            }
        }
    }

    fun markDatasetReviewed(id: String, reviewed: Boolean) {
        update(id) { item ->
            val original = item.report
            if (original == null) item else {
                val report = JSONObject(original.toString())
                val dataset = JSONObject(report.optJSONObject("dataset_analysis")?.toString() ?: "{}")
                val annotations = JSONObject(dataset.optJSONObject("annotations")?.toString() ?: "{}").put("reviewed", reviewed)
                dataset.put("annotations", annotations)
                report.put("dataset_analysis", dataset)
                report.put("analysis", JSONObject(report.optJSONObject("analysis")?.toString() ?: "{}")
                    .put("status", if (reviewed) "full_local_reviewed" else "full_local_needs_review"))
                item.copy(report = report, status = if (reviewed) "Done" else "Partial")
            }
        }
    }

    val audioPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) {
            scope.launch {
                busy = true; error = ""; notice = "Adding files…"
                try {
                    val additions = withContext(Dispatchers.IO) { collectUriSources(context, uris) }
                    val combined = tracks + additions
                    val totalBytes = combined.sumOf { it.sizeBytes }
                    require(combined.size <= SONG_MAX_TRACKS) { "Choose up to $SONG_MAX_TRACKS tracks." }
                    require(totalBytes <= SONG_MAX_BATCH_BYTES) { "This batch is too large for safe local processing." }
                    tracks = combined
                    if (selectedId == null) selectedId = additions.firstOrNull()?.id
                    notice = if (additions.isEmpty()) "No supported audio tracks found." else "${additions.size} track${if (additions.size == 1) "" else "s"} added."
                } catch (failure: Throwable) {
                    if (failure is CancellationException) throw failure
                    error = failure.message ?: "Files could not be added."
                    notice = ""
                } finally {
                    busy = false
                }
            }
        }
    }
    val jsonExporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) scope.launch { exportNative(context, uri, tracks, "json") { error = it } }
    }
    val csvExporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri != null) scope.launch { exportNative(context, uri, tracks, "csv") { error = it } }
    }
    val zipExporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        if (uri != null) scope.launch { exportNative(context, uri, tracks, "zip") { error = it } }
    }

    val selected = tracks.firstOrNull { it.id == selectedId } ?: tracks.firstOrNull { it.report != null } ?: tracks.firstOrNull()
    val analyzedCount = tracks.count { it.report != null }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(44.dp)) {
                Icon(Icons.Default.MusicNote, contentDescription = null, modifier = Modifier.padding(10.dp), tint = MaterialTheme.colorScheme.onPrimaryContainer)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("Song Metadata Analyzer", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text("Understand the sound behind each track.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        OutlinedCard {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Default.UploadFile, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Column(Modifier.weight(1f)) {
                        Text("Add songs", fontWeight = FontWeight.SemiBold)
                        Text("Select tracks or a ZIP collection", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Button(
                    onClick = { audioPicker.launch(arrayOf("audio/*", "application/zip", "application/x-zip-compressed")) },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.FolderZip, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Choose files")
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = !fullAnalysis, onClick = { if (!busy) fullAnalysis = false }, label = { Text("Quick Scan") }, enabled = !busy)
                    FilterChip(selected = fullAnalysis, onClick = { if (!busy) fullAnalysis = true }, label = { Text("Full Analysis") }, enabled = !busy)
                }
                if (fullAnalysis) {
                    Text("Full Analysis runs local signal processing only. Genre, language, mood, instruments and vocal labels are entered and reviewed by your team; no audio is sent to an AI service.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Button(
                    onClick = {
                        error = ""; notice = ""; progress = 0; busy = true
                            currentJob = scope.launch {
                                try {
                                    val queue = tracks.toList()
                                    for ((index, item) in queue.withIndex()) {
                                        currentCoroutineContext().ensureActive()
                                        update(item.id) { it.copy(status = "Analyzing", error = null) }
                                        try {
                                            val scan = withContext(Dispatchers.IO) { analyzeNativeSong(context, item, detailed = fullAnalysis) }
                                            var report = scan.report
                                            val annotationReview = report.optJSONObject("dataset_analysis")?.optJSONObject("annotations")?.optBoolean("reviewed", false) == true
                                            val status = if (!fullAnalysis && report.optString("tempo_bpm") != "null") "Done" else if (fullAnalysis && annotationReview && report.optString("tempo_bpm") != "null") "Done" else "Partial"
                                            update(item.id) { it.copy(status = status, report = report, error = null) }
                                            if (report.optJSONArray("warnings")?.length() ?: 0 > 0) notice = "Some results need review."
                                        } catch (failure: Throwable) {
                                            if (failure is CancellationException) throw failure
                                            update(item.id) { it.copy(status = "Failed", error = failure.message ?: "This track could not be analyzed.") }
                                        }
                                        progress = (((index + 1).toFloat() / queue.size.coerceAtLeast(1)) * 100).roundToInt()
                                    }
                                    notice = if (tracks.any { it.status == "Failed" }) "Some tracks could not be read." else "Batch complete."
                                } catch (_: CancellationException) {
                                    notice = "Stopped. Completed results were kept."
                                    tracks.filter { it.status == "Queued" || it.status == "Analyzing" }.forEach { item -> update(item.id) { it.copy(status = "Cancelled") } }
                                } finally {
                                    busy = false; currentJob = null
                                }
                            }
                    },
                    enabled = tracks.isNotEmpty() && !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (busy) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    else Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (busy) "Analyzing locally… $progress%" else if (fullAnalysis) "Run detailed local analysis" else "Scan songs")
                }
                if (busy) {
                    OutlinedButton(onClick = { currentJob?.cancel() }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Default.Pause, contentDescription = null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(8.dp)); Text("Stop")
                    }
                }
                if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                if (notice.isNotEmpty()) Text(notice, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                Text("Local-only processing. No model inference or external AI request.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        OutlinedCard {
            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Batch results", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text("$analyzedCount of ${tracks.size}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (tracks.isEmpty()) {
                    Text("Your songs will appear here.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 20.dp))
                } else {
                    tracks.forEach { item ->
                        Row(
                            modifier = Modifier.fillMaxWidth().background(
                                if (item.id == selected?.id) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface,
                                RoundedCornerShape(10.dp),
                            ).padding(horizontal = 8.dp, vertical = 9.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(if (item.report != null) Icons.Default.CheckCircle else Icons.Default.AudioFile, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                            Column(Modifier.weight(1f)) {
                                Text(item.name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                Text(item.status, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(formatNativeBytes(item.sizeBytes), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            TextButton(onClick = { if (!busy) selectedId = item.id }, enabled = !busy) { Text(if (item.id == selected?.id) "View" else "Open") }
                            if (!busy) TextButton(onClick = { tracks = tracks.filterNot { it.id == item.id }; if (selectedId == item.id) selectedId = null }) { Icon(Icons.Default.Close, contentDescription = "Remove track", modifier = Modifier.size(16.dp)) }
                        }
                    }
                }
                if (analyzedCount > 0) {
                    Divider()
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                        OutlinedButton(onClick = { jsonExporter.launch("song-analysis.json") }, enabled = !busy) { Text("JSON") }
                        OutlinedButton(onClick = { csvExporter.launch("song-analysis.csv") }, enabled = !busy) { Text("CSV") }
                        OutlinedButton(onClick = { zipExporter.launch("song-analysis-report.zip") }, enabled = !busy) { Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text("ZIP report") }
                    }
                }
                Text("Up to 50 tracks · 20 MB each · 60 MB per batch", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        selected?.report?.let { report ->
            OutlinedCard {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(report.optJSONObject("identity")?.optString("title")?.takeIf { it.isNotBlank() && it != "null" } ?: selected.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(report.optJSONObject("identity")?.optString("artist")?.takeIf { it.isNotBlank() && it != "null" } ?: "Unknown artist", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                        nativeMetric("Tempo", report.opt("tempo_bpm")?.takeIf { it != JSONObject.NULL }?.let { "$it BPM" } ?: "—")
                        nativeMetric("Key", report.optString("key").takeIf { it.isNotBlank() && it != "null" } ?: "—")
                        nativeMetric("Energy", report.optString("energy").takeIf { it.isNotBlank() && it != "unknown" } ?: "—")
                    }
                    nativeTagList("STYLE", report.optString("genre"), report.optString("sub_style"), *jsonStringList(report.optJSONArray("language")).toTypedArray())
                    nativeTagList("MOOD", *jsonStringList(report.optJSONArray("mood")).toTypedArray())
                    nativeTagList("THEMES", *jsonStringList(report.optJSONArray("theme")).toTypedArray())
                    nativeTagList("VOCALS", *jsonStringList(report.optJSONArray("vocals")).toTypedArray())
                    nativeTagList("INSTRUMENTS", *jsonStringList(report.optJSONArray("instruments")).toTypedArray())
                    nativeTagList("DESCRIPTIONS", *jsonStringList(report.optJSONArray("descriptions")).toTypedArray())
                    report.optJSONObject("dataset_analysis")?.let { dataset ->
                        NativeSongDatasetDetails(dataset)
                        NativeSongDatasetAnnotationEditor(
                            dataset = dataset,
                            onTagChange = { key, value -> selected?.id?.let { updateDatasetTag(it, key, value) } },
                            onTextChange = { key, value -> selected?.id?.let { updateDatasetAnnotationText(it, key, value) } },
                            onReviewedChange = { reviewed -> selected?.id?.let { markDatasetReviewed(it, reviewed) } },
                        )
                    }
                    if (itemWarnings(report).isNotEmpty()) {
                        Text("Notes", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium)
                        itemWarnings(report).take(5).forEach { Text("• $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
    }
}

private val nativeDatasetAnnotationFields = listOf(
    Triple("genre", "Genre", "Afrobeats, R&B"),
    Triple("sub_style", "Sub-style", "Afro-pop, Amapiano"),
    Triple("style_influences", "Style influences", "Highlife, dancehall, soul"),
    Triple("language", "Language", "Nigerian Pidgin, Yoruba"),
    Triple("energy", "Energy", "Low, medium, high"),
    Triple("mood", "Mood", "Celebratory, soulful"),
    Triple("source_role", "Audio part / stem role", "Full mix, vocals, drums, bass, melody"),
    Triple("vocals", "Vocal content", "Lead vocals, backing vocals, ad-libs"),
    Triple("vocal_delivery", "Vocal delivery", "Melodic singing, rap, chant"),
    Triple("vocal_register", "Vocal pitch / register", "High/low pitch, soprano, alto, tenor, baritone"),
    Triple("vocal_harmony", "Vocal harmony", "Doubles, thirds, call-and-response"),
    Triple("performance_technique", "Performance techniques", "Vibrato, falsetto, melisma"),
    Triple("instruments", "Instruments", "Log drum, shakers, synth bass"),
    Triple("themes", "Themes", "Love, celebration"),
    Triple("listening_scene", "Listening scene", "Club, road trip"),
    Triple("production_traits", "Production traits", "Reverb, saturation, sidechain"),
    Triple("arrangement", "Arrangement", "Intro build, drum drop, instrumental break"),
)

@Composable
private fun NativeSongDatasetDetails(dataset: JSONObject) {
    val technical = dataset.optJSONObject("technical") ?: JSONObject()
    val timbre = dataset.optJSONObject("timbre") ?: JSONObject()
    val pitch = dataset.optJSONObject("pitch") ?: JSONObject()
    val rhythm = dataset.optJSONObject("rhythm") ?: JSONObject()
    val tonality = dataset.optJSONObject("tonality") ?: JSONObject()
    val structure = dataset.optJSONObject("structure") ?: JSONObject()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Local DSP findings", fontWeight = FontWeight.SemiBold)
        Text("Pitch span: ${pitch.optString("lowest_detected_note", "unknown")}–${pitch.optString("highest_detected_note", "unknown")} · Chords: ${tonality.optJSONArray("chord_estimates")?.length() ?: 0} · Transient rate: ${rhythm.opt("transient_density_per_second") ?: "—"}/s", style = MaterialTheme.typography.bodySmall)
        Text("Mean spectral centroid: ${timbre.opt("mean_spectral_centroid_hz") ?: "—"} Hz · Feature changes: ${structure.optJSONArray("change_points")?.length() ?: 0}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        val cueArray = dataset.optJSONArray("style_cues") ?: JSONArray()
        for (index in 0 until min(cueArray.length(), 8)) {
            val cue = cueArray.optJSONObject(index) ?: continue
            Text("${cue.optString("tag")}: ${cue.optString("evidence")}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text("Pitch and chord values are estimates from a mono mix, not verified vocal-only notes. Section cuts are not confirmed verse/chorus labels.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun NativeSongDatasetAnnotationEditor(
    dataset: JSONObject,
    onTagChange: (String, String) -> Unit,
    onTextChange: (String, String) -> Unit,
    onReviewedChange: (Boolean) -> Unit,
) {
    val annotations = dataset.optJSONObject("annotations") ?: JSONObject()
    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Text("Training labels (human-reviewed)", fontWeight = FontWeight.SemiBold)
        Text("Genre, language, vocal type and instrument identity are annotations, not facts inferred by this local DSP pass.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        nativeDatasetAnnotationFields.forEach { (key, label, placeholder) ->
            OutlinedTextField(
                value = jsonStringList(annotations.optJSONArray(key)).joinToString(", "),
                onValueChange = { onTagChange(key, it) },
                label = { Text(label) },
                placeholder = { Text(placeholder) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
        }
        OutlinedTextField(
            value = annotations.optString("notes"),
            onValueChange = { onTextChange("notes", it.take(4000)) },
            label = { Text("Annotation notes") },
            placeholder = { Text("Parts to preserve or replace, uncertainty, review notes") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 2,
            maxLines = 4,
        )
        OutlinedTextField(
            value = annotations.optString("reviewer").takeUnless { it == "null" } ?: "",
            onValueChange = { onTextChange("reviewer", it.take(100)) },
            label = { Text("Reviewer initials / team ID") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = annotations.optBoolean("reviewed", false), onCheckedChange = onReviewedChange)
            Text("Reviewed for training use", style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun collectUriSources(context: Context, uris: List<Uri>): List<NativeSongSource> {
    val result = mutableListOf<NativeSongSource>()
    val seenUris = mutableSetOf<String>()
    var bytesTotal = 0L
    for (uri in uris) {
        val info = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val name = cursor.getString(0) ?: "audio-file"
                val sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE)
                val size = if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) cursor.getLong(sizeColumn) else -1L
                name to size
            } else "audio-file" to -1L
        } ?: ("audio-file" to -1L)
        val name = info.first
        val lower = name.lowercase(Locale.ROOT)
        if (!seenUris.add(uri.toString())) continue
        if (lower.endsWith(".zip")) {
            val zipBytes = (context.contentResolver.openInputStream(uri) ?: error("Cannot open $name.")).use { readBoundedContent(it, SONG_MAX_ZIP_BYTES.toLong()) }
            val extracted = extractNativeSongZip(zipBytes)
            for (entry in extracted) {
                bytesTotal += entry.sizeBytes
                if (bytesTotal > SONG_MAX_BATCH_BYTES) error("Batch exceeds 60 MB.")
                result += entry
                require(result.size <= SONG_MAX_TRACKS) { "Choose up to 50 tracks." }
            }
            continue
        }
        val ext = lower.substringAfterLast('.', "")
        if (ext !in nativeSongExtensions && context.contentResolver.getType(uri)?.startsWith("audio/") != true) continue
        val size = info.second
        require(size != 0L) { "$name is empty." }
        require(size < 0L || size <= SONG_MAX_TRACK_BYTES) { "$name exceeds the 20 MB track limit." }
        require(result.size < SONG_MAX_TRACKS) { "Choose up to 50 tracks." }
        if (size < 0L) {
            // Some document providers omit SIZE. Read bounded bytes now so the batch cap stays real.
            val bytes = (context.contentResolver.openInputStream(uri) ?: error("Cannot open $name.")).use {
                readBoundedContent(it, SONG_MAX_TRACK_BYTES.toLong())
            }
            require(bytes.isNotEmpty()) { "$name is empty." }
            bytesTotal += bytes.size
            require(bytesTotal <= SONG_MAX_BATCH_BYTES) { "Batch exceeds 60 MB." }
            result += NativeSongSource(name = name, bytes = bytes, sizeBytes = bytes.size.toLong())
        } else {
            bytesTotal += size
            require(bytesTotal <= SONG_MAX_BATCH_BYTES) { "Batch exceeds 60 MB." }
            result += NativeSongSource(name = name, uri = uri, sizeBytes = size)
        }
    }
    return result
}

private val nativeSongExtensions = setOf("mp3", "m4a", "aac", "wav", "flac", "ogg", "oga", "opus", "aiff", "aif", "3gp", "mp4", "amr", "webm")

internal fun extractNativeSongZip(bytes: ByteArray): List<NativeSongSource> {
    require(bytes.size >= 22 && bytes.size <= SONG_MAX_ZIP_BYTES) { "ZIP must be between 22 bytes and 30 MB." }
    fun u16(offset: Int): Int {
        require(offset >= 0 && offset + 2 <= bytes.size) { "ZIP directory is damaged." }
        return (bytes[offset].toInt() and 0xff) or ((bytes[offset + 1].toInt() and 0xff) shl 8)
    }
    fun u32(offset: Int): Long {
        require(offset >= 0 && offset + 4 <= bytes.size) { "ZIP directory is damaged." }
        return (bytes[offset].toLong() and 0xffL) or
            ((bytes[offset + 1].toLong() and 0xffL) shl 8) or
            ((bytes[offset + 2].toLong() and 0xffL) shl 16) or
            ((bytes[offset + 3].toLong() and 0xffL) shl 24)
    }

    val searchStart = max(0, bytes.size - 22 - 65_535)
    var endRecord = -1
    for (offset in (bytes.size - 22 downTo searchStart)) {
        if (u32(offset) == 0x06054b50L && offset + 22 + u16(offset + 20) == bytes.size) {
            endRecord = offset
            break
        }
    }
    require(endRecord >= 0) { "This file is not a valid ZIP archive." }
    require(u16(endRecord + 4) == 0 && u16(endRecord + 6) == 0) { "Split ZIP archives are not supported." }
    val entriesOnDisk = u16(endRecord + 8)
    val entryCount = u16(endRecord + 10)
    val directorySize = u32(endRecord + 12)
    val directoryOffset = u32(endRecord + 16)
    require(entriesOnDisk == entryCount) { "ZIP directory counts do not match." }
    require(entryCount <= 500 && directorySize != 0xffffffffL && directoryOffset != 0xffffffffL &&
        directoryOffset + directorySize <= endRecord.toLong()) {
        "ZIP contains too many entries or an invalid directory."
    }
    val directoryStart = directoryOffset.toInt()
    val directoryEnd = (directoryOffset + directorySize).toInt()
    var cursor = directoryStart
    var expandedBytes = 0L
    val seenNames = mutableSetOf<String>()
    val localRanges = mutableListOf<Pair<Int, Int>>()
    val results = mutableListOf<NativeSongSource>()
    val utf8 = Charsets.UTF_8
    val legacy = java.nio.charset.Charset.forName("windows-1252")

    for (index in 0 until entryCount) {
        require(u32(cursor) == 0x02014b50L) { "ZIP central directory entry is damaged." }
        val madeBy = u16(cursor + 4)
        val flags = u16(cursor + 8)
        val method = u16(cursor + 10)
        val crcExpected = u32(cursor + 16)
        val compressedLong = u32(cursor + 20)
        val uncompressedLong = u32(cursor + 24)
        val nameLength = u16(cursor + 28)
        val extraLength = u16(cursor + 30)
        val commentLength = u16(cursor + 32)
        val externalAttributes = u32(cursor + 38)
        val localOffsetLong = u32(cursor + 42)
        val nameStart = cursor + 46
        val next = nameStart.toLong() + nameLength + extraLength + commentLength
        require(next <= directoryEnd.toLong()) { "ZIP central directory entry is truncated." }
        require(flags and 0x41 == 0) { "Encrypted ZIP entries are not supported." }
        require(method == 0 || method == 8) { "Only stored and deflate-compressed ZIP entries are supported." }
        require(compressedLong != 0xffffffffL && uncompressedLong != 0xffffffffL && localOffsetLong != 0xffffffffL) {
            "ZIP64 archives are not supported by this analyzer."
        }
        require(compressedLong <= bytes.size && uncompressedLong <= SONG_MAX_ZIP_EXPANDED_BYTES &&
            localOffsetLong < directoryOffset) { "ZIP entry size or offset is invalid." }
        val compressedSize = compressedLong.toInt()
        val uncompressedSize = uncompressedLong.toInt()
        val localOffset = localOffsetLong.toInt()
        val nameBytes = bytes.copyOfRange(nameStart, nameStart + nameLength)
        val decodedName = String(nameBytes, if (flags and 0x0800 != 0) utf8 else legacy)
        val name = decodedName.replace('\\', '/')
        require(name.isNotBlank() && name.toByteArray(utf8).size <= 1024 &&
            !name.startsWith("/") && !Regex("^[A-Za-z]:").containsMatchIn(name) &&
            !name.split('/').any { it == ".." || it == "." } &&
            name.none { it.code < 32 || it.code == 127 }) { "ZIP contains an unsafe path." }
        require(seenNames.add(name)) { "ZIP contains duplicate paths." }
        val unixMode = (externalAttributes ushr 16).toInt()
        require(!((madeBy ushr 8) == 3 && (unixMode and 0xf000) == 0xa000)) { "ZIP symbolic links are not supported." }

        require(localOffset + 30 <= directoryStart && u32(localOffset) == 0x04034b50L) {
            "ZIP local file header is damaged."
        }
        val localFlags = u16(localOffset + 6)
        val localMethod = u16(localOffset + 8)
        val localNameLength = u16(localOffset + 26)
        val localExtraLength = u16(localOffset + 28)
        val localNameStart = localOffset + 30
        val payloadStartLong = localNameStart.toLong() + localNameLength + localExtraLength
        val payloadEndLong = payloadStartLong + compressedSize
        require(localFlags == flags && localMethod == method &&
            payloadStartLong <= directoryOffset && payloadEndLong <= directoryOffset &&
            payloadEndLong >= payloadStartLong) { "ZIP entry payload is outside archive bounds." }
        val payloadStart = payloadStartLong.toInt()
        val payloadEnd = payloadEndLong.toInt()
        val localNameEnd = localNameStart + localNameLength
        require(localNameEnd <= directoryStart && bytes.copyOfRange(localNameStart, localNameEnd).contentEquals(nameBytes)) {
            "ZIP local and central filenames do not match."
        }
        localRanges += localOffset to payloadEnd
        cursor = next.toInt()

        val isDirectory = name.endsWith("/")
        if (isDirectory) continue
        require(uncompressedSize <= SONG_MAX_TRACK_BYTES) { "A ZIP entry exceeds 20 MB." }
        expandedBytes += uncompressedSize
        require(expandedBytes <= SONG_MAX_ZIP_EXPANDED_BYTES) { "ZIP expands beyond 60 MB." }
        if (uncompressedSize > 1024 * 1024 && compressedSize > 0 &&
            uncompressedSize.toDouble() / compressedSize > 250.0) {
            throw IllegalArgumentException("ZIP contains an unusually high compression ratio.")
        }
        require(uncompressedSize == 0 || compressedSize > 0) { "ZIP entry has an invalid zero-size payload." }

        val extension = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
        if (extension !in nativeSongExtensions) continue
        require(uncompressedSize > 0) { "ZIP contains an empty audio track." }
        val compressed = bytes.copyOfRange(payloadStart, payloadEnd)
        val decoded = when (method) {
            0 -> {
                require(compressed.size == uncompressedSize) { "Stored ZIP entry length does not match." }
                compressed
            }
            8 -> inflateNativeSongEntry(compressed, uncompressedSize)
            else -> error("Unsupported ZIP compression.")
        }
        val crc = java.util.zip.CRC32().apply { update(decoded) }.value
        require(crc == crcExpected) { "ZIP entry checksum failed." }
        val displayName = name.split('/').filter { it.isNotBlank() }.joinToString(" — ")
        results += NativeSongSource(name = displayName, bytes = decoded, sizeBytes = decoded.size.toLong())
        require(results.size <= SONG_MAX_TRACKS) { "ZIP contains more than 50 audio tracks." }
    }
    require(cursor == directoryEnd) { "ZIP directory has unexpected trailing data." }
    localRanges.sortBy { it.first }
    for (index in 1 until localRanges.size) {
        require(localRanges[index].first >= localRanges[index - 1].second) { "ZIP entries overlap each other." }
    }
    return results
}

private fun inflateNativeSongEntry(compressed: ByteArray, expectedSize: Int): ByteArray {
    require(expectedSize in 1..SONG_MAX_TRACK_BYTES) { "Compressed ZIP entry has an invalid uncompressed size." }
    val inflater = java.util.zip.Inflater(true)
    try {
        inflater.setInput(compressed)
        val output = ByteArray(expectedSize)
        var offset = 0
        while (!inflater.finished() && offset < output.size) {
            val count = try {
                inflater.inflate(output, offset, output.size - offset)
            } catch (failure: java.util.zip.DataFormatException) {
                throw IllegalArgumentException("ZIP deflate stream is damaged.", failure)
            }
            if (count == 0) {
                if (inflater.needsInput() || inflater.needsDictionary()) break
                throw IllegalArgumentException("ZIP deflate stream made no progress.")
            }
            offset += count
        }
        require(inflater.finished() && offset == expectedSize && inflater.remaining == 0) {
            "ZIP deflate output size does not match its directory."
        }
        return output
    } finally {
        inflater.end()
    }
}

private fun readBoundedContent(input: InputStream, limit: Long): ByteArray {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(16 * 1024)
    var total = 0L
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        total += count
        require(total <= limit) { "File exceeds the safe local processing limit." }
        output.write(buffer, 0, count)
    }
    return output.toByteArray()
}

private fun readCurrentEntryBounded(input: InputStream, limit: Long): ByteArray =
    readBoundedContent(input, limit)

private suspend fun analyzeNativeSong(context: Context, item: NativeSongSource, detailed: Boolean = false): NativeSongScan {
    val bytes = item.bytes ?: withContext(Dispatchers.IO) {
        val stream = item.uri?.let { context.contentResolver.openInputStream(it) } ?: error("Cannot open ${item.name}.")
        stream.use { readBoundedContent(it, SONG_MAX_TRACK_BYTES.toLong()) }
    }
    require(item.sizeBytes <= 0L || item.sizeBytes == bytes.size.toLong()) { "File size changed after import. Add the track again." }
    require(bytes.isNotEmpty()) { "This file is empty." }
    require(bytes.size <= SONG_MAX_TRACK_BYTES) { "This track exceeds 20 MB." }
    val temp = File.createTempFile("env-song-", ".audio", context.cacheDir)
    try {
        withContext(Dispatchers.IO) { FileOutputStream(temp).use { it.write(bytes) } }
        val meta = readNativeMetadata(temp)
        val decoded = withContext(Dispatchers.IO) { decodeNativeSong(temp, meta.optDouble("duration_seconds", 0.0)) }
        val warnings = JSONArray()
        val tempo = decoded?.let { NativeSongSignalAnalysis.estimateBpm(it.samples, it.sampleRateHz) }
        val key = decoded?.let { NativeSongSignalAnalysis.estimateKey(it.samples, it.sampleRateHz) }
        val datasetAnalysis = if (detailed && decoded != null) NativeSongSignalAnalysis.analyzeDataset(decoded.samples, decoded.sampleRateHz) else null
        if (decoded == null) warnings.put("This audio format could not be decoded on this device.")
        if (tempo == null) warnings.put("Tempo could not be estimated reliably.")
        if (key == null) warnings.put("Musical key could not be estimated reliably.")
        val peak = decoded?.samples?.maxOfOrNull { abs(it) }
        val squareSum = decoded?.samples?.sumOf { it.toDouble() * it } ?: 0.0
        val rms = decoded?.samples?.takeIf { it.isNotEmpty() }?.let { sqrt(squareSum / it.size) }
        val bpmTag = meta.optString("embedded_bpm").toDoubleOrNull()
        val tempoFinal = tempo ?: bpmTag?.takeIf { it in 1.0..300.0 }?.roundToInt()
        val ext = item.name.substringAfterLast('.', "").lowercase(Locale.ROOT)
        val technical = JSONObject()
            .put("container", meta.optString("container").takeIf { it.isNotBlank() } ?: JSONObject.NULL)
            .put("codec", decoded?.codec ?: meta.optString("codec").ifBlank { JSONObject.NULL })
            .put("extension", ext)
            .put("mime_type", meta.optString("mime_type"))
            .put("duration_seconds", decoded?.durationSeconds ?: meta.opt("duration_seconds"))
            .put("file_size_bytes", bytes.size)
            .put("bitrate_bps", decoded?.bitRate ?: meta.opt("bitrate_bps"))
            .put("sample_rate_hz", decoded?.sourceRateHz ?: JSONObject.NULL)
            .put("analysis_sample_rate_hz", decoded?.sampleRateHz ?: JSONObject.NULL)
            .put("channels", decoded?.channels ?: JSONObject.NULL)
            .put("peak_dbfs", peak?.takeIf { it > 0f }?.let { 20.0 * kotlin.math.log10(it.toDouble()) } ?: JSONObject.NULL)
            .put("rms_dbfs", rms?.takeIf { it > 0.0 }?.let { 20.0 * kotlin.math.log10(it) } ?: JSONObject.NULL)
        val identity = JSONObject()
            .put("title", meta.optString("title").takeIf { it.isNotBlank() } ?: JSONObject.NULL)
            .put("artist", meta.optString("artist").takeIf { it.isNotBlank() } ?: JSONObject.NULL)
            .put("album", meta.optString("album").takeIf { it.isNotBlank() } ?: JSONObject.NULL)
            .put("album_artist", meta.optString("album_artist").takeIf { it.isNotBlank() } ?: JSONObject.NULL)
            .put("release_date", meta.optString("year").takeIf { it.isNotBlank() } ?: JSONObject.NULL)
            .put("artwork_available", meta.optBoolean("artwork_available", false))
        val report = JSONObject()
            .put("schema_version", "1.1")
            .put("filename", item.name)
            .put("genre", meta.optString("genre").takeIf { it.isNotBlank() } ?: JSONObject.NULL)
            .put("sub_style", JSONObject.NULL)
            .put("language", JSONArray())
            .put("tempo_bpm", tempoFinal ?: JSONObject.NULL)
            .put("tempo_band", tempoFinal?.let(::nativeTempoBand) ?: "unknown")
            .put("tempo_source", if (tempo != null) "audio_estimate" else if (bpmTag != null) "embedded_tag" else JSONObject.NULL)
            .put("key", key ?: JSONObject.NULL)
            .put("energy", "unknown")
            .put("mood", JSONArray())
            .put("theme", JSONArray())
            .put("setting", JSONArray())
            .put("vocals", JSONArray())
            .put("instruments", JSONArray())
            .put("descriptions", JSONArray())
            .put("lyric_evidence", "")
            .put("identity", identity)
            .put("technical", technical)
            .put("embedded_metadata", meta)
            .put("analysis", JSONObject().put("status", if (datasetAnalysis != null) "full_local_needs_review" else "quick_local").put("local_audio_decoded", decoded != null)
                .put("semantic_analysis", "not_run_local_only").put("uses_remote_api", false).put("uses_hosted_model", false)
                .put("key_source", if (key != null) "audio_estimate" else "unavailable"))
            .put("warnings", warnings)
        if (datasetAnalysis != null) report.put("dataset_analysis", datasetAnalysis)
        return NativeSongScan(report, decoded)
    } finally {
        temp.delete()
    }
}

private fun readNativeMetadata(file: File): JSONObject {
    val meta = JSONObject()
    val retriever = MediaMetadataRetriever()
    try {
        retriever.setDataSource(file.absolutePath)
        fun text(key: Int): String? = retriever.extractMetadata(key)?.trim()?.takeIf { it.isNotEmpty() }
        val duration = text(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.div(1000.0)
        val mime = text(MediaMetadataRetriever.METADATA_KEY_MIMETYPE)?.lowercase(Locale.ROOT)
        val bitRate = text(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toIntOrNull()
        val extension = file.extension.lowercase(Locale.ROOT)
        val resolvedMime = mime ?: mimeFromExtension(extension)
        val container = nativeAudioContainer(extension, mime)
        val codec = nativeAudioCodec(extension, mime)
        val artworkAvailable = runCatching { retriever.embeddedPicture?.isNotEmpty() == true }.getOrDefault(false)
        meta.put("title", text(MediaMetadataRetriever.METADATA_KEY_TITLE) ?: JSONObject.NULL)
            .put("artist", text(MediaMetadataRetriever.METADATA_KEY_ARTIST) ?: JSONObject.NULL)
            .put("album", text(MediaMetadataRetriever.METADATA_KEY_ALBUM) ?: JSONObject.NULL)
            .put("album_artist", text(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST) ?: JSONObject.NULL)
            .put("year", text(MediaMetadataRetriever.METADATA_KEY_YEAR) ?: JSONObject.NULL)
            .put("genre", text(MediaMetadataRetriever.METADATA_KEY_GENRE) ?: JSONObject.NULL)
            .put("embedded_bpm", JSONObject.NULL)
            .put("track_number", text(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER) ?: JSONObject.NULL)
            .put("disc_number", JSONObject.NULL)
            .put("composer", text(MediaMetadataRetriever.METADATA_KEY_COMPOSER) ?: JSONObject.NULL)
            .put("publisher", JSONObject.NULL)
            .put("copyright", JSONObject.NULL)
            .put("comment", JSONObject.NULL)
            .put("artwork_available", artworkAvailable)
            .put("container", container ?: JSONObject.NULL)
            .put("codec", codec ?: JSONObject.NULL)
            .put("mime_type", resolvedMime)
            .put("duration_seconds", duration ?: JSONObject.NULL)
            .put("bitrate_bps", bitRate ?: JSONObject.NULL)
    } finally {
        retriever.release()
    }
    return meta
}

private fun nativeAudioContainer(extension: String, mime: String?): String? {
    return when {
        extension == "mp3" || mime == "audio/mpeg" -> "MPEG Audio"
        extension == "wav" || mime == "audio/wav" || mime == "audio/x-wav" -> "WAVE"
        extension == "flac" || mime == "audio/flac" -> "FLAC"
        extension in setOf("m4a", "mp4", "3gp") || mime?.contains("mp4") == true || mime?.contains("3gpp") == true -> "ISO Base Media / MP4"
        extension in setOf("ogg", "oga", "opus") || mime?.contains("ogg") == true -> "Ogg"
        extension in setOf("aif", "aiff") || mime == "audio/aiff" -> "AIFF"
        extension == "webm" || mime == "audio/webm" -> "WebM / Matroska"
        extension == "amr" || mime == "audio/amr" -> "AMR"
        else -> null
    }
}

private fun nativeAudioCodec(extension: String, mime: String?): String? {
    return when {
        mime == "audio/mpeg" || extension == "mp3" -> "MPEG Audio"
        mime == "audio/flac" || extension == "flac" -> "FLAC"
        mime == "audio/opus" || extension == "opus" -> "Opus"
        mime == "audio/aiff" || extension in setOf("aif", "aiff") -> "AIFF audio"
        mime == "audio/wav" || mime == "audio/x-wav" || extension == "wav" -> "WAVE audio (PCM encoding not confirmed)"
        mime == "audio/ogg" || extension in setOf("ogg", "oga") -> "Ogg audio (Vorbis/Opus not confirmed)"
        mime == "audio/aac" || extension == "aac" -> "AAC"
        mime == "audio/amr" || extension == "amr" -> "AMR"
        else -> null
    }
}

private fun mimeFromExtension(extension: String): String = when (extension.lowercase(Locale.ROOT)) {
    "mp3" -> "audio/mpeg"; "wav" -> "audio/wav"; "flac" -> "audio/flac"; "m4a", "mp4" -> "audio/mp4"
    "ogg", "oga" -> "audio/ogg"; "opus" -> "audio/opus"; "aac" -> "audio/aac"; else -> "application/octet-stream"
}

private suspend fun decodeNativeSong(file: File, metadataDuration: Double): NativeDecodedSong? {
    val extractor = MediaExtractor()
    var decoder: MediaCodec? = null
    try {
        extractor.setDataSource(file.absolutePath)
        val trackIndex = (0 until extractor.trackCount).firstOrNull { index ->
            extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
        } ?: return null
        val format = extractor.getTrackFormat(trackIndex)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: return null
        val originalRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val sourceChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceIn(1, 8)
        val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else (metadataDuration * 1_000_000).toLong()
        if (durationUs > SONG_MAX_ANALYSIS_SECONDS * 1_000_000L) {
            // Deliberately bound decoded analysis memory; header duration stays available in metadata.
            return null
        }
        extractor.selectTrack(trackIndex)
        decoder = MediaCodec.createDecoderByType(mime)
        decoder.configure(format, null, null, 0)
        decoder.start()
        val info = MediaCodec.BufferInfo()
        val samples = FloatArray(SONG_ANALYSIS_RATE * SONG_MAX_ANALYSIS_SECONDS)
        var count = 0
        var sourceFrameIndex = 0L
        var nextTargetFrame = 0.0
        var sourceRate = originalRate
        var channels = sourceChannels
        var pcmEncoding = AudioFormat.ENCODING_PCM_16BIT
        var inputDone = false
        var outputDone = false
        var idleLoops = 0
        while (!outputDone && idleLoops < 1000) {
            currentCoroutineContext().ensureActive()
            if (!inputDone) {
                val inputIndex = decoder.dequeueInputBuffer(10_000)
                if (inputIndex >= 0) {
                    val inputBuffer = decoder.getInputBuffer(inputIndex) ?: error("Audio decoder input buffer is unavailable.")
                    inputBuffer.clear()
                    val size = extractor.readSampleData(inputBuffer, 0)
                    if (size < 0) {
                        decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        inputDone = true
                    } else {
                        decoder.queueInputBuffer(inputIndex, 0, size, extractor.sampleTime.coerceAtLeast(0), 0)
                        extractor.advance()
                    }
                }
            }
            when (val outputIndex = decoder.dequeueOutputBuffer(info, 10_000)) {
                MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    val outFormat = decoder.outputFormat
                    sourceRate = outFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    channels = outFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceIn(1, 8)
                    pcmEncoding = if (outFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) outFormat.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
                }
                MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (inputDone) idleLoops++ else idleLoops = 0
                }
                else -> if (outputIndex >= 0) {
                    val output = decoder.getOutputBuffer(outputIndex)
                    if (output != null && info.size > 0) {
                        val buffer = output.duplicate().order(ByteOrder.LITTLE_ENDIAN)
                        buffer.position(info.offset)
                        buffer.limit(info.offset + info.size)
                        val floatPcm = pcmEncoding == AudioFormat.ENCODING_PCM_FLOAT
                        val bytesPerSample = if (floatPcm) 4 else 2
                        val frameBytes = bytesPerSample * channels
                        while (buffer.remaining() >= frameBytes && count < samples.size) {
                            var mono = 0.0
                            repeat(channels) {
                                val sample = if (floatPcm) buffer.float.toDouble() else buffer.short.toDouble() / 32768.0
                                mono += sample
                            }
                            mono /= channels
                            if (sourceFrameIndex.toDouble() >= nextTargetFrame) {
                                samples[count++] = mono.toFloat().coerceIn(-1f, 1f)
                                nextTargetFrame += sourceRate.toDouble() / SONG_ANALYSIS_RATE
                            }
                            sourceFrameIndex++
                        }
                    }
                    if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outputDone = true
                    decoder.releaseOutputBuffer(outputIndex, false)
                    idleLoops = 0
                }
            }
            if (count >= samples.size) outputDone = true
        }
        if (count < SONG_ANALYSIS_RATE) return null
        return NativeDecodedSong(samples.copyOf(count), SONG_ANALYSIS_RATE, originalRate, sourceChannels,
            count.toDouble() / SONG_ANALYSIS_RATE, mime, if (format.containsKey(MediaFormat.KEY_BIT_RATE)) format.getInteger(MediaFormat.KEY_BIT_RATE) else null)
    } catch (failure: Throwable) {
        if (failure is CancellationException) throw failure
        return null
    } finally {
        runCatching { decoder?.stop() }; runCatching { decoder?.release() }; extractor.release()
    }
}

private fun nativeTempoBand(bpm: Int): String = when {
    bpm < 80 -> "slow"; bpm < 110 -> "mid"; bpm < 130 -> "upbeat"; else -> "fast"
}
private fun formatNativeBytes(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> String.format(Locale.US, "%.1f KB", bytes / 1024.0)
    else -> String.format(Locale.US, "%.1f MB", bytes / (1024.0 * 1024.0))
}
private fun jsonStringList(array: JSONArray?): List<String> = array?.let { values -> (0 until values.length()).mapNotNull { values.optString(it).takeIf(String::isNotBlank) } } ?: emptyList()
private fun itemWarnings(report: JSONObject): List<String> = jsonStringList(report.optJSONArray("warnings"))
@Composable
private fun nativeMetric(label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("$label:", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
    }
}
@Composable
private fun nativeTagList(label: String, vararg values: String) {
    val actual = values.filter { it.isNotBlank() && it != "null" && it != "unknown" }
    if (actual.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
            Text(actual.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
        }
    }
}

private suspend fun exportNative(context: Context, uri: Uri, tracks: List<NativeSongSource>, kind: String, setError: (String) -> Unit) {
    val reports = tracks.filter { it.report != null }.map { it.report!! }
    val outBytes = withContext(Dispatchers.IO) {
        when (kind) {
            "json" -> JSONObject().put("schema_version", "env.song-analysis-export.v2").put("tracks", JSONArray().also { array -> reports.forEach(array::put) }).toString(2).toByteArray()
            "csv" -> nativeReportsCsv(reports).toByteArray(Charsets.UTF_8)
            else -> {
                val buffer = ByteArrayOutputStream()
                ZipOutputStream(buffer).use { zip ->
                    val json = JSONObject().put("schema_version", "1.0").put("tracks", JSONArray().also { array -> reports.forEach(array::put) }).toString(2).toByteArray()
                    zip.putNextEntry(ZipEntry("song-analysis.json")); zip.write(json); zip.closeEntry()
                    zip.putNextEntry(ZipEntry("song-analysis.csv")); zip.write(nativeReportsCsv(reports).toByteArray()); zip.closeEntry()
                    val failures = tracks.filter { it.error != null }.map { JSONObject().put("filename", it.name).put("error", it.error) }
                    zip.putNextEntry(ZipEntry("processing-issues.json")); zip.write(JSONArray(failures).toString(2).toByteArray()); zip.closeEntry()
                }
                buffer.toByteArray()
            }
        }
    }
    try {
        withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { it.write(outBytes) } ?: error("Cannot create export file.") }
    } catch (failure: Throwable) { setError(failure.message ?: "Could not export report.") }
}

private fun nativeReportsCsv(reports: List<JSONObject>): String {
    val columns = listOf(
        "filename", "title", "artist", "album", "genre", "sub_style", "style_influences", "language",
        "tempo_bpm", "tempo_band", "key", "energy", "mood", "theme", "setting", "source_role",
        "vocals", "vocal_delivery", "vocal_register", "vocal_harmony", "performance_technique", "instruments",
        "production_traits", "arrangement", "duration_seconds", "file_size_bytes", "codec", "sample_rate_hz", "channels",
        "pitch_lowest_note", "pitch_highest_note", "pitch_range_semitones", "transient_density_per_second",
        "spectral_centroid_mean_hz", "low_energy_ratio_mean", "mid_energy_ratio_mean", "high_energy_ratio_mean",
        "chord_estimates", "section_boundaries", "labels_reviewed", "reviewer", "annotation_notes",
        "uses_remote_api", "uses_hosted_model", "analysis_status", "warnings"
    )
    fun cell(value: Any?): String {
        var text = when (value) {
            null, JSONObject.NULL -> ""
            is JSONArray -> (0 until value.length()).joinToString("; ") { value.optString(it) }
            is JSONObject -> value.toString()
            else -> value.toString()
        }
        if (text.trimStart().startsWith("=") || text.trimStart().startsWith("+") || text.trimStart().startsWith("@") || text.trimStart().matches(Regex("-[0-9].*"))) text = "'$text"
        return "\"" + text.replace("\"", "\"\"") + "\""
    }
    return (listOf(columns.joinToString(",") { cell(it) }) + reports.map { report ->
        val identity = report.optJSONObject("identity") ?: JSONObject()
        val technical = report.optJSONObject("technical") ?: JSONObject()
        val analysis = report.optJSONObject("analysis") ?: JSONObject()
        val dataset = report.optJSONObject("dataset_analysis") ?: JSONObject()
        val annotations = dataset.optJSONObject("annotations") ?: JSONObject()
        val pitch = dataset.optJSONObject("pitch") ?: JSONObject()
        val rhythm = dataset.optJSONObject("rhythm") ?: JSONObject()
        val tonality = dataset.optJSONObject("tonality") ?: JSONObject()
        val timbre = dataset.optJSONObject("timbre") ?: JSONObject()
        val structure = dataset.optJSONObject("structure") ?: JSONObject()
        val chordText = (tonality.optJSONArray("chord_estimates") ?: JSONArray()).let { values ->
            (0 until values.length()).joinToString(" | ") { index ->
                val item = values.optJSONObject(index) ?: JSONObject()
                "${item.opt("start_seconds") ?: "?"}-${item.opt("end_seconds") ?: "?"}s:${item.opt("chord")?.takeUnless { it == JSONObject.NULL } ?: "unknown"}"
            }
        }
        val sectionText = (structure.optJSONArray("change_points") ?: JSONArray()).let { values ->
            (0 until values.length()).joinToString(" | ") { index ->
                val item = values.optJSONObject(index) ?: JSONObject()
                "${item.opt("time_seconds") ?: "?"}s(${item.opt("change_score") ?: "?"})"
            }
        }
        val processing = dataset.optJSONObject("processing") ?: JSONObject()
        val row = JSONObject()
            .put("filename", report.optString("filename"))
            .put("title", identity.opt("title"))
            .put("artist", identity.opt("artist"))
            .put("album", identity.opt("album"))
            .put("genre", report.opt("genre"))
            .put("sub_style", report.opt("sub_style"))
            .put("style_influences", annotations.optJSONArray("style_influences"))
            .put("language", report.optJSONArray("language"))
            .put("tempo_bpm", report.opt("tempo_bpm"))
            .put("tempo_band", report.optString("tempo_band"))
            .put("key", report.opt("key"))
            .put("energy", annotations.optJSONArray("energy") ?: report.opt("energy"))
            .put("mood", report.optJSONArray("mood"))
            .put("theme", report.optJSONArray("theme"))
            .put("setting", report.optJSONArray("setting"))
            .put("source_role", annotations.optJSONArray("source_role"))
            .put("vocals", report.optJSONArray("vocals"))
            .put("vocal_delivery", annotations.optJSONArray("vocal_delivery"))
            .put("vocal_register", annotations.optJSONArray("vocal_register"))
            .put("vocal_harmony", annotations.optJSONArray("vocal_harmony"))
            .put("performance_technique", annotations.optJSONArray("performance_technique"))
            .put("instruments", report.optJSONArray("instruments"))
            .put("production_traits", annotations.optJSONArray("production_traits"))
            .put("arrangement", annotations.optJSONArray("arrangement"))
            .put("duration_seconds", technical.opt("duration_seconds"))
            .put("file_size_bytes", technical.opt("file_size_bytes"))
            .put("codec", technical.opt("codec"))
            .put("sample_rate_hz", technical.opt("sample_rate_hz"))
            .put("channels", technical.opt("channels"))
            .put("pitch_lowest_note", pitch.opt("lowest_detected_note"))
            .put("pitch_highest_note", pitch.opt("highest_detected_note"))
            .put("pitch_range_semitones", pitch.opt("pitch_range_semitones"))
            .put("transient_density_per_second", rhythm.opt("transient_density_per_second"))
            .put("spectral_centroid_mean_hz", timbre.opt("mean_spectral_centroid_hz"))
            .put("low_energy_ratio_mean", timbre.opt("mean_low_frequency_energy_ratio"))
            .put("mid_energy_ratio_mean", timbre.opt("mean_mid_frequency_energy_ratio"))
            .put("high_energy_ratio_mean", timbre.opt("mean_high_frequency_energy_ratio"))
            .put("chord_estimates", chordText)
            .put("section_boundaries", sectionText)
            .put("labels_reviewed", annotations.optBoolean("reviewed", false))
            .put("reviewer", annotations.opt("reviewer"))
            .put("annotation_notes", annotations.optString("notes"))
            .put("uses_remote_api", processing.optBoolean("uses_remote_api", false))
            .put("uses_hosted_model", processing.optBoolean("uses_hosted_model", false))
            .put("analysis_status", analysis.optString("status"))
            .put("warnings", report.optJSONArray("warnings"))
        columns.joinToString(",") { column -> cell(row.opt(column)) }
    }).joinToString("\r\n")
}

private object NativeSongSignalAnalysis {
    private val keyNames = listOf("C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B")
    private val majorProfile = doubleArrayOf(6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
    private val minorProfile = doubleArrayOf(6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)

    fun estimateBpm(samples: FloatArray, sampleRate: Int): Int? {
        if (samples.size < sampleRate * 3 || sampleRate <= 0) return null
        val hop = max(1, sampleRate / 100)
        val envelope = DoubleArray(samples.size / hop)
        for (frame in envelope.indices) {
            var energy = 0.0
            val start = frame * hop
            val end = min(samples.size, start + hop)
            for (i in start until end) energy += samples[i] * samples[i]
            envelope[frame] = sqrt(energy / max(1, end - start))
        }
        val novelty = DoubleArray(envelope.size)
        for (i in 1 until envelope.size) novelty[i] = max(0.0, envelope[i] - envelope[i - 1])
        val secondsPerHop = hop.toDouble() / sampleRate
        val minLag = max(1, floor(60.0 / 180.0 / secondsPerHop).toInt())
        val maxLag = min(novelty.size - 1, ceil(60.0 / 55.0 / secondsPerHop).toInt())
        if (maxLag <= minLag) return null
        var bestLag = 0
        var bestScore = Double.NEGATIVE_INFINITY
        for (lag in minLag..maxLag) {
            var dot = 0.0; var aa = 0.0; var bb = 0.0
            for (i in lag until novelty.size) {
                dot += novelty[i] * novelty[i - lag]; aa += novelty[i] * novelty[i]; bb += novelty[i - lag] * novelty[i - lag]
            }
            val score = dot / sqrt(max(aa * bb, 1e-12))
            if (score > bestScore) { bestScore = score; bestLag = lag }
        }
        if (bestScore < 0.04 || bestLag == 0) return null
        var bpm = 60.0 / (bestLag * secondsPerHop)
        while (bpm < 70) bpm *= 2
        while (bpm > 180) bpm /= 2
        return bpm.roundToInt()
    }

    fun estimateKey(samples: FloatArray, sampleRate: Int): String? {
        if (samples.size < sampleRate * 3 || sampleRate <= 0) return null
        val size = 4096
        val hop = max(size, sampleRate * 2 / 5)
        val chroma = DoubleArray(12)
        val real = DoubleArray(size); val imag = DoubleArray(size)
        var frames = 0
        var start = 0
        while (start + size <= samples.size && frames < 180) {
            for (i in 0 until size) {
                real[i] = samples[start + i] * (0.5 - 0.5 * cos(2.0 * PI * i / (size - 1)))
                imag[i] = 0.0
            }
            fft(real, imag)
            for (bin in 2 until size / 2) {
                val frequency = bin.toDouble() * sampleRate / size
                if (frequency < 55 || frequency > 2200) continue
                val midi = (69 + 12 * log2(frequency / 440.0)).roundToInt()
                chroma[(midi % 12 + 12) % 12] += hypot(real[bin], imag[bin])
            }
            frames++; start += hop
        }
        if (chroma.sum() <= 1e-9) return null
        val mean = chroma.average()
        val normalized = DoubleArray(12) { chroma[it] - mean }
        var bestScore = Double.NEGATIVE_INFINITY
        var bestKey: String? = null
        for (tonic in 0 until 12) {
            for ((mode, profile) in listOf("major" to majorProfile, "minor" to minorProfile)) {
                val profileMean = profile.average()
                var dot = 0.0; var aa = 0.0; var bb = 0.0
                for (i in 0 until 12) {
                    val a = normalized[(i + tonic) % 12]
                    val b = profile[i] - profileMean
                    dot += a * b; aa += a * a; bb += b * b
                }
                val score = dot / sqrt(max(aa * bb, 1e-12))
                if (score > bestScore) { bestScore = score; bestKey = "${keyNames[tonic]} $mode" }
            }
        }
        return bestKey.takeIf { bestScore >= 0.06 }
    }

    private data class LocalFeatureFrame(
        val start: Double,
        val end: Double,
        val rmsDb: Double?,
        val peakDb: Double?,
        val centroid: Double?,
        val flatness: Double?,
        val lowRatio: Double?,
        val midRatio: Double?,
        val highRatio: Double?,
        val flux: Double,
        val zcr: Double,
        val chroma: DoubleArray,
    )

    private fun noteName(midi: Int): String = "${keyNames[((midi % 12) + 12) % 12]}${midi / 12 - 1}"

    private fun localDb(value: Double): Double =
        if (!value.isFinite() || value <= 1e-12) -120.0 else (20.0 * log10(value)).coerceAtLeast(-120.0)

    private fun meanValue(values: List<Double>): Double? =
        values.filter { it.isFinite() }.takeIf { it.isNotEmpty() }?.average()

    private fun localPitch(samples: FloatArray, sampleRate: Int, start: Int, time: Double): JSONObject? {
        val length = min(2048, samples.size - start)
        if (length < 512 || sampleRate <= 0) return null
        val decimation = max(1, ceil(sampleRate / 8000.0).toInt())
        val rate = sampleRate.toDouble() / decimation
        val reduced = ArrayList<Double>((length + decimation - 1) / decimation)
        var cursor = 0
        while (cursor < length) {
            val window = 0.5 - 0.5 * cos(2.0 * PI * cursor / max(1, length - 1))
            reduced += samples[start + cursor].toDouble() * window
            cursor += decimation
        }
        val minLag = max(2, (rate / 1000.0).toInt())
        val maxLag = min((rate / 55.0).toInt(), reduced.size / 2)
        if (maxLag <= minLag) return null
        var bestLag = 0
        var bestScore = 0.0
        for (lag in minLag..maxLag) {
            var dot = 0.0; var left = 0.0; var right = 0.0
            for (index in 0 until reduced.size - lag) {
                val a = reduced[index]; val b = reduced[index + lag]
                dot += a * b; left += a * a; right += b * b
            }
            val score = dot / sqrt(max(left * right, 1e-12))
            if (score > bestScore) { bestScore = score; bestLag = lag }
        }
        if (bestLag == 0 || bestScore < 0.55) return null
        val hz = rate / bestLag
        if (!hz.isFinite() || hz !in 55.0..1000.0) return null
        val midi = (69 + 12 * log2(hz / 440.0)).roundToInt()
        return JSONObject().put("time_seconds", time).put("frequency_hz", (hz * 100.0).roundToInt() / 100.0)
            .put("midi_note", midi).put("note", noteName(midi)).put("confidence", bestScore.coerceIn(0.0, 1.0))
    }

    private fun localChord(chroma: DoubleArray, start: Double, end: Double): JSONObject {
        val total = chroma.sum()
        if (total <= 1e-9) return JSONObject().put("start_seconds", start).put("end_seconds", end)
            .put("chord", JSONObject.NULL).put("confidence", JSONObject.NULL).put("method", "spectral-chroma-triad-template")
        val values = DoubleArray(12) { chroma[it] / total }
        var bestName: String? = null
        var bestScore = Double.NEGATIVE_INFINITY
        var secondScore = Double.NEGATIVE_INFINITY
        for (root in 0 until 12) for (minor in listOf(false, true)) {
            val third = (root + if (minor) 3 else 4) % 12
            val fifth = (root + 7) % 12
            var score = values[root] + 0.8 * values[third] + 0.6 * values[fifth]
            for (note in 0 until 12) if (note != root && note != third && note != fifth) score -= values[note] * 0.15
            if (score > bestScore) { secondScore = bestScore; bestScore = score; bestName = keyNames[root] + if (minor) "m" else "" }
            else if (score > secondScore) secondScore = score
        }
        val confidence = ((bestScore - max(0.0, secondScore)) / max(bestScore, 1e-9) * 3 + 0.3).coerceIn(0.0, 0.99)
        return JSONObject().put("start_seconds", start).put("end_seconds", end).put("chord", bestName)
            .put("confidence", confidence).put("method", "spectral-chroma-triad-template")
    }

    fun analyzeDataset(samples: FloatArray, sampleRate: Int): JSONObject {
        require(sampleRate in 8_000..192_000) { "Analysis sample rate must be between 8 kHz and 192 kHz." }
        require(samples.isNotEmpty()) { "No decoded audio samples were supplied." }
        require(samples.all { it.isFinite() }) { "Audio contains non-finite samples." }
        val duration = samples.size.toDouble() / sampleRate
        require(duration <= 15 * 60) { "Detailed local analysis is limited to 15 minutes per track." }

        val fftSize = 2048
        val hop = max(1, sampleRate / 2)
        val bins = fftSize / 2
        val real = DoubleArray(fftSize)
        val imag = DoubleArray(fftSize)
        val previousMagnitudes = DoubleArray(bins)
        val frames = ArrayList<LocalFeatureFrame>()
        val timeline = JSONArray()
        val pitchPoints = JSONArray()
        val blockChroma = linkedMapOf<Int, DoubleArray>()
        val fluxValues = ArrayList<Double>()
        var transientCount = 0
        var previousRmsDb: Double? = null
        var totalSquares = 0.0
        var globalPeak = 0.0
        var dcSum = 0.0
        var clipped = 0L
        for (sample in samples) {
            val value = sample.toDouble()
            totalSquares += value * value
            globalPeak = max(globalPeak, abs(value))
            dcSum += value
            if (abs(value) >= 0.999f) clipped += 1
        }

        var frameIndex = 0
        var frameStart = 0
        while (frameStart < samples.size) {
            val frameEnd = min(samples.size, frameStart + hop)
            val length = frameEnd - frameStart
            var sum = 0.0; var peak = 0.0; var crossings = 0
            var previous = samples[frameStart]
            for (index in frameStart until frameEnd) {
                val value = samples[index]
                sum += value * value
                peak = max(peak, abs(value.toDouble()))
                if (index > frameStart && ((value >= 0 && previous < 0) || (value < 0 && previous >= 0))) crossings += 1
                previous = value
            }
            val rms = sqrt(sum / max(1, length))
            val rmsDb = localDb(rms)
            real.fill(0.0); imag.fill(0.0)
            val spectralStart = min(frameStart, max(0, samples.size - fftSize))
            for (index in 0 until fftSize) {
                val sampleIndex = spectralStart + index
                val value = if (sampleIndex < samples.size) samples[sampleIndex].toDouble() else 0.0
                real[index] = value * (0.5 - 0.5 * cos(2.0 * PI * index / (fftSize - 1)))
            }
            fft(real, imag)
            val chroma = DoubleArray(12)
            var magnitudeSum = 0.0; var weightedFrequency = 0.0; var logSum = 0.0
            var lowPower = 0.0; var midPower = 0.0; var highPower = 0.0; var powerSum = 0.0; var fluxNumerator = 0.0
            val magnitudes = DoubleArray(bins)
            for (bin in 1 until bins) {
                val magnitude = hypot(real[bin], imag[bin])
                magnitudes[bin] = magnitude
                val frequency = bin.toDouble() * sampleRate / fftSize
                val power = magnitude * magnitude
                magnitudeSum += magnitude; weightedFrequency += magnitude * frequency; logSum += ln(max(magnitude, 1e-12)); powerSum += power
                if (frequency < 160) lowPower += power else if (frequency < 2000) midPower += power else highPower += power
                if (frequency in 45.0..min(5000.0, sampleRate / 2.0)) {
                    val midi = (69 + 12 * log2(frequency / 440.0)).roundToInt()
                    chroma[(midi % 12 + 12) % 12] += magnitude
                }
                fluxNumerator += max(0.0, magnitude - previousMagnitudes[bin])
            }
            val totalMagnitude = magnitudeSum
            val flux = if (totalMagnitude > 1e-9) fluxNumerator / totalMagnitude else 0.0
            for (bin in 0 until bins) previousMagnitudes[bin] = magnitudes[bin]
            if (previousRmsDb != null && rmsDb - previousRmsDb!! >= 3.0) transientCount += 1
            if (flux > 0.22) transientCount += 1
            previousRmsDb = rmsDb
            fluxValues += flux
            val lowRatio = if (powerSum > 1e-12) lowPower / powerSum else 0.0
            val midRatio = if (powerSum > 1e-12) midPower / powerSum else 0.0
            val highRatio = if (powerSum > 1e-12) highPower / powerSum else 0.0
            val centroid = if (magnitudeSum > 1e-9) weightedFrequency / magnitudeSum else null
            val flatness = if (magnitudeSum > 1e-9) exp(logSum / max(1, bins - 1)) / (magnitudeSum / max(1, bins - 1)) else null
            val startSeconds = frameStart.toDouble() / sampleRate
            val endSeconds = frameEnd.toDouble() / sampleRate
            val frame = LocalFeatureFrame(startSeconds, endSeconds, rmsDb, localDb(peak), centroid, flatness, lowRatio, midRatio, highRatio, flux, crossings.toDouble() / max(1, length - 1), chroma)
            frames += frame
            timeline.put(JSONObject().put("start_seconds", startSeconds).put("end_seconds", endSeconds)
                .put("rms_dbfs", rmsDb).put("peak_dbfs", localDb(peak))
                .put("spectral_centroid_hz", centroid ?: JSONObject.NULL).put("spectral_flatness", flatness ?: JSONObject.NULL)
                .put("low_frequency_energy_ratio", lowRatio).put("mid_frequency_energy_ratio", midRatio)
                .put("high_frequency_energy_ratio", highRatio).put("spectral_flux", flux)
                .put("zero_crossing_rate", frame.zcr))
            val block = (startSeconds / 2.0).toInt()
            val blockValues = blockChroma.getOrPut(block) { DoubleArray(12) }
            for (note in 0 until 12) blockValues[note] += chroma[note]
            if (frameIndex % 2 == 0) localPitch(samples, sampleRate, frameStart, startSeconds)?.let { pitchPoints.put(it) }
            frameIndex++
            frameStart += hop
        }

        val allChroma = DoubleArray(12)
        blockChroma.values.forEach { block -> for (index in 0 until 12) allChroma[index] += block[index] }
        val chromaTotal = allChroma.sum()
        val normalizedChroma = DoubleArray(12) { if (chromaTotal > 1e-9) allChroma[it] / chromaTotal else 0.0 }
        val chords = JSONArray()
        blockChroma.forEach { (block, chroma) -> chords.put(localChord(chroma, block * 2.0, min(duration, (block + 1) * 2.0))) }
        val pitches = (0 until pitchPoints.length()).mapNotNull { pitchPoints.optJSONObject(it)?.optInt("midi_note") }
        val transientRate = max(transientCount, fluxValues.count { it >= max(0.15, (fluxValues.averageOrZero()) * 1.4) }) / max(duration, 1e-9)
        val changes = JSONArray()
        var lastBoundary = 0.0
        for (index in 1 until frames.size) {
            val prior = frames[index - 1]; val current = frames[index]
            val rmsChange = abs((current.rmsDb ?: -120.0) - (prior.rmsDb ?: -120.0)) / 24.0
            val centroidChange = abs((current.centroid ?: 0.0) - (prior.centroid ?: 0.0)) / max(1000.0, prior.centroid ?: 1000.0)
            val lowChange = abs((current.lowRatio ?: 0.0) - (prior.lowRatio ?: 0.0))
            val score = (rmsChange * 0.45 + centroidChange * 0.25 + lowChange * 0.2 + current.flux * 0.1).coerceIn(0.0, 1.0)
            if (score >= 0.27 && current.start - lastBoundary >= 4.0 && duration - current.start >= 3.0) {
                changes.put(JSONObject().put("time_seconds", current.start).put("change_score", score)
                    .put("reason", "Measured level, brightness, frequency balance or spectral flux changed; not a verified verse/chorus label."))
                lastBoundary = current.start
            }
        }
        val boundaries = mutableListOf(0.0)
        for (index in 0 until changes.length()) boundaries += changes.getJSONObject(index).getDouble("time_seconds")
        boundaries += duration
        val sections = JSONArray()
        for (index in 0 until boundaries.size - 1) {
            if (boundaries[index + 1] - boundaries[index] >= 1.0) {
                sections.put(JSONObject().put("start_seconds", boundaries[index]).put("end_seconds", boundaries[index + 1])
                    .put("label", "section_${sections.length() + 1}").put("label_source", "automatic_feature_change").put("semantic_section", JSONObject.NULL))
            }
        }
        val descriptors = JSONArray()
        val meanLow = meanValue(frames.mapNotNull { it.lowRatio }) ?: 0.0
        val meanMid = meanValue(frames.mapNotNull { it.midRatio }) ?: 0.0
        val meanHigh = meanValue(frames.mapNotNull { it.highRatio }) ?: 0.0
        val meanCentroid = meanValue(frames.mapNotNull { it.centroid }) ?: 0.0
        if (meanLow >= 0.35) descriptors.put(JSONObject().put("tag", "low-frequency-prominent").put("evidence", "Low band carries ${(meanLow * 100).roundToInt()}% of average spectral energy."))
        if (meanHigh >= 0.30) descriptors.put(JSONObject().put("tag", "high-frequency-prominent").put("evidence", "High band carries ${(meanHigh * 100).roundToInt()}% of average spectral energy."))
        if (transientRate >= 3) descriptors.put(JSONObject().put("tag", "transient-dense").put("evidence", "Approximately ${(transientRate * 100).roundToInt() / 100.0} onset-like changes per second."))
        if (meanCentroid >= 3000) descriptors.put(JSONObject().put("tag", "spectrally-bright").put("evidence", "Mean spectral centroid is ${meanCentroid.roundToInt()} Hz."))
        if (descriptors.length() == 0) descriptors.put(JSONObject().put("tag", "no-dominant-rule-cue").put("evidence", "No conservative measurable rule was triggered."))
        val pitchLow = pitches.minOrNull()
        val pitchHigh = pitches.maxOrNull()
        val sortedLevels = frames.mapNotNull { it.rmsDb }.sorted()
        val dynamicRange = if (sortedLevels.size > 1) sortedLevels[(sortedLevels.size - 1) * 95 / 100] - sortedLevels[(sortedLevels.size - 1) * 10 / 100] else JSONObject.NULL
        val rms = sqrt(totalSquares / samples.size)
        val peak = globalPeak
        val annotations = JSONObject()
        listOf("genre", "sub_style", "style_influences", "language", "energy", "mood", "source_role", "vocals", "vocal_delivery", "vocal_register", "vocal_harmony", "performance_technique", "instruments", "themes", "listening_scene", "production_traits", "arrangement").forEach { annotations.put(it, JSONArray()) }
        annotations.put("notes", "").put("reviewed", false).put("reviewer", JSONObject.NULL)

        val warnings = JSONArray()
            .put("No hosted model or AI API was used. Genre, language, mood, instrument identity and vocal type require human annotation.")
            .put("Pitch/chord estimates are made from the mono mix and may follow instruments rather than a singer.")
            .put("Section boundaries are generic measured feature changes, not confirmed verse/chorus labels.")
        if (pitchPoints.length() == 0) warnings.put("No stable dominant pitch was detected with sufficient confidence.")
        val keyEstimate = estimateKey(samples, sampleRate)
        val globalPeakDb = localDb(peak)
        val globalRmsDb = localDb(rms)
        return JSONObject()
            .put("schema_version", "env.music-dataset-analysis.v1")
            .put("source", JSONObject().put("sample_rate_hz", sampleRate).put("channels", 1).put("frame_count", samples.size).put("duration_seconds", duration))
            .put("processing", JSONObject().put("method", "local-digital-signal-processing").put("uses_remote_api", false).put("uses_hosted_model", false).put("model_inference", false))
            .put("technical", JSONObject().put("duration_seconds", duration).put("sample_rate_hz", sampleRate).put("channels", 1)
                .put("peak_dbfs", globalPeakDb).put("rms_dbfs", globalRmsDb)
                .put("crest_factor_db", if (rms > 1e-12) globalPeakDb - globalRmsDb else JSONObject.NULL)
                .put("dynamic_range_estimate_db", dynamicRange)
                .put("clipped_sample_percent", clipped.toDouble() / samples.size * 100.0).put("dc_offset_by_channel", JSONArray().put(dcSum / samples.size)))
            .put("rhythm", JSONObject().put("tempo_bpm", estimateBpm(samples, sampleRate) ?: JSONObject.NULL)
                .put("tempo_method", "Local onset-envelope autocorrelation estimate").put("transient_density_per_second", transientRate)
                .put("transient_event_count", max(transientCount, fluxValues.count { it >= max(0.15, (fluxValues.averageOrZero()) * 1.4) }))
                .put("interpretation", "Transient estimates are not verified drum-hit counts; tempo may be half/double-time."))
            .put("tonality", JSONObject().put("key_estimate", keyEstimate ?: JSONObject.NULL).put("key_method", "Local chroma template estimate")
                .put("pitch_class_profile", JSONArray().also { list -> keyNames.forEachIndexed { index, name -> list.put(JSONObject().put("note", name).put("energy", normalizedChroma[index])) } })
                .put("chord_estimates", chords).put("interpretation", "Chords are template-based estimates from the mixed signal."))
            .put("pitch", JSONObject().put("source", "full_mix_dominant_pitch_estimate").put("points", pitchPoints)
                .put("lowest_detected_note", pitchLow?.let(::noteName) ?: JSONObject.NULL).put("highest_detected_note", pitchHigh?.let(::noteName) ?: JSONObject.NULL)
                .put("pitch_range_semitones", if (pitchLow != null && pitchHigh != null) pitchHigh - pitchLow else JSONObject.NULL)
                .put("note", "Dominant pitch of the full mix; not a vocal-only contour or definitive voice type."))
            .put("timbre", JSONObject().put("mean_spectral_centroid_hz", meanCentroid).put("mean_spectral_flatness", meanValue(frames.mapNotNull { it.flatness }) ?: JSONObject.NULL)
                .put("mean_low_frequency_energy_ratio", meanLow).put("mean_mid_frequency_energy_ratio", meanMid).put("mean_high_frequency_energy_ratio", meanHigh)
                .put("mean_zero_crossing_rate", meanValue(frames.map { it.zcr }) ?: JSONObject.NULL).put("descriptors", descriptors))
            .put("timeline", timeline)
            .put("structure", JSONObject().put("change_points", changes).put("sections", sections)
                .put("note", "Automatic boundaries are not verified verse/chorus labels."))
            .put("style_cues", descriptors)
            .put("separation", JSONObject().put("status", "not_performed")
                .put("reason", "Native local mode does not claim true vocal/drum/bass source separation.")
                .put("supported_local_layers", JSONArray()).put("note", "A future native local-layer export must use explicitly labeled signal candidates, never imply clean source isolation."))
            .put("annotations", annotations)
            .put("warnings", warnings)
    }

    private fun List<Double>.averageOrZero(): Double = if (isEmpty()) 0.0 else average()

    private fun fft(real: DoubleArray, imag: DoubleArray) {
        val n = real.size
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) { j = j xor bit; bit = bit shr 1 }
            j = j xor bit
            if (i < j) {
                val tr = real[i]; real[i] = real[j]; real[j] = tr
                val ti = imag[i]; imag[i] = imag[j]; imag[j] = ti
            }
        }
        var length = 2
        while (length <= n) {
            val angle = -2.0 * PI / length
            val wLengthReal = cos(angle); val wLengthImag = sin(angle)
            var offset = 0
            while (offset < n) {
                var wReal = 1.0; var wImag = 0.0
                for (k in 0 until length / 2) {
                    val even = offset + k; val odd = even + length / 2
                    val oddReal = real[odd] * wReal - imag[odd] * wImag
                    val oddImag = real[odd] * wImag + imag[odd] * wReal
                    real[odd] = real[even] - oddReal; imag[odd] = imag[even] - oddImag
                    real[even] += oddReal; imag[even] += oddImag
                    val nextReal = wReal * wLengthReal - wImag * wLengthImag
                    wImag = wReal * wLengthImag + wImag * wLengthReal; wReal = nextReal
                }
                offset += length
            }
            length = length shl 1
        }
    }
}
