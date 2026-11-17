package com.chastech.env

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationCompat
import java.io.File
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.flow.MutableStateFlow

/** What the Video Link Screen Recording screen observes. The service is the only writer. */
sealed interface VideoLinkRecordingState {
    object Idle : VideoLinkRecordingState
    data class Recording(val startedAtMillis: Long, val withAudio: Boolean) : VideoLinkRecordingState
    object Finishing : VideoLinkRecordingState
    data class Finished(val file: File, val durationMillis: Long) : VideoLinkRecordingState
    data class Failed(val message: String) : VideoLinkRecordingState
}

object VideoLinkRecordingBus {
    val state = MutableStateFlow<VideoLinkRecordingState>(VideoLinkRecordingState.Idle)
}

/**
 * Foreground service that records the device screen (and, on Android 10+, the audio the app plays)
 * into an MP4 in the app cache. It starts only after the person approves the system screen-capture
 * prompt, shows an ongoing notification with a Stop action, and never uploads anything.
 */
class VideoLinkRecordingService : Service() {
    private var session: CaptureSession? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startCapture(intent)
            ACTION_STOP -> session?.requestStop() ?: stopSelf()
            else -> if (session == null) stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        // If the system destroys the service mid-recording, finish the file instead of leaving it truncated.
        session?.requestStop()
        super.onDestroy()
    }

    private fun startCapture(intent: Intent) {
        if (session != null) return
        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val grant = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(EXTRA_GRANT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_GRANT_DATA)
        }
        if (grant == null) {
            fail("Screen capture permission data was missing. Try again.")
            return
        }
        val width = intent.getIntExtra(EXTRA_WIDTH, 720)
        val height = intent.getIntExtra(EXTRA_HEIGHT, 1280)
        val dpi = intent.getIntExtra(EXTRA_DPI, 320)
        val wantsAudio = intent.getBooleanExtra(EXTRA_WITH_AUDIO, false) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

        // Android 14+ requires the mediaProjection foreground service to be running before the projection is created.
        val notification = buildNotification()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (error: Exception) {
            fail("Android did not allow screen recording to start: ${error.message ?: "unknown error"}")
            return
        }

        val output = File(cacheDir, "$RECORDING_DIR/enV-video-link-${System.currentTimeMillis()}.mp4")
        output.parentFile?.mkdirs()
        try {
            val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val projection = manager.getMediaProjection(resultCode, grant)
                ?: throw IllegalStateException("The system did not return a screen-capture session.")
            val created = CaptureSession(
                context = applicationContext,
                projection = projection,
                width = width,
                height = height,
                dpi = dpi,
                wantsAudio = wantsAudio,
                output = output,
                onFinished = { result -> onSessionFinished(result) },
            )
            session = created
            created.start()
            VideoLinkRecordingBus.state.value = VideoLinkRecordingState.Recording(System.currentTimeMillis(), created.hasAudio)
        } catch (error: Exception) {
            session = null
            output.delete()
            fail(error.message ?: "Screen recording could not be started on this device.")
        }
    }

    private fun onSessionFinished(result: Result<SessionResult>) {
        Handler(Looper.getMainLooper()).post {
            session = null
            result.onSuccess { done ->
                VideoLinkRecordingBus.state.value = if (done.file.length() > 0L) {
                    VideoLinkRecordingState.Finished(done.file, done.durationMillis)
                } else {
                    done.file.delete()
                    VideoLinkRecordingState.Failed("Nothing was recorded. Keep the video on screen while recording.")
                }
            }.onFailure { error ->
                VideoLinkRecordingBus.state.value = VideoLinkRecordingState.Failed(error.message ?: "The recording could not be saved.")
            }
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun fail(message: String) {
        VideoLinkRecordingBus.state.value = VideoLinkRecordingState.Failed(message)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Screen recording", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Shown while enV is recording the screen."
                    setShowBadge(false)
                },
            )
        }
        val stopIntent = PendingIntent.getService(
            this,
            0,
            Intent(this, VideoLinkRecordingService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 1, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("enV is recording your screen")
            .setContentText("Tap Stop when you are finished.")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stopIntent)
            .build()
    }

    companion object {
        const val ACTION_START = "com.chastech.env.action.VIDEO_LINK_RECORDING_START"
        const val ACTION_STOP = "com.chastech.env.action.VIDEO_LINK_RECORDING_STOP"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_GRANT_DATA = "grantData"
        const val EXTRA_WIDTH = "width"
        const val EXTRA_HEIGHT = "height"
        const val EXTRA_DPI = "dpi"
        const val EXTRA_WITH_AUDIO = "withAudio"
        const val RECORDING_DIR = "video-link-recordings"
        private const val CHANNEL_ID = "env_video_link_recording"
        private const val NOTIFICATION_ID = 7421

        fun start(context: Context, resultCode: Int, grant: Intent, width: Int, height: Int, dpi: Int, withAudio: Boolean) {
            val intent = Intent(context, VideoLinkRecordingService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_RESULT_CODE, resultCode)
                .putExtra(EXTRA_GRANT_DATA, grant)
                .putExtra(EXTRA_WIDTH, width)
                .putExtra(EXTRA_HEIGHT, height)
                .putExtra(EXTRA_DPI, dpi)
                .putExtra(EXTRA_WITH_AUDIO, withAudio)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, VideoLinkRecordingService::class.java).setAction(ACTION_STOP))
        }

        /** Removes recordings left in the cache by earlier sessions. */
        fun purgeOldRecordings(context: Context, keepNewerThanMillis: Long = 24L * 60L * 60L * 1000L) {
            val directory = File(context.cacheDir, RECORDING_DIR)
            val cutoff = System.currentTimeMillis() - keepNewerThanMillis
            directory.listFiles()?.forEach { if (it.lastModified() < cutoff) it.delete() }
        }
    }
}

private data class SessionResult(val file: File, val durationMillis: Long)

/** Collects encoded samples until every expected track has been added, then starts the muxer once. */
private class MuxerGate(path: String, private var expectedTracks: Int) {
    private class Pending(val track: Int, val data: ByteArray, val flags: Int, val presentationTimeUs: Long)

    private val muxer = MediaMuxer(path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    private val pending = ArrayList<Pending>()
    private var pendingBytes = 0L
    private var added = 0
    private var started = false
    private var released = false

    @Synchronized
    fun addTrack(format: MediaFormat): Int {
        val index = muxer.addTrack(format)
        added += 1
        startIfReady()
        return index
    }

    /** Used when the audio path fails so video is not held back waiting for it. */
    @Synchronized
    fun setExpectedTracks(count: Int) {
        expectedTracks = count
        startIfReady()
    }

    @Synchronized
    fun write(track: Int, buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
        if (released || info.size <= 0) return
        if (started) {
            buffer.position(info.offset)
            buffer.limit(info.offset + info.size)
            muxer.writeSampleData(track, buffer, info)
            return
        }
        val copy = ByteArray(info.size)
        buffer.position(info.offset)
        buffer.limit(info.offset + info.size)
        buffer.get(copy)
        pending.add(Pending(track, copy, info.flags, info.presentationTimeUs))
        pendingBytes += copy.size
    }

    val isBackedUp: Boolean
        @Synchronized get() = !started && pendingBytes > 24L * 1024L * 1024L

    private fun startIfReady() {
        if (started || added < expectedTracks || added == 0) return
        muxer.start()
        started = true
        val info = MediaCodec.BufferInfo()
        pending.forEach { sample ->
            info.set(0, sample.data.size, sample.presentationTimeUs, sample.flags)
            muxer.writeSampleData(sample.track, ByteBuffer.wrap(sample.data), info)
        }
        pending.clear()
        pendingBytes = 0
    }

    @Synchronized
    fun release() {
        if (released) return
        released = true
        try {
            if (started) muxer.stop()
        } catch (_: Exception) {
            // A muxer that never received samples cannot be stopped cleanly.
        }
        try {
            muxer.release()
        } catch (_: Exception) {
        }
    }
}

private class CaptureSession(
    private val context: Context,
    private val projection: MediaProjection,
    private val width: Int,
    private val height: Int,
    private val dpi: Int,
    wantsAudio: Boolean,
    private val output: File,
    private val onFinished: (Result<SessionResult>) -> Unit,
) {
    private val baseUs = System.nanoTime() / 1000L
    private val stopRequested = AtomicBoolean(false)
    private val stopped = AtomicBoolean(false)
    private val mainHandler = Handler(Looper.getMainLooper())

    private var videoEncoder: MediaCodec? = null
    private var inputSurface: android.view.Surface? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var gate: MuxerGate? = null
    private var videoThread: Thread? = null
    private var audioThread: Thread? = null
    private var audioRecord: AudioRecord? = null
    private var audioEncoder: MediaCodec? = null
    private var startedAtMillis = 0L
    private var videoTrack = -1
    private var audioTrack = -1

    @Volatile
    private var audioFailed = false

    val hasAudio: Boolean = wantsAudio && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    private val projectionCallback = object : MediaProjection.Callback() {
        // The person ended sharing from the system UI.
        override fun onStop() {
            requestStop()
        }
    }

    fun start() {
        gate = MuxerGate(output.absolutePath, if (hasAudio) 2 else 1)
        projection.registerCallback(projectionCallback, mainHandler)

        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, bitRateFor(width, height))
            setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
            // Static screens still produce regular frames, which keeps playback smooth.
            setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000L)
        }
        val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        inputSurface = encoder.createInputSurface()
        encoder.start()
        videoEncoder = encoder

        virtualDisplay = projection.createVirtualDisplay(
            "enV-video-link",
            width,
            height,
            dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            inputSurface,
            null,
            null,
        )

        if (hasAudio) {
            try {
                startAudio()
            } catch (error: Exception) {
                // Video-only is better than no recording; the screen explains the missing sound.
                audioFailed = true
                releaseAudio()
                gate?.setExpectedTracks(1)
            }
        }

        startedAtMillis = System.currentTimeMillis()
        videoThread = Thread({ drainVideo(encoder) }, "enV-video-link-video").also { it.start() }
    }

    fun requestStop() {
        if (!stopRequested.compareAndSet(false, true)) return
        VideoLinkRecordingBus.state.value = VideoLinkRecordingState.Finishing
        Thread({ finish() }, "enV-video-link-finish").start()
    }

    private fun finish() {
        if (!stopped.compareAndSet(false, true)) return
        var failure: Throwable? = null
        try {
            audioThread?.join(3_000)
            try {
                videoEncoder?.signalEndOfInputStream()
            } catch (_: Exception) {
            }
            videoThread?.join(5_000)
        } catch (error: Throwable) {
            failure = error
        }
        try {
            projection.unregisterCallback(projectionCallback)
        } catch (_: Exception) {
        }
        try {
            virtualDisplay?.release()
        } catch (_: Exception) {
        }
        try {
            projection.stop()
        } catch (_: Exception) {
        }
        releaseAudio()
        try {
            videoEncoder?.stop()
        } catch (_: Exception) {
        }
        try {
            videoEncoder?.release()
        } catch (_: Exception) {
        }
        try {
            inputSurface?.release()
        } catch (_: Exception) {
        }
        gate?.release()
        val duration = System.currentTimeMillis() - startedAtMillis
        if (failure != null) {
            output.delete()
            onFinished(Result.failure(failure))
        } else {
            onFinished(Result.success(SessionResult(output, duration)))
        }
    }

    private fun drainVideo(encoder: MediaCodec) {
        val info = MediaCodec.BufferInfo()
        var lastPts = -1L
        var endOfStreamDeadline = Long.MAX_VALUE
        try {
            while (true) {
                if (stopRequested.get() && endOfStreamDeadline == Long.MAX_VALUE) endOfStreamDeadline = System.currentTimeMillis() + 6_000
                if (System.currentTimeMillis() > endOfStreamDeadline) break
                if (System.currentTimeMillis() - startedAtMillis > MAX_DURATION_MILLIS) {
                    mainHandler.post { requestStop() }
                }
                val index = encoder.dequeueOutputBuffer(info, 10_000)
                when {
                    index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> videoTrack = gate!!.addTrack(encoder.outputFormat)
                    index >= 0 -> {
                        val buffer = encoder.getOutputBuffer(index)
                        val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                        if (buffer != null && info.size > 0 && !isConfig && videoTrack >= 0) {
                            var pts = (info.presentationTimeUs - baseUs).coerceAtLeast(0L)
                            if (pts <= lastPts) pts = lastPts + 1
                            lastPts = pts
                            info.presentationTimeUs = pts
                            gate!!.write(videoTrack, buffer, info)
                        }
                        encoder.releaseOutputBuffer(index, false)
                        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
                    }
                }
                // If the audio path never came up, do not let queued video grow without bound.
                if (gate?.isBackedUp == true) {
                    audioFailed = true
                    gate?.setExpectedTracks(1)
                }
            }
        } catch (_: Exception) {
            // Finishing handles whatever was already written.
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    @SuppressLint("MissingPermission")
    private fun startAudio() {
        val capture = AudioPlaybackCaptureConfiguration.Builder(projection)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()
        val pcmFormat = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
            .build()
        val minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT)
        val record = AudioRecord.Builder()
            .setAudioFormat(pcmFormat)
            .setBufferSizeInBytes(maxOf(minimum * 2, 16_384))
            .setAudioPlaybackCaptureConfig(capture)
            .build()
        check(record.state == AudioRecord.STATE_INITIALIZED) { "Audio capture is not available." }

        val aacFormat = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, 2).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, 128_000)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16_384)
        }
        val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        encoder.configure(aacFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        encoder.start()
        record.startRecording()
        audioRecord = record
        audioEncoder = encoder
        audioThread = Thread({ audioLoop(record, encoder) }, "enV-video-link-audio").also { it.start() }
    }

    private fun audioLoop(record: AudioRecord, encoder: MediaCodec) {
        val pcm = ByteArray(4096)
        val info = MediaCodec.BufferInfo()
        var framesWritten = 0L
        var originUs = -1L
        var finished = false

        fun drain() {
            while (true) {
                val index = encoder.dequeueOutputBuffer(info, 0)
                when {
                    index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> audioTrack = gate!!.addTrack(encoder.outputFormat)
                    index >= 0 -> {
                        val buffer = encoder.getOutputBuffer(index)
                        val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                        if (buffer != null && info.size > 0 && !isConfig && audioTrack >= 0) gate!!.write(audioTrack, buffer, info)
                        encoder.releaseOutputBuffer(index, false)
                        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) finished = true
                    }
                    else -> return
                }
            }
        }

        try {
            while (!stopRequested.get() && !audioFailed) {
                val read = record.read(pcm, 0, pcm.size)
                if (read <= 0) {
                    if (read < 0) throw IllegalStateException("Audio capture stopped unexpectedly.")
                    continue
                }
                if (originUs < 0) {
                    val frames = read / BYTES_PER_FRAME
                    originUs = (System.nanoTime() / 1000L - baseUs - frames * 1_000_000L / SAMPLE_RATE).coerceAtLeast(0L)
                }
                var offset = 0
                while (offset < read && !audioFailed) {
                    val inputIndex = encoder.dequeueInputBuffer(10_000)
                    if (inputIndex >= 0) {
                        val input = encoder.getInputBuffer(inputIndex)!!
                        input.clear()
                        val count = minOf(input.remaining(), read - offset)
                        input.put(pcm, offset, count)
                        val pts = originUs + framesWritten * 1_000_000L / SAMPLE_RATE
                        encoder.queueInputBuffer(inputIndex, 0, count, pts, 0)
                        framesWritten += count / BYTES_PER_FRAME
                        offset += count
                    }
                    drain()
                }
            }
            // Flush the encoder so the last audio is not cut off.
            val last = encoder.dequeueInputBuffer(50_000)
            if (last >= 0) {
                val pts = maxOf(originUs, 0L) + framesWritten * 1_000_000L / SAMPLE_RATE
                encoder.queueInputBuffer(last, 0, 0, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            }
            val deadline = System.currentTimeMillis() + 2_000
            while (!finished && System.currentTimeMillis() < deadline) {
                drain()
                Thread.sleep(5)
            }
        } catch (_: Exception) {
            audioFailed = true
            gate?.setExpectedTracks(1)
        }
    }

    private fun releaseAudio() {
        try {
            audioRecord?.stop()
        } catch (_: Exception) {
        }
        try {
            audioRecord?.release()
        } catch (_: Exception) {
        }
        audioRecord = null
        try {
            audioEncoder?.stop()
        } catch (_: Exception) {
        }
        try {
            audioEncoder?.release()
        } catch (_: Exception) {
        }
        audioEncoder = null
    }

    private companion object {
        const val FRAME_RATE = 30
        const val SAMPLE_RATE = 44_100
        const val BYTES_PER_FRAME = 4 // 16-bit stereo
        const val MAX_DURATION_MILLIS = 60L * 60L * 1000L

        fun bitRateFor(width: Int, height: Int): Int = (width.toLong() * height * 4L).coerceIn(2_000_000L, 12_000_000L).toInt()
    }
}
