package com.chastech.env

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.net.Uri
import android.content.pm.PackageManager
import android.graphics.PointF
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Matrix as AndroidMatrix
import android.graphics.Paint
import android.graphics.Path as AndroidPath
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CaptureRequest
import android.provider.Settings
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Range
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.CameraController
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.camera.core.CameraSelector
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.Camera2CameraControl
import androidx.camera.camera2.interop.CaptureRequestOptions
import androidx.camera.core.CameraEffect
import androidx.camera.core.ImageAnalysis
import androidx.camera.effects.OverlayEffect
import androidx.camera.media3.effect.Media3Effect
import androidx.camera.core.ConcurrentCamera
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.Recorder
import androidx.camera.video.VideoCapture
import androidx.camera.view.video.AudioConfig
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recording
import androidx.camera.video.VideoRecordEvent
import androidx.compose.foundation.Canvas
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.Offset
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
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.Effect
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Brightness
import androidx.media3.effect.Contrast
import androidx.media3.effect.HslAdjustment
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import androidx.core.util.Consumer
import androidx.media3.effect.RgbFilter
import androidx.compose.runtime.livedata.observeAsState
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private enum class NativeCameraMode { PHOTO, VIDEO }

private enum class NativeCameraLook(val label: String) {
    NATURAL("Natural"),
    WARM("Warm"),
    COOL("Cool"),
    MONO("Mono"),
    VIVID("Vivid"),
    FADE("Fade"),
    SUNSET("Sunset"),
    GLOW("Glow"),
}

@androidx.annotation.OptIn(UnstableApi::class)
private fun nativeCameraEffects(look: NativeCameraLook): List<Effect> = when (look) {
    NativeCameraLook.NATURAL -> emptyList()
    NativeCameraLook.WARM -> listOf(HslAdjustment.Builder().adjustHue(-7f).adjustSaturation(8f).adjustLightness(2f).build())
    NativeCameraLook.COOL -> listOf(HslAdjustment.Builder().adjustHue(8f).adjustSaturation(-6f).build())
    NativeCameraLook.MONO -> listOf(RgbFilter.createGrayscaleFilter())
    NativeCameraLook.VIVID -> listOf(Contrast(0.12f), HslAdjustment.Builder().adjustSaturation(18f).build())
    NativeCameraLook.FADE -> listOf(Contrast(-0.12f), Brightness(0.035f))
    NativeCameraLook.SUNSET -> listOf(HslAdjustment.Builder().adjustHue(-15f).adjustSaturation(14f).adjustLightness(2f).build())
    NativeCameraLook.GLOW -> listOf(Brightness(0.045f), Contrast(-0.04f))
}

private data class NativeFaceOverlayGeometry(
    val bounds: RectF,
    val leftEye: PointF?,
    val rightEye: PointF?
)

private fun mlKitPointToSensor(
    x: Float,
    y: Float,
    imageWidth: Int,
    imageHeight: Int,
    rotationDegrees: Int,
    analysisToSensor: AndroidMatrix
): PointF {
    val raw = when (((rotationDegrees % 360) + 360) % 360) {
        90 -> floatArrayOf(y, imageHeight.toFloat() - x)
        180 -> floatArrayOf(imageWidth.toFloat() - x, imageHeight.toFloat() - y)
        270 -> floatArrayOf(imageWidth.toFloat() - y, x)
        else -> floatArrayOf(x, y)
    }
    analysisToSensor.mapPoints(raw)
    return PointF(raw[0], raw[1])
}

private fun mapNativeFaceToSensor(
    face: Face,
    imageWidth: Int,
    imageHeight: Int,
    rotationDegrees: Int,
    analysisToSensor: AndroidMatrix
): NativeFaceOverlayGeometry {
    val bounds = face.boundingBox
    val corners = floatArrayOf(
        bounds.left.toFloat(), bounds.top.toFloat(),
        bounds.right.toFloat(), bounds.top.toFloat(),
        bounds.right.toFloat(), bounds.bottom.toFloat(),
        bounds.left.toFloat(), bounds.bottom.toFloat()
    )
    for (index in corners.indices step 2) {
        val point = mlKitPointToSensor(
            corners[index], corners[index + 1],
            imageWidth, imageHeight, rotationDegrees, analysisToSensor
        )
        corners[index] = point.x
        corners[index + 1] = point.y
    }
    val xs = listOf(corners[0], corners[2], corners[4], corners[6])
    val ys = listOf(corners[1], corners[3], corners[5], corners[7])
    val sensorBounds = RectF(xs.minOrNull() ?: 0f, ys.minOrNull() ?: 0f, xs.maxOrNull() ?: 0f, ys.maxOrNull() ?: 0f)
    fun eye(type: Int): PointF? = face.getLandmark(type)?.position?.let { position ->
        mlKitPointToSensor(
            position.x, position.y,
            imageWidth, imageHeight, rotationDegrees, analysisToSensor
        )
    }
    return NativeFaceOverlayGeometry(
        bounds = sensorBounds,
        leftEye = eye(FaceLandmark.LEFT_EYE),
        rightEye = eye(FaceLandmark.RIGHT_EYE)
    )
}

private fun drawNativeFaceOverlay(
    canvas: AndroidCanvas,
    face: NativeFaceOverlayGeometry,
    effect: String
) {
    val bounds = face.bounds
    if (bounds.width() <= 0f || bounds.height() <= 0f) return
    when (effect) {
        "Glasses" -> {
            val leftEye = face.leftEye ?: return
            val rightEye = face.rightEye ?: return
            val eyeDistance = kotlin.math.hypot(
                (rightEye.x - leftEye.x).toDouble(),
                (rightEye.y - leftEye.y).toDouble()
            ).toFloat()
            if (eyeDistance < 1f) return
            val lensWidth = maxOf(eyeDistance * 0.82f, bounds.width() * 0.14f)
            val lensHeight = lensWidth * 0.52f
            val leftLens = RectF(
                leftEye.x - lensWidth / 2, leftEye.y - lensHeight / 2,
                leftEye.x + lensWidth / 2, leftEye.y + lensHeight / 2
            )
            val rightLens = RectF(
                rightEye.x - lensWidth / 2, rightEye.y - lensHeight / 2,
                rightEye.x + lensWidth / 2, rightEye.y + lensHeight / 2
            )
            val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.argb(175, 9, 27, 39) }
            val frame = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = android.graphics.Color.rgb(94, 230, 228)
                style = Paint.Style.STROKE
                strokeWidth = maxOf(2f, bounds.width() * 0.012f)
            }
            canvas.drawRoundRect(leftLens, lensHeight * 0.24f, lensHeight * 0.24f, fill)
            canvas.drawRoundRect(rightLens, lensHeight * 0.24f, lensHeight * 0.24f, fill)
            canvas.drawRoundRect(leftLens, lensHeight * 0.24f, lensHeight * 0.24f, frame)
            canvas.drawRoundRect(rightLens, lensHeight * 0.24f, lensHeight * 0.24f, frame)
            canvas.drawLine(leftLens.right, leftEye.y, rightLens.left, rightEye.y, frame)
        }
        "Crown" -> {
            val crownWidth = bounds.width() * 0.68f
            val crownHeight = bounds.height() * 0.24f
            val left = bounds.centerX() - crownWidth / 2
            val right = bounds.centerX() + crownWidth / 2
            val baseY = bounds.top - bounds.height() * 0.035f
            val topY = baseY - crownHeight
            val path = AndroidPath().apply {
                moveTo(left, baseY)
                lineTo(left + crownWidth * 0.08f, topY + crownHeight * 0.18f)
                lineTo(left + crownWidth * 0.34f, topY + crownHeight * 0.66f)
                lineTo(bounds.centerX(), topY)
                lineTo(left + crownWidth * 0.66f, topY + crownHeight * 0.66f)
                lineTo(right - crownWidth * 0.08f, topY + crownHeight * 0.18f)
                lineTo(right, baseY)
                close()
            }
            val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.rgb(255, 195, 48) }
            val outline = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = android.graphics.Color.rgb(255, 238, 176)
                style = Paint.Style.STROKE
                strokeWidth = maxOf(2f, bounds.width() * 0.012f)
            }
            canvas.drawPath(path, fill)
            canvas.drawPath(path, outline)
        }
        "Soft glow" -> {
            val radius = bounds.width() * 0.62f
            val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader = RadialGradient(
                    bounds.centerX(), bounds.centerY(), radius,
                    intArrayOf(
                        android.graphics.Color.argb(62, 255, 224, 196),
                        android.graphics.Color.argb(26, 255, 224, 196),
                        android.graphics.Color.TRANSPARENT
                    ),
                    floatArrayOf(0f, 0.64f, 1f),
                    Shader.TileMode.CLAMP
                )
            }
            canvas.drawOval(
                RectF(
                    bounds.centerX() - radius,
                    bounds.centerY() - bounds.height() * 0.62f,
                    bounds.centerX() + radius,
                    bounds.centerY() + bounds.height() * 0.62f
                ),
                glow
            )
        }
    }
}

private data class NativeCameraQuality(val label: String, val quality: Quality)
private data class NativeCameraLensOption(val cameraId: String, val focalLengthMm: Float, val label: String)

private val nativeCameraQualities = listOf(
    NativeCameraQuality("720p", Quality.HD),
    NativeCameraQuality("1080p", Quality.FHD),
    NativeCameraQuality("4K", Quality.UHD),
)

@androidx.annotation.OptIn(androidx.camera.camera2.interop.ExperimentalCamera2Interop::class, androidx.camera.core.ExperimentalGetImage::class, UnstableApi::class)
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
            setVideoCaptureQualitySelector(
                QualitySelector.from(Quality.FHD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD))
            )
        }
    }
    var dualCameraMode by remember { mutableStateOf(false) }
    var selectedLook by remember { mutableStateOf(NativeCameraLook.NATURAL) }
    var faceEffectMode by remember { mutableStateOf("Off") }
    var effectError by remember { mutableStateOf<String?>(null) }
    var faceOverlayError by remember { mutableStateOf<String?>(null) }
    val faceEffectModeState = rememberUpdatedState(faceEffectMode)
    val faceFrameResults = remember { ConcurrentHashMap<Long, List<NativeFaceOverlayGeometry>>() }
    val faceOverlayThread = remember { HandlerThread("enV-camera-face-overlay").apply { start() } }
    val faceOverlayEffect = remember(faceOverlayThread) {
        OverlayEffect(
            CameraEffect.PREVIEW or CameraEffect.VIDEO_CAPTURE,
            6,
            Handler(faceOverlayThread.looper),
            Consumer<Throwable> { failure ->
                Handler(Looper.getMainLooper()).post {
                    faceOverlayError = failure.message ?: "Face effects are unavailable on this camera."
                }
            }
        ).apply {
            setOnDrawListener { frame ->
                val faces = faceFrameResults.remove(frame.timestampNanos)
                if (!faces.isNullOrEmpty()) {
                    val canvas = frame.overlayCanvas
                    canvas.save()
                    canvas.setMatrix(frame.sensorToBufferTransform)
                    faces.forEach { face -> drawNativeFaceOverlay(canvas, face, faceEffectModeState.value) }
                    canvas.restore()
                }
                true
            }
        }
    }
    val faceDetector = remember {
        FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
                .enableTracking()
                .build()
        )
    }
    val faceAnalysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val faceAnalyzer = remember(faceDetector, faceOverlayEffect, faceAnalysisExecutor) {
        ImageAnalysis.Analyzer { imageProxy ->
            val mediaImage = imageProxy.image
            if (mediaImage == null) {
                imageProxy.close()
            } else {
                val timestamp = imageProxy.imageInfo.timestamp
                val rotation = imageProxy.imageInfo.rotationDegrees
                val analysisToSensor = AndroidMatrix()
                if (!imageProxy.imageInfo.sensorToBufferTransformMatrix.invert(analysisToSensor)) {
                    imageProxy.close()
                } else {
                    try {
                        val input = InputImage.fromMediaImage(mediaImage, rotation)
                        faceDetector.process(input)
                            .addOnSuccessListener(faceAnalysisExecutor) { detectedFaces ->
                                val geometries = detectedFaces.map { face ->
                                    mapNativeFaceToSensor(
                                        face,
                                        imageProxy.width,
                                        imageProxy.height,
                                        rotation,
                                        analysisToSensor
                                    )
                                }
                                faceFrameResults[timestamp] = geometries
                                while (faceFrameResults.size > 8) {
                                    faceFrameResults.keys.minOrNull()?.let(faceFrameResults::remove) ?: break
                                }
                                faceOverlayEffect.drawFrameAsync(timestamp)
                            }
                            .addOnFailureListener(faceAnalysisExecutor) { failure ->
                                faceFrameResults[timestamp] = emptyList()
                                faceOverlayEffect.drawFrameAsync(timestamp)
                                Handler(Looper.getMainLooper()).post {
                                    faceOverlayError = failure.message ?: "Face tracking could not process this frame."
                                }
                            }
                            .addOnCompleteListener(faceAnalysisExecutor) {
                                imageProxy.close()
                            }
                    } catch (failure: Throwable) {
                        imageProxy.close()
                        faceFrameResults[timestamp] = emptyList()
                        faceOverlayEffect.drawFrameAsync(timestamp)
                        Handler(Looper.getMainLooper()).post {
                            faceOverlayError = failure.message ?: "Face tracking could not process this frame."
                        }
                    }
                }
            }
        }
    }
    val cameraEffect = remember(context) {
        Media3Effect(
            context,
            CameraEffect.PREVIEW or CameraEffect.VIDEO_CAPTURE or CameraEffect.IMAGE_CAPTURE,
            ContextCompat.getMainExecutor(context)
        ) { failure ->
            effectError = failure.message ?: "The selected camera filter could not be applied."
        }
    }
    LaunchedEffect(controller, faceEffectMode, dualCameraMode) {
        if (dualCameraMode) {
            runCatching { controller.clearImageAnalysisAnalyzer() }
            runCatching { controller.setEffects(emptySet()) }
        } else if (faceEffectMode == "Off") {
            runCatching { controller.clearImageAnalysisAnalyzer() }
            runCatching { controller.setEnabledUseCases(CameraController.IMAGE_CAPTURE or CameraController.VIDEO_CAPTURE) }
            runCatching { controller.setEffects(setOf(cameraEffect)) }
                .onFailure { effectError = it.message ?: "Live camera filters are unavailable on this device." }
        } else {
            runCatching {
                controller.setEnabledUseCases(
                    CameraController.IMAGE_CAPTURE or CameraController.VIDEO_CAPTURE or CameraController.IMAGE_ANALYSIS
                )
                controller.setImageAnalysisBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                controller.setImageAnalysisAnalyzer(faceAnalysisExecutor, faceAnalyzer)
                controller.setEffects(setOf(faceOverlayEffect))
                effectError = null
            }.onFailure {
                faceOverlayError = it.message ?: "Face effects are not supported by this camera."
                faceEffectMode = "Off"
            }
        }
    }
    DisposableEffect(faceDetector, faceOverlayEffect, faceAnalysisExecutor, faceOverlayThread, controller) {
        onDispose {
            runCatching { controller.clearImageAnalysisAnalyzer() }
            runCatching { controller.setEffects(emptySet()) }
            faceFrameResults.clear()
            faceDetector.close()
            faceOverlayEffect.close()
            faceAnalysisExecutor.shutdown()
            faceOverlayThread.quitSafely()
        }
    }
    DisposableEffect(cameraEffect) {
        onDispose { cameraEffect.close() }
    }
    LaunchedEffect(selectedLook) {
        runCatching { cameraEffect.setEffects(nativeCameraEffects(selectedLook)) }
            .onFailure { effectError = it.message ?: "The selected camera filter could not be applied." }
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
    LaunchedEffect(mode) {
        if (mode == NativeCameraMode.PHOTO && faceEffectMode != "Off") faceEffectMode = "Off"
    }
    var timerSeconds by remember { mutableStateOf(0) }
    var countdown by remember { mutableStateOf<Int?>(null) }
    var gridEnabled by remember { mutableStateOf(false) }
    var videoQuality by remember { mutableStateOf("1080p") }
    var videoFrameRate by remember { mutableStateOf(30) }
    val captureScope = rememberCoroutineScope()
    var usingFrontCamera by remember { mutableStateOf(false) }
    var rearCameraLenses by remember { mutableStateOf(emptyList<NativeCameraLensOption>()) }
    var selectedRearCameraId by remember { mutableStateOf<String?>(null) }
    var manualSensorSupported by remember { mutableStateOf(false) }
    var manualIsoRange by remember { mutableStateOf<Range<Int>?>(null) }
    var manualExposureTimeRange by remember { mutableStateOf<Range<Long>?>(null) }
    var manualFocusMinimum by remember { mutableStateOf(0f) }
    var manualExposureEnabled by remember { mutableStateOf(false) }
    var manualIso by remember { mutableStateOf(100f) }
    var manualShutterSeconds by remember { mutableStateOf(1f / 60f) }
    var manualFocusLocked by remember { mutableStateOf(false) }
    var manualFocusDistance by remember { mutableStateOf(0f) }
    var whiteBalanceModes by remember { mutableStateOf(emptySet<Int>()) }
    var videoStabilizationModes by remember { mutableStateOf(emptySet<Int>()) }
    var videoStabilizationEnabled by remember { mutableStateOf(true) }
    var selectedWhiteBalance by remember { mutableStateOf(CaptureRequest.CONTROL_AWB_MODE_AUTO) }
    var advancedControlError by remember { mutableStateOf<String?>(null) }
    var recording by remember { mutableStateOf<Recording?>(null) }
    var recordingActive by remember { mutableStateOf(false) }
    var pendingFile by remember { mutableStateOf<File?>(null) }
    var pendingMime by remember { mutableStateOf("image/jpeg") }
    var status by remember { mutableStateOf("Camera ready.") }
    var error by remember { mutableStateOf<String?>(null) }
    var flashEnabled by remember { mutableStateOf(false) }
    val latestRecording = rememberUpdatedState(recording)
    val disposeAfterRecording = remember(controller) { AtomicBoolean(false) }

    LaunchedEffect(cameraGranted, usingFrontCamera, selectedRearCameraId) {
        if (!cameraGranted) {
            rearCameraLenses = emptyList()
            selectedRearCameraId = null
            manualSensorSupported = false
            manualIsoRange = null
            manualExposureTimeRange = null
            manualFocusMinimum = 0f
            whiteBalanceModes = emptySet()
            videoStabilizationModes = emptySet()
            return@LaunchedEffect
        }
        runCatching {
            val provider = withContext(Dispatchers.IO) {
                ProcessCameraProvider.getInstance(context.applicationContext).get()
            }
            val discovered = provider.availableCameraInfos.mapNotNull { info ->
                runCatching {
                    val camera2Info = Camera2CameraInfo.from(info)
                    if (camera2Info.getCameraCharacteristic(CameraCharacteristics.LENS_FACING) != CameraCharacteristics.LENS_FACING_BACK) return@runCatching null
                    val focalLengths = camera2Info.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)
                    val focalLength = focalLengths?.minOrNull() ?: return@runCatching null
                    NativeCameraLensOption(
                        cameraId = camera2Info.cameraId,
                        focalLengthMm = focalLength,
                        label = "Rear · ${String.format("%.1f", focalLength)} mm"
                    )
                }.getOrNull()
            }.distinctBy { it.cameraId }.sortedBy { it.focalLengthMm }
            rearCameraLenses = discovered
            val activeId = controller.cameraInfo?.let { info ->
                runCatching { Camera2CameraInfo.from(info).cameraId }.getOrNull()
            }
            selectedRearCameraId = discovered.firstOrNull { it.cameraId == activeId }?.cameraId ?: discovered.firstOrNull()?.cameraId
        }.onFailure {
            advancedControlError = "Available rear lenses could not be read on this device."
        }
        repeat(8) {
            val info = controller.cameraInfo
            if (info != null) {
                runCatching {
                    val camera2Info = Camera2CameraInfo.from(info)
                    val capabilities = camera2Info.getCameraCharacteristic(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES)?.toSet().orEmpty()
                    manualSensorSupported = capabilities.contains(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR)
                    manualIsoRange = camera2Info.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE)
                    manualExposureTimeRange = camera2Info.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE)
                    manualFocusMinimum = camera2Info.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE) ?: 0f
                    whiteBalanceModes = camera2Info.getCameraCharacteristic(CameraCharacteristics.CONTROL_AWB_AVAILABLE_MODES)?.toSet().orEmpty()
                    videoStabilizationModes = camera2Info.getCameraCharacteristic(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES)?.toSet().orEmpty()
                    if (!videoStabilizationModes.contains(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON)) videoStabilizationEnabled = false
                    manualIsoRange?.let { range -> manualIso = manualIso.coerceIn(range.lower.toFloat(), range.upper.toFloat()) }
                    manualExposureTimeRange?.let { range ->
                        manualShutterSeconds = manualShutterSeconds.coerceIn(
                            (range.lower / 1_000_000_000.0).toFloat(),
                            (range.upper / 1_000_000_000.0).toFloat()
                        )
                    }
                }.onFailure {
                    advancedControlError = "Advanced camera controls could not be read on this device."
                }
                return@LaunchedEffect
            }
            delay(150)
        }
    }

    fun applyAdvancedCameraSettings() {
        val cameraControl = controller.cameraControl ?: return
        runCatching {
            val options = CaptureRequestOptions.Builder()
                .setCaptureRequestOption(CaptureRequest.CONTROL_AWB_MODE, selectedWhiteBalance)
                .setCaptureRequestOption(
                    CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
                    if (mode == NativeCameraMode.VIDEO && videoStabilizationEnabled && videoStabilizationModes.contains(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON)) CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON else CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_OFF
                )
                .apply {
                    if (manualExposureEnabled && manualSensorSupported && manualIsoRange != null && manualExposureTimeRange != null) {
                        setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_OFF)
                        setCaptureRequestOption(CaptureRequest.SENSOR_SENSITIVITY, manualIso.roundToInt())
                        setCaptureRequestOption(CaptureRequest.SENSOR_EXPOSURE_TIME, (manualShutterSeconds * 1_000_000_000f).toLong())
                    } else {
                        setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                        clearCaptureRequestOption(CaptureRequest.SENSOR_SENSITIVITY)
                        clearCaptureRequestOption(CaptureRequest.SENSOR_EXPOSURE_TIME)
                    }
                    if (manualFocusLocked && manualFocusMinimum > 0f) {
                        setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF)
                        setCaptureRequestOption(CaptureRequest.LENS_FOCUS_DISTANCE, manualFocusDistance.coerceIn(0f, manualFocusMinimum))
                    } else {
                        setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                        clearCaptureRequestOption(CaptureRequest.LENS_FOCUS_DISTANCE)
                    }
                }
                .build()
            val future = Camera2CameraControl.from(cameraControl).setCaptureRequestOptions(options)
            future.addListener({
                runCatching { future.get() }
                    .onSuccess { advancedControlError = null }
                    .onFailure { advancedControlError = "This camera rejected one or more manual settings. Automatic controls remain available." }
            }, ContextCompat.getMainExecutor(context))
            controller.setTapToFocusEnabled(!manualFocusLocked)
        }.onFailure {
            advancedControlError = it.message ?: "Manual camera controls are unavailable on this device."
        }
    }

    fun resetAdvancedCameraSettings() {
        manualExposureEnabled = false
        manualFocusLocked = false
        selectedWhiteBalance = CaptureRequest.CONTROL_AWB_MODE_AUTO
        videoStabilizationEnabled = videoStabilizationModes.contains(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON)
        controller.setTapToFocusEnabled(true)
        applyAdvancedCameraSettings()
    }

    LaunchedEffect(videoStabilizationEnabled, mode, videoStabilizationModes, cameraGranted) {
        if (cameraGranted && videoStabilizationModes.contains(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON)) {
            applyAdvancedCameraSettings()
        }
    }

    val savePicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("image/jpeg")) { target ->
        val source = pendingFile
        if (source == null) return@rememberLauncherForActivityResult
        if (target == null) {
            status = "Save canceled. Your photo is still ready to save."
            return@rememberLauncherForActivityResult
        }
        runCatching { copyCameraFile(context, source, target) }
            .onSuccess {
                status = "Photo saved to your selected location."
                error = null
                source.delete()
                if (pendingFile == source) pendingFile = null
            }
            .onFailure {
                error = it.message ?: "Could not save this photo. Your capture is still available to retry."
            }
    }
    val saveVideoPicker = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("video/mp4")) { target ->
        val source = pendingFile
        if (source == null) return@rememberLauncherForActivityResult
        if (target == null) {
            status = "Save canceled. Your video is still ready to save."
            return@rememberLauncherForActivityResult
        }
        runCatching { copyCameraFile(context, source, target) }
            .onSuccess {
                status = "Video saved to your selected location."
                error = null
                source.delete()
                if (pendingFile == source) pendingFile = null
            }
            .onFailure {
                error = it.message ?: "Could not save this video. Your capture is still available to retry."
            }
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
            onRecording = { next -> recording = next; recordingActive = true; error = null; status = if (granted) "Recording video with sound." else "Recording video without sound. Allow microphone access to record audio." },
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

    DisposableEffect(controller, lifecycleOwner, cameraGranted, dualCameraMode) {
        if (cameraGranted && !dualCameraMode) controller.bindToLifecycle(lifecycleOwner)
        onDispose {
            // Entering dual mode disposes this single-camera binding before the concurrent
            // front/rear session claims the camera devices.
            if (!dualCameraMode) {
                val activeRecording = latestRecording.value
                if (activeRecording != null) {
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
    }

    fun selectRearLens(option: NativeCameraLensOption) {
        if (recordingActive || !cameraGranted) return
        usingFrontCamera = false
        selectedRearCameraId = option.cameraId
        controller.cameraSelector = CameraSelector.Builder().addCameraFilter { infos ->
            infos.filter { info ->
                runCatching { Camera2CameraInfo.from(info).cameraId == option.cameraId }.getOrDefault(false)
            }
        }.build()
        status = "${option.label} selected."
        error = null
    }

    fun switchCamera() {
        if (recordingActive || !cameraGranted) return
        usingFrontCamera = !usingFrontCamera
        controller.cameraSelector = if (usingFrontCamera) CameraSelector.DEFAULT_FRONT_CAMERA else {
            val selectedId = selectedRearCameraId
            if (selectedId == null) CameraSelector.DEFAULT_BACK_CAMERA else CameraSelector.Builder().addCameraFilter { infos ->
                infos.filter { info ->
                    runCatching { Camera2CameraInfo.from(info).cameraId == selectedId }.getOrDefault(false)
                }
            }.build()
        }
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

    fun capturePhotoWithTimer() {
        if (countdown != null || recordingActive || !cameraGranted) return
        if (timerSeconds == 0) {
            capturePhoto()
            return
        }
        captureScope.launch {
            for (remaining in timerSeconds downTo 1) {
                countdown = remaining
                delay(1_000)
            }
            countdown = null
            capturePhoto()
        }
    }

    fun applyVideoFrameRate(fps: Int) {
        if (recordingActive) return
        runCatching {
            controller.setVideoCaptureTargetFrameRate(Range(fps, fps))
        }.onSuccess {
            videoFrameRate = fps
            status = "Requested $fps fps. The phone will use its closest supported frame rate."
            error = null
        }.onFailure {
            error = "That frame rate is not available on this camera."
        }
    }

    fun applyVideoQuality(label: String) {
        val selected = nativeCameraQualities.firstOrNull { it.label == label } ?: return
        if (recordingActive) return
        runCatching {
            controller.setVideoCaptureQualitySelector(
                QualitySelector.from(selected.quality, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD))
            )
        }.onSuccess {
            videoQuality = label
            status = "Requested $label video. The phone will use its closest supported recording quality."
            error = null
        }.onFailure {
            error = "That video quality is not available on this camera."
        }
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

    if (dualCameraMode) {
        NativeDualCameraStudioScreen(
            context = context,
            lifecycleOwner = lifecycleOwner,
            cameraEffect = cameraEffect,
            onExit = { dualCameraMode = false },
            onVideoReady = { file ->
                pendingFile?.delete()
                pendingFile = file
                pendingMime = "video/mp4"
                status = "Front and rear video saved to a temporary capture. Save it to keep it."
                error = null
            },
            onStatus = { status = it },
            onError = { error = it }
        )
    } else {
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
                if (gridEnabled) {
                    Canvas(modifier = Modifier.matchParentSize()) {
                        val thirdX = size.width / 3f
                        val thirdY = size.height / 3f
                        for (index in 1..2) {
                            drawLine(Color.White.copy(alpha = 0.55f), Offset(thirdX * index, 0f), Offset(thirdX * index, size.height), strokeWidth = 1.dp.toPx())
                            drawLine(Color.White.copy(alpha = 0.55f), Offset(0f, thirdY * index), Offset(size.width, thirdY * index), strokeWidth = 1.dp.toPx())
                        }
                    }
                }
                if (countdown != null) {
                    Text("$countdown", modifier = Modifier.align(Alignment.Center), color = Color.White, style = MaterialTheme.typography.displayLarge)
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
                    .clickable(enabled = cameraGranted && countdown == null && (!recordingActive || mode == NativeCameraMode.VIDEO)) {
                        if (mode == NativeCameraMode.PHOTO) capturePhotoWithTimer()
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

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { gridEnabled = !gridEnabled }, enabled = cameraGranted && !recordingActive, modifier = Modifier.weight(1f)) {
                Text(if (gridEnabled) "Hide grid" else "Grid")
            }
            OutlinedButton(onClick = { timerSeconds = if (timerSeconds == 0) 3 else if (timerSeconds == 3) 10 else 0 }, enabled = mode == NativeCameraMode.PHOTO && !recordingActive, modifier = Modifier.weight(1f)) {
                Text(if (timerSeconds == 0) "Timer off" else "Timer ${timerSeconds}s")
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Filters", style = MaterialTheme.typography.labelMedium)
            NativeCameraLook.entries.chunked(4).forEach { lookRow ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    lookRow.forEach { look ->
                        OutlinedButton(
                            onClick = { selectedLook = look },
                            enabled = !recordingActive && faceEffectMode == "Off",
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(if (selectedLook == look) "✓ ${look.label}" else look.label)
                        }
                    }
                }
            }
            Text("Filters are applied to the live preview and saved photos/videos.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (effectError != null) {
                Text(effectError!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Face effects", style = MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("Off", "Glasses", "Crown", "Soft glow").forEach { effect ->
                    OutlinedButton(
                        onClick = { faceEffectMode = effect },
                        enabled = cameraGranted && !recordingActive && !dualCameraMode && mode == NativeCameraMode.VIDEO,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(if (faceEffectMode == effect) "✓ $effect" else effect)
                    }
                }
            }
            Text(
                when (faceEffectMode) {
                    "Off" -> if (mode == NativeCameraMode.VIDEO) "Face tracking is off." else "Face effects are available in Video mode."
                    "Soft glow" -> "Adds a subtle face-tracked light effect. Face analysis stays on this device."
                    else -> "Tracks facial landmarks and applies the selected mask to the live preview and recorded video. Colour filters pause while a mask is active."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (faceOverlayError != null) {
                Text(faceOverlayError!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }

        if (mode == NativeCameraMode.VIDEO) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Video quality · requested $videoQuality", style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    nativeCameraQualities.forEach { option ->
                        OutlinedButton(onClick = { applyVideoQuality(option.label) }, enabled = !recordingActive, modifier = Modifier.weight(1f)) {
                            Text(option.label)
                        }
                    }
                }
                Text("Frame rate · requested $videoFrameRate fps", style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(24, 30, 60).forEach { fps ->
                        OutlinedButton(onClick = { applyVideoFrameRate(fps) }, enabled = !recordingActive, modifier = Modifier.weight(1f)) {
                            Text("$fps fps")
                        }
                    }
                }
                Text("The phone may choose lower resolution or frame rate when its camera and encoder do not support the selected option.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(
                    onClick = { dualCameraMode = true },
                    enabled = cameraGranted && !recordingActive && pendingFile == null,
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Record with front + rear cameras") }
                Text("This mode is available only on phones that support simultaneous camera capture.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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

        if (cameraGranted && !usingFrontCamera && rearCameraLenses.size > 1) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Rear lens", style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    rearCameraLenses.forEach { lens ->
                        OutlinedButton(
                            onClick = { selectRearLens(lens) },
                            enabled = !recordingActive,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(if (selectedRearCameraId == lens.cameraId) "✓ ${lens.label}" else lens.label)
                        }
                    }
                }
                Text("Only rear cameras exposed by the device camera framework are listed.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        if (cameraGranted && (manualSensorSupported || whiteBalanceModes.size > 1 || manualFocusMinimum > 0f || videoStabilizationModes.contains(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON))) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Pro controls", style = MaterialTheme.typography.titleSmall)
                if (mode == NativeCameraMode.VIDEO && videoStabilizationModes.contains(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Video stabilization", style = MaterialTheme.typography.labelMedium)
                            Text("Uses the camera's supported hardware stabilization when recording video.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        OutlinedButton(
                            onClick = {
                                videoStabilizationEnabled = !videoStabilizationEnabled
                                applyAdvancedCameraSettings()
                            },
                            enabled = !recordingActive
                        ) { Text(if (videoStabilizationEnabled) "On" else "Off") }
                    }
                }
                if (manualSensorSupported && manualIsoRange != null && manualExposureTimeRange != null) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Manual ISO and shutter", style = MaterialTheme.typography.labelMedium)
                        OutlinedButton(
                            onClick = {
                                manualExposureEnabled = !manualExposureEnabled
                                applyAdvancedCameraSettings()
                            },
                            enabled = !recordingActive
                        ) { Text(if (manualExposureEnabled) "On" else "Off") }
                    }
                    if (manualExposureEnabled) {
                        val isoRange = manualIsoRange!!
                        val shutterRange = manualExposureTimeRange!!
                        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("ISO", style = MaterialTheme.typography.labelSmall)
                                Text(manualIso.roundToInt().toString(), style = MaterialTheme.typography.labelSmall)
                            }
                            Slider(
                                value = manualIso.coerceIn(isoRange.lower.toFloat(), isoRange.upper.toFloat()),
                                onValueChange = { manualIso = it },
                                onValueChangeFinished = { applyAdvancedCameraSettings() },
                                valueRange = isoRange.lower.toFloat()..isoRange.upper.toFloat(),
                                enabled = !recordingActive
                            )
                        }
                        val minimumSeconds = (shutterRange.lower / 1_000_000_000.0).toFloat().coerceAtLeast(0.000001f)
                        val maximumSeconds = (shutterRange.upper / 1_000_000_000.0).toFloat().coerceAtLeast(minimumSeconds + 0.000001f)
                        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Shutter", style = MaterialTheme.typography.labelSmall)
                                Text("1/${(1f / manualShutterSeconds.coerceAtLeast(0.000001f)).roundToInt()} s", style = MaterialTheme.typography.labelSmall)
                            }
                            Slider(
                                value = manualShutterSeconds.coerceIn(minimumSeconds, maximumSeconds),
                                onValueChange = { manualShutterSeconds = it },
                                onValueChangeFinished = { applyAdvancedCameraSettings() },
                                valueRange = minimumSeconds..maximumSeconds,
                                enabled = !recordingActive
                            )
                        }
                    }
                }
                val whiteBalanceChoices = listOf(
                    "Auto" to CaptureRequest.CONTROL_AWB_MODE_AUTO,
                    "Daylight" to CaptureRequest.CONTROL_AWB_MODE_DAYLIGHT,
                    "Cloudy" to CaptureRequest.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT,
                    "Incandescent" to CaptureRequest.CONTROL_AWB_MODE_INCANDESCENT,
                    "Fluorescent" to CaptureRequest.CONTROL_AWB_MODE_FLUORESCENT
                ).filter { whiteBalanceModes.contains(it.second) }
                if (whiteBalanceChoices.size > 1) {
                    Text("White balance", style = MaterialTheme.typography.labelMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        whiteBalanceChoices.forEach { (label, value) ->
                            OutlinedButton(
                                onClick = {
                                    selectedWhiteBalance = value
                                    applyAdvancedCameraSettings()
                                },
                                enabled = !recordingActive,
                                modifier = Modifier.weight(1f)
                            ) { Text(if (selectedWhiteBalance == value) "✓ $label" else label) }
                        }
                    }
                }
                if (manualFocusMinimum > 0f) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Focus lock", style = MaterialTheme.typography.labelMedium)
                        OutlinedButton(
                            onClick = {
                                manualFocusLocked = !manualFocusLocked
                                applyAdvancedCameraSettings()
                            },
                            enabled = !recordingActive
                        ) { Text(if (manualFocusLocked) "Locked" else "Auto") }
                    }
                    if (manualFocusLocked) {
                        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Focus distance", style = MaterialTheme.typography.labelSmall)
                                Text(String.format("%.2f D", manualFocusDistance), style = MaterialTheme.typography.labelSmall)
                            }
                            Slider(
                                value = manualFocusDistance.coerceIn(0f, manualFocusMinimum),
                                onValueChange = { manualFocusDistance = it },
                                onValueChangeFinished = { applyAdvancedCameraSettings() },
                                valueRange = 0f..manualFocusMinimum,
                                enabled = !recordingActive
                            )
                        }
                    }
                }
                OutlinedButton(onClick = { resetAdvancedCameraSettings() }, enabled = !recordingActive, modifier = Modifier.fillMaxWidth()) {
                    Text("Reset pro controls")
                }
                if (advancedControlError != null) {
                    Text(advancedControlError!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                Text("Manual controls are shown only when the active camera reports hardware support. Manual exposure disables automatic exposure while active.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        if (pendingFile != null && !recordingActive) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        if (pendingMime == "video/mp4") saveVideoPicker.launch("enV-camera-video.mp4")
                        else savePicker.launch("enV-camera-photo.jpg")
                    },
                    modifier = Modifier.weight(1f)
                ) { Text(if (pendingMime == "video/mp4") "Save video" else "Save photo") }
                OutlinedButton(
                    onClick = {
                        pendingFile?.delete()
                        pendingFile = null
                        status = "Capture discarded."
                        error = null
                    }
                ) { Text("Discard") }
            }
        }

        if (cameraGranted && error != null) {
            Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        } else if (cameraGranted) {
            Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        }
    }
    }
}

@androidx.annotation.OptIn(androidx.camera.camera2.interop.ExperimentalCamera2Interop::class)
@Composable
private fun NativeDualCameraStudioScreen(
    context: Context,
    lifecycleOwner: LifecycleOwner,
    cameraEffect: CameraEffect,
    onExit: () -> Unit,
    onVideoReady: (File) -> Unit,
    onStatus: (String) -> Unit,
    onError: (String) -> Unit,
) {
    var previewView by remember { mutableStateOf<PreviewView?>(null) }
    var provider by remember { mutableStateOf<ProcessCameraProvider?>(null) }
    var previewUseCase by remember { mutableStateOf<Preview?>(null) }
    var videoCapture by remember { mutableStateOf<VideoCapture<Recorder>?>(null) }
    var cameraReady by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf<Recording?>(null) }
    var recordingActive by remember { mutableStateOf(false) }
    var localStatus by remember { mutableStateOf("Checking whether this phone supports both cameras…") }
    var localError by remember { mutableStateOf<String?>(null) }
    val latestRecording = rememberUpdatedState(recording)
    val disposeAfterRecording = remember { AtomicBoolean(false) }

    LaunchedEffect(previewView) {
        val targetPreview = previewView ?: return@LaunchedEffect
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R ||
                !context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_CONCURRENT)
            ) {
                throw IllegalStateException("This phone does not support simultaneous front and rear camera recording.")
            }

            val cameraProvider = withContext(Dispatchers.IO) {
                ProcessCameraProvider.getInstance(context.applicationContext).get()
            }
            val supportedPair = cameraProvider.availableConcurrentCameraInfos.firstOrNull { cameras ->
                cameras.size >= 2 &&
                    cameras.any { it.lensFacing == CameraSelector.LENS_FACING_FRONT } &&
                    cameras.any { it.lensFacing == CameraSelector.LENS_FACING_BACK }
            } ?: throw IllegalStateException("This phone cannot run its front and rear cameras at the same time.")
            val backCameraId = Camera2CameraInfo.from(
                supportedPair.first { it.lensFacing == CameraSelector.LENS_FACING_BACK }
            ).cameraId
            val frontCameraId = Camera2CameraInfo.from(
                supportedPair.first { it.lensFacing == CameraSelector.LENS_FACING_FRONT }
            ).cameraId
            val backSelector = CameraSelector.Builder().addCameraFilter { infos ->
                infos.filter { Camera2CameraInfo.from(it).cameraId == backCameraId }
            }.build()
            val frontSelector = CameraSelector.Builder().addCameraFilter { infos ->
                infos.filter { Camera2CameraInfo.from(it).cameraId == frontCameraId }
            }.build()

            // CameraX composition mode records both live feeds into one video file.
            // The same Preview and VideoCapture use cases must be shared by both camera configs.
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(targetPreview.surfaceProvider)
            }
            val recorder = Recorder.Builder()
                .setQualitySelector(
                    QualitySelector.from(Quality.HD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD))
                )
                .build()
            val video = VideoCapture.withOutput(recorder)
            val group = UseCaseGroup.Builder()
                .addUseCase(preview)
                .addUseCase(video)
                .addEffect(cameraEffect)
                .build()

            val concurrentCamera = cameraProvider.bindToLifecycle(
                listOf(
                    ConcurrentCamera.SingleCameraConfig(backSelector, group, lifecycleOwner),
                    ConcurrentCamera.SingleCameraConfig(frontSelector, group, lifecycleOwner)
                )
            )
            // Request hardware video stabilization independently for each stream when
            // that camera advertises support. Unsupported cameras continue normally.
            concurrentCamera.cameras.forEach { activeCamera ->
                runCatching {
                    val info = Camera2CameraInfo.from(activeCamera.cameraInfo)
                    val modes = info.getCameraCharacteristic(
                        CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES
                    )?.toSet().orEmpty()
                    if (modes.contains(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON)) {
                        val options = CaptureRequestOptions.Builder()
                            .setCaptureRequestOption(
                                CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
                                CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON
                            )
                            .build()
                        val future = Camera2CameraControl.from(activeCamera.cameraControl)
                            .setCaptureRequestOptions(options)
                        future.addListener(
                            { runCatching { future.get() } },
                            ContextCompat.getMainExecutor(context)
                        )
                    }
                }
            }

            provider = cameraProvider
            previewUseCase = preview
            videoCapture = video
            cameraReady = true
            localStatus = "Both cameras are live. Video quality is automatically limited to a supported dual-camera mode."
            localError = null
        } catch (failure: Throwable) {
            cameraReady = false
            localError = failure.message ?: "Dual-camera recording is unavailable on this phone."
            localStatus = "Your normal single-camera mode is still available."
        }
    }

    fun startDualRecording(includeAudio: Boolean) {
        val currentVideoCapture = videoCapture
        if (!cameraReady || currentVideoCapture == null || recordingActive) return
        val output = File(context.cacheDir, "env-camera-dual-${System.currentTimeMillis()}.mp4")
        try {
            val pending = currentVideoCapture.output.prepareRecording(
                context,
                FileOutputOptions.Builder(output).build()
            )
            val audioAllowed = includeAudio &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
            val configured = if (audioAllowed) pending.withAudioEnabled() else pending
            val active = configured.start(ContextCompat.getMainExecutor(context)) { event ->
                when (event) {
                    is VideoRecordEvent.Start -> {
                        recordingActive = true
                        localStatus = "Recording from the front and rear cameras."
                    }
                    is VideoRecordEvent.Finalize -> {
                        recording = null
                        recordingActive = false
                        if (disposeAfterRecording.compareAndSet(true, false)) {
                            output.delete()
                            val currentProvider = provider
                            val currentPreview = previewUseCase
                            val currentVideo = videoCapture
                            if (currentProvider != null && currentPreview != null && currentVideo != null) {
                                runCatching { currentProvider.unbind(currentPreview, currentVideo) }
                            }
                            provider = null
                            previewUseCase = null
                            videoCapture = null
                            cameraReady = false
                        } else if (event.hasError()) {
                            output.delete()
                            localError = "Dual-camera video could not be finalized (error ${event.error}). Check storage and try again."
                        } else {
                            localError = null
                            onStatus("Front and rear recording complete. Save the video to keep it.")
                            onVideoReady(output)
                            onExit()
                        }
                    }
                }
            }
            recording = active
            recordingActive = true
            localError = null
            localStatus = if (audioAllowed) "Starting front and rear recording with microphone audio…" else "Starting front and rear recording without audio…"
        } catch (failure: Throwable) {
            output.delete()
            localError = failure.message ?: "The dual-camera recording could not start."
        }
    }

    val microphonePermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        // Silent video remains available when microphone access is declined.
        startDualRecording(granted)
    }

    DisposableEffect(provider, previewUseCase, videoCapture) {
        onDispose {
            val active = latestRecording.value
            if (active != null) {
                disposeAfterRecording.set(true)
                runCatching { active.stop() }
            } else {
                val currentProvider = provider
                val currentPreview = previewUseCase
                val currentVideo = videoCapture
                if (currentProvider != null && currentPreview != null && currentVideo != null) {
                    runCatching { currentProvider.unbind(currentPreview, currentVideo) }
                }
            }
        }
    }

    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Dual-camera video", style = MaterialTheme.typography.titleMedium)
            OutlinedButton(onClick = onExit, enabled = !recordingActive) { Text("Back") }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.Black)) {
            Box(modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f), contentAlignment = Alignment.Center) {
                AndroidView(
                    modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f),
                    factory = { viewContext ->
                        PreviewView(viewContext).also {
                            it.scaleType = PreviewView.ScaleType.FILL_CENTER
                            previewView = it
                        }
                    },
                    update = {
                        if (previewView !== it) previewView = it
                    }
                )
                if (!cameraReady && localError == null) {
                    Text("Preparing cameras…", color = Color.White, style = MaterialTheme.typography.bodyMedium)
                }
                if (recordingActive) {
                    Surface(modifier = Modifier.align(Alignment.TopStart).padding(12.dp), color = Color(0xCC991B1B), shape = CircleShape) {
                        Text("● REC", modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), color = Color.White, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
        Button(
            onClick = {
                if (recordingActive) {
                    recording?.stop()
                } else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    startDualRecording(true)
                } else {
                    microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
                }
            },
            enabled = cameraReady,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (recordingActive) "Stop dual-camera recording" else "Start dual-camera recording")
        }
        Text(
            "Both cameras are recorded into one composed video when the phone supports concurrent capture.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall
        )
        if (localError != null) {
            Text(localError!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        } else {
            Text(localStatus, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
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
