package com.chastech.env.engine

import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sqrt
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.PI
import kotlin.math.pow

/** Pure PCM primitives for native audio tools. These helpers are independent of UI and decoding frameworks. */
object NativeAudioDsp {
    fun peakAmplitude(samples: FloatArray): Double = samples.maxOfOrNull { abs(it.toDouble()) } ?: 0.0

    fun rmsAmplitude(samples: FloatArray): Double {
        if (samples.isEmpty()) return 0.0
        var squares = 0.0
        for (sample in samples) squares += sample.toDouble() * sample.toDouble()
        return sqrt(squares / samples.size)
    }

    fun dcOffset(samples: FloatArray): Double {
        if (samples.isEmpty()) return 0.0
        var sum = 0.0
        for (sample in samples) sum += sample.toDouble()
        return sum / samples.size
    }

    fun amplitudeDbfs(amplitude: Double): Double =
        if (amplitude <= 0.0 || !amplitude.isFinite()) Double.NEGATIVE_INFINITY else 20.0 * log10(amplitude)

    /** Simple soft gate for a live preview contract; it is not a neural noise suppressor. */
    fun noiseGate(samples: FloatArray, thresholdDb: Double = -42.0, attenuation: Double = 0.0): FloatArray {
        require(thresholdDb.isFinite() && thresholdDb in -100.0..0.0) { "Gate threshold must be between -100 and 0 dBFS." }
        require(attenuation.isFinite() && attenuation in 0.0..1.0) { "Gate attenuation must be between 0 and 1." }
        val threshold = 10.0.pow(thresholdDb / 20.0)
        return FloatArray(samples.size) { index ->
            val sample = samples[index].toDouble()
            val gain = if (abs(sample) >= threshold) 1.0 else attenuation + (1.0 - attenuation) * (abs(sample) / threshold).coerceIn(0.0, 1.0)
            (sample * gain).toFloat()
        }
    }

    fun reverse(samples: FloatArray): FloatArray = samples.reversedArray()

    /** Peak normalisation leaves headroom so integer PCM export is less likely to clip. */
    fun normalizePeak(samples: FloatArray, targetPeak: Double = 0.98): FloatArray {
        require(targetPeak.isFinite() && targetPeak in 0.01..1.0) { "Target peak must be in 0.01–1.0." }
        val peak = peakAmplitude(samples)
        if (peak == 0.0) return samples.copyOf()
        val gain = targetPeak / peak
        return FloatArray(samples.size) { (samples[it] * gain).toFloat() }
    }

    fun toMono(channels: List<FloatArray>): FloatArray {
        require(channels.isNotEmpty()) { "At least one channel is required." }
        val frames = channels.first().size
        require(channels.all { it.size == frames }) { "All channels must have the same frame count." }
        return FloatArray(frames) { frame -> (channels.sumOf { it[frame].toDouble() } / channels.size).toFloat() }
    }

    fun totalSilentDurationSeconds(channels: List<FloatArray>, sampleRateHz: Int, thresholdDb: Double = -60.0): Double {
        require(sampleRateHz > 0) { "Sample rate must be positive." }
        require(channels.isNotEmpty()) { "At least one channel is required." }
        val frames = channels.first().size
        require(channels.all { it.size == frames }) { "All channels must have the same frame count." }
        val threshold = 10.0.pow(thresholdDb / 20.0)
        var silentFrames = 0
        for (frame in 0 until frames) if (channels.all { abs(it[frame].toDouble()) < threshold }) silentFrames++
        return silentFrames.toDouble() / sampleRateHz
    }

    fun trim(samples: FloatArray, sampleRateHz: Int, startSeconds: Double, endSeconds: Double): FloatArray {
        require(sampleRateHz > 0) { "Sample rate must be positive." }
        require(startSeconds.isFinite() && endSeconds.isFinite() && startSeconds >= 0 && endSeconds > startSeconds) { "Trim range must have a non-negative start and a larger end." }
        val start = (startSeconds * sampleRateHz).toLong()
        val end = (endSeconds * sampleRateHz).toLong()
        require(start < samples.size && end <= samples.size) { "Trim range exceeds the decoded audio duration." }
        return samples.copyOfRange(start.toInt(), end.toInt())
    }

    fun fade(samples: FloatArray, sampleRateHz: Int, durationMs: Double, fadeIn: Boolean): FloatArray {
        require(sampleRateHz > 0 && durationMs.isFinite() && durationMs > 0) { "Sample rate and fade duration must be positive." }
        val fadeFrames = (durationMs * sampleRateHz / 1000.0).toInt().coerceIn(1, samples.size)
        val out = samples.copyOf()
        for (i in 0 until fadeFrames) {
            val factor = if (fadeFrames <= 1) 1.0 else i.toDouble() / (fadeFrames - 1)
            val index = if (fadeIn) i else samples.size - fadeFrames + i
            out[index] = (samples[index] * if (fadeIn) factor else 1.0 - factor).toFloat()
        }
        return out
    }

    /** One-pole high-pass filter, suitable as a basic rumble cleanup primitive. */
    fun highPass(samples: FloatArray, sampleRateHz: Int, cutoffHz: Double = 80.0): FloatArray {
        require(sampleRateHz > 0 && cutoffHz.isFinite() && cutoffHz in 1.0..(sampleRateHz / 2.0)) { "High-pass cutoff must be within the Nyquist range." }
        val rc = 1.0 / (2.0 * PI * cutoffHz)
        val alpha = rc / (rc + 1.0 / sampleRateHz)
        val out = FloatArray(samples.size)
        var previousInput = 0.0
        var previousOutput = 0.0
        for (i in samples.indices) {
            val input = samples[i].toDouble()
            val value = alpha * (previousOutput + input - previousInput)
            out[i] = value.toFloat()
            previousInput = input
            previousOutput = value
        }
        return out
    }

    /** Practical voice cleanup chain; not a neural denoiser and not a substitute for source separation. */
    fun noiseReduce(samples: FloatArray, sampleRateHz: Int, cutoffHz: Double = 80.0, thresholdDb: Double = -48.0, attenuation: Double = 0.12): FloatArray {
        require(thresholdDb.isFinite() && thresholdDb in -100.0..0.0 && attenuation.isFinite() && attenuation in 0.0..1.0) { "Noise-reduction controls are out of range." }
        return noiseGate(highPass(samples, sampleRateHz, cutoffHz), thresholdDb, attenuation)
    }

    /** Cascade 50/60 Hz and second-harmonic notch filters for mains hum. */
    fun humReduce(samples: FloatArray, sampleRateHz: Int, mainsFrequency: Int = 50): FloatArray {
        require(sampleRateHz > 0 && mainsFrequency in setOf(50, 60)) { "Choose a 50 or 60 Hz mains frequency and positive sample rate." }
        var current = samples.copyOf()
        for (frequency in listOf(mainsFrequency, mainsFrequency * 2).filter { it < sampleRateHz / 2 }) {
            val w0 = 2.0 * PI * frequency / sampleRateHz
            val q = 12.0
            val alpha = sin(w0) / (2.0 * q)
            val a0 = 1.0 + alpha
            val b0 = 1.0 / a0; val b1 = -2.0 * cos(w0) / a0; val b2 = b0
            val a1 = -2.0 * cos(w0) / a0; val a2 = (1.0 - alpha) / a0
            var x1 = 0.0; var x2 = 0.0; var y1 = 0.0; var y2 = 0.0
            val filtered = FloatArray(current.size)
            for (i in current.indices) {
                val x = current[i].toDouble()
                val y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
                filtered[i] = y.toFloat()
                x2 = x1; x1 = x; y2 = y1; y1 = y
            }
            current = filtered
        }
        return current
    }

    /** Three-band equalizer uses one-pole low/mid splits; useful as a light local tone control. */
    fun threeBandEq(samples: FloatArray, sampleRateHz: Int, lowGainDb: Double = 0.0, midGainDb: Double = 0.0, highGainDb: Double = 0.0): FloatArray {
        require(sampleRateHz > 0 && listOf(lowGainDb, midGainDb, highGainDb).all { it.isFinite() && it in -24.0..24.0 }) { "EQ gains must be between -24 and +24 dB." }
        fun coeff(cutoff: Double) = (1.0 - kotlin.math.exp(-2.0 * PI * cutoff / sampleRateHz)).coerceIn(0.0, 1.0)
        val lowA = coeff(minOf(200.0, sampleRateHz * 0.2)); val midA = coeff(minOf(2500.0, sampleRateHz * 0.4))
        val lowG = 10.0.pow(lowGainDb / 20.0); val midG = 10.0.pow(midGainDb / 20.0); val highG = 10.0.pow(highGainDb / 20.0)
        var lowState = 0.0; var midState = 0.0
        return FloatArray(samples.size) { i ->
            val x = samples[i].toDouble()
            lowState += lowA * (x - lowState)
            midState += midA * (x - midState)
            val low = lowState; val mid = midState - lowState; val high = x - midState
            (low * lowG + mid * midG + high * highG).toFloat()
        }
    }

    /** Static-ratio compressor approximation; not a full attack/release dynamics processor. */
    fun compress(samples: FloatArray, thresholdDb: Double = -18.0, ratio: Double = 4.0, makeupDb: Double = 0.0): FloatArray {
        require(thresholdDb.isFinite() && thresholdDb in -60.0..0.0 && ratio.isFinite() && ratio in 1.0..20.0 && makeupDb.isFinite() && makeupDb in -24.0..24.0) { "Compressor settings are out of range." }
        val threshold = 10.0.pow(thresholdDb / 20.0)
        val makeup = 10.0.pow(makeupDb / 20.0)
        return FloatArray(samples.size) { i ->
            val sample = samples[i].toDouble(); val amplitude = abs(sample)
            val compressed = if (amplitude <= threshold) amplitude else threshold + (amplitude - threshold) / ratio
            (sample.signSafe(compressed * makeup)).toFloat()
        }
    }

    /** Playback-rate resampling: pitch and duration change together. Not pitch-locked time stretching. */
    fun resampleAtPlaybackRate(samples: FloatArray, playbackRate: Double): FloatArray {
        require(playbackRate.isFinite() && playbackRate in 0.25..3.0) { "Playback rate must be between 0.25× and 3×." }
        if (samples.isEmpty()) return samples.copyOf()
        val outputSize = maxOf(1, (samples.size / playbackRate).toInt())
        return FloatArray(outputSize) { i ->
            val position = i * playbackRate
            val left = position.toInt().coerceIn(0, samples.lastIndex)
            val right = minOf(samples.lastIndex, left + 1)
            val fraction = position - left
            (samples[left] * (1.0 - fraction) + samples[right] * fraction).toFloat()
        }
    }

    /** RMS-derived loudness proxy only; not BS.1770/EBU R128 integrated LUFS. */
    fun approximateLufs(samples: FloatArray): Double {
        val amplitude = rmsAmplitude(samples)
        return if (amplitude <= 0.0) Double.NEGATIVE_INFINITY else -0.691 + 20.0 * log10(amplitude)
    }

    private fun Double.signSafe(magnitude: Double): Double = if (this < 0.0) -magnitude else magnitude
}
