package com.chastech.env

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import android.media.MediaMetadataRetriever
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.camera.core.CameraSelector
import androidx.camera.view.video.AudioConfig
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Recording
import androidx.camera.video.VideoRecordEvent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.transformer.Composition
import androidx.media3.transformer.Effects
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File

private data class NativeSavedVocalSetup(
    val id: String,
    val name: String,
    val presetId: String,
    val eqBandsDb: List<Float>,
    val compressorThresholdDb: Float,
    val compressorRatio: Float,
    val voiceRenderGain: Float,
    val outputGainDb: Float,
    val effectAmount: Float,
    val ampCharacter: String,
    val ampDrive: Float,
    val ampBassDb: Float,
    val ampMidDb: Float,
    val ampTrebleDb: Float,
    val highPassHzOverride: Float?,
    val lowPassHzOverride: Float?,
    val backingLevel: Float,
)

private fun encodeNativeSavedVocalSetups(setups: List<NativeSavedVocalSetup>): String = JSONArray().apply {
    setups.take(30).forEach { setup ->
        put(JSONObject().apply {
            put("id", setup.id); put("name", setup.name); put("presetId", setup.presetId)
            put("eqBandsDb", JSONArray().apply { setup.eqBandsDb.take(10).forEach { put(it.toDouble()) } })
            put("compressorThresholdDb", setup.compressorThresholdDb.toDouble()); put("compressorRatio", setup.compressorRatio.toDouble())
            put("voiceRenderGain", setup.voiceRenderGain.toDouble()); put("outputGainDb", setup.outputGainDb.toDouble()); put("effectAmount", setup.effectAmount.toDouble())
            put("ampCharacter", setup.ampCharacter); put("ampDrive", setup.ampDrive.toDouble()); put("ampBassDb", setup.ampBassDb.toDouble()); put("ampMidDb", setup.ampMidDb.toDouble()); put("ampTrebleDb", setup.ampTrebleDb.toDouble())
            if (setup.highPassHzOverride == null) put("highPassHzOverride", JSONObject.NULL) else put("highPassHzOverride", setup.highPassHzOverride.toDouble())
            if (setup.lowPassHzOverride == null) put("lowPassHzOverride", JSONObject.NULL) else put("lowPassHzOverride", setup.lowPassHzOverride.toDouble())
            put("backingLevel", setup.backingLevel.toDouble())
        })
    }
}.toString()

private fun decodeNativeSavedVocalSetups(raw: String): List<NativeSavedVocalSetup> = runCatching {
    val array = JSONArray(raw)
    buildList {
        for (index in 0 until minOf(array.length(), 30)) {
            val item = array.optJSONObject(index) ?: continue
            val id = item.optString("id").take(100)
            val name = item.optString("name").trim().take(48)
            val presetId = item.optString("presetId")
            val bandsArray = item.optJSONArray("eqBandsDb") ?: continue
            if (id.isBlank() || name.isBlank() || NATIVE_VOCAL_PRESETS.none { it.first == presetId } || bandsArray.length() != 10) continue
            val bands = (0 until 10).map { band -> bandsArray.optDouble(band, 0.0).toFloat().coerceIn(-9f, 9f) }
            val ampCharacter = item.optString("ampCharacter", "clean").takeIf { it in setOf("clean", "tube", "crunch", "fuzz") } ?: "clean"
            add(NativeSavedVocalSetup(
                id = id, name = name, presetId = presetId, eqBandsDb = bands,
                compressorThresholdDb = item.optDouble("compressorThresholdDb", -20.0).toFloat().coerceIn(-36f, -8f),
                compressorRatio = item.optDouble("compressorRatio", 3.0).toFloat().coerceIn(1f, 8f),
                voiceRenderGain = item.optDouble("voiceRenderGain", 1.0).toFloat().coerceIn(0f, 1.5f),
                outputGainDb = item.optDouble("outputGainDb", 0.0).toFloat().coerceIn(-12f, 6f),
                effectAmount = item.optDouble("effectAmount", 1.0).toFloat().coerceIn(0f, 1.5f),
                ampCharacter = ampCharacter, ampDrive = item.optDouble("ampDrive", 25.0).toFloat().coerceIn(0f, 100f),
                ampBassDb = item.optDouble("ampBassDb", 0.0).toFloat().coerceIn(-6f, 6f), ampMidDb = item.optDouble("ampMidDb", 0.0).toFloat().coerceIn(-6f, 6f), ampTrebleDb = item.optDouble("ampTrebleDb", 0.0).toFloat().coerceIn(-6f, 6f),
                highPassHzOverride = if (item.isNull("highPassHzOverride")) null else item.optDouble("highPassHzOverride", 70.0).toFloat().coerceIn(20f, 1_000f),
                lowPassHzOverride = if (item.isNull("lowPassHzOverride")) null else item.optDouble("lowPassHzOverride", 20_000.0).toFloat().coerceIn(1_000f, 20_000f),
                backingLevel = item.optDouble("backingLevel", 0.65).toFloat().coerceIn(0f, 1f),
            ))
        }
    }
}.getOrElse { emptyList() }


private const val PORTABLE_AUDIO_PRESET_FORMAT = "env-audio-studio-preset"
private const val PORTABLE_AUDIO_PRESET_VERSION = 1
private const val PORTABLE_AUDIO_PRESET_MAX_BYTES = 256 * 1024

private fun encodePortableNativePreset(setup: NativeSavedVocalSetup): String = JSONObject().apply {
    put("format", PORTABLE_AUDIO_PRESET_FORMAT); put("version", PORTABLE_AUDIO_PRESET_VERSION)
    put("name", setup.name.take(48)); put("exportedAt", System.currentTimeMillis().toString())
    put("settings", JSONObject().apply {
        put("presetId", setup.presetId); put("micGain", setup.voiceRenderGain * 100f); put("backingGain", setup.backingLevel * 100f)
        put("eqBandsDb", JSONArray().apply { setup.eqBandsDb.take(10).forEach { put(it.toDouble()) } }); put("eqProfile", "custom")
        if (setup.highPassHzOverride == null) put("highPassHz", JSONObject.NULL) else put("highPassHz", setup.highPassHzOverride.toDouble())
        if (setup.lowPassHzOverride == null) put("lowPassHz", JSONObject.NULL) else put("lowPassHz", setup.lowPassHzOverride.toDouble())
        put("compressorThresholdDb", setup.compressorThresholdDb.toDouble()); put("compressorRatio", setup.compressorRatio.toDouble())
        put("outputGainDb", setup.outputGainDb.toDouble()); put("reverbAmount", setup.effectAmount * 100f); put("delayAmount", setup.effectAmount * 100f); put("effectAmount", setup.effectAmount * 100f)
        put("ampCharacter", setup.ampCharacter); put("ampDrive", setup.ampDrive.toDouble()); put("ampBassDb", setup.ampBassDb.toDouble()); put("ampMidDb", setup.ampMidDb.toDouble()); put("ampTrebleDb", setup.ampTrebleDb.toDouble())
    })
}.toString(2)

private fun decodePortableNativePreset(raw: String): NativeSavedVocalSetup? = runCatching {
    if (raw.toByteArray(Charsets.UTF_8).size > PORTABLE_AUDIO_PRESET_MAX_BYTES) return null
    val envelope = JSONObject(raw)
    if (envelope.optString("format") != PORTABLE_AUDIO_PRESET_FORMAT || envelope.optInt("version", -1) != PORTABLE_AUDIO_PRESET_VERSION) return null
    val name = envelope.optString("name").trim().take(48)
    if (name.isBlank()) return null
    val settings = envelope.optJSONObject("settings") ?: return null
    val importedPreset = settings.optString("presetId", "clean")
    val presetId = if (NATIVE_VOCAL_PRESETS.any { it.first == importedPreset }) importedPreset else "clean"
    val bandsJson = settings.optJSONArray("eqBandsDb") ?: return null
    if (bandsJson.length() != 10) return null
    val bands = (0 until 10).map { index -> bandsJson.optDouble(index, 0.0).toFloat().let { gain -> if (gain.isFinite()) gain.coerceIn(-9f, 9f) else 0f } }
    fun number(key: String, fallback: Double, min: Double, max: Double) = settings.optDouble(key, fallback).let { if (it.isFinite()) it.coerceIn(min, max) else fallback }.toFloat()
    fun optionalNumber(key: String, min: Double, max: Double): Float? = if (!settings.has(key) || settings.isNull(key)) null else number(key, max, min, max)
    val effect = number("effectAmount", maxOf(settings.optDouble("reverbAmount", 100.0), settings.optDouble("delayAmount", 100.0)), 0.0, 150.0) / 100f
    NativeSavedVocalSetup(
        id = "import-${System.currentTimeMillis()}", name = name, presetId = presetId, eqBandsDb = bands,
        compressorThresholdDb = number("compressorThresholdDb", -20.0, -36.0, -8.0), compressorRatio = number("compressorRatio", 3.0, 1.0, 8.0),
        voiceRenderGain = number("micGain", 100.0, 0.0, 150.0) / 100f, outputGainDb = number("outputGainDb", 0.0, -12.0, 6.0), effectAmount = effect,
        ampCharacter = settings.optString("ampCharacter", "clean").takeIf { it in setOf("clean", "tube", "crunch", "fuzz") } ?: "clean",
        ampDrive = number("ampDrive", 25.0, 0.0, 100.0), ampBassDb = number("ampBassDb", 0.0, -6.0, 6.0), ampMidDb = number("ampMidDb", 0.0, -6.0, 6.0), ampTrebleDb = number("ampTrebleDb", 0.0, -6.0, 6.0),
        highPassHzOverride = optionalNumber("highPassHz", 20.0, 1000.0), lowPassHzOverride = optionalNumber("lowPassHz", 1000.0, 20000.0),
        backingLevel = number("backingGain", 65.0, 0.0, 100.0) / 100f,
    )
}.getOrNull()

private fun limitedRead(input: java.io.InputStream, maxBytes: Int): ByteArray {
    val output = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        if (output.size() + count > maxBytes) throw IllegalArgumentException("Preset file exceeds 256 KB.")
        output.write(buffer, 0, count)
    }
    return output.toByteArray()
}

/** Native CameraX capture plus on-device Media3 composition. Source media never leaves the device. */
@androidx.annotation.OptIn(markerClass = [androidx.media3.common.util.UnstableApi::class])
@Composable
fun NativeMusicLiveVideoStudio() {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val controller = remember(context) {
        LifecycleCameraController(context).apply {
            cameraSelector = CameraSelector.DEFAULT_FRONT_CAMERA
            setEnabledUseCases(CameraController.VIDEO_CAPTURE)
        }
    }
    val requiredPermissions = remember { arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO) }
    var permissionGranted by remember {
        mutableStateOf(requiredPermissions.all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED })
    }
    var backingUri by remember { mutableStateOf<Uri?>(null) }
    var backingName by remember { mutableStateOf("") }
    var backingDurationMs by remember { mutableStateOf(0L) }
    var backingCueSeconds by remember { mutableFloatStateOf(0f) }
    var cameraRecording by remember { mutableStateOf(false) }
    var mixing by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Choose a local instrumental, enable the camera and record a take.") }
    var error by remember { mutableStateOf("") }
    var rawCapture by remember { mutableStateOf<File?>(null) }
    var finalVideo by remember { mutableStateOf<File?>(null) }
    var backingLevel by remember { mutableFloatStateOf(0.65f) }
    var vocalPreset by remember { mutableStateOf("pop") }
    var presetMenuOpen by remember { mutableStateOf(false) }
    var presetSearch by remember { mutableStateOf("") }
    var showAdvancedSound by remember { mutableStateOf(false) }
    var eqBandsDb by remember { mutableStateOf(List(10) { 0f }) }
    var compressorThresholdDb by remember { mutableFloatStateOf(-20f) }
    var compressorRatio by remember { mutableFloatStateOf(3f) }
    var outputGainDb by remember { mutableFloatStateOf(0f) }
    var voiceRenderGain by remember { mutableFloatStateOf(1f) }
    var effectAmount by remember { mutableFloatStateOf(1f) }
    var ampCharacter by remember { mutableStateOf("clean") }
    var ampDrive by remember { mutableFloatStateOf(25f) }
    var ampBassDb by remember { mutableFloatStateOf(0f) }
    var ampMidDb by remember { mutableFloatStateOf(0f) }
    var ampTrebleDb by remember { mutableFloatStateOf(0f) }
    var highPassHzOverride by remember { mutableStateOf<Float?>(null) }
    var lowPassHzOverride by remember { mutableStateOf<Float?>(null) }
    val savedSetupPreferences = remember(context) { context.getSharedPreferences("env_live_video_studio", Context.MODE_PRIVATE) }
    var savedSetupsRaw by remember { mutableStateOf(savedSetupPreferences.getString("saved_vocal_setups_v1", "[]") ?: "[]") }
    var savedSetupName by remember { mutableStateOf("") }
    var selectedSavedSetupId by remember { mutableStateOf("") }
    var savedSetupMenuOpen by remember { mutableStateOf(false) }
    var abSnapshotA by remember { mutableStateOf<NativeSavedVocalSetup?>(null) }
    var abSnapshotB by remember { mutableStateOf<NativeSavedVocalSetup?>(null) }
    var activeAbSlot by remember { mutableStateOf<String?>(null) }
    var pendingPresetExport by remember { mutableStateOf<NativeSavedVocalSetup?>(null) }
    val savedVocalSetups = remember(savedSetupsRaw) { decodeNativeSavedVocalSetups(savedSetupsRaw) }
    var usingFrontCamera by remember { mutableStateOf(true) }
    var recording by remember { mutableStateOf<Recording?>(null) }
    var player by remember { mutableStateOf<ExoPlayer?>(null) }

    fun persistSavedVocalSetups(setups: List<NativeSavedVocalSetup>) {
        val raw = encodeNativeSavedVocalSetups(setups.take(30))
        savedSetupPreferences.edit().putString("saved_vocal_setups_v1", raw).apply()
        savedSetupsRaw = raw
    }

    fun currentVocalSetup(name: String, id: String = System.currentTimeMillis().toString()) = NativeSavedVocalSetup(
        id = id, name = name.trim().take(48), presetId = vocalPreset,
        eqBandsDb = eqBandsDb.map { if (it.isFinite()) it.coerceIn(-9f, 9f) else 0f }, compressorThresholdDb = compressorThresholdDb,
        compressorRatio = compressorRatio, voiceRenderGain = voiceRenderGain, outputGainDb = outputGainDb, effectAmount = effectAmount,
        ampCharacter = ampCharacter, ampDrive = ampDrive, ampBassDb = ampBassDb, ampMidDb = ampMidDb, ampTrebleDb = ampTrebleDb,
        highPassHzOverride = highPassHzOverride, lowPassHzOverride = lowPassHzOverride, backingLevel = backingLevel,
    )

    fun saveCurrentVocalSetup() {
        val name = savedSetupName.trim().take(48)
        if (name.isBlank()) { error = "Enter a name for this sound setup before saving."; return }
        val existing = savedVocalSetups.firstOrNull { it.name.equals(name, ignoreCase = true) }
        val setup = currentVocalSetup(name, existing?.id ?: System.currentTimeMillis().toString())
        persistSavedVocalSetups((listOf(setup) + savedVocalSetups.filterNot { it.id == setup.id }).take(30))
        selectedSavedSetupId = setup.id
        savedSetupName = setup.name
        error = ""
        status = "Saved “${setup.name}” on this device. Only sound-control values were saved; no audio or video was stored in the setup."
    }

    fun applySavedVocalSetup(setup: NativeSavedVocalSetup) {
        vocalPreset = setup.presetId; eqBandsDb = setup.eqBandsDb.toList(); compressorThresholdDb = setup.compressorThresholdDb
        compressorRatio = setup.compressorRatio; voiceRenderGain = setup.voiceRenderGain; outputGainDb = setup.outputGainDb; effectAmount = setup.effectAmount
        ampCharacter = setup.ampCharacter; ampDrive = setup.ampDrive; ampBassDb = setup.ampBassDb; ampMidDb = setup.ampMidDb; ampTrebleDb = setup.ampTrebleDb
        highPassHzOverride = setup.highPassHzOverride; lowPassHzOverride = setup.lowPassHzOverride; backingLevel = setup.backingLevel
        player?.volume = backingLevel
        selectedSavedSetupId = setup.id; savedSetupName = setup.name; savedSetupMenuOpen = false; error = ""
        status = "Loaded “${setup.name}”. Make a short test take and adjust by ear before recording a full performance."
    }

    fun deleteSelectedVocalSetup() {
        val setup = savedVocalSetups.firstOrNull { it.id == selectedSavedSetupId } ?: return
        persistSavedVocalSetups(savedVocalSetups.filterNot { it.id == setup.id })
        selectedSavedSetupId = ""; savedSetupName = ""
        status = "Deleted “${setup.name}” from this device. Existing recordings were not changed."
    }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        permissionGranted = requiredPermissions.all { permission -> results[permission] == true || ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED }
        if (!permissionGranted) error = "Camera and microphone permission are required for native live performance recording."
    }
    val audioPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            runCatching { context.contentResolver.takePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            scope.launch {
                runCatching {
                    val copied = copyUriToCache(context, uri, "env-backing", ".audio")
                    backingUri = Uri.fromFile(copied)
                    backingName = copied.name
                    val retriever = MediaMetadataRetriever()
                    try { retriever.setDataSource(copied.absolutePath); backingDurationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L }
                    finally { retriever.release() }
                    backingCueSeconds = 0f
                    player?.release()
                    player = ExoPlayer.Builder(context).build().also { exo ->
                        exo.setMediaItem(MediaItem.fromUri(Uri.fromFile(copied)))
                        exo.repeatMode = Player.REPEAT_MODE_ONE
                        exo.volume = backingLevel
                        exo.prepare()
                    }
                    status = "Backing track ready. Use wired headphones to avoid the backing track bleeding into the microphone."
                    error = ""
                }.onFailure { error = it.message ?: "Could not read the selected audio file." }
            }
        }
    }
    val savePicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("video/mp4")) { target ->
        val source = finalVideo
        if (target != null && source != null) {
            runCatching {
                context.contentResolver.openOutputStream(target)?.use { output -> source.inputStream().use { input -> input.copyTo(output) } }
                    ?: error("Unable to open the selected export destination.")
            }.onSuccess { status = "Saved final video to the selected destination." }
                .onFailure { error = it.message ?: "Could not save the video." }
        }
    }
    val presetExportPicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { target ->
        val setup = pendingPresetExport
        if (target != null && setup != null) {
            runCatching {
                context.contentResolver.openOutputStream(target)?.use { it.write(encodePortableNativePreset(setup).toByteArray(Charsets.UTF_8)) }
                    ?: error("Unable to open the selected preset destination.")
            }.onSuccess { status = "Exported ${setup.name} as a portable version 1 enV preset. Only settings were included." }
                .onFailure { error = it.message ?: "Could not export the preset." }
        }
        pendingPresetExport = null
    }
    val presetImportPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runCatching {
            val raw = context.contentResolver.openInputStream(uri)?.use { limitedRead(it, PORTABLE_AUDIO_PRESET_MAX_BYTES).toString(Charsets.UTF_8) }
                ?: error("Unable to read the selected preset file.")
            decodePortableNativePreset(raw) ?: error("Unsupported or invalid enV Audio Studio preset. Only version 1 files are supported.")
        }.onSuccess { setup ->
            val existing = savedVocalSetups.firstOrNull { it.name.equals(setup.name, ignoreCase = true) }
            val imported = setup.copy(id = existing?.id ?: setup.id)
            persistSavedVocalSetups((listOf(imported) + savedVocalSetups.filterNot { it.id == imported.id }).take(30))
            applySavedVocalSetup(imported)
            status = "Imported ${imported.name} and applied the settings locally. Unsupported pitch presets fall back to Clean Studio on this device."
        }.onFailure { error = it.message ?: "Could not import the preset file." }
    }

    DisposableEffect(controller, lifecycleOwner) {
        controller.bindToLifecycle(lifecycleOwner)
        onDispose {
            runCatching { recording?.stop() }
            runCatching { player?.release() }
            runCatching { controller.unbind() }
        }
    }
    DisposableEffect(player) {
        onDispose { player?.release() }
    }
    LaunchedEffect(cameraRecording) {
        if (cameraRecording) {
            delay(300_000)
            recording?.stop()
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        Text("Live Video Singing Studio", style = MaterialTheme.typography.headlineSmall)
        Text("Capture video and microphone natively, then overlay your local backing track with Media3. Files stay on this device; exporting is an explicit user action.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Card { Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Rights & privacy", style = MaterialTheme.typography.titleSmall)
            Text("Use tracks you own or have permission to perform. enV does not download DRM-protected streams. Wired headphones are strongly recommended: Bluetooth monitoring may introduce noticeable latency.", style = MaterialTheme.typography.bodySmall)
        } }
        Card { Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Quick start", style = MaterialTheme.typography.titleSmall)
            Text("${if (backingUri != null) "✓" else "1"} · Add a backing track${if (backingUri != null) " — ready" else " — choose a local audio file below"}", style = MaterialTheme.typography.bodyMedium)
            Text("2 · Choose a vocal sound — currently ${nativeVocalPresetLabel(vocalPreset)}", style = MaterialTheme.typography.bodyMedium)
            Text("${if (permissionGranted) "✓" else "3"} · Enable camera & mic, then record", style = MaterialTheme.typography.bodyMedium)
            Text("After recording, choose Mix voice + backing, review the result, then export. You can keep advanced EQ and dynamics closed until you need them.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } }
        AndroidView(
            modifier = Modifier.fillMaxWidth().height(248.dp),
            factory = { viewContext -> PreviewView(viewContext).also { previewView -> previewView.controller = controller; previewView.scaleType = PreviewView.ScaleType.FILL_CENTER } },
            update = { view -> view.controller = controller },
        )
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Button(onClick = { if (permissionGranted) { error = ""; status = "Camera and microphone permissions are ready." } else permissionLauncher.launch(requiredPermissions) }, modifier = Modifier.fillMaxWidth()) { Text(if (permissionGranted) "Camera & mic ready" else "Enable camera & mic") }
            OutlinedButton(enabled = permissionGranted && !cameraRecording, onClick = {
                usingFrontCamera = !usingFrontCamera
                controller.cameraSelector = if (usingFrontCamera) CameraSelector.DEFAULT_BACK_CAMERA else CameraSelector.DEFAULT_FRONT_CAMERA
            }, modifier = Modifier.fillMaxWidth()) { Text("Flip front / rear camera") }
        }
        OutlinedButton(enabled = !cameraRecording && !mixing, onClick = { audioPicker.launch(arrayOf("audio/*")) }, modifier = Modifier.fillMaxWidth()) { Text(if (backingUri == null) "Choose backing / instrumental" else "Change backing · $backingName") }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Button(enabled = permissionGranted && backingUri != null && !cameraRecording && !mixing, onClick = {
                error = ""
                val out = File(context.cacheDir, "env-live-capture-${System.currentTimeMillis()}.mp4")
                val options = FileOutputOptions.Builder(out).build()
                try {
                    val started = controller.startRecording(options, AudioConfig.create(true), ContextCompat.getMainExecutor(context)) { event ->
                        when (event) {
                            is VideoRecordEvent.Start -> {
                                cameraRecording = true
                                player?.seekTo((backingCueSeconds * 1000).toLong()); player?.play()
                                status = "Recording. Maximum five minutes; backing playback starts at the selected cue."
                            }
                            is VideoRecordEvent.Finalize -> {
                                cameraRecording = false
                                recording = null
                                player?.pause()
                                if (event.hasError()) {
                                    error = "CameraX could not finalize this take (error ${event.error}). Please retry with sufficient device storage."
                                    out.delete()
                                } else {
                                    rawCapture = out
                                    status = "Capture complete. Ready to mix voice + backing on-device."
                                }
                            }
                        }
                    }
                    recording = started
                } catch (failure: Throwable) { error = failure.message ?: "Could not start the native camera recorder." }
            }, modifier = Modifier.weight(1f).height(48.dp)) { Text("Start recording") }
            OutlinedButton(enabled = cameraRecording, onClick = { recording?.stop(); recording = null; player?.pause() }, modifier = Modifier.weight(1f).height(48.dp)) { Text("Stop recording") }
        }
        if (backingUri != null) {
            Text("Start backing at ${"%.1f".format(backingCueSeconds)} sec", style = MaterialTheme.typography.bodySmall)
            Slider(value = backingCueSeconds, onValueChange = { backingCueSeconds = it }, valueRange = 0f..maxOf(0.1f, backingDurationMs / 1000f), enabled = !cameraRecording && !mixing)
            Text("The output loops the backing from this cue for the length of the video.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("Backing monitor level: ${(backingLevel * 100).toInt()}% (headphone preview)", style = MaterialTheme.typography.bodySmall)
            Slider(value = backingLevel, onValueChange = { backingLevel = it; player?.volume = it }, valueRange = 0f..1f, enabled = !cameraRecording)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(enabled = !cameraRecording, onClick = { if (player?.isPlaying == true) player?.pause() else { player?.seekTo(0); player?.play() } }, modifier = Modifier.weight(1f)) { Text(if (player?.isPlaying == true) "Pause backing" else "Preview backing") }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedTextField(value = presetSearch, onValueChange = { presetSearch = it }, label = { Text("Search vocal presets") }, singleLine = true, enabled = !cameraRecording && !mixing, modifier = Modifier.fillMaxWidth())
            OutlinedButton(enabled = !cameraRecording && !mixing, onClick = { presetMenuOpen = true }, modifier = Modifier.fillMaxWidth()) { Text("Vocal render preset · ${nativeVocalPresetLabel(vocalPreset)}") }
            DropdownMenu(expanded = presetMenuOpen, onDismissRequest = { presetMenuOpen = false }) {
                val matchingPresets = NATIVE_VOCAL_PRESETS.filter { it.first.contains(presetSearch, ignoreCase = true) || it.second.contains(presetSearch, ignoreCase = true) }
                if (matchingPresets.isEmpty()) {
                    DropdownMenuItem(text = { Text("No presets match this search") }, onClick = { presetMenuOpen = false }, enabled = false)
                } else matchingPresets.forEach { preset ->
                    DropdownMenuItem(text = { Text(preset.second) }, onClick = { vocalPreset = preset.first; presetMenuOpen = false })
                }
            }
            Text("Preset is rendered locally on the captured microphone track before the instrumental is mixed. Mic monitoring during capture stays dry. AutoPitch / Hard Tune are unavailable until a real key-aware engine is configured.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = { showAdvancedSound = !showAdvancedSound }, modifier = Modifier.fillMaxWidth(), enabled = !cameraRecording && !mixing) {
                Text(if (showAdvancedSound) "Hide advanced EQ & dynamics" else "Open advanced EQ & dynamics")
            }
            if (showAdvancedSound) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(12.dp)) {
                        Text("10-band graphic EQ", style = MaterialTheme.typography.titleMedium)
                        Text("Small cuts are often a safer starting point than boosts. The displayed bands affect the vocal render only.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        NATIVE_EQ_PROFILES.forEach { (profileName, bands) ->
                            OutlinedButton(onClick = { eqBandsDb = bands }, modifier = Modifier.fillMaxWidth(), enabled = !mixing) { Text(profileName) }
                        }
                        val eqCurveColor = MaterialTheme.colorScheme.primary
                        Canvas(modifier = Modifier.fillMaxWidth().height(112.dp).pointerInput(mixing) {
                            if (!mixing) {
                                var activeBandIndex = 0
                                fun setBandFromY(y: Float) {
                                    val chartTop = 8.dp.toPx()
                                    val chartHeight = (size.height - 16.dp.toPx()).coerceAtLeast(1f)
                                    val gain = (9f - ((y - chartTop) / chartHeight) * 18f).coerceIn(-9f, 9f)
                                    eqBandsDb = eqBandsDb.toMutableList().also { it[activeBandIndex] = (gain * 2).toInt() / 2f }
                                }
                                detectDragGestures(
                                    onDragStart = { offset ->
                                        activeBandIndex = ((offset.x / size.width.coerceAtLeast(1).toFloat()) * (eqBandsDb.size - 1)).toInt().coerceIn(eqBandsDb.indices)
                                        setBandFromY(offset.y)
                                    },
                                    onDrag = { change, _ -> change.consume(); setBandFromY(change.position.y) },
                                )
                            }
                        }) {
                            val top = 8.dp.toPx(); val chartHeight = size.height - 16.dp.toPx()
                            listOf(-9f, -6f, -3f, 0f, 3f, 6f, 9f).forEach { gain ->
                                val y = top + ((9f - gain) / 18f) * chartHeight
                                drawLine(eqCurveColor.copy(alpha = if (gain == 0f) 0.42f else 0.12f), Offset(0f, y), Offset(size.width, y), strokeWidth = 1.dp.toPx())
                            }
                            val points = eqBandsDb.mapIndexed { index, gain ->
                                val x = if (eqBandsDb.size <= 1) 0f else index.toFloat() / (eqBandsDb.size - 1) * size.width
                                val y = top + ((9f - gain.coerceIn(-9f, 9f)) / 18f) * chartHeight
                                Offset(x, y)
                            }
                            val path = Path().apply { points.forEachIndexed { index, point -> if (index == 0) moveTo(point.x, point.y) else lineTo(point.x, point.y) } }
                            drawPath(path, eqCurveColor, style = Stroke(width = 2.dp.toPx()))
                            points.forEach { drawCircle(eqCurveColor, radius = 4.dp.toPx(), center = it) }
                        }
                        Text("Touch and drag the curve to edit a band · sliders below remain available. This is a control response, not a measured spectrum.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        NATIVE_EQ_FREQUENCIES.forEachIndexed { index, frequency ->
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text("${frequency} Hz · ${if (eqBandsDb[index] > 0f) "+" else ""}${"%.1f".format(eqBandsDb[index])} dB", style = MaterialTheme.typography.bodySmall)
                                Slider(value = eqBandsDb[index], onValueChange = { value -> eqBandsDb = eqBandsDb.toMutableList().also { it[index] = value } }, valueRange = -9f..9f, enabled = !mixing)
                            }
                        }
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                            Text("Filter / cleanup", style = MaterialTheme.typography.titleSmall)
                            TextButton(onClick = { highPassHzOverride = null; lowPassHzOverride = null }, enabled = !mixing && (highPassHzOverride != null || lowPassHzOverride != null)) { Text("Use preset defaults") }
                        }
                        val presetHighPassHz = nativeVocalPresetHighPassHz(vocalPreset)
                        val presetLowPassHz = nativeVocalPresetLowPassHz(vocalPreset)
                        Text("High-pass / low cut · ${"%.0f".format(highPassHzOverride ?: presetHighPassHz)} Hz${if (highPassHzOverride == null) " · preset" else " · custom"}", style = MaterialTheme.typography.bodySmall)
                        Slider(value = highPassHzOverride ?: presetHighPassHz, onValueChange = { highPassHzOverride = it }, valueRange = 20f..1_000f, steps = 195, enabled = !mixing)
                        val shownLowPassHz = lowPassHzOverride ?: presetLowPassHz
                        Text("Low-pass / high cut · ${if (shownLowPassHz >= 19_999f) "Off" else "%.0f Hz".format(shownLowPassHz)}${if (lowPassHzOverride == null) " · preset" else " · custom"}", style = MaterialTheme.typography.bodySmall)
                        Slider(value = shownLowPassHz, onValueChange = { lowPassHzOverride = it }, valueRange = 1_000f..20_000f, steps = 189, enabled = !mixing)
                        Text("A 20 kHz high-cut setting bypasses this manual filter. The sliders affect the vocal render, not the backing track.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("Preamp / amplifier colour", style = MaterialTheme.typography.titleSmall)
                        NATIVE_AMP_CHARACTERS.chunked(2).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                row.forEach { (id, label) ->
                                    OutlinedButton(onClick = { ampCharacter = id }, modifier = Modifier.weight(1f), enabled = !mixing) { Text(if (ampCharacter == id) "✓ $label" else label) }
                                }
                            }
                        }
                        Text("Drive / saturation · ${"%.0f".format(ampDrive)}%", style = MaterialTheme.typography.bodySmall)
                        Slider(value = ampDrive, onValueChange = { ampDrive = it }, valueRange = 0f..100f, enabled = !mixing && ampCharacter != "clean")
                        Text("Bass tone · ${"%+.1f".format(ampBassDb)} dB", style = MaterialTheme.typography.bodySmall)
                        Slider(value = ampBassDb, onValueChange = { ampBassDb = it }, valueRange = -6f..6f, enabled = !mixing)
                        Text("Mid tone · ${"%+.1f".format(ampMidDb)} dB", style = MaterialTheme.typography.bodySmall)
                        Slider(value = ampMidDb, onValueChange = { ampMidDb = it }, valueRange = -6f..6f, enabled = !mixing)
                        Text("Treble tone · ${"%+.1f".format(ampTrebleDb)} dB", style = MaterialTheme.typography.bodySmall)
                        Slider(value = ampTrebleDb, onValueChange = { ampTrebleDb = it }, valueRange = -6f..6f, enabled = !mixing)
                        Text("Saturation is a creative preamp effect, not a physical amp or cabinet simulation.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("Compressor threshold · ${"%.0f".format(compressorThresholdDb)} dB", style = MaterialTheme.typography.bodySmall)
                        Slider(value = compressorThresholdDb, onValueChange = { compressorThresholdDb = it }, valueRange = -36f..-8f, enabled = !mixing)
                        Text("Compression ratio · ${"%.1f".format(compressorRatio)}:1", style = MaterialTheme.typography.bodySmall)
                        Slider(value = compressorRatio, onValueChange = { compressorRatio = it }, valueRange = 1f..8f, enabled = !mixing)
                        Text("Voice render gain · ${(voiceRenderGain * 100).toInt()}%", style = MaterialTheme.typography.bodySmall)
                        Slider(value = voiceRenderGain, onValueChange = { voiceRenderGain = it }, valueRange = 0f..1.5f, enabled = !mixing)
                        Text("Output trim · ${if (outputGainDb > 0f) "+" else ""}${"%.0f".format(outputGainDb)} dB", style = MaterialTheme.typography.bodySmall)
                        Slider(value = outputGainDb, onValueChange = { outputGainDb = it }, valueRange = -12f..6f, enabled = !mixing)
                        Text("Effect send · ${(effectAmount * 100).toInt()}%", style = MaterialTheme.typography.bodySmall)
                        Slider(value = effectAmount, onValueChange = { effectAmount = it }, valueRange = 0f..1.5f, enabled = !mixing)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedButton(onClick = { eqBandsDb = List(10) { 0f }; compressorThresholdDb = -20f; compressorRatio = 3f; voiceRenderGain = 1f; outputGainDb = 0f; effectAmount = 1f; ampCharacter = "clean"; ampDrive = 25f; ampBassDb = 0f; ampMidDb = 0f; ampTrebleDb = 0f; highPassHzOverride = null; lowPassHzOverride = null }, modifier = Modifier.weight(1f), enabled = !mixing) { Text("Reset sound") }
                        Text("My saved sound setups · this device", style = MaterialTheme.typography.titleSmall)
                        Text("Only sound values are stored locally. Your backing file and recordings are not saved in a setup.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("A/B quick compare · temporary snapshots", style = MaterialTheme.typography.titleSmall)
                        Text("Save A, change the sound, save B, then recall either snapshot to compare by ear. Snapshots stay in memory only.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedButton(onClick = { abSnapshotA = currentVocalSetup("Snapshot A", "ab-A"); activeAbSlot = "A"; status = "Captured temporary A snapshot." }, enabled = !mixing && !cameraRecording, modifier = Modifier.weight(1f)) { Text(if (abSnapshotA == null) "Save current to A" else "Replace A") }
                            OutlinedButton(onClick = { abSnapshotB = currentVocalSetup("Snapshot B", "ab-B"); activeAbSlot = "B"; status = "Captured temporary B snapshot." }, enabled = !mixing && !cameraRecording, modifier = Modifier.weight(1f)) { Text(if (abSnapshotB == null) "Save current to B" else "Replace B") }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedButton(onClick = { abSnapshotA?.let { applySavedVocalSetup(it); selectedSavedSetupId = ""; activeAbSlot = "A" } }, enabled = abSnapshotA != null && !mixing && !cameraRecording, modifier = Modifier.weight(1f)) { Text(if (activeAbSlot == "A") "✓ Recall A" else "Recall A") }
                            OutlinedButton(onClick = { abSnapshotB?.let { applySavedVocalSetup(it); selectedSavedSetupId = ""; activeAbSlot = "B" } }, enabled = abSnapshotB != null && !mixing && !cameraRecording, modifier = Modifier.weight(1f)) { Text(if (activeAbSlot == "B") "✓ Recall B" else "Recall B") }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedButton(onClick = { presetImportPicker.launch(arrayOf("application/json", "text/json", "text/plain")) }, enabled = !mixing && !cameraRecording, modifier = Modifier.weight(1f)) { Text("Import preset JSON") }
                            OutlinedButton(onClick = { pendingPresetExport = currentVocalSetup(savedSetupName.ifBlank { "Current sound" }); presetExportPicker.launch("env-audio-studio-preset.json") }, enabled = !mixing && !cameraRecording, modifier = Modifier.weight(1f)) { Text("Export current JSON") }
                        }
                        Text("Portable versioned JSON contains sound controls only (max 256 KB).", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        OutlinedTextField(value = savedSetupName, onValueChange = { savedSetupName = it.take(48) }, label = { Text("Setup name") }, singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !mixing && !cameraRecording)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedButton(onClick = { saveCurrentVocalSetup() }, enabled = !mixing && !cameraRecording && savedSetupName.isNotBlank(), modifier = Modifier.weight(1f)) { Text("Save setup") }
                            OutlinedButton(onClick = { savedSetupMenuOpen = true }, enabled = !mixing && !cameraRecording && savedVocalSetups.isNotEmpty(), modifier = Modifier.weight(1f)) { Text(if (savedSetupMenuOpen) "Choose setup" else "Load saved setup") }
                        }
                        DropdownMenu(expanded = savedSetupMenuOpen, onDismissRequest = { savedSetupMenuOpen = false }) {
                            savedVocalSetups.forEach { setup -> DropdownMenuItem(text = { Text(setup.name) }, onClick = { applySavedVocalSetup(setup) }) }
                        }
                        if (selectedSavedSetupId.isNotBlank()) {
                            val selectedSetup = savedVocalSetups.firstOrNull { it.id == selectedSavedSetupId }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                Text(selectedSetup?.name ?: "Saved setup selected", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                                TextButton(onClick = { deleteSelectedVocalSetup() }, enabled = !mixing && !cameraRecording) { Text("Delete") }
                            }
                        }
                        }
                    }
                }
            }
        }
        Button(enabled = rawCapture != null && backingUri != null && !cameraRecording && !mixing, onClick = {
            val cameraFile = rawCapture ?: return@Button
            val song = backingUri ?: return@Button
            mixing = true; error = ""; status = "Mixing camera audio with the backing track locally…"
            scope.launch {
                val output = File(context.cacheDir, "env-live-performance-${System.currentTimeMillis()}.mp4")
                try {
                    val vocalEffects = Effects(listOf(NativeVocalPresetAudioProcessor(
                        presetId = vocalPreset,
                        eqBandsDb = eqBandsDb.toList(),
                        compressorThresholdDb = compressorThresholdDb,
                        compressorRatioOverride = compressorRatio,
                        outputGainDb = outputGainDb,
                        voiceGain = voiceRenderGain,
                        effectAmount = effectAmount,
                        ampCharacter = ampCharacter,
                        ampDrive = ampDrive,
                        ampBassDb = ampBassDb,
                        ampMidDb = ampMidDb,
                        ampTrebleDb = ampTrebleDb,
                        highPassHzOverride = highPassHzOverride,
                        lowPassHzOverride = lowPassHzOverride,
                    )), emptyList())
                    val cameraItem = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(cameraFile))).setEffects(vocalEffects).build()
                    val cueMs = (backingCueSeconds * 1000).toLong().coerceAtLeast(0L)
                    val backingMediaItem = MediaItem.Builder().setUri(song).setClippingConfiguration(MediaItem.ClippingConfiguration.Builder().setStartPositionMs(cueMs).build()).build()
                    val backingItem = EditedMediaItem.Builder(backingMediaItem).build()
                    val cameraSequence = EditedMediaItemSequence.Builder(listOf(cameraItem)).build()
                    val backingSequence = EditedMediaItemSequence.Builder(listOf(backingItem)).setIsLooping(true).build()
                    val composition = Composition.Builder(listOf(cameraSequence, backingSequence)).build()
                    val completion = kotlinx.coroutines.CompletableDeferred<Result<Unit>>()
                    val transformer = Transformer.Builder(context).addListener(object : Transformer.Listener {
                        override fun onCompleted(composition: Composition, exportResult: ExportResult) { completion.complete(Result.success(Unit)) }
                        override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) { completion.complete(Result.failure(exportException)) }
                    }).build()
                    transformer.start(composition, output.absolutePath)
                    completion.await().getOrThrow()
                    finalVideo = output
                    status = "Final MP4 ready. The ${nativeVocalPresetLabel(vocalPreset)} preset was rendered on the microphone track, then mixed with your backing track on-device. Review the balance before sharing."
                } catch (failure: Throwable) {
                    output.delete(); error = failure.message ?: "The local media composition failed. Keep the original capture and try again."; status = "Composition failed; original capture is retained in app-private storage."
                } finally { mixing = false }
            }
        }, modifier = Modifier.fillMaxWidth()) { Text(if (mixing) "Mixing…" else "Mix voice + backing") }
        if (mixing) androidx.compose.material3.LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        if (finalVideo != null) {
            Text("Final video is ready in app-private storage. Save a copy before leaving this screen.", style = MaterialTheme.typography.bodySmall)
            Button(onClick = { savePicker.launch("enV-live-performance.mp4") }, modifier = Modifier.fillMaxWidth()) { Text("Export / save MP4") }
        }
        if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
    }
}

private fun copyUriToCache(context: Context, uri: Uri, prefix: String, extension: String): File {
    val file = File(context.cacheDir, "$prefix-${System.currentTimeMillis()}$extension")
    context.contentResolver.openInputStream(uri)?.use { input -> file.outputStream().use { output -> input.copyTo(output) } }
        ?: throw IllegalStateException("The selected audio could not be opened.")
    if (file.length() == 0L) { file.delete(); throw IllegalArgumentException("The selected audio file is empty.") }
    return file
}

private val NATIVE_VOCAL_PRESETS = listOf(
    "clean" to "Clean Studio",
    "warm" to "Warm Vocal",
    "pop" to "Pop Shine",
    "rap" to "Rap Punch",
    "dream-hall" to "Dream Hall / Reverb",
    "slapback" to "Slapback Echo",
    "lofi" to "Lo-Fi / Radio",
    "telephone" to "Telephone / Broadcast",
    "wide-chorus" to "Wide Chorus",
    "studio-room" to "Studio Room",
    "ambient" to "Ambient Dream",
    "megaphone" to "Megaphone",
    "vocal-double" to "Vocal Double",
    "podcast" to "Podcast Clarity",
    "acoustic" to "Acoustic Warmth",
    "rnb" to "R&B Silk",
    "arena" to "Arena Vocal",
)

private val NATIVE_EQ_FREQUENCIES = listOf(60, 120, 250, 500, 1_000, 2_000, 4_000, 8_000, 12_000, 16_000)
private val NATIVE_EQ_PROFILES = listOf(
    "Flat EQ" to List(10) { 0f },
    "Vocal clarity" to listOf(-3f, -2f, -1f, 0f, 1f, 2f, 2.5f, 1.5f, 1f, 0f),
    "Warm" to listOf(1.5f, 1.5f, 1f, 0.5f, 0f, -0.5f, -1f, -1f, -0.5f, -0.5f),
    "Bright" to listOf(-1f, -1f, -0.5f, 0f, 0.5f, 1.5f, 2f, 2f, 1.5f, 1f),
    "Soft top" to listOf(0f, 0f, 0.5f, 0.5f, 0f, -0.5f, -1f, -2f, -2.5f, -3f),
    "Radio tone" to listOf(-4f, -3f, -1f, 1.5f, 2f, 2f, 1f, -1f, -3f, -4f),
    "Podcast speech" to listOf(-3f, -2f, -0.5f, 0f, 1f, 1.5f, 1.5f, 0.8f, 0f, 0f),
    "Air & openness" to listOf(-0.5f, -0.5f, 0f, 0f, 0.3f, 0.6f, 1f, 1.5f, 2f, 1.5f),
    "Sibilance soften" to listOf(0f, 0f, 0f, 0f, 0f, -0.5f, -1.5f, -2.5f, -2.5f, -1.5f),
    "Intimate vocal" to listOf(0f, 0f, 0.5f, 1f, 1.2f, 0.8f, 0.3f, 0f, -0.5f, -1f),
    "Lead vocal" to listOf(-2f, -1f, 0f, 0.5f, 1f, 1.5f, 2f, 1.5f, 1f, 0.5f),
    "Rumble reduction" to listOf(-5f, -3f, -1.5f, -0.5f, 0f, 0f, 0f, 0f, 0f, 0f),
)

private val NATIVE_AMP_CHARACTERS = listOf(
    "clean" to "Clean preamp",
    "tube" to "Warm tube",
    "crunch" to "Crunch",
    "fuzz" to "Fuzz",
)

private fun nativeVocalPresetLabel(id: String): String = NATIVE_VOCAL_PRESETS.firstOrNull { it.first == id }?.second ?: "Clean Studio"

private fun nativeVocalPresetHighPassHz(id: String): Float = when (id) {
    "warm", "acoustic" -> 75f
    "pop" -> 90f
    "rap" -> 100f
    "dream-hall", "arena" -> 80f
    "slapback" -> 85f
    "lofi" -> 180f
    "telephone" -> 340f
    "wide-chorus", "vocal-double" -> 85f
    "studio-room" -> 75f
    "ambient" -> 80f
    "megaphone" -> 500f
    "podcast" -> 95f
    "rnb" -> 80f
    else -> 70f
}

private fun nativeVocalPresetLowPassHz(id: String): Float = when (id) {
    "lofi" -> 5_200f
    "telephone" -> 3_400f
    "megaphone" -> 2_600f
    else -> 20_000f
}
