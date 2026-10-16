package com.chastech.env.engine

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt
import kotlin.math.sin

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
    ): NativeAudioWavResult {
        val input = decode(bytes)
        val duration = input.durationSeconds
        val peak = input.channels.maxOfOrNull { NativeAudioDsp.peakAmplitude(it) } ?: 0.0
        val rms = if (input.frames == 0) 0.0 else sqrt(input.channels.sumOf { channel -> channel.sumOf { it.toDouble() * it } } / (input.frames.toDouble() * input.channels.size))
        val dc = if (input.frames == 0) 0.0 else input.channels.sumOf { channel -> channel.sumOf { it.toDouble() } } / (input.frames.toDouble() * input.channels.size)
        when (operation) {
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
