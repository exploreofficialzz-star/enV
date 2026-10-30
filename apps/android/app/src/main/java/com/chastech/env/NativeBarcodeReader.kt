package com.chastech.env

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.max

data class NativeBarcodeScan(
    val text: String,
    val format: String,
    val scannedAt: Long = System.currentTimeMillis(),
)

private fun readerHints(): Map<DecodeHintType, Any> = mapOf(
    DecodeHintType.TRY_HARDER to true,
    DecodeHintType.POSSIBLE_FORMATS to listOf(
        BarcodeFormat.QR_CODE, BarcodeFormat.AZTEC, BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417,
        BarcodeFormat.EAN_8, BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.CODE_128, BarcodeFormat.CODABAR,
        BarcodeFormat.ITF, BarcodeFormat.RSS_14, BarcodeFormat.RSS_EXPANDED,
    ),
)

data class NativeBarcodeLumaFrame(val data: ByteArray, val width: Int, val height: Int)

object NativeBarcodeImageDecoder {
    internal fun rotateLumaFrame(data: ByteArray, width: Int, height: Int, degrees: Int): NativeBarcodeLumaFrame {
        require(width > 0 && height > 0 && data.size >= width * height) { "Invalid camera luminance frame." }
        val rotation = ((degrees % 360) + 360) % 360
        if (rotation == 0) return NativeBarcodeLumaFrame(data.copyOf(width * height), width, height)
        require(rotation == 90 || rotation == 180 || rotation == 270) { "Unsupported camera frame rotation: $degrees" }
        val outputWidth = if (rotation == 180) width else height
        val outputHeight = if (rotation == 180) height else width
        val output = ByteArray(outputWidth * outputHeight)
        for (y in 0 until height) {
            for (x in 0 until width) {
                val (targetX, targetY) = when (rotation) {
                    90 -> height - 1 - y to x
                    180 -> width - 1 - x to height - 1 - y
                    else -> y to width - 1 - x
                }
                output[targetY * outputWidth + targetX] = data[y * width + x]
            }
        }
        return NativeBarcodeLumaFrame(output, outputWidth, outputHeight)
    }

    fun decode(bitmap: Bitmap): NativeBarcodeScan? {
        if (bitmap.width <= 0 || bitmap.height <= 0) return null
        return runCatching {
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
            val source = RGBLuminanceSource(bitmap.width, bitmap.height, pixels)
            val reader = MultiFormatReader().apply { setHints(readerHints()) }
            val result = reader.decodeWithState(BinaryBitmap(HybridBinarizer(source)))
            NativeBarcodeScan(result.text, result.barcodeFormat.toString())
        }.getOrNull()
    }

    fun decode(context: Context, uri: Uri): NativeBarcodeScan? {
        val resolver = context.contentResolver
        val declaredSize = resolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
        require(declaredSize <= 20L * 1024L * 1024L || declaredSize < 0L) {
            "Image is larger than 20 MB. Resize it before scanning."
        }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "The selected image could not be read." }
        var sampleSize = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sampleSize > 2800) sampleSize *= 2
        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) } ?: return null
        return try { decode(bitmap) } finally { bitmap.recycle() }
    }
}

private class NativeBarcodeCameraAnalyzer(
    private val onResult: (NativeBarcodeScan) -> Unit,
) : ImageAnalysis.Analyzer {
    private val reader = MultiFormatReader().apply { setHints(readerHints()) }

    override fun analyze(image: ImageProxy) {
        try {
            val plane = image.planes.firstOrNull() ?: return
            val width = image.width
            val height = image.height
            val buffer = plane.buffer.duplicate()
            val rowStride = plane.rowStride
            val pixelStride = plane.pixelStride
            val bytes = ByteArray(width * height)
            for (row in 0 until height) {
                for (column in 0 until width) {
                    val index = row * rowStride + column * pixelStride
                    if (index < buffer.limit()) bytes[row * width + column] = buffer.get(index)
                }
            }
            val rotated = NativeBarcodeImageDecoder.rotateLumaFrame(bytes, width, height, image.imageInfo.rotationDegrees)
            val source = PlanarYUVLuminanceSource(rotated.data, rotated.width, rotated.height, 0, 0, rotated.width, rotated.height, false)
            val result = reader.decodeWithState(BinaryBitmap(HybridBinarizer(source)))
            onResult(NativeBarcodeScan(result.text, result.barcodeFormat.toString()))
            reader.reset()
        } catch (_: Exception) {
            // A frame without a code is expected while the user is aiming.
            reader.reset()
        } finally {
            image.close()
        }
    }
}

@Composable
fun NativeBarcodeReaderTool() {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val analyzerExecutor = remember { Executors.newSingleThreadExecutor() }
    val previewView = remember(context) { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }
    val results = remember { mutableStateListOf<NativeBarcodeScan>() }
    var cameraPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    var cameraActive by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Choose Start camera or Read image. Decoding stays on this device.") }
    var error by remember { mutableStateOf("") }
    var lastSignature by remember { mutableStateOf("") }
    var lastScanAt by remember { mutableStateOf(0L) }

    fun accept(scan: NativeBarcodeScan) {
        val signature = "${scan.format}\u0000${scan.text}"
        val now = System.currentTimeMillis()
        if (signature == lastSignature && now - lastScanAt < 1800L) return
        lastSignature = signature
        lastScanAt = now
        results.add(0, scan.copy(scannedAt = now))
        while (results.size > 50) results.removeAt(results.lastIndex)
        status = "${scan.format} detected."
        error = ""
    }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        cameraPermission = granted
        if (granted) {
            cameraActive = true
            status = "Camera permission granted. Starting scanner…"
        } else {
            cameraActive = false
            error = "Camera permission was denied. Allow it in Android settings or use image upload."
        }
    }
    val imageLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            val scan = runCatching { NativeBarcodeImageDecoder.decode(context, uri) }.getOrNull()
            if (scan != null) accept(scan) else error = "No supported QR code or barcode was detected in that image. Try a sharper image with the full code visible."
        }
    }

    DisposableEffect(analyzerExecutor) {
        onDispose { analyzerExecutor.shutdown() }
    }

    DisposableEffect(cameraActive, cameraPermission, lifecycleOwner, previewView) {
        if (!cameraActive || !cameraPermission) {
            onDispose { }
        } else {
            val providerFuture = ProcessCameraProvider.getInstance(context)
            var cameraProvider: ProcessCameraProvider? = null
            var disposed = false
            var previewUseCase: Preview? = null
            var analysisUseCase: ImageAnalysis? = null
            val analyzer = NativeBarcodeCameraAnalyzer { scan ->
                mainHandler.post { accept(scan) }
            }
            providerFuture.addListener({
                if (disposed) return@addListener
                runCatching {
                    val provider = providerFuture.get()
                    cameraProvider = provider
                    val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                        .also { it.setAnalyzer(analyzerExecutor, analyzer) }
                    previewUseCase = preview
                    analysisUseCase = analysis
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                    mainHandler.post { status = "Scanner ready. Hold the code inside the camera view."; error = "" }
                }.onFailure { cause ->
                    mainHandler.post {
                        cameraActive = false
                        error = "Could not start the camera: ${cause.message ?: "camera unavailable"}"
                    }
                }
            }, ContextCompat.getMainExecutor(context))
            onDispose {
                disposed = true
                runCatching { analysisUseCase?.clearAnalyzer() }
                runCatching {
                    val provider = cameraProvider ?: if (providerFuture.isDone) providerFuture.get() else null
                    if (provider != null) {
                        val useCases = listOfNotNull(previewUseCase, analysisUseCase)
                        if (useCases.isNotEmpty()) provider.unbind(*useCases.toTypedArray())
                    }
                }
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("QR & barcode reader", style = MaterialTheme.typography.titleMedium)
        Text("Scan supported 1D and 2D codes with the Android camera or read an image from this device.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                error = ""
                if (cameraPermission) cameraActive = true
                else permissionLauncher.launch(Manifest.permission.CAMERA)
            }, enabled = !cameraActive) { Text("Start camera") }
            OutlinedButton(onClick = { cameraActive = false; status = "Camera stopped." }, enabled = cameraActive) { Text("Stop") }
            OutlinedButton(onClick = { imageLauncher.launch("image/*") }) { Text("Read image") }
        }
        if (cameraActive && cameraPermission) {
            AndroidView(factory = { previewView }, modifier = Modifier.fillMaxWidth().height(260.dp))
        } else {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Text("Camera is off. Camera access is requested only after you tap Start camera.", modifier = Modifier.padding(18.dp), style = MaterialTheme.typography.bodySmall)
            }
        }
        Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (error.isNotBlank()) Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Scan results · ${results.size}", style = MaterialTheme.typography.titleSmall)
            if (results.isNotEmpty()) TextButtonCompat(onClick = { results.clear(); status = "Scan history cleared." }, label = "Clear")
        }
        if (results.isEmpty()) {
            Text("Decoded values will appear here. Links are not opened automatically.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.heightIn(max = 460.dp)) {
                items(results, key = { "${it.scannedAt}-${it.format}-${it.text.hashCode()}" }) { result ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(result.format, style = MaterialTheme.typography.labelLarge)
                            Text(result.text, style = MaterialTheme.typography.bodyMedium)
                            Text(SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(result.scannedAt)), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            OutlinedButton(onClick = {
                                context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Decoded code", result.text))
                                status = "Result copied."
                            }) { Text("Copy result") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TextButtonCompat(onClick: () -> Unit, label: String) {
    androidx.compose.material3.TextButton(onClick = onClick) { Text(label) }
}
