package com.chastech.env.engine

import com.chastech.env.data.ToolRecord
import java.util.Locale

/** Small audio calculations/reference guide implemented in Kotlin for fully offline native use. */
object NativeAudioEngine {
    private val platformPrefixes = listOf("podcast-", "discord-", "spotify-", "instagram-", "apple-music-", "youtube-", "tiktok-", "twitch-")

    private val nativeWavOperations = mapOf(
        "audio-analyze-studio" to "analyze", "audio-file-inspector" to "inspector", "audio-duration-tool" to "duration", "audio-trimmer" to "trim", "audio-to-wav" to "to-wav",
        "audio-peak-meter" to "peak", "audio-rms-meter" to "rms", "audio-silence-detector" to "silence", "audio-dc-offset-checker" to "dc-offset",
        "audio-to-mono" to "mono", "audio-to-stereo" to "stereo", "audio-reverser" to "reverse", "audio-normalizer" to "normalize",
        "voice-noise-reducer" to "voice-noise-reducer", "voice-noise-gate" to "voice-noise-gate", "audio-hum-reducer" to "audio-hum-reducer",
        "audio-trim-silence" to "audio-trim-silence", "audio-fade-in" to "fade-in", "audio-fade-out" to "fade-out", "audio-lufs-meter" to "audio-lufs-meter",
        "audio-compressor" to "audio-compressor", "audio-eq-simple" to "audio-eq-simple", "audio-pitch-shift" to "audio-pitch-shift", "audio-tempo-change" to "audio-tempo-change",
        "audio-volume-control" to "volume-local", "audio-sample-rate-converter" to "resample-local", "audio-channel-converter" to "channels-local", "audio-joiner-local" to "joiner",
        "audio-tone-generator" to "generate-tone", "audio-metronome" to "generate-metronome"
    )

    fun operationFor(tool: ToolRecord): String? {
        if (tool.id == "music-live-video-studio") return "live-video-studio"
        if (tool.id in setOf("music-studio", "music-practice", "music-stem-mixer", "music-karaoke", "music-duet")) return "music-studio"
        if (tool.id == "audio-recorder") return "record-mic"
        nativeWavOperations[tool.id]?.let { return "file:$it" }
        val op = tool.engine.extras["op"].orEmpty().substringAfter(':', "")
        if (tool.id in setOf("audio-calc-studio", "audio-platform-guide-studio")) return if (tool.id == "audio-calc-studio") "calc" else "guide"
        if (tool.id == "audio-bitrate-calculator" || tool.engine.extras["formula"] == "audio-bitrate") return "calc"
        if (tool.id == "audio-file-size-calculator" || tool.engine.extras["formula"] == "audio-size") return "calc"
        if (tool.id == "audio-duration-tool") return "duration"
        if (tool.id.startsWith("audio-") && tool.id in setOf("audio-bitrate-calculator", "audio-file-size-calculator", "audio-duration-tool")) return "calc"
        if (platformPrefixes.any(tool.id::startsWith)) {
            val derived = op.ifBlank {
                when {
                    tool.id.contains("bitrate") -> "bitrate"
                    tool.id.contains("file-size") -> "file-size"
                    tool.id.contains("bpm") -> "bpm"
                    tool.id.contains("loudness") -> "loudness"
                    tool.id.contains("sample-rate") -> "sample-rate"
                    tool.id.contains("format-guide") || tool.id.contains("export-preset") -> "format-guide"
                    else -> ""
                }
            }
            if (derived in setOf("bitrate", "file-size", "bpm", "loudness", "sample-rate", "format-guide")) return derived
        }
        return null
    }

    fun supports(tool: ToolRecord): Boolean =
        (tool.engine.type == "audio" || tool.id in setOf("audio-bitrate-calculator", "audio-file-size-calculator")) && operationFor(tool) != null

    fun calculate(
        operation: String,
        platform: String,
        durationSeconds: Double,
        bitrateKbps: Double,
        sampleRateHz: Double,
        channels: Int,
        bits: Int,
        bpm: Double,
        bars: Int,
        targetSizeMegabytes: Double = 0.96,
    ): String {
        require(durationSeconds.isFinite() && durationSeconds > 0.0) { "Duration must be a positive number of seconds." }
        require(bitrateKbps.isFinite() && bitrateKbps > 0.0) { "Bitrate must be a positive number of kbps." }
        require(sampleRateHz.isFinite() && sampleRateHz > 0.0) { "Sample rate must be positive." }
        require(channels in 1..32 && bits in 8..64) { "Channels must be 1–32 and bit depth must be 8–64." }
        val bytes = durationSeconds * bitrateKbps * 1000 / 8
        val pcmBytes = durationSeconds * sampleRateHz * channels * bits / 8
        return when (operation) {
            "duration" -> "Duration: ${String.format(Locale.US, "%.3f", durationSeconds)} seconds\nBitrate-based estimated size: ${decimalMegabytes(bytes)}"
            "bitrate" -> "Estimated compressed file size: ${decimalMegabytes(bytes)}\nBytes (decimal): ${String.format(Locale.US, "%.0f", bytes)}\nFormula: duration × bitrate × 1,000 ÷ 8; container overhead excluded."
            "bitrate-from-size" -> {
                val targetBytes = targetSizeMegabytes * 1_000_000
                require(targetSizeMegabytes.isFinite() && targetSizeMegabytes > 0.0) { "Target size must be a positive decimal MB value." }
                val inferredKbps = targetBytes * 8 / durationSeconds / 1000
                "Required average bitrate: ${String.format(Locale.US, "%.2f", inferredKbps)} kbps\nTarget size: ${decimalMegabytes(targetBytes)}\nFormula: target bytes × 8 ÷ duration ÷ 1,000; container overhead excluded."
            }
            "pcm-size" -> "Estimated uncompressed PCM size: ${decimalMegabytes(pcmBytes)}\nFormula: duration × sample rate × channels × bit depth ÷ 8."
            "file-size" -> "Estimated compressed size at selected bitrate: ${decimalMegabytes(bytes)}\nBytes (decimal): ${String.format(Locale.US, "%.0f", bytes)}\nFormula: duration × bitrate × 1,000 ÷ 8; container overhead excluded."
            "bpm" -> {
                require(bpm in 1.0..1000.0 && bars in 1..10000) { "BPM must be positive and bars must be 1–10,000." }
                "Beat duration: ${String.format(Locale.US, "%.3f", 60 / bpm)} seconds\n$bars bars in 4/4: ${String.format(Locale.US, "%.3f", 60 / bpm * 4 * bars)} seconds"
            }
            "loudness" -> "${platformLabel(platform)} loudness guidance\n${when (platform.lowercase()) { "podcast" -> "−16 LUFS stereo / −19 LUFS mono are common podcast targets."; "spotify" -> "−14 LUFS is a playback-normalization reference, not a required mastering target."; else -> "No universal loudness target applies to every upload, program, or distributor." }}\nGuidance only — not an acceptance guarantee."
            "sample-rate" -> "Sample rate: ${String.format(Locale.US, "%.0f", sampleRateHz)} Hz\nSamples for selected duration: ${String.format(Locale.US, "%.0f", durationSeconds * sampleRateHz)}\nPreserve the source/master resolution unless a delivery workflow requires conversion."
            "format-guide", "guide" -> "${platformLabel(platform)} audio guidance\n${when (platform.lowercase()) { "podcast" -> "44.1 or 48 kHz; MP3/AAC for distribution; WAV for masters; 128–192 kbps stereo is common."; "discord" -> "Call/channel settings control voice bitrate; 44.1 or 48 kHz are common source rates; Opus is used in voice paths."; "spotify" -> "Keep a lossless master (WAV/FLAC where requested); do not force all masters to −14 LUFS."; "instagram" -> "Keep a high-quality source; AAC is common in video delivery paths and the service may transcode."; "apple music" -> "Follow the distributor's requested lossless delivery format and native master resolution."; else -> "Keep a high-quality source and confirm the destination's current published delivery specifications." }}\nGuidance only — not an acceptance guarantee."
            else -> error("This audio mode does not have a native offline implementation yet.")
        }
    }

    private fun platformLabel(value: String): String = value.trim().replace('-', ' ').ifBlank { "Audio" }.replaceFirstChar { it.uppercase() }
    private fun decimalMegabytes(value: Double): String = "${String.format(Locale.US, "%.2f", value / 1_000_000)} MB"
    private fun prettyBytes(value: Double): String {
        var n = value
        val units = listOf("B", "KB", "MB", "GB", "TB")
        var i = 0
        while (n >= 1024 && i < units.lastIndex) { n /= 1024; i++ }
        return "${String.format(Locale.US, if (i == 0) "%.0f" else "%.2f", n)} ${units[i]}"
    }
}
