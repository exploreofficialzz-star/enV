package com.chastech.env

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.media.projection.MediaProjectionConfig
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Surface
import android.view.WindowManager
import android.provider.MediaStore
import androidx.browser.customtabs.CustomTabsIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.io.File
import java.util.Locale

private data class VideoPostLink(val uri: Uri, val provider: String)

private val videoLinkCaptureDomains = linkedMapOf(
    "TikTok" to listOf("tiktok.com"),
    "Instagram" to listOf("instagram.com"),
    "Facebook" to listOf("facebook.com", "fb.watch", "fb.com"),
    "YouTube" to listOf("youtube.com", "youtu.be", "youtube-nocookie.com"),
    "X" to listOf("x.com", "twitter.com"),
    "Snapchat" to listOf("snapchat.com"),
    "Threads" to listOf("threads.net"),
    "LinkedIn" to listOf("linkedin.com"),
    "Reddit" to listOf("reddit.com"),
    "Twitch" to listOf("twitch.tv"),
    "Vimeo" to listOf("vimeo.com"),
    "Dailymotion" to listOf("dailymotion.com", "dai.ly"),
)

private fun parseVideoPostLink(raw: String): VideoPostLink {
    val trimmed = raw.trim()
    require(trimmed.isNotEmpty()) { "Paste a supported social-media post link." }
    val candidate = if (trimmed.startsWith("https://", ignoreCase = true)) trimmed else "https://$trimmed"
    val uri = Uri.parse(candidate)
    require(uri.scheme.equals("https", ignoreCase = true)) { "Paste a secure HTTPS social-media post link." }
    require(uri.encodedUserInfo.isNullOrEmpty()) { "Links containing embedded login credentials are not accepted." }
    require(uri.port == -1 || uri.port == 443) { "Custom ports are not supported for post links." }
    val host = uri.host?.lowercase(Locale.ROOT)?.removePrefix("www.")
        ?: throw IllegalArgumentException("That link is not valid.")
    require(uri.path?.substringAfterLast('/')?.substringAfterLast('.')?.lowercase(Locale.ROOT) !in setOf("mp4", "m4v", "mov", "webm", "ogv", "mkv", "avi", "3gp")) {
        "Paste the original platform post URL, not a direct video-file URL."
    }
    val provider = videoLinkCaptureDomains.entries.firstOrNull { (_, domains) ->
        domains.any { host == it || host.endsWith(".$it") }
    }?.key ?: throw IllegalArgumentException("This platform is not supported yet.")
    return VideoPostLink(uri, provider)
}

@Composable
fun NativeVideoLinkRecorderScreen(initialPostUrl: String = "") {
    val context = LocalContext.current
    val initialProvider = remember(initialPostUrl) {
        initialPostUrl.takeIf { it.isNotBlank() }?.let { raw ->
            runCatching { parseVideoPostLink(raw).provider }.getOrNull()
        }.orEmpty()
    }
    var postUrl by rememberSaveable(initialPostUrl) { mutableStateOf(initialPostUrl) }
    var provider by rememberSaveable(initialPostUrl) { mutableStateOf(initialProvider) }
    var postUri by remember(initialPostUrl) {
        mutableStateOf(initialPostUrl.takeIf { it.isNotBlank() }?.let { raw ->
            runCatching { parseVideoPostLink(raw).uri }.getOrNull()
        })
    }
    var status by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var isStarting by rememberSaveable { mutableStateOf(false) }
    var isRecording by rememberSaveable { mutableStateOf(false) }
    var isStopping by rememberSaveable { mutableStateOf(false) }

    DisposableEffect(context) {
        val captureResultReceiver = object : BroadcastReceiver() {
            override fun onReceive(receiverContext: Context?, result: Intent?) {
                when (result?.action) {
                    VideoLinkCaptureService.ACTION_STARTED -> {
                        isStarting = false
                        isRecording = true
                        isStopping = false
                        status = "Recording."
                        error = null
                        postUri?.let { uri ->
                            runCatching {
                                CustomTabsIntent.Builder().setShowTitle(false).build().launchUrl(context, uri)
                            }.onFailure {
                                error = "Recording has started, but the post could not be opened."
                            }
                        }
                    }
                    VideoLinkCaptureService.ACTION_RESULT -> {
                        val saved = result.getBooleanExtra(VideoLinkCaptureService.EXTRA_SAVED, false)
                        val message = result.getStringExtra(VideoLinkCaptureService.EXTRA_MESSAGE)
                            ?: if (saved) "Recording saved." else "Recording could not be saved."
                        isStarting = false
                        isRecording = false
                        isStopping = false
                        status = message
                        error = if (saved) null else message
                    }
                }
            }
        }
        ContextCompat.registerReceiver(
            context,
            captureResultReceiver,
            IntentFilter().apply {
                addAction(VideoLinkCaptureService.ACTION_STARTED)
                addAction(VideoLinkCaptureService.ACTION_RESULT)
            },
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        onDispose { context.unregisterReceiver(captureResultReceiver) }
    }

    val projectionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data
        if (result.resultCode == Activity.RESULT_OK && data != null) {
            val serviceIntent = Intent(context, VideoLinkCaptureService::class.java).apply {
                action = VideoLinkCaptureService.ACTION_START
                putExtra(VideoLinkCaptureService.EXTRA_RESULT_CODE, result.resultCode)
                putExtra(VideoLinkCaptureService.EXTRA_PROJECTION_DATA, data)
            }
            runCatching { ContextCompat.startForegroundService(context, serviceIntent) }
                .onSuccess {
                    isStarting = true
                    isStopping = false
                    status = "Starting capture."
                    error = null
                }
                .onFailure {
                    isStarting = false
                    isRecording = false
                    isStopping = false
                    error = it.message ?: "Unable to start screen recording."
                    status = "Capture did not start."
                }
        } else {
            isStarting = false
            isRecording = false
            isStopping = false
            status = "Screen capture permission was cancelled."
        }
    }

    fun validatedLink(): VideoPostLink? {
        return runCatching { parseVideoPostLink(postUrl) }
            .onSuccess {
                provider = it.provider
                error = null
            }
            .onFailure {
                error = it.message ?: "Paste a valid supported post link."
            }
            .getOrNull()
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        OutlinedTextField(
            value = postUrl,
            onValueChange = {
                postUrl = it
                provider = ""
                postUri = null
                error = null
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isRecording,
            label = { Text("Social-media post link") },
            placeholder = { Text("Paste a TikTok, Instagram, Facebook, YouTube, X or other supported post link") },
            singleLine = true
        )
        if (provider.isNotBlank()) {
            Text("Platform: $provider", style = MaterialTheme.typography.labelMedium)
        }
        Button(
            onClick = {
                val link = validatedLink() ?: return@Button
                postUri = link.uri
                val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                val captureIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
                } else {
                    manager.createScreenCaptureIntent()
                }
                isStarting = true
                status = "Waiting for screen-capture permission."
                error = null
                projectionLauncher.launch(captureIntent)
            },
            enabled = postUrl.isNotBlank() && !isStarting && !isRecording && !isStopping,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Start recording")
        }
        if (isRecording || isStarting) {
            Button(
                onClick = {
                    isStopping = true
                    error = null
                    status = "Saving recording."
                    context.startService(
                        Intent(context, VideoLinkCaptureService::class.java)
                            .setAction(VideoLinkCaptureService.ACTION_STOP)
                    )
                },
                enabled = isRecording && !isStopping,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isStopping) "Saving…" else "Stop and save recording")
            }
        }
        if (error != null) {
            Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        if (status.isNotBlank()) Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * Records the actual Android display through MediaProjection.
 * It never reads social-app databases, cookies, or private post endpoints.
 */
class VideoLinkCaptureService : Service() {
    companion object {
        const val ACTION_START = "com.chastech.env.videolink.START"
        const val ACTION_STOP = "com.chastech.env.videolink.STOP"
        const val ACTION_STARTED = "com.chastech.env.videolink.STARTED"
        const val ACTION_RESULT = "com.chastech.env.videolink.RESULT"
        const val EXTRA_SAVED = "capture_saved"
        const val EXTRA_MESSAGE = "capture_message"
        const val EXTRA_RESULT_CODE = "projection_result_code"
        const val EXTRA_PROJECTION_DATA = "projection_data"
        private const val CHANNEL_ID = "video_link_capture"
        private const val NOTIFICATION_ID = 7214
        private const val MAX_DURATION_MS = 10 * 60 * 1000
    }

    private var projection: MediaProjection? = null
    private var projectionCallback: MediaProjection.Callback? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var recorder: MediaRecorder? = null
    private var outputUri: Uri? = null
    private var outputFile: File? = null
    private var outputDescriptor: android.os.ParcelFileDescriptor? = null
    private var stopping = false
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopCapture()
                return START_NOT_STICKY
            }
            ACTION_START -> {
                if (projection != null && recorder != null) {
                    sendCaptureStarted()
                    return START_NOT_STICKY
                }
                try {
                    createNotificationChannel()
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        startForeground(
                            NOTIFICATION_ID,
                            buildNotification("Preparing screen capture"),
                            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                        )
                    } else {
                        startForeground(NOTIFICATION_ID, buildNotification("Preparing screen capture"))
                    }
                    @Suppress("DEPRECATION")
                    val projectionData = intent.getParcelableExtra<Intent>(EXTRA_PROJECTION_DATA)
                    val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
                    if (projectionData == null || resultCode != Activity.RESULT_OK) {
                        failCapture("Screen-capture permission was not received.")
                        return START_NOT_STICKY
                    }
                    startCapture(resultCode, projectionData)
                } catch (error: Exception) {
                    failCapture(error.message ?: "Android could not start the screen-capture service.")
                }
            }
        }
        return START_NOT_STICKY
    }

    private fun startCapture(resultCode: Int, data: Intent) {
        try {
            val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val activeProjection = manager.getMediaProjection(resultCode, data)
                ?: throw IllegalStateException("Android did not provide a screen-capture session.")
            projection = activeProjection

            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            (getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(metrics)
            val sourceWidth = metrics.widthPixels.coerceAtLeast(16)
            val sourceHeight = metrics.heightPixels.coerceAtLeast(16)
            val scale = minOf(1.0, 1920.0 / maxOf(sourceWidth, sourceHeight))
            val width = ((sourceWidth * scale).toInt() / 16 * 16).coerceAtLeast(16)
            val height = ((sourceHeight * scale).toInt() / 16 * 16).coerceAtLeast(16)

            prepareOutput()
            val videoRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            recorder = videoRecorder
            videoRecorder.setVideoSource(MediaRecorder.VideoSource.SURFACE)
            videoRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            videoRecorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
            videoRecorder.setVideoSize(width, height)
            videoRecorder.setVideoFrameRate(30)
            videoRecorder.setVideoEncodingBitRate((width.toLong() * height * 2L).toInt().coerceIn(2_000_000, 7_000_000))
            val descriptor = outputDescriptor
            if (descriptor != null) {
                videoRecorder.setOutputFile(descriptor.fileDescriptor)
            } else {
                videoRecorder.setOutputFile(requireNotNull(outputFile).absolutePath)
            }
            videoRecorder.setMaxDuration(MAX_DURATION_MS)
            videoRecorder.setOnInfoListener { _, what, _ ->
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) stopCapture()
            }
            videoRecorder.prepare()

            val callback = object : MediaProjection.Callback() {
                override fun onStop() {
                    if (!stopping) stopCapture()
                }
            }
            projectionCallback = callback
            // Android 14+ requires a registered callback before creating the virtual display.
            activeProjection.registerCallback(callback, mainHandler)

            val surface: Surface = videoRecorder.surface
            virtualDisplay = activeProjection.createVirtualDisplay(
                "enV Video Link Capture",
                width,
                height,
                metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                surface,
                null,
                mainHandler
            ) ?: throw IllegalStateException("Android could not create a display for screen recording.")

            videoRecorder.start()
            updateNotification("Recording screen · use Stop to finish")
            sendCaptureStarted()
        } catch (error: Exception) {
            failCapture(error.message ?: "Screen recording could not start.")
        }
    }

    private fun prepareOutput() {
        val fileName = "enV-Post-Interface-${System.currentTimeMillis()}.mp4"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/enV")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }
            val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("Could not create an MP4 in device storage.")
            outputUri = uri
            outputDescriptor = contentResolver.openFileDescriptor(uri, "w")
                ?: throw IllegalStateException("Could not open the output MP4.")
        } else {
            val directory = File(getExternalFilesDir(Environment.DIRECTORY_MOVIES), "enV")
            if (!directory.exists() && !directory.mkdirs()) {
                throw IllegalStateException("Could not create the app's Movies folder.")
            }
            outputFile = File(directory, fileName)
        }
    }

    private fun stopCapture() {
        if (stopping) return
        stopping = true
        var saved = false
        try {
            val currentRecorder = recorder
            recorder = null
            if (currentRecorder != null) {
                try {
                    currentRecorder.stop()
                    saved = true
                } catch (_: RuntimeException) {
                    saved = false
                } finally {
                    runCatching { currentRecorder.reset() }
                    runCatching { currentRecorder.release() }
                }
            }
            virtualDisplay?.release()
            virtualDisplay = null
            outputDescriptor?.close()
            outputDescriptor = null
            if (saved) {
                outputUri?.let { uri ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        val values = ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }
                        contentResolver.update(uri, values, null, null)
                    }
                }
                val message = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    "Recording saved as an MP4 in Movies/enV."
                } else {
                    "Recording saved to enV's app-specific Movies folder."
                }
                updateNotification(message)
                sendCaptureResult(saved = true, message = message)
            } else {
                deletePartialOutput()
                val message = "Recording could not be finalized. Try a longer capture."
                updateNotification(message)
                sendCaptureResult(saved = false, message = message)
            }
        } catch (_: Exception) {
            deletePartialOutput()
            val message = "Recording could not be saved."
            updateNotification(message)
            sendCaptureResult(saved = false, message = message)
        } finally {
            val activeProjection = projection
            projection = null
            projectionCallback?.let { callback ->
                runCatching { activeProjection?.unregisterCallback(callback) }
            }
            projectionCallback = null
            runCatching { activeProjection?.stop() }
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            stopping = false
        }
    }

    private fun failCapture(message: String) {
        if (stopping) return
        stopping = true
        virtualDisplay?.release()
        virtualDisplay = null
        deletePartialOutput()
        runCatching { updateNotification(message.take(100)) }
        sendCaptureResult(saved = false, message = message)
        val activeProjection = projection
        projection = null
        projectionCallback?.let { callback ->
            runCatching { activeProjection?.unregisterCallback(callback) }
        }
        projectionCallback = null
        runCatching { activeProjection?.stop() }
        runCatching { recorder?.reset() }
        runCatching { recorder?.release() }
        recorder = null
        runCatching { outputDescriptor?.close() }
        outputDescriptor = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun deletePartialOutput() {
        outputUri?.let { runCatching { contentResolver.delete(it, null, null) } }
        outputUri = null
        outputFile?.let { if (it.exists()) it.delete() }
        outputFile = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Video link screen recording", NotificationManager.IMPORTANCE_LOW)
        )
    }

    private fun buildNotification(message: String) = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.presence_video_online)
        .setContentTitle("enV Video Link Screen Recording")
        .setContentText(message)
        .setOngoing(true)
        .addAction(
            android.R.drawable.ic_media_pause,
            "Stop",
            PendingIntent.getService(
                this,
                NOTIFICATION_ID,
                Intent(this, VideoLinkCaptureService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        )
        .build()

    private fun sendCaptureStarted() {
        sendBroadcast(
            Intent(ACTION_STARTED).setPackage(packageName)
        )
    }

    private fun sendCaptureResult(saved: Boolean, message: String) {
        sendBroadcast(
            Intent(ACTION_RESULT)
                .setPackage(packageName)
                .putExtra(EXTRA_SAVED, saved)
                .putExtra(EXTRA_MESSAGE, message)
        )
    }

    private fun updateNotification(message: String) {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification(message))
    }

    override fun onDestroy() {
        if (!stopping && projection != null) stopCapture()
        super.onDestroy()
    }
}
