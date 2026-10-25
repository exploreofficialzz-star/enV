package com.chastech.env.engine

import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt
import kotlin.math.sin
import kotlin.math.round
import kotlin.math.roundToInt

/**
 * Native-first PCM WAV processor used by Android's offline Audio tools.
 * Input: uncompressed RIFF/WAVE PCM (8/16/24/32-bit) or 32-bit float WAV.
 * Output: 16-bit PCM WAV. Heavy stem AI and compressed-format conversion remain
 * web/server paths and are not misrepresented as native local processing.
 */
data class NativeDecodedWav(val sampleRateHz: Int, val channels: List<FloatArray>, val sourceBits: Int, val sourceEncoding: Int) {
    val frames: Int get() = channels.firstOrNull()?.size ?: 0
    val durationSeconds: Double get() = if (sampleRateHz > 0) frames.toDouble() / sampleRateHz else 0.0
}

data class NativeAudioWavResult(val report: String, val outputWav: ByteArray? = null, val durationSeconds: Double? = null)

object NativeAudioWavProcessor {
    private const val MAX_SOURCE_BYTES = 250 * 1024 * 1024
    private const val MAX_OUTPUT_BYTES = 512L * 1024 * 1024
    private const val MAX_FLOAT_SAMPLES = 30_000_000L

    fun decode(bytes: ByteArray): NativeDecodedWav {
        require(bytes.size in 44..MAX_SOURCE_BYTES) { "Choose a WAV file between 44 bytes and 250 MB." }
        require(ascii(bytes, 0, 4) == "RIFF" && ascii(bytes, 8, 4) == "WAVE") {
            "This native offline tool currently accepts RIFF/WAVE audio. For MP3, M4A or OGG, use the browser-local audio tool."
        }
        var offset = 12
        var format: Int? = null
        var channelCount: Int? = null
        var sampleRate: Int? = null
        var bits: Int? = null
        var blockAlign: Int? = null
        var dataStart = -1
        var dataLength = 0
        while (offset + 8 <= bytes.size) {
            val id = ascii(bytes, offset, 4)
            val chunkSizeLong = uint32(bytes, offset + 4)
            require(chunkSizeLong <= Int.MAX_VALUE.toLong()) { "WAV chunk is too large for this device." }
            val chunkSize = chunkSizeLong.toInt()
            val start = offset + 8
            require(start.toLong() + chunkSize <= bytes.size.toLong()) { "The WAV file contains a truncated chunk." }
            when (id) {
                "fmt " -> {
                    require(chunkSize >= 16) { "The WAV format chunk is incomplete." }
                    format = uint16(bytes, start)
                    channelCount = uint16(bytes, start + 2)
                    sampleRate = uint32(bytes, start + 4).toInt()
                    blockAlign = uint16(bytes, start + 12)
                    bits = uint16(bytes, start + 14)
                }
                "data" -> if (dataStart < 0) { dataStart = start; dataLength = chunkSize }
            }
            offset = start + chunkSize + (chunkSize and 1)
        }
        val encoding = format ?: throw IllegalArgumentException("WAV format chunk is missing.")
        val channelsCount = channelCount ?: throw IllegalArgumentException("WAV channel count is missing.")
        val rate = sampleRate ?: throw IllegalArgumentException("WAV sample rate is missing.")
        val bitDepth = bits ?: throw IllegalArgumentException("WAV bit depth is missing.")
        val align = blockAlign ?: throw IllegalArgumentException("WAV block alignment is missing.")
        require(channelsCount in 1..8) { "Native WAV processing supports 1–8 channels." }
        require(rate in 8_000..192_000) { "Sample rate must be 8,000–192,000 Hz." }
        require(encoding == 1 || encoding == 3) { "Only uncompressed PCM or 32-bit float WAV is supported natively." }
        require((encoding == 1 && bitDepth in setOf(8, 16, 24, 32)) || (encoding == 3 && bitDepth == 32)) { "Supported WAV samples are 8/16/24/32-bit PCM or 32-bit float." }
        val bytesPerSample = bitDepth / 8
        require(align >= channelsCount * bytesPerSample && align > 0) { "The WAV block alignment is invalid." }
        require(dataStart >= 0 && dataLength > 0) { "WAV audio data is missing or empty." }
        val frames = dataLength / align
        require(frames > 0 && frames * align == dataLength) { "The WAV data chunk ends mid-frame." }
        require(frames.toLong() * channelsCount <= MAX_FLOAT_SAMPLES) { "This WAV expands beyond the native memory safety limit. Use a shorter excerpt or the browser tool on a suitable device." }
        val output = List(channelsCount) { FloatArray(frames) }
        for (frame in 0 until frames) {
            val base = dataStart + frame * align
            for (channel in 0 until channelsCount) {
                val at = base + channel * bytesPerSample
                val value = when {
                    encoding == 3 -> Float.fromBits(int32(bytes, at)).takeIf { it.isFinite() } ?: 0f
                    bitDepth == 8 -> ((bytes[at].toInt() and 0xff) - 128) / 128f
                    bitDepth == 16 -> short16(bytes, at).toInt() / 32768f
                    bitDepth == 24 -> {
                        var value24 = (bytes[at].toInt() and 0xff) or ((bytes[at + 1].toInt() and 0xff) shl 8) or ((bytes[at + 2].toInt() and 0xff) shl 16)
                        if ((value24 and 0x800000) != 0) value24 = value24 or -0x1000000
                        value24 / 8_388_608f
                    }
                    else -> (int32(bytes, at).toDouble() / 2_147_483_648.0).toFloat()
                }
                output[channel][frame] = value.coerceIn(-1f, 1f)
            }
        }
        return NativeDecodedWav(rate, output, bitDepth, encoding)
    }

    fun generateTone(sampleRateHz: Int = 44_100, durationSeconds: Double = 2.0, frequencyHz: Double = 440.0, waveform: String = "sine", levelDbfs: Double = -12.0): NativeAudioWavResult {
        require(sampleRateHz in 8_000..192_000) { "Sample rate must be 8,000–192,000 Hz." }
        require(durationSeconds.isFinite() && durationSeconds in 0.05..300.0) { "Tone duration must be 0.05–300 seconds." }
        require(frequencyHz.isFinite() && frequencyHz >= 1 && frequencyHz < sampleRateHz / 2.0) { "Frequency must be positive and below Nyquist (${sampleRateHz / 2} Hz)." }
        require(waveform in setOf("sine", "square", "saw", "noise")) { "Choose sine, square, saw or noise." }
        require(levelDbfs.isFinite() && levelDbfs in -60.0..0.0) { "Output level must be between −60 and 0 dBFS." }
        val frames = (durationSeconds * sampleRateHz).toLong()
        require(frames in 1L..MAX_FLOAT_SAMPLES) { "Generated tone exceeds the native sample safety limit." }
        val amplitude = 10.0.pow(levelDbfs / 20.0)
        val fadeFrames = min(frames.toInt() / 2, max(1, (sampleRateHz * 0.01).toInt()))
        val random = kotlin.random.Random.Default
        val samples = FloatArray(frames.toInt()) { index ->
            val phase = (frequencyHz * index / sampleRateHz) % 1.0
            val raw = when (waveform) {
                "sine" -> sin(2.0 * Math.PI * phase)
                "square" -> if (sin(2.0 * Math.PI * phase) >= 0) 1.0 else -1.0
                "saw" -> 2.0 * phase - 1.0
                else -> random.nextDouble(-1.0, 1.0)
            }
            val edge = min(1.0, min((index + 1).toDouble() / fadeFrames, (frames.toInt() - index).toDouble() / fadeFrames))
            (raw * amplitude * edge.coerceAtLeast(0.0)).toFloat()
        }
        val encoded = encodePcm16(sampleRateHz, listOf(samples))
        return NativeAudioWavResult("Generated $waveform tone\nFrequency: ${fmt(frequencyHz)} Hz\nDuration: ${fmt(durationSeconds)} s\nLevel: $levelDbfs dBFS\nOutput: 16-bit PCM WAV with short edge fades.", encoded, durationSeconds)
    }

    fun generateMetronome(sampleRateHz: Int = 44_100, bpm: Double = 120.0, beatsPerBar: Int = 4, bars: Int = 4, denominator: Int = 4): NativeAudioWavResult {
        require(sampleRateHz in 8_000..192_000) { "Sample rate must be 8,000–192,000 Hz." }
        require(bpm.isFinite() && bpm in 40.0..240.0) { "BPM must be 40–240." }
        require(beatsPerBar in 1..12 && bars in 1..100) { "Beats per bar must be 1–12 and bars must be 1–100." }
        require(denominator in setOf(2, 4, 8)) { "Time-signature denominator must be 2, 4 or 8." }
        val beatSeconds = 60.0 / bpm * 4.0 / denominator
        val beats = beatsPerBar * bars
        val framesLong = (beatSeconds * beats * sampleRateHz).toLong()
        require(framesLong in 1L..MAX_FLOAT_SAMPLES) { "Metronome export exceeds the native sample safety limit." }
        val output = FloatArray(framesLong.toInt())
        val clickFrames = max(1, (sampleRateHz * 0.025).toInt())
        for (beat in 0 until beats) {
            val start = (beat * beatSeconds * sampleRateHz).toInt()
            val accent = beat % beatsPerBar == 0
            val frequency = if (accent) 1_600.0 else 1_000.0
            val amplitude = if (accent) 0.85 else 0.45
            for (i in 0 until min(clickFrames, output.size - start)) {
                val edge = min(1.0, min((i + 1.0) / (sampleRateHz * 0.002), (clickFrames - i).toDouble() / (sampleRateHz * 0.004)))
                val decay = kotlin.math.exp(-i / (sampleRateHz * 0.007))
                output[start + i] = (output[start + i] + amplitude * edge.coerceAtLeast(0.0) * decay * sin(2 * Math.PI * frequency * i / sampleRateHz)).toFloat().coerceIn(-1f, 1f)
            }
        }
        val encoded = encodePcm16(sampleRateHz, listOf(output))
        val duration = framesLong.toDouble() / sampleRateHz
        return NativeAudioWavResult("Generated metronome click track\nTempo: ${fmt(bpm)} quarter-note BPM\nTime signature: $beatsPerBar/$denominator\nBars: $bars · Total beats: $beats\nBeat interval: ${fmt(beatSeconds)} s\nDuration: ${fmt(duration)} s\nDownbeats accented.", encoded, duration)
    }

    fun join(wavFiles: List<ByteArray>): NativeAudioWavResult {
        require(wavFiles.size in 2..32) { "Choose 2–32 WAV files to join." }
        require(wavFiles.sumOf { it.size.toLong() } <= 100L * 1024 * 1024) { "The combined WAV input size must not exceed 100 MB for safe local joining." }
        val decoded = wavFiles.map { decode(it) }
        val first = decoded.first()
        require(decoded.all { it.sampleRateHz == first.sampleRateHz && it.channels.size == first.channels.size }) {
            "To keep joining lossless and predictable, all WAVs must have the same sample rate and channel count. Convert them first if needed."
        }
        val totalFrames = decoded.sumOf { it.frames.toLong() }
        require(totalFrames * first.channels.size <= MAX_FLOAT_SAMPLES) { "The joined output exceeds the native memory safety limit. Join shorter excerpts." }
        val joinedChannels = List(first.channels.size) { channel ->
            val out = FloatArray(totalFrames.toInt())
            var offset = 0
            for (track in decoded) {
                System.arraycopy(track.channels[channel], 0, out, offset, track.frames)
                offset += track.frames
            }
            out
        }
        val encoded = encodePcm16(first.sampleRateHz, joinedChannels)
        val duration = totalFrames.toDouble() / first.sampleRateHz
        return NativeAudioWavResult("Joined ${wavFiles.size} WAV files in selected order\nSample rate: ${first.sampleRateHz} Hz\nChannels: ${first.channels.size}\nDuration: ${fmt(duration)} s\nOutput: 16-bit PCM WAV\nProcessed on this device; no upload performed.", encoded, duration)
    }

    fun process(
        bytes: ByteArray,
        operation: String,
        startSeconds: Double = 0.0,
        endSeconds: Double? = null,
        gainPercent: Double = 100.0,
        semitones: Double = 2.0,
        playbackRate: Double = 1.0,
        targetSampleRateHz: Int = 44_100,
        noiseStrength: Double = 0.8,
        gateThresholdDb: Double = -42.0,
        humFrequencyHz: Int = 50,
        silenceThresholdDb: Double = -50.0,
        fadeDurationMs: Double = 1_000.0,
        eqLowDb: Double = 0.0,
        eqMidDb: Double = 0.0,
        eqHighDb: Double = 0.0,
        compressorThresholdDb: Double = -18.0,
        compressorRatio: Double = 4.0,
        targetChannels: Int = 2,
        fileName: String = "audio.wav",
    ): NativeAudioWavResult {
        val input = decode(bytes)
        val duration = input.durationSeconds
        val peak = input.channels.maxOfOrNull { NativeAudioDsp.peakAmplitude(it) } ?: 0.0
        val rms = if (input.frames == 0) 0.0 else sqrt(input.channels.sumOf { channel -> channel.sumOf { it.toDouble() * it } } / (input.frames.toDouble() * input.channels.size))
        val dc = if (input.frames == 0) 0.0 else input.channels.sumOf { channel -> channel.sumOf { it.toDouble() } } / (input.frames.toDouble() * input.channels.size)
        when (operation) {
            "analyze" -> return NativeAudioWavResult(musicAnalysisReport(input, fileName, bytes.size, peak, rms), durationSeconds = duration)
            "inspector" -> return NativeAudioWavResult("WAV inspector\nDuration: ${fmt(duration)} s\nSample rate: ${input.sampleRateHz} Hz\nChannels: ${input.channels.size}\nFrames per channel: ${input.frames}\nSource encoding: ${input.sourceBits}-bit ${if (input.sourceEncoding == 3) "IEEE float" else "PCM"}\nSource size: ${bytes.size} bytes", durationSeconds = duration)
            "duration" -> return NativeAudioWavResult("Duration: ${fmt(duration)} seconds\nSample rate: ${input.sampleRateHz} Hz", durationSeconds = duration)
            "peak" -> return NativeAudioWavResult("Peak amplitude: ${fmt(peak)}\nPeak level: ${fmt(NativeAudioDsp.amplitudeDbfs(peak))} dBFS\nSource channels: ${input.channels.size}", durationSeconds = duration)
            "rms" -> return NativeAudioWavResult("RMS amplitude: ${fmt(rms)}\nRMS level: ${fmt(NativeAudioDsp.amplitudeDbfs(rms))} dBFS\nComputed across all source-channel samples.", durationSeconds = duration)
            "silence" -> return NativeAudioWavResult("Estimated silent duration: ${fmt(NativeAudioDsp.totalSilentDurationSeconds(input.channels, input.sampleRateHz, silenceThresholdDb))} s\nThreshold: $silenceThresholdDb dBFS amplitude\nHeuristic only; quiet content near the threshold may be counted as silent.", durationSeconds = duration)
            "dc-offset" -> return NativeAudioWavResult("Mean sample offset: ${fmt(dc)}\nInterpretation: ${if (abs(dc) < 0.001) "very small" else "noticeable; inspect the source"}", durationSeconds = duration)
            "audio-lufs-meter" -> {
                val mono = NativeAudioDsp.toMono(input.channels)
                val estimate = NativeAudioDsp.approximateLufs(mono)
                return NativeAudioWavResult("RMS-based loudness estimate: ${fmt(estimate)} LUFS-like\nSample peak: ${fmt(NativeAudioDsp.amplitudeDbfs(peak))} dBFS\nNot standards-compliant BS.1770 integrated LUFS: K-weighting and gating are not implemented.", durationSeconds = duration)
            }
        }

        var rate = input.sampleRateHz
        var channels = input.channels.map { it.copyOf() }
        var detail: String
        when (operation) {
            "to-wav" -> detail = "Converted decodable PCM WAV to 16-bit PCM WAV"
            "trim" -> {
                require(startSeconds.isFinite() && startSeconds >= 0.0) { "Trim start must be non-negative." }
                val start = min(duration, startSeconds)
                val end = min(duration, endSeconds ?: duration)
                require(end.isFinite() && end > start) { "Trim end must be greater than trim start and within the file duration." }
                channels = channels.map { NativeAudioDsp.trim(it, rate, start, end) }
                detail = "Trimmed ${fmt(start)}–${fmt(end)} s"
            }
            "reverse" -> { channels = channels.map { NativeAudioDsp.reverse(it) }; detail = "Reversed audio" }
            "normalize" -> {
                val globalPeak = channels.maxOfOrNull { NativeAudioDsp.peakAmplitude(it) } ?: 0.0
                require(globalPeak > 0.0) { "The selected audio is silent." }
                val gain = 0.98 / globalPeak
                channels = channels.map { channel -> FloatArray(channel.size) { (channel[it] * gain).toFloat() } }
                detail = "Peak-normalized to −0.18 dBFS (approximately 98% amplitude)"
            }
            "fade-in", "fade-out" -> { channels = channels.map { NativeAudioDsp.fade(it, rate, fadeDurationMs.coerceAtMost(duration * 1000), operation == "fade-in") }; detail = "Applied ${fmt(fadeDurationMs.coerceAtMost(duration * 1000))} ms ${if (operation == "fade-in") "fade-in" else "fade-out"}" }
            "mono" -> { channels = listOf(NativeAudioDsp.toMono(channels)); detail = "Downmixed to mono" }
            "stereo" -> { channels = if (channels.size == 1) listOf(channels[0].copyOf(), channels[0].copyOf()) else listOf(channels[0].copyOf(), channels[1].copyOf()); detail = if (input.channels.size == 2) "Already stereo; exported a fresh WAV" else "Converted to stereo (first two channels used when source had more than two)" }
            "voice-noise-reducer" -> {
                require(noiseStrength.isFinite() && noiseStrength in 0.0..1.0) { "Noise strength must be between 0 and 1." }
                channels = channels.map { NativeAudioDsp.noiseReduce(it, rate, 80.0, gateThresholdDb, (1.0 - noiseStrength * 0.9).coerceIn(0.05, 1.0)) }
                detail = "Applied native high-pass and soft-gate cleanup; this is not AI noise separation"
            }
            "voice-noise-gate" -> { channels = channels.map { NativeAudioDsp.noiseGate(it, gateThresholdDb, 0.03) }; detail = "Applied soft noise gate at $gateThresholdDb dBFS" }
            "audio-hum-reducer" -> { channels = channels.map { NativeAudioDsp.humReduce(it, rate, humFrequencyHz) }; detail = "Applied ${humFrequencyHz} Hz and second-harmonic notch filters" }
            "audio-trim-silence" -> {
                val bounds = trimSilenceBounds(channels, rate, silenceThresholdDb)
                require(bounds.second > bounds.first) { "No active audio was found above the silence threshold. Adjust it or check whether the file is silent." }
                channels = channels.map { it.copyOfRange(bounds.first, bounds.second) }
                detail = "Removed leading/trailing silence at $silenceThresholdDb dBFS threshold"
            }
            "volume-local" -> {
                require(gainPercent.isFinite() && gainPercent in 0.0..500.0) { "Volume must be between 0 and 500 percent." }
                val gain = gainPercent / 100.0
                channels = channels.map { channel -> FloatArray(channel.size) { (channel[it] * gain).toFloat() } }
                detail = "Applied $gainPercent% gain${if (gainPercent > 100) "; output peaks may clip" else ""}"
            }
            "audio-pitch-shift" -> {
                require(semitones.isFinite() && semitones in -12.0..12.0) { "Pitch shift must be between −12 and +12 semitones." }
                val speed = 2.0.pow(semitones / 12.0)
                channels = channels.map { NativeAudioDsp.resampleAtPlaybackRate(it, speed) }
                detail = "Pitch changed by $semitones semitones with coupled duration change; no pitch-locked time stretching"
            }
            "audio-tempo-change" -> {
                require(playbackRate.isFinite() && playbackRate in 0.5..1.5) { "Tempo must be between 0.5× and 1.5×." }
                channels = channels.map { NativeAudioDsp.resampleAtPlaybackRate(it, playbackRate) }
                detail = "Tempo changed to ${fmt(playbackRate)}× with coupled pitch change; no pitch-locked time stretching"
            }
            "audio-compressor" -> { channels = channels.map { NativeAudioDsp.compress(it, compressorThresholdDb, compressorRatio) }; detail = "Applied a static ${fmt(compressorRatio)}:1 compressor approximation at ${compressorThresholdDb} dBFS; no full attack/release envelope" }
            "audio-eq-simple" -> { channels = channels.map { NativeAudioDsp.threeBandEq(it, rate, eqLowDb, eqMidDb, eqHighDb) }; detail = "Applied three-band EQ (low ${eqLowDb} dB, mid ${eqMidDb} dB, high ${eqHighDb} dB)" }
            "resample-local" -> {
                require(targetSampleRateHz in 8_000..192_000) { "Output sample rate must be 8,000–192,000 Hz." }
                channels = channels.map { resampleToRate(it, rate, targetSampleRateHz) }
                detail = "Resampled from $rate Hz to $targetSampleRateHz Hz; duration and pitch are intended to remain approximately constant"
                rate = targetSampleRateHz
            }
            "channels-local" -> {
                require(targetChannels in 1..2) { "Choose mono (1) or stereo (2) output." }
                channels = if (targetChannels == 1) listOf(NativeAudioDsp.toMono(input.channels)) else if (input.channels.size == 1) listOf(input.channels[0].copyOf(), input.channels[0].copyOf()) else listOf(input.channels[0].copyOf(), input.channels[1].copyOf())
                detail = if (targetChannels == 1) "Converted to mono" else if (input.channels.size == 1) "Converted to stereo by duplicating the mono channel" else "Converted to stereo using the first two source channels"
            }
            else -> throw IllegalArgumentException("This native audio operation is not implemented: $operation. Use the web tool for this feature.")
        }
        val encoded = encodePcm16(rate, channels)
        val outputDuration = channels.firstOrNull()?.size?.toDouble()?.div(rate) ?: 0.0
        return NativeAudioWavResult("$detail\nOutput: 16-bit PCM WAV\nSample rate: $rate Hz\nChannels: ${channels.size}\nDuration: ${fmt(outputDuration)} s\nOutput size: ${encoded.size} bytes\nProcessed on this device; no upload performed.", encoded, outputDuration)
    }

    private data class NativeSpectrum(val centroidHz: Double?, val rolloff85Hz: Double?, val flatness: Double?)

    private fun musicAnalysisReport(input: NativeDecodedWav, fileName: String, fileSizeBytes: Int, peak: Double, rms: Double): String {
        val frames = input.frames
        val rate = input.sampleRateHz
        val duration = input.durationSeconds
        var clippedSamples = 0L
        var totalSamples = 0L
        val windowFrames = max(1, rate / 10)
        val windowLevels = mutableListOf<Double>()
        var silentWindows = 0
        var totalWindows = 0
        for (start in 0 until frames step windowFrames) {
            val stop = min(frames, start + windowFrames)
            var sumSquares = 0.0
            var count = 0
            for (channel in input.channels) for (i in start until stop) {
                val sample = channel[i].toDouble()
                sumSquares += sample * sample
                if (abs(sample) >= 0.999) clippedSamples++
                totalSamples++
                count++
            }
            val windowRms = if (count > 0) sqrt(sumSquares / count) else 0.0
            windowLevels += if (windowRms > 0.0) 20.0 * kotlin.math.log10(windowRms) else -120.0
            if (windowRms < 0.001) silentWindows++
            totalWindows++
        }
        val sortedLevels = windowLevels.sorted()
        fun percentile(q: Double): Double? {
            if (sortedLevels.isEmpty()) return null
            val index = ((sortedLevels.size - 1) * q).roundToInt().coerceIn(0, sortedLevels.lastIndex)
            return sortedLevels[index]
        }
        val p95 = percentile(0.95)
        val p10 = percentile(0.10)
        val spread = if (p95 != null && p10 != null) max(0.0, p95 - p10) else null
        val representative = input.channels.firstOrNull() ?: FloatArray(0)
        val zcr = if (frames > 1) {
            var crossings = 0L
            for (i in 1 until frames) {
                val previous = representative[i - 1]
                val current = representative[i]
                if ((current >= 0f && previous < 0f) || (current < 0f && previous >= 0f)) crossings++
            }
            crossings.toDouble() / (frames - 1)
        } else null
        val tempo = estimateTempoBpm(representative.copyOfRange(0, min(representative.size, rate * 90)), rate)
        val key = estimateMusicalKey(representative.copyOfRange(0, min(representative.size, rate * 30)), rate)
        val spectrum = calculateSpectrum(representative, rate)
        val json = JSONObject()
            .put("schema_version", "env.music-analysis.v1")
            .put("source", JSONObject()
                .put("file_name", fileName.ifBlank { "audio.wav" })
                .put("mime_type", "audio/wav")
                .put("file_size_bytes", fileSizeBytes))
            .put("metadata", JSONObject()
                .put("title", JSONObject.NULL).put("artist", JSONObject.NULL).put("album", JSONObject.NULL)
                .put("album_artist", JSONObject.NULL).put("year", JSONObject.NULL).put("embedded_genre", JSONObject.NULL)
                .put("track_number", JSONObject.NULL).put("disc_number", JSONObject.NULL).put("composer", JSONObject.NULL)
                .put("publisher", JSONObject.NULL).put("tagged_bpm", JSONObject.NULL))
            .put("audio", JSONObject()
                .put("duration_seconds", duration)
                .put("sample_rate_hz", rate)
                .put("channels", input.channels.size)
                .put("peak_dbfs", jsonNumberOrNull(if (peak > 0) 20.0 * kotlin.math.log10(peak) else Double.NEGATIVE_INFINITY))
                .put("rms_dbfs", jsonNumberOrNull(if (rms > 0) 20.0 * kotlin.math.log10(rms) else Double.NEGATIVE_INFINITY))
                .put("estimated_loudness_lufs", jsonNumberOrNull(if (rms > 0) 20.0 * kotlin.math.log10(rms) - 0.691 else Double.NEGATIVE_INFINITY))
                .put("clipped_sample_percent", if (totalSamples > 0) clippedSamples.toDouble() * 100.0 / totalSamples else 0.0)
                .put("silence_percent", if (totalWindows > 0) silentWindows.toDouble() * 100.0 / totalWindows else 0.0)
                .put("windowed_rms_spread_db", jsonNumberOrNull(spread ?: Double.NaN))
                .put("metric_scope_seconds", min(duration, 30.0)))
            .put("rhythm", JSONObject()
                .put("tempo_bpm", tempo?.let { it } ?: JSONObject.NULL)
                .put("method", "RMS-energy novelty autocorrelation with an approximately 10 ms hop; best-effort estimate")
                .put("status", if (tempo != null) "estimated" else "unavailable"))
            .put("tonality", JSONObject()
                .put("key", key ?: JSONObject.NULL)
                .put("method", "4096-point chroma-template correlation; best-effort estimate")
                .put("status", if (key != null) "estimated" else "unavailable"))
            .put("timbre", JSONObject()
                .put("spectral_centroid_hz", jsonNumberOrNull(spectrum.centroidHz ?: Double.NaN))
                .put("spectral_rolloff_85_hz", jsonNumberOrNull(spectrum.rolloff85Hz ?: Double.NaN))
                .put("spectral_flatness", jsonNumberOrNull(spectrum.flatness ?: Double.NaN))
                .put("zero_crossing_rate", jsonNumberOrNull(zcr ?: Double.NaN))
                .put("interpretation", "Signal features do not independently identify genre, instruments, mood or language."))
            .put("classification", JSONObject()
                .put("genre", JSONObject.NULL).put("sub_style", JSONObject.NULL)
                .put("language", JSONArray()).put("mood", JSONArray()).put("instruments", JSONArray())
                .put("vocal_style", JSONObject.NULL).put("genre_candidates", JSONArray())
                .put("status", "requires_model")
                .put("note", "No trained semantic classifier is configured on this native path. Genre, sub-style, language, mood, instruments and vocal style remain unknown rather than guessed."))
        return json.toString(2)
    }

    private fun jsonNumberOrNull(value: Double): Any = if (value.isFinite()) value else JSONObject.NULL

    private fun estimateTempoBpm(samples: FloatArray, sampleRateHz: Int): Int? {
        if (sampleRateHz <= 0 || samples.size < sampleRateHz * 2) return null
        val hop = max(128, (sampleRateHz * 0.01).roundToInt())
        val envelope = ArrayList<Double>()
        var start = 0
        while (start + hop <= samples.size) {
            var sum = 0.0
            for (i in start until start + hop) { val value = samples[i].toDouble(); sum += value * value }
            envelope += sqrt(sum / hop)
            start += hop
        }
        if (envelope.size < 2) return null
        val novelty = DoubleArray(envelope.size) { i -> if (i == 0) 0.0 else max(0.0, envelope[i] - envelope[i - 1]) }
        val minLag = max(1, floor(60.0 / 180.0 / (hop.toDouble() / sampleRateHz)).toInt())
        val maxLag = min(novelty.lastIndex, ceil(60.0 / 55.0 / (hop.toDouble() / sampleRateHz)).toInt())
        if (maxLag <= minLag) return null
        var bestLag = 0
        var bestScore = Double.NEGATIVE_INFINITY
        for (lag in minLag..maxLag) {
            var score = 0.0; var normA = 0.0; var normB = 0.0
            for (i in lag until novelty.size) {
                score += novelty[i] * novelty[i - lag]
                normA += novelty[i] * novelty[i]
                normB += novelty[i - lag] * novelty[i - lag]
            }
            score /= sqrt(max(normA * normB, 1e-12))
            if (score > bestScore) { bestScore = score; bestLag = lag }
        }
        if (bestScore < 0.04 || bestLag <= 0) return null
        var bpm = 60.0 / (bestLag * hop.toDouble() / sampleRateHz)
        while (bpm < 70) bpm *= 2
        while (bpm > 180) bpm /= 2
        return bpm.roundToInt()
    }

    private fun calculateSpectrum(samples: FloatArray, sampleRateHz: Int): NativeSpectrum {
        val size = 2048
        if (samples.size < size || sampleRateHz <= 0) return NativeSpectrum(null, null, null)
        val real = DoubleArray(size)
        val imag = DoubleArray(size)
        val centroids = mutableListOf<Double>()
        val rolloffs = mutableListOf<Double>()
        val flatnesses = mutableListOf<Double>()
        val lastStart = min(samples.size - size, max(0, sampleRateHz * 30 - size))
        var start = 0
        while (start <= lastStart) {
            for (i in 0 until size) {
                real[i] = samples[start + i] * (0.5 - 0.5 * kotlin.math.cos(2.0 * Math.PI * i / (size - 1)))
                imag[i] = 0.0
            }
            fft(real, imag)
            val mags = DoubleArray(size / 2)
            var total = 0.0; var weighted = 0.0; var logTotal = 0.0
            for (bin in 1 until size / 2) {
                val magnitude = kotlin.math.hypot(real[bin], imag[bin])
                mags[bin] = magnitude
                total += magnitude
                weighted += magnitude * (bin.toDouble() * sampleRateHz / size)
                logTotal += kotlin.math.ln(max(magnitude, 1e-12))
            }
            if (total > 1e-10) {
                centroids += weighted / total
                var cumulative = 0.0; var rollBin = size / 2 - 1
                for (bin in 1 until size / 2) {
                    cumulative += mags[bin]
                    if (cumulative >= total * 0.85) { rollBin = bin; break }
                }
                rolloffs += rollBin.toDouble() * sampleRateHz / size
                val arithmetic = total / (size / 2 - 1)
                val geometric = kotlin.math.exp(logTotal / (size / 2 - 1))
                flatnesses += if (arithmetic > 0) geometric / arithmetic else 0.0
            }
            start += 4096
        }
        fun mean(values: List<Double>): Double? = if (values.isEmpty()) null else values.average()
        return NativeSpectrum(mean(centroids), mean(rolloffs), mean(flatnesses))
    }

    private fun estimateMusicalKey(samples: FloatArray, sampleRateHz: Int): String? {
        if (sampleRateHz <= 0 || samples.size < sampleRateHz * 3) return null
        val size = 4096
        val hop = max(size, (sampleRateHz * 0.4).toInt())
        val chroma = DoubleArray(12)
        val real = DoubleArray(size)
        val imag = DoubleArray(size)
        var start = 0
        var frames = 0
        while (start + size <= samples.size && frames < 180) {
            for (i in 0 until size) {
                real[i] = samples[start + i] * (0.5 - 0.5 * kotlin.math.cos(2.0 * Math.PI * i / (size - 1)))
                imag[i] = 0.0
            }
            fft(real, imag)
            for (bin in 2 until size / 2) {
                val frequency = bin.toDouble() * sampleRateHz / size
                if (frequency < 55 || frequency > 2200) continue
                val midi = round(69.0 + 12.0 * kotlin.math.ln(frequency / 440.0) / kotlin.math.ln(2.0)).toInt()
                val magnitude = kotlin.math.hypot(real[bin], imag[bin])
                chroma[((midi % 12) + 12) % 12] += magnitude
            }
            frames++
            start += hop
        }
        if (chroma.sum() <= 0.0) return null
        val mean = chroma.average()
        val normalized = DoubleArray(12) { chroma[it] - mean }
        val names = arrayOf("C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B")
        val major = doubleArrayOf(6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
        val minor = doubleArrayOf(6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)
        var bestScore = Double.NEGATIVE_INFINITY
        var bestLabel: String? = null
        for (tonic in 0 until 12) {
            for ((mode, profile) in listOf("major" to major, "minor" to minor)) {
                val average = profile.average()
                var score = 0.0; var normA = 0.0; var normB = 0.0
                for (i in 0 until 12) {
                    val sample = normalized[(i + tonic) % 12]
                    val weight = profile[i] - average
                    score += sample * weight
                    normA += sample * sample
                    normB += weight * weight
                }
                score /= sqrt(max(normA * normB, 1e-12))
                if (score > bestScore) { bestScore = score; bestLabel = names[tonic] + " " + mode }
            }
        }
        return if (bestScore >= 0.06) bestLabel else null
    }

    private fun fft(real: DoubleArray, imag: DoubleArray) {
        val n = real.size
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while ((j and bit) != 0) { j = j xor bit; bit = bit shr 1 }
            j = j xor bit
            if (i < j) {
                val r = real[i]; real[i] = real[j]; real[j] = r
                val im = imag[i]; imag[i] = imag[j]; imag[j] = im
            }
        }
        var length = 2
        while (length <= n) {
            val angle = -2.0 * Math.PI / length
            val wrStep = kotlin.math.cos(angle); val wiStep = kotlin.math.sin(angle)
            var base = 0
            while (base < n) {
                var wr = 1.0; var wi = 0.0
                for (k in 0 until length / 2) {
                    val even = base + k; val odd = even + length / 2
                    val oddR = real[odd] * wr - imag[odd] * wi
                    val oddI = real[odd] * wi + imag[odd] * wr
                    real[odd] = real[even] - oddR; imag[odd] = imag[even] - oddI
                    real[even] += oddR; imag[even] += oddI
                    val nextWr = wr * wrStep - wi * wiStep
                    wi = wr * wiStep + wi * wrStep; wr = nextWr
                }
                base += length
            }
            length = length shl 1
        }
    }

    private fun trimSilenceBounds(channels: List<FloatArray>, sampleRateHz: Int, thresholdDb: Double): Pair<Int, Int> {
        require(thresholdDb.isFinite() && thresholdDb in -120.0..0.0) { "Silence threshold must be between −120 and 0 dBFS." }
        val frames = channels.firstOrNull()?.size ?: 0
        if (frames == 0) return 0 to 0
        val threshold = 10.0.pow(thresholdDb / 20.0)
        // RMS over 10 ms windows avoids treating every waveform zero-crossing as silence.
        val windowFrames = max(1, (sampleRateHz * 0.01).toInt())
        var first = -1
        var end = -1
        var start = 0
        while (start < frames) {
            val stop = min(frames, start + windowFrames)
            var sumSquares = 0.0
            var sampleCount = 0
            for (channel in channels) for (index in start until stop) {
                val value = channel[index].toDouble()
                sumSquares += value * value
                sampleCount++
            }
            val windowRms = if (sampleCount == 0) 0.0 else sqrt(sumSquares / sampleCount)
            if (windowRms >= threshold) {
                if (first < 0) first = start
                end = stop
            }
            start = stop
        }
        if (first < 0 || end <= first) return 0 to 0
        return first.coerceAtLeast(0) to min(frames, end)
    }

    private fun resampleToRate(samples: FloatArray, sourceRate: Int, targetRate: Int): FloatArray {
        if (samples.isEmpty()) return FloatArray(0)
        if (sourceRate == targetRate) return samples.copyOf()
        val outputFrames = max(1, ceil(samples.size.toDouble() * targetRate / sourceRate).toInt())
        return FloatArray(outputFrames) { index ->
            val position = index.toDouble() * sourceRate / targetRate
            val left = floor(position).toInt().coerceIn(0, samples.lastIndex)
            val right = min(samples.lastIndex, left + 1)
            val fraction = position - left
            (samples[left] * (1.0 - fraction) + samples[right] * fraction).toFloat()
        }
    }

    fun encodePcm16(sampleRateHz: Int, channels: List<FloatArray>): ByteArray {
        require(sampleRateHz in 8_000..192_000) { "Sample rate must be 8,000–192,000 Hz." }
        require(channels.isNotEmpty() && channels.size <= 8) { "Output must have 1–8 channels." }
        val frames = channels.first().size
        require(channels.all { it.size == frames }) { "All output channels must have equal frame counts." }
        val dataSize = frames.toLong() * channels.size * 2L
        require(dataSize + 44 <= MAX_OUTPUT_BYTES && dataSize + 36 <= 0xffff_ffffL) { "The output WAV is too large for safe local export." }
        val output = ByteBuffer.allocate((44 + dataSize).toInt()).order(ByteOrder.LITTLE_ENDIAN)
        putAscii(output, "RIFF"); output.putInt((36 + dataSize).toInt()); putAscii(output, "WAVE")
        putAscii(output, "fmt "); output.putInt(16); output.putShort(1.toShort()); output.putShort(channels.size.toShort())
        output.putInt(sampleRateHz); output.putInt(sampleRateHz * channels.size * 2); output.putShort((channels.size * 2).toShort()); output.putShort(16.toShort())
        putAscii(output, "data"); output.putInt(dataSize.toInt())
        for (frame in 0 until frames) for (channel in channels) {
            val sample = channel[frame].takeIf { it.isFinite() }?.coerceIn(-1f, 1f) ?: 0f
            val value = if (sample < 0f) Math.round(sample * 32768f) else Math.round(sample * 32767f)
            output.putShort(value.coerceIn(-32768, 32767).toShort())
        }
        return output.array()
    }

    private fun fmt(value: Double): String = if (value.isFinite()) String.format(java.util.Locale.US, "%.3f", value) else "unavailable"
    private fun ascii(bytes: ByteArray, offset: Int, length: Int) = String(bytes, offset, length, Charsets.US_ASCII)
    private fun uint16(bytes: ByteArray, offset: Int): Int = (bytes[offset].toInt() and 0xff) or ((bytes[offset + 1].toInt() and 0xff) shl 8)
    private fun short16(bytes: ByteArray, offset: Int): Short = ((bytes[offset].toInt() and 0xff) or (bytes[offset + 1].toInt() shl 8)).toShort()
    private fun int32(bytes: ByteArray, offset: Int): Int = (bytes[offset].toInt() and 0xff) or ((bytes[offset + 1].toInt() and 0xff) shl 8) or ((bytes[offset + 2].toInt() and 0xff) shl 16) or (bytes[offset + 3].toInt() shl 24)
    private fun uint32(bytes: ByteArray, offset: Int): Long = int32(bytes, offset).toLong() and 0xffff_ffffL
    private fun putAscii(buffer: ByteBuffer, value: String) { buffer.put(value.toByteArray(Charsets.US_ASCII)) }
}
