package com.chastech.env

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import android.content.pm.PackageManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.CameraController
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.camera.core.CameraSelector
import androidx.camera.view.video.AudioConfig
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Recording
import androidx.camera.video.VideoRecordEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.runtime.livedata.observeAsState
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private enum class NativeCameraMode { PHOTO, VIDEO }

@Composable
fun NativeCameraStudioScreen() {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val controller = remember(context) {
        LifecycleCameraController(context).apply {
            cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
            setEnabledUseCases(CameraController.IMAGE_CAPTURE or CameraController.VIDEO_CAPTURE)
            setPinchToZoomEnabled(true)
            setTapToFocusEnabled(true)
        }
    }
    val zoomState = controller.zoomState.observeAsState().value
    val exposureState = controller.cameraInfo?.exposureState
    var exposureIndex by remember(exposureState) { mutableStateOf(exposureState?.exposureCompensationIndex ?: 0) }
    var cameraGranted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    var cameraPermissionDenied by remember { mutableStateOf(false) }
    var cameraPermissionNeedsSettings by remember { mutableStateOf(false) }
    var microphoneGranted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
    }
    var mode by remember { mutableStateOf(NativeCameraMode.PHOTO) }
    var usingFrontCamera by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf<Recording?>(null) }
    var recordingActive by remember { mutableStateOf(false) }
    var pendingFile by remember { mutableStateOf<File?>(null) }
    var pendingMime by remember { mutableStateOf("image/jpeg") }
    var status by remember { mutableStateOf("Camera ready.") }
    var error by remember { mutableStateOf<String?>(null) }
    var flashEnabled by remember { mutableStateOf(false) }
    val latestRecording = rememberUpdatedState(recording)
    val disposeAfterRecording = remember(controller) { AtomicBoolean(false) }

    val savePicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("image/jpeg")) { target ->
        val source = pendingFile
        if (target != null && source != null) {
            runCatching { copyCameraFile(context, source, target) }
                .onSuccess { status = "Photo saved to the location you selected." }
                .onFailure { error = it.message ?: "Could not save this photo." }
        }
        pendingFile?.delete()
        pendingFile = null
    }
    val saveVideoPicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("video/mp4")) { target ->
        val source = pendingFile
        if (target != null && source != null) {
            runCatching { copyCameraFile(context, source, target) }
                .onSuccess { status = "Video saved to the location you selected." }
                .onFailure { error = it.message ?: "Could not save this video." }
        }
        pendingFile?.delete()
        pendingFile = null
    }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        cameraGranted = granted
        cameraPermissionDenied = !granted
        cameraPermissionNeedsSettings = !granted && context.findActivity()?.let {
            !ActivityCompat.shouldShowRequestPermissionRationale(it, Manifest.permission.CAMERA)
        } == true
        if (granted) {
            error = null
            status = "Camera ready."
        } else {
            error = if (cameraPermissionNeedsSettings) {
                "Camera access is disabled for enV. Enable it in app settings to continue."
            } else {
                "Camera access is needed to take photos and videos."
            }
        }
    }

    val requestCameraAccess = {
        cameraPermission.launch(Manifest.permission.CAMERA)
    }

    LaunchedEffect(Unit) {
        if (!cameraGranted) requestCameraAccess()
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                cameraGranted = granted
                if (granted) {
                    cameraPermissionDenied = false
                    cameraPermissionNeedsSettings = false
                    error = null
                    status = "Camera ready."
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val microphonePermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        microphoneGranted = granted
        startNativeCameraVideo(context, controller, granted,
            onRecording = { next -> recording = next; recordingActive = true; error = null; status = if (granted) "Recording video with microphone audio." else "Recording video without microphone audio." },
            onFinalized = { file, message ->
                val disposing = disposeAfterRecording.get()
                recording = null
                recordingActive = false
                if (disposing) {
                    file?.delete()
                    pendingFile?.delete()
                    pendingFile = null
                } else if (file != null) {
                    pendingFile = file
                    pendingMime = "video/mp4"
                    status = "Recording complete. Save your video to keep it."
                } else {
                    error = message
                }
                if (disposeAfterRecording.compareAndSet(true, false)) {
                    runCatching { controller.enableTorch(false) }
                    runCatching { controller.unbind() }
                }
            },
            onError = { message ->
                recording = null
                recordingActive = false
                error = message
                if (disposeAfterRecording.compareAndSet(true, false)) {
                    runCatching { controller.enableTorch(false) }
                    runCatching { controller.unbind() }
                }
            }
        )
    }

    DisposableEffect(controller, lifecycleOwner, cameraGranted) {
        if (cameraGranted) controller.bindToLifecycle(lifecycleOwner)
        onDispose {
            val activeRecording = latestRecording.value
            if (activeRecording != null) {
                // CameraX finalizes MP4 asynchronously after stop(). Keep the controller
                // bound until the Finalize event arrives instead of unbinding mid-write.
                disposeAfterRecording.set(true)
                pendingFile?.delete()
                pendingFile = null
                runCatching { activeRecording.stop() }
            } else {
                runCatching { controller.enableTorch(false) }
                if (cameraGranted) runCatching { controller.unbind() }
                pendingFile?.delete()
            }
        }
    }

    fun switchCamera() {
        if (recordingActive || !cameraGranted) return
        usingFrontCamera = !usingFrontCamera
        controller.cameraSelector = if (usingFrontCamera) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
        status = if (usingFrontCamera) "Front camera selected." else "Rear camera selected."
        error = null
    }

    fun capturePhoto() {
        if (!cameraGranted || recordingActive) return
        val output = File(context.cacheDir, "env-camera-photo-${System.currentTimeMillis()}.jpg")
        val options = ImageCapture.OutputFileOptions.Builder(output).build()
        controller.takePicture(options, ContextCompat.getMainExecutor(context), object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(result: ImageCapture.OutputFileResults) {
                pendingFile?.delete()
                pendingFile = output
                pendingMime = "image/jpeg"
                status = "Photo captured. Save it to your device."
                error = null
            }
            override fun onError(exception: ImageCaptureException) {
                output.delete()
                error = exception.message ?: "The photo could not be captured. Try again."
            }
        })
    }

    fun startVideo() {
        if (!cameraGranted || recordingActive) return
        if (!microphoneGranted && ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
        } else {
            startNativeCameraVideo(context, controller, microphoneGranted,
                onRecording = { next -> recording = next; recordingActive = true; error = null; status = if (microphoneGranted) "Recording video with microphone audio." else "Recording video without microphone audio." },
                onFinalized = { file, message ->
                    val disposing = disposeAfterRecording.get()
                    recording = null
                    recordingActive = false
                    if (disposing) {
                        file?.delete()
                        pendingFile?.delete()
                        pendingFile = null
                    } else if (file != null) {
                        pendingFile?.delete()
                        pendingFile = file
                        pendingMime = "video/mp4"
                        status = "Recording complete. Save your video to keep it."
                    } else {
                        error = message
                    }
                    if (disposeAfterRecording.compareAndSet(true, false)) {
                        runCatching { controller.enableTorch(false) }
                        runCatching { controller.unbind() }
                    }
                },
                onError = { message ->
                recording = null
                recordingActive = false
                error = message
                if (disposeAfterRecording.compareAndSet(true, false)) {
                    runCatching { controller.enableTorch(false) }
                    runCatching { controller.unbind() }
                }
            }
            )
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Camera Studio", style = MaterialTheme.typography.titleLarge)
            Surface(shape = CircleShape, color = if (cameraGranted) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant) {
                Text(if (cameraGranted) "Camera ready" else "Camera off", modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp), style = MaterialTheme.typography.labelSmall)
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color.Black)) {
            Box(modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f), contentAlignment = Alignment.Center) {
                if (cameraGranted) {
                    AndroidView(
                        modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f),
                        factory = { viewContext ->
                            PreviewView(viewContext).also { preview ->
                                preview.controller = controller
                                preview.scaleType = PreviewView.ScaleType.FILL_CENTER
                            }
                        },
                        update = { it.controller = controller }
                    )
                }
                if (recordingActive) {
                    Surface(modifier = Modifier.align(Alignment.TopStart).padding(12.dp), color = Color(0xCC991B1B), shape = CircleShape) {
                        Text("● REC", modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), color = Color.White, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }

        if (!cameraGranted && cameraPermissionDenied) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(error ?: "Camera access is needed.", modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                OutlinedButton(onClick = {
                    if (cameraPermissionNeedsSettings) {
                        val settingsIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                            data = Uri.fromParts("package", context.packageName, null)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        context.startActivity(settingsIntent)
                    } else {
                        requestCameraAccess()
                    }
                }) {
                    Text(if (cameraPermissionNeedsSettings) "Open settings" else "Try again")
                }
            }
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { mode = NativeCameraMode.PHOTO }, enabled = !recordingActive, modifier = Modifier.weight(1f)) { Text("Photo") }
            OutlinedButton(onClick = { mode = NativeCameraMode.VIDEO }, enabled = !recordingActive, modifier = Modifier.weight(1f)) { Text("Video") }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            IconButton(
                onClick = { switchCamera() },
                enabled = cameraGranted && !recordingActive
            ) {
                Icon(
                    imageVector = Icons.Filled.Cameraswitch,
                    contentDescription = "Switch camera",
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }

            Box(
                modifier = Modifier
                    .size(76.dp)
                    .border(4.dp, MaterialTheme.colorScheme.onSurface, CircleShape)
                    .clickable(enabled = cameraGranted && (!recordingActive || mode == NativeCameraMode.VIDEO)) {
                        if (mode == NativeCameraMode.PHOTO) capturePhoto()
                        else if (recordingActive) recording?.stop()
                        else startVideo()
                    }
                    .semantics {
                        contentDescription = if (mode == NativeCameraMode.PHOTO) {
                            "Take photo"
                        } else if (recordingActive) {
                            "Stop video recording"
                        } else {
                            "Start video recording"
                        }
                        role = Role.Button
                    },
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(if (recordingActive) 28.dp else 54.dp)
                        .background(
                            color = if (mode == NativeCameraMode.VIDEO) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                            shape = CircleShape
                        )
                )
            }

            if (cameraGranted && controller.cameraInfo?.hasFlashUnit() == true) {
                IconButton(
                    onClick = {
                        flashEnabled = !flashEnabled
                        controller.enableTorch(flashEnabled)
                    },
                    enabled = !recordingActive
                ) {
                    Icon(
                        imageVector = if (flashEnabled) Icons.Filled.FlashOff else Icons.Filled.FlashOn,
                        contentDescription = if (flashEnabled) "Turn flash off" else "Turn flash on",
                        tint = MaterialTheme.colorScheme.onSurface
                    )
                }
            } else {
                Spacer(Modifier.size(48.dp))
            }
        }

        if (cameraGranted && zoomState != null && zoomState.maxZoomRatio > zoomState.minZoomRatio) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Zoom", style = MaterialTheme.typography.labelMedium)
                    Text("${String.format("%.1f", zoomState.zoomRatio)}×", style = MaterialTheme.typography.labelMedium)
                }
                Slider(
                    value = zoomState.linearZoom.coerceIn(0f, 1f),
                    onValueChange = { controller.setLinearZoom(it) },
                    enabled = !recordingActive,
                )
            }
        }

        if (
            cameraGranted &&
            exposureState?.isExposureCompensationSupported == true &&
            exposureState.exposureCompensationRange.upper > exposureState.exposureCompensationRange.lower
        ) {
            val exposureRange = exposureState.exposureCompensationRange
            val exposureStep = exposureState.exposureCompensationStep.toFloat()
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Exposure", style = MaterialTheme.typography.labelMedium)
                    Text("${String.format("%+.1f", exposureIndex * exposureStep)} EV", style = MaterialTheme.typography.labelMedium)
                }
                Slider(
                    value = exposureIndex.toFloat().coerceIn(exposureRange.lower.toFloat(), exposureRange.upper.toFloat()),
                    onValueChange = { next ->
                        val index = next.roundToInt().coerceIn(exposureRange.lower, exposureRange.upper)
                        exposureIndex = index
                        controller.cameraControl?.setExposureCompensationIndex(index)
                    },
                    valueRange = exposureRange.lower.toFloat()..exposureRange.upper.toFloat(),
                    enabled = !recordingActive,
                )
            }
        }

        if (pendingFile != null && !recordingActive) {
            Button(
                onClick = {
                    if (pendingMime == "video/mp4") saveVideoPicker.launch("enV-camera-video.mp4")
                    else savePicker.launch("enV-camera-photo.jpg")
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (pendingMime == "video/mp4") "Save video" else "Save photo") }
        }

        if (cameraGranted && error != null) {
            Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        } else if (cameraGranted) {
            Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun startNativeCameraVideo(
    context: Context,
    controller: LifecycleCameraController,
    includeAudio: Boolean,
    onRecording: (Recording) -> Unit,
    onFinalized: (File?, String) -> Unit,
    onError: (String) -> Unit,
) {
    val output = File(context.cacheDir, "env-camera-video-${System.currentTimeMillis()}.mp4")
    val options = FileOutputOptions.Builder(output).build()
    try {
        // Re-check at the point of use: permission can be denied or revoked after
        // the UI decision. A missing microphone permission must still allow silent video.
        val audioConfig = if (
            includeAudio &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        ) {
            AudioConfig.create(true)
        } else {
            AudioConfig.create(false)
        }
        val recording = controller.startRecording(
            options,
            audioConfig,
            ContextCompat.getMainExecutor(context)
        ) { event ->
            when (event) {
                is VideoRecordEvent.Start -> Unit
                is VideoRecordEvent.Finalize -> {
                    if (event.hasError()) {
                        output.delete()
                        onFinalized(null, "Video recording could not be finalized (error ${event.error}). Check storage and try again.")
                    } else onFinalized(output, "")
                }
                else -> Unit
            }
        }
        onRecording(recording)
    } catch (failure: Throwable) {
        output.delete()
        onError(failure.message ?: "The camera could not start video recording.")
    }
}

private fun copyCameraFile(context: Context, source: File, target: Uri) {
    val output = context.contentResolver.openOutputStream(target) ?: error("The selected save location could not be opened.")
    output.use { stream -> source.inputStream().use { input -> input.copyTo(stream) } }
}
