@file:OptIn(androidx.media3.common.util.UnstableApi::class)

package com.chastech.env

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

/**
 * App-private PCM processor used while rendering the final microphone track.
 * The local EQ and dynamics controls are applied before the instrumental is mixed,
 * so they do not intentionally change the backing track. This is an offline render
 * chain, not real-time mic monitoring or a substitute for a true look-ahead limiter.
 */
class NativeVocalPresetAudioProcessor(
    private val presetId: String,
    private val eqBandsDb: List<Float> = List(10) { 0f },
    private val compressorThresholdDb: Float = -20f,
    private val compressorRatioOverride: Float? = null,
    private val outputGainDb: Float = 0f,
    private val voiceGain: Float = 1f,
    private val effectAmount: Float = 1f,
    private val ampCharacter: String = "clean",
    private val ampDrive: Float = 0f,
    private val ampBassDb: Float = 0f,
    private val ampMidDb: Float = 0f,
    private val ampTrebleDb: Float = 0f,
    private val highPassHzOverride: Float? = null,
    private val lowPassHzOverride: Float? = null,
) : AudioProcessor {
    private data class Params(
        val highPassHz: Float,
        val lowPassHz: Float = 20_000f,
        val compressionRatio: Float = 2.5f,
        val outputGain: Float = 1f,
        val delayMs: Float = 0f,
        val wet: Float = 0f,
        val feedback: Float = 0.08f,
        val chorusRateHz: Float = 0f,
        val chorusDepthMs: Float = 0f,
        val distortion: Float = 0f,
    )

    private data class BiquadCoefficients(
        val b0: Float, val b1: Float, val b2: Float,
        val a1: Float, val a2: Float,
    )

    private data class BiquadState(
        var x1: Float = 0f, var x2: Float = 0f,
        var y1: Float = 0f, var y2: Float = 0f,
    )

    private val params = when (presetId) {
        "warm", "acoustic" -> Params(75f, compressionRatio = 2.4f, outputGain = 1.02f, delayMs = 65f, wet = 0.08f, feedback = 0.08f)
        "pop" -> Params(90f, compressionRatio = 3.2f, outputGain = 1.04f, delayMs = 65f, wet = 0.14f, feedback = 0.12f)
        "rap" -> Params(100f, compressionRatio = 4.5f, outputGain = 1.02f, delayMs = 92f, wet = 0.07f, feedback = 0.08f)
        "dream-hall", "arena" -> Params(80f, compressionRatio = 2.6f, outputGain = 1f, delayMs = 185f, wet = 0.24f, feedback = 0.20f)
        "slapback" -> Params(85f, compressionRatio = 2.8f, delayMs = 105f, wet = 0.20f, feedback = 0.06f)
        "lofi" -> Params(180f, lowPassHz = 5_200f, compressionRatio = 4f, distortion = 0.12f)
        "telephone" -> Params(340f, lowPassHz = 3_400f, compressionRatio = 3.8f, outputGain = 1.02f)
        "wide-chorus" -> Params(85f, compressionRatio = 2.4f, delayMs = 25f, wet = 0.18f, chorusRateHz = 0.28f, chorusDepthMs = 5f)
        "studio-room" -> Params(75f, compressionRatio = 2.4f, delayMs = 45f, wet = 0.10f, feedback = 0.04f)
        "ambient" -> Params(80f, compressionRatio = 2.4f, delayMs = 180f, wet = 0.20f, feedback = 0.18f)
        "megaphone" -> Params(500f, lowPassHz = 2_600f, compressionRatio = 4.5f, distortion = 0.16f)
        "vocal-double" -> Params(85f, compressionRatio = 2.5f, delayMs = 22f, wet = 0.20f, feedback = 0.04f, chorusRateHz = 0.12f, chorusDepthMs = 3f)
        "podcast" -> Params(95f, compressionRatio = 3.2f, outputGain = 1.02f)
        "rnb" -> Params(80f, compressionRatio = 2.8f, outputGain = 1.01f, delayMs = 160f, wet = 0.14f, feedback = 0.08f)
        else -> Params(70f)
    }

    private val eqFrequenciesHz = floatArrayOf(60f, 120f, 250f, 500f, 1_000f, 2_000f, 4_000f, 8_000f, 12_000f, 16_000f)
    private var eqCoefficients: Array<BiquadCoefficients> = emptyArray()
    private var eqStates: Array<Array<BiquadState>> = emptyArray()
    private var ampToneCoefficients: Array<BiquadCoefficients> = emptyArray()
    private var ampToneStates: Array<Array<BiquadState>> = emptyArray()
    private var audioFormat = AudioProcessor.AudioFormat.NOT_SET
    private var outputBuffer: ByteBuffer = AudioProcessor.EMPTY_BUFFER
    private var inputEnded = false
    private var previousInput = FloatArray(2)
    private var previousHighPass = FloatArray(2)
    private var lowPassState = FloatArray(2)
    private var delayBuffer: Array<FloatArray> = emptyArray()
    private var frameCursor = 0L
    private var delayCapacity = 1
    private var highPassAlpha = 0f
    private var lowPassAlpha = 1f
    private var compressionThreshold = 0.1f
    private var effectiveRatio = 2.5f
    private var effectiveOutputGain = 1f
    private var effectiveWet = 0f

    override fun configure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT && inputAudioFormat.encoding != C.ENCODING_PCM_FLOAT) {
            throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        }
        audioFormat = inputAudioFormat
        val channels = inputAudioFormat.channelCount.coerceIn(1, 8)
        previousInput = FloatArray(channels)
        previousHighPass = FloatArray(channels)
        lowPassState = FloatArray(channels)
        delayCapacity = (inputAudioFormat.sampleRate * 0.24f).toInt().coerceAtLeast(2)
        delayBuffer = Array(channels) { FloatArray(delayCapacity) }
        eqStates = Array(channels) { Array(eqFrequenciesHz.size) { BiquadState() } }
        val sr = inputAudioFormat.sampleRate.coerceAtLeast(8_000).toFloat()
        val resolvedHighPassHz = (highPassHzOverride ?: params.highPassHz).coerceIn(20f, 1_000f)
        val resolvedLowPassHz = (lowPassHzOverride ?: params.lowPassHz).coerceIn(1_000f, 20_000f)
        highPassAlpha = exp((-2f * PI.toFloat() * resolvedHighPassHz / sr).coerceAtLeast(-20f))
        lowPassAlpha = if (resolvedLowPassHz >= 19_999f || resolvedLowPassHz >= sr * 0.48f) 1f else 1f - exp(-2f * PI.toFloat() * resolvedLowPassHz / sr)
        eqCoefficients = eqFrequenciesHz.mapIndexed { index, frequency ->
            peakingCoefficients(frequency.coerceAtMost(sr * 0.45f), eqBandsDb.getOrElse(index) { 0f }.coerceIn(-9f, 9f), sr)
        }.toTypedArray()
        ampToneCoefficients = arrayOf(
            shelfCoefficients(140f.coerceAtMost(sr * 0.45f), ampBassDb.coerceIn(-6f, 6f), sr, highShelf = false),
            peakingCoefficients(850f.coerceAtMost(sr * 0.45f), ampMidDb.coerceIn(-6f, 6f), sr, q = 0.85f),
            shelfCoefficients(4_200f.coerceAtMost(sr * 0.45f), ampTrebleDb.coerceIn(-6f, 6f), sr, highShelf = true),
        )
        ampToneStates = Array(channels) { Array(ampToneCoefficients.size) { BiquadState() } }
        compressionThreshold = Math.pow(10.0, compressorThresholdDb.coerceIn(-36f, -8f).toDouble() / 20.0).toFloat()
        effectiveRatio = (compressorRatioOverride ?: params.compressionRatio).coerceIn(1f, 8f)
        effectiveOutputGain = params.outputGain * Math.pow(10.0, outputGainDb.coerceIn(-12f, 6f).toDouble() / 20.0).toFloat()
        effectiveWet = (params.wet * effectAmount.coerceIn(0f, 1.5f)).coerceIn(0f, 0.65f)
        flush()
        return inputAudioFormat
    }

    private fun peakingCoefficients(frequencyHz: Float, gainDb: Float, sampleRate: Float, q: Float = 1.05f): BiquadCoefficients {
        val a = Math.pow(10.0, gainDb.toDouble() / 40.0).toFloat()
        val omega = (2f * PI.toFloat() * frequencyHz / sampleRate)
        val cosine = cos(omega)
        val alpha = sin(omega) / (2f * q.coerceIn(0.5f, 2f))
        val a0 = 1f + alpha / a
        return BiquadCoefficients(
            b0 = (1f + alpha * a) / a0,
            b1 = (-2f * cosine) / a0,
            b2 = (1f - alpha * a) / a0,
            a1 = (-2f * cosine) / a0,
            a2 = (1f - alpha / a) / a0,
        )
    }

    /** RBJ-style shelving biquad so Bass and Treble behave as broad tone controls, not narrow peaks. */
    private fun shelfCoefficients(frequencyHz: Float, gainDb: Float, sampleRate: Float, highShelf: Boolean): BiquadCoefficients {
        val amplitude = Math.pow(10.0, gainDb.toDouble() / 40.0).toFloat()
        val omega = 2f * PI.toFloat() * frequencyHz / sampleRate
        val cosine = cos(omega)
        val alpha = sin(omega) * 0.5f * sqrt(2f)
        val beta = 2f * sqrt(amplitude) * alpha
        val a0: Float
        val b0: Float
        val b1: Float
        val b2: Float
        val a1: Float
        val a2: Float
        if (highShelf) {
            b0 = amplitude * ((amplitude + 1f) + (amplitude - 1f) * cosine + beta)
            b1 = -2f * amplitude * ((amplitude - 1f) + (amplitude + 1f) * cosine)
            b2 = amplitude * ((amplitude + 1f) + (amplitude - 1f) * cosine - beta)
            a0 = (amplitude + 1f) - (amplitude - 1f) * cosine + beta
            val rawA1 = 2f * ((amplitude - 1f) - (amplitude + 1f) * cosine)
            val rawA2 = (amplitude + 1f) - (amplitude - 1f) * cosine - beta
            return BiquadCoefficients(b0 / a0, b1 / a0, b2 / a0, rawA1 / a0, rawA2 / a0)
        }
        b0 = amplitude * ((amplitude + 1f) - (amplitude - 1f) * cosine + beta)
        b1 = 2f * amplitude * ((amplitude - 1f) - (amplitude + 1f) * cosine)
        b2 = amplitude * ((amplitude + 1f) - (amplitude - 1f) * cosine - beta)
        a0 = (amplitude + 1f) + (amplitude - 1f) * cosine + beta
        val rawA1 = -2f * ((amplitude - 1f) + (amplitude + 1f) * cosine)
        val rawA2 = (amplitude + 1f) + (amplitude - 1f) * cosine - beta
        return BiquadCoefficients(b0 / a0, b1 / a0, b2 / a0, rawA1 / a0, rawA2 / a0)
    }

    override fun isActive(): Boolean = audioFormat != AudioProcessor.AudioFormat.NOT_SET

    override fun queueInput(inputBuffer: ByteBuffer) {
        if (!inputBuffer.hasRemaining()) return
        val remaining = inputBuffer.remaining()
        val sampleBytes = if (audioFormat.encoding == C.ENCODING_PCM_FLOAT) 4 else 2
        val safeBytes = remaining - (remaining % sampleBytes)
        val channels = audioFormat.channelCount.coerceAtLeast(1)
        val output = ByteBuffer.allocateDirect(safeBytes).order(ByteOrder.LITTLE_ENDIAN)
        val source = inputBuffer.slice().order(ByteOrder.LITTLE_ENDIAN)
        val sampleCount = safeBytes / sampleBytes
        val firstFrame = frameCursor
        for (sampleIndex in 0 until sampleCount) {
            val channel = sampleIndex % channels
            val input = if (sampleBytes == 4) source.getFloat() else source.getShort() / 32768f
            val frame = firstFrame + (sampleIndex / channels)
            val processed = processSample(input, channel, frame)
            if (sampleBytes == 4) output.putFloat(processed) else output.putShort((processed * 32767f).toInt().coerceIn(-32768, 32767).toShort())
        }
        frameCursor += (sampleCount / channels)
        output.flip()
        outputBuffer = output
        inputBuffer.position(inputBuffer.limit())
    }

    private fun processSample(input: Float, channel: Int, frame: Long): Float {
        val gainedInput = input * voiceGain.coerceIn(0f, 1.5f)
        val hp = highPassAlpha * (previousHighPass[channel] + gainedInput - previousInput[channel])
        previousInput[channel] = gainedInput
        previousHighPass[channel] = hp
        lowPassState[channel] += lowPassAlpha * (hp - lowPassState[channel])
        var value = lowPassState[channel]
        for (band in eqCoefficients.indices) {
            val coefficient = eqCoefficients[band]
            val state = eqStates[channel][band]
            val filtered = coefficient.b0 * value + coefficient.b1 * state.x1 + coefficient.b2 * state.x2 - coefficient.a1 * state.y1 - coefficient.a2 * state.y2
            state.x2 = state.x1; state.x1 = value; state.y2 = state.y1; state.y1 = filtered
            value = filtered
        }
        for (band in ampToneCoefficients.indices) {
            val coefficient = ampToneCoefficients[band]
            val state = ampToneStates[channel][band]
            val filtered = coefficient.b0 * value + coefficient.b1 * state.x1 + coefficient.b2 * state.x2 - coefficient.a1 * state.y1 - coefficient.a2 * state.y2
            state.x2 = state.x1; state.x1 = value; state.y2 = state.y1; state.y1 = filtered
            value = filtered
        }
        value *= effectiveOutputGain
        val magnitude = abs(value)
        if (magnitude > compressionThreshold) {
            value = kotlin.math.sign(value) * (compressionThreshold + (magnitude - compressionThreshold) / effectiveRatio)
        }
        if (params.distortion > 0f) {
            val drive = 1f + params.distortion * 5f
            value = (tanh(value * drive) / tanh(drive)) * (1f - params.distortion * 0.25f)
        }
        val normalizedAmpDrive = ampDrive.coerceIn(0f, 100f) / 100f
        if (ampCharacter != "clean" && normalizedAmpDrive > 0f) {
            val drive = 1f + normalizedAmpDrive * 11f
            value = when (ampCharacter) {
                "tube" -> tanh(value * drive) / tanh(drive)
                "crunch" -> atan(value * drive) / atan(drive)
                "fuzz" -> (value * drive).coerceIn(-1f, 1f)
                else -> value
            }
        }
        if (effectiveWet > 0f && params.delayMs > 0f) {
            val modulation = if (params.chorusRateHz > 0f) sin((frame.toDouble() / audioFormat.sampleRate) * 2.0 * PI * params.chorusRateHz).toFloat() * params.chorusDepthMs else 0f
            val delayFrames = ((params.delayMs + modulation).coerceAtLeast(1f) * audioFormat.sampleRate / 1000f).toInt().coerceIn(1, delayCapacity - 1)
            val readIndex = ((frame - delayFrames).mod(delayCapacity.toLong())).toInt()
            val delayed = delayBuffer[channel][readIndex]
            delayBuffer[channel][(frame % delayCapacity).toInt()] = (value + delayed * params.feedback).coerceIn(-1.5f, 1.5f)
            value = value * (1f - effectiveWet * 0.35f) + delayed * effectiveWet
        } else {
            delayBuffer[channel][(frame % delayCapacity).toInt()] = value
        }
        return value.coerceIn(-0.98f, 0.98f)
    }

    override fun getOutput(): ByteBuffer {
        val output = outputBuffer
        outputBuffer = AudioProcessor.EMPTY_BUFFER
        return output
    }

    override fun queueEndOfStream() { inputEnded = true }

    override fun isEnded(): Boolean = inputEnded && !outputBuffer.hasRemaining()

    override fun flush() {
        outputBuffer = AudioProcessor.EMPTY_BUFFER
        inputEnded = false
        frameCursor = 0L
        previousInput.fill(0f); previousHighPass.fill(0f); lowPassState.fill(0f)
        eqStates.forEach { channelStates -> channelStates.forEach { it.x1 = 0f; it.x2 = 0f; it.y1 = 0f; it.y2 = 0f } }
        ampToneStates.forEach { channelStates -> channelStates.forEach { it.x1 = 0f; it.x2 = 0f; it.y1 = 0f; it.y2 = 0f } }
        delayBuffer.forEach { it.fill(0f) }
    }

    override fun reset() {
        flush()
        audioFormat = AudioProcessor.AudioFormat.NOT_SET
        previousInput = FloatArray(2); previousHighPass = FloatArray(2); lowPassState = FloatArray(2)
        eqCoefficients = emptyArray(); eqStates = emptyArray(); ampToneCoefficients = emptyArray(); ampToneStates = emptyArray(); delayBuffer = emptyArray()
    }
}
