package com.chastech.env.engine

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Builds a standards-compliant RIFF/WAVE header for mono signed 16-bit little-endian PCM. */
object NativePcmWavEncoder {
    fun encodeMonoPcm16Wav(pcm: ByteArray, sampleRateHz: Int = 44_100, maxDurationSeconds: Int = 300): ByteArray {
        require(sampleRateHz in 8_000..192_000) { "Sample rate must be between 8,000 and 192,000 Hz." }
        require(maxDurationSeconds in 1..300) { "Recording duration limit must be between 1 and 300 seconds." }
        require(pcm.isNotEmpty() && pcm.size % 2 == 0) { "Recording must contain complete 16-bit PCM samples." }
        val maxBytes = sampleRateHz.toLong() * 2L * maxDurationSeconds
        require(pcm.size.toLong() <= maxBytes) { "Recording exceeds its configured duration limit." }
        require(pcm.size.toLong() + 36L <= Int.MAX_VALUE) { "Recording is too large to export as a single WAV file." }

        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        fun ascii(value: String) { value.forEach { header.put(it.code.toByte()) } }
        ascii("RIFF")
        header.putInt(36 + pcm.size)
        ascii("WAVE")
        ascii("fmt ")
        header.putInt(16) // PCM format chunk size
        header.putShort(1) // WAVE_FORMAT_PCM
        header.putShort(1) // mono
        header.putInt(sampleRateHz)
        header.putInt(sampleRateHz * 2) // byte rate
        header.putShort(2) // block align
        header.putShort(16) // bits/sample
        ascii("data")
        header.putInt(pcm.size)
        return header.array() + pcm
    }
}
