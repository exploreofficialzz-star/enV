package com.chastech.env

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
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
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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

private data class SocialPostLink(val uri: Uri, val provider: String)

private val socialPostDomains = linkedMapOf(
    "TikTok" to listOf("tiktok.com"),
    "Instagram" to listOf("instagram.com"),
    "Facebook" to listOf("facebook.com", "fb.watch"),
    "YouTube" to listOf("youtube.com", "youtu.be"),
    "X" to listOf("x.com", "twitter.com"),
    "Snapchat" to listOf("snapchat.com"),
    "Threads" to listOf("threads.net"),
    "LinkedIn" to listOf("linkedin.com"),
    "Reddit" to listOf("reddit.com"),
    "Twitch" to listOf("twitch.tv"),
    "Vimeo" to listOf("vimeo.com"),
    "Dailymotion" to listOf("dailymotion.com"),
)

private fun parseSocialPostLink(raw: String): SocialPostLink {
    val uri = Uri.parse(raw.trim())
    require(uri.scheme.equals("https", ignoreCase = true)) { "Paste a secure HTTPS social-media post link." }
    require(uri.encodedUserInfo.isNullOrEmpty()) { "Links containing embedded login credentials are not accepted." }
    val host = uri.host?.lowercase(Locale.ROOT)?.removePrefix("www.")
        ?: throw IllegalArgumentException("That link is not valid.")
    val provider = socialPostDomains.entries.firstOrNull { (_, domains) ->
        domains.any { host == it || host.endsWith(".$it") }
    }?.key ?: throw IllegalArgumentException("This platform is not supported yet.")
    return SocialPostLink(uri, provider)
}

@Composable
fun NativeSocialMediaPostRecorderScreen() {
    val context = LocalContext.current
    var postUrl by rememberSaveable { mutableStateOf("") }
    var provider by rememberSaveable { mutableStateOf("") }
    var status by rememberSaveable { mutableStateOf("Paste a public post link to begin.") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var isRecording by rememberSaveable { mutableStateOf(false) }

    val projectionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data
        if (result.resultCode == Activity.RESULT_OK && data != null) {
            val serviceIntent = Intent(context, SocialPostCaptureService::class.java).apply {
                action = SocialPostCaptureService.ACTION_START
                putExtra(SocialPostCaptureService.EXTRA_RESULT_CODE, result.resultCode)
                putExtra(SocialPostCaptureService.EXTRA_PROJECTION_DATA, data)
            }
            runCatching { ContextCompat.startForegroundService(context, serviceIntent) }
                .onSuccess {
                    isRecording = true
                    status = "Screen capture started. Switch to the social-media post and play it. Use the enV screen or recording notification to stop."
                    error = null
                }
                .onFailure {
                    error = it.message ?: "Unable to start screen recording."
                    status = "Capture did not start."
                }
        } else {
            status = "Screen capture permission was cancelled."
        }
    }

    fun validatedLink(): SocialPostLink? {
        return runCatching { parseSocialPostLink(postUrl) }
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
        Text(
            "Record the real social-media post screen, including the video and the details visible while it plays.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        OutlinedTextField(
            value = postUrl,
            onValueChange = {
                postUrl = it
                provider = ""
                error = null
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isRecording,
            label = { Text("Social-media post link") },
            placeholder = { Text("Paste a TikTok, Instagram, Facebook or other supported link") },
            singleLine = true
        )
        if (provider.isNotBlank()) {
            Text("Platform: $provider", style = MaterialTheme.typography.labelMedium)
        }
        OutlinedButton(
            onClick = {
                val link = validatedLink() ?: return@OutlinedButton
                runCatching {
                    context.startActivity(Intent(Intent.ACTION_VIEW, link.uri))
                }.onFailure {
                    error = "No app or browser could open this post link."
                }
            },
            enabled = postUrl.isNotBlank() && !isRecording,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Open original post")
        }
        Button(
            onClick = {
                if (validatedLink() == null) return@Button
                val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                projectionLauncher.launch(manager.createScreenCaptureIntent())
            },
            enabled = postUrl.isNotBlank() && !isRecording,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Start screen recording")
        }
        if (isRecording) {
            Button(
                onClick = {
                    context.startService(
                        Intent(context, SocialPostCaptureService::class.java)
                            .setAction(SocialPostCaptureService.ACTION_STOP)
                    )
                    isRecording = false
                    status = "Recording stopped. Check Movies/enV or the app's Movies folder for the saved MP4."
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Stop and save MP4")
            }
        }
        if (error != null) {
            Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        Text(
            "Choose full-screen capture in Android's permission prompt if you want the original app layout and navigation included. Android may block capture from protected screens. This first Android version records the screen as MP4 without app playback audio; app audio is subject to Android and each source app's capture policy.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/**
 * Records the actual Android display through MediaProjection.
 * It never reads social-app databases, cookies, or private post endpoints.
 */
class SocialPostCaptureService : Service() {
    companion object {
        const val ACTION_START = "com.chastech.env.socialpost.START"
        const val ACTION_STOP = "com.chastech.env.socialpost.STOP"
        const val EXTRA_RESULT_CODE = "projection_result_code"
        const val EXTRA_PROJECTION_DATA = "projection_data"
        private const val CHANNEL_ID = "social_post_capture"
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
                if (projection != null || recorder != null) return START_STICKY
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
            val width = (metrics.widthPixels - metrics.widthPixels % 2).coerceAtLeast(2)
            val height = (metrics.heightPixels - metrics.heightPixels % 2).coerceAtLeast(2)

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
            videoRecorder.setVideoEncodingBitRate(8_000_000)
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

            val surface: Surface = videoRecorder.surface
            virtualDisplay = activeProjection.createVirtualDisplay(
                "enV Social Post Capture",
                width,
                height,
                metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                surface,
                null,
                mainHandler
            ) ?: throw IllegalStateException("Android could not create a display for screen recording.")

            val callback = object : MediaProjection.Callback() {
                override fun onStop() {
                    if (!stopping) stopCapture()
                }
            }
            projectionCallback = callback
            activeProjection.registerCallback(callback, mainHandler)
            videoRecorder.start()
            updateNotification("Recording screen · use Stop to finish")
        } catch (error: Exception) {
            failCapture(error.message ?: "Screen recording could not start.")
        }
    }

    private fun prepareOutput() {
        val fileName = "enV-Social-Post-${System.currentTimeMillis()}.mp4"
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
            virtualDisplay?.release()
            virtualDisplay = null
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
            outputDescriptor?.close()
            outputDescriptor = null
            if (saved) {
                outputUri?.let { uri ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        val values = ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }
                        contentResolver.update(uri, values, null, null)
                    }
                }
                updateNotification("Recording saved as an MP4 in Movies/enV")
            } else {
                deletePartialOutput()
                updateNotification("Recording could not be finalized. Try a longer capture.")
            }
        } catch (_: Exception) {
            deletePartialOutput()
            updateNotification("Recording could not be saved.")
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
        deletePartialOutput()
        updateNotification(message.take(100))
        val activeProjection = projection
        projection = null
        runCatching { activeProjection?.stop() }
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
            NotificationChannel(CHANNEL_ID, "Social post screen recording", NotificationManager.IMPORTANCE_LOW)
        )
    }

    private fun buildNotification(message: String) = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.presence_video_online)
        .setContentTitle("enV Social Media Post Recorder")
        .setContentText(message)
        .setOngoing(true)
        .addAction(
            android.R.drawable.ic_media_pause,
            "Stop",
            PendingIntent.getService(
                this,
                NOTIFICATION_ID,
                Intent(this, SocialPostCaptureService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        )
        .build()

    private fun updateNotification(message: String) {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification(message))
    }

    override fun onDestroy() {
        if (!stopping && projection != null) stopCapture()
        super.onDestroy()
    }
}
