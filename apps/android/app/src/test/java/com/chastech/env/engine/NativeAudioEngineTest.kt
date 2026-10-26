package com.chastech.env.engine

import com.chastech.env.data.EngineInfo
import com.chastech.env.data.ToolRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject

class NativeAudioEngineTest {
    @Test
    fun nativeRecorderRouteIsExplicitAndOffline() {
        val recorder = ToolRecord(
            id = "audio-recorder",
            name = "Audio Recorder",
            slug = "audio-recorder",
            description = "Record local microphone audio and export WAV.",
            category = "audio",
            keywords = listOf("microphone", "record", "wav"),
            tags = listOf("audio-studio"),
            icon = "audio-lines",
            popularity = 80,
            featured = false,
            clientSide = true,
            requiresBackend = false,
            requiresAuth = false,
            status = "active",
            related = emptyList(),
            engine = EngineInfo(type = "audio", id = "audio-recorder")
        )
        assertEquals("record-mic", NativeAudioEngine.operationFor(recorder))
        assertTrue(NativeAudioEngine.supports(recorder))
    }

    @Test
    fun musicAnalyzerHasAnExplicitNativeWavRoute() {
        val analyzer = ToolRecord(
            id = "audio-analyze-studio",
            name = "Music Analyzer",
            slug = "audio-analyze-studio",
            description = "Analyze WAV audio measurements locally.",
            category = "audio",
            keywords = listOf("music", "analysis", "wav"),
            tags = listOf("audio-studio"),
            icon = "activity",
            popularity = 80,
            featured = false,
            clientSide = true,
            requiresBackend = false,
            requiresAuth = false,
            status = "active",
            related = emptyList(),
            engine = EngineInfo(type = "audio", id = "audio-analyze-studio")
        )
        assertEquals("file:analyze", NativeAudioEngine.operationFor(analyzer))
        assertTrue(NativeAudioEngine.supports(analyzer))
    }

    @Test
    fun musicAnalyzerEmitsV2RmsProxyWithoutClaimingStandardLufs() {
        val sampleRate = 8_000
        val tone = FloatArray(sampleRate * 4) { index ->
            (0.5 * kotlin.math.sin(2.0 * Math.PI * 440.0 * index / sampleRate)).toFloat()
        }
        val wav = NativeAudioWavProcessor.encodePcm16(sampleRate, listOf(tone))
        val result = NativeAudioWavProcessor.process(wav, operation = "analyze", fileName = "tone.wav")
        val root = JSONObject(result.report)
        assertEquals("env.music-analysis.v2", root.getString("schema_version"))
        val audio = root.getJSONObject("audio")
        assertEquals(4.0, audio.getDouble("duration_seconds"), 0.001)
        assertTrue(audio.has("rms_loudness_proxy_db"))
        assertTrue(!audio.has("estimated_loudness_lufs"))
        val rms = audio.getDouble("rms_dbfs")
        val proxy = audio.getDouble("rms_loudness_proxy_db")
        assertTrue(kotlin.math.abs(proxy - (rms - 0.691)) < 0.02)
    }

    @Test
    fun sixtySecondsAt128KbpsUsesDecimalMegabytes() {
        val result = NativeAudioEngine.calculate("bitrate", "podcast", 60.0, 128.0, 44_100.0, 2, 16, 120.0, 4)
        assertTrue(result, "0.96 MB" in result)
        assertTrue(result, "960000" in result)
    }

    @Test
    fun targetSizeCanBeConvertedBackToRequiredBitrate() {
        val result = NativeAudioEngine.calculate("bitrate-from-size", "podcast", 60.0, 128.0, 44_100.0, 2, 16, 120.0, 4, 0.96)
        assertTrue(result, "128.00 kbps" in result)
    }

    @Test
    fun pcmSizeUsesSampleRateChannelsAndBitDepth() {
        val result = NativeAudioEngine.calculate("pcm-size", "podcast", 60.0, 128.0, 44_100.0, 2, 16, 120.0, 4)
        assertTrue(result, "10.58 MB" in result)
    }
    @Test
    fun nativePcmMeterAndEditContractsMatchGoldenValues() {
        val samples = floatArrayOf(-0.5f, 0.5f)
        assertTrue(kotlin.math.abs(NativeAudioDsp.peakAmplitude(samples) - 0.5) < 1e-6)
        assertTrue(kotlin.math.abs(NativeAudioDsp.rmsAmplitude(samples) - 0.5) < 1e-6)
        assertTrue(kotlin.math.abs(NativeAudioDsp.dcOffset(samples)) < 1e-6)
        assertTrue(NativeAudioDsp.reverse(floatArrayOf(1f, 2f, 3f)).contentEquals(floatArrayOf(3f, 2f, 1f)))
        assertTrue(NativeAudioDsp.peakAmplitude(NativeAudioDsp.normalizePeak(floatArrayOf(0.25f, -0.5f))) <= 0.98001)
    }

    @Test
    fun nativeSoftGateAndMonoContractsAreDeterministic() {
        val gated = NativeAudioDsp.noiseGate(floatArrayOf(0.001f, 0.5f))
        assertTrue(kotlin.math.abs(gated[0]) < 0.001f)
        assertTrue(gated[1] == 0.5f)
        val mono = NativeAudioDsp.toMono(listOf(floatArrayOf(0.4f, -0.2f), floatArrayOf(0.2f, 0.6f)))
        assertTrue(kotlin.math.abs(mono[0] - 0.3f) < 1e-6)
        assertTrue(kotlin.math.abs(mono[1] - 0.2f) < 1e-6)
        assertTrue(kotlin.math.abs(NativeAudioDsp.totalSilentDurationSeconds(listOf(floatArrayOf(0f, 0.5f)), 10) - 0.1) < 1e-6)
    }


    @Test
    fun nativeTrimFadeAndResampleValidateRangesAndPreserveContracts() {
        val input = floatArrayOf(0f, 0.25f, 0.5f, 0.75f, 1f)
        assertTrue(NativeAudioDsp.trim(input, 10, 0.1, 0.4).contentEquals(floatArrayOf(0.25f, 0.5f, 0.75f)))
        val faded = NativeAudioDsp.fade(floatArrayOf(1f, 1f, 1f), 1000, 2.0, true)
        assertTrue(faded.first() == 0f && faded.last() == 1f)
        assertTrue(NativeAudioDsp.resampleAtPlaybackRate(floatArrayOf(0f, 1f, 0f, -1f), 2.0).size == 2)
        try {
            NativeAudioDsp.trim(input, 10, 0.4, 0.1)
            throw AssertionError("Invalid trim range should fail")
        } catch (_: IllegalArgumentException) { }
    }

    @Test
    fun nativeFiltersAndCompressorAreDeterministicAndReportApproximateLoudness() {
        val rate = 8000
        val hum = FloatArray(rate) { i -> kotlin.math.sin(2 * Math.PI * 50 * i / rate).toFloat() }
        val filtered = NativeAudioDsp.humReduce(hum, rate, 50)
        val tailOriginal = NativeAudioDsp.rmsAmplitude(hum.copyOfRange(2000, hum.size))
        val tailFiltered = NativeAudioDsp.rmsAmplitude(filtered.copyOfRange(2000, filtered.size))
        assertTrue(tailFiltered < tailOriginal * 0.2)
        val compressed = NativeAudioDsp.compress(floatArrayOf(0.05f, 0.8f), -18.0, 4.0)
        assertTrue(kotlin.math.abs(compressed[0]) <= 0.05f)
        assertTrue(kotlin.math.abs(compressed[1]) < 0.8f)
        assertTrue(NativeAudioDsp.threeBandEq(floatArrayOf(0.1f, -0.1f), rate).contentEquals(floatArrayOf(0.1f, -0.1f)))
        assertTrue(NativeAudioDsp.approximateLufs(floatArrayOf(1f, -1f)) < 0.0)
    }
    @Test
    fun wavProcessorRoundTripsInspectsTrimsAndRejectsInvalidInput() {
        val tone = FloatArray(8_000) { index -> if (index < 800 || index > 7_200) 0f else (0.4 * kotlin.math.sin(2 * Math.PI * 440 * index / 8_000)).toFloat() }
        val wav = NativeAudioWavProcessor.encodePcm16(8_000, listOf(tone))
        val decoded = NativeAudioWavProcessor.decode(wav)
        assertTrue(decoded.sampleRateHz == 8_000 && decoded.channels.size == 1 && decoded.frames == 8_000)
        assertTrue(NativeAudioWavProcessor.process(wav, "inspector").report.contains("Duration: 1.000 s"))
        assertTrue(NativeAudioWavProcessor.process(wav, "trim", startSeconds = 0.25, endSeconds = 0.75).durationSeconds == 0.5)
        val stereo = NativeAudioWavProcessor.process(NativeAudioWavProcessor.encodePcm16(8_000, listOf(tone, tone)), "channels-local", targetChannels = 1)
        assertTrue(NativeAudioWavProcessor.decode(stereo.outputWav!!).channels.size == 1)
        assertTrue((NativeAudioWavProcessor.process(wav, "audio-trim-silence", silenceThresholdDb = -40.0).durationSeconds ?: 1.0) < 1.0)
        try { NativeAudioWavProcessor.decode(byteArrayOf(1, 2, 3)); throw AssertionError("Invalid WAV must be rejected") }
        catch (_: IllegalArgumentException) { }
    }

    @Test
    fun wavJoinerPreservesOrderDurationAndRejectsIncompatibleSources() {
        val first = NativeAudioWavProcessor.encodePcm16(8_000, listOf(floatArrayOf(0.1f, 0.2f)))
        val second = NativeAudioWavProcessor.encodePcm16(8_000, listOf(floatArrayOf(0.3f, 0.4f)))
        val joined = NativeAudioWavProcessor.join(listOf(first, second))
        val decoded = NativeAudioWavProcessor.decode(joined.outputWav!!)
        assertTrue(decoded.frames == 4 && decoded.sampleRateHz == 8_000)
        assertTrue(kotlin.math.abs(decoded.channels[0][0] - 0.1f) < 0.001f)
        assertTrue(kotlin.math.abs(decoded.channels[0][3] - 0.4f) < 0.001f)
        val incompatible = NativeAudioWavProcessor.encodePcm16(16_000, listOf(floatArrayOf(0.2f)))
        try { NativeAudioWavProcessor.join(listOf(first, incompatible)); throw AssertionError("Different sample rates must be rejected") }
        catch (_: IllegalArgumentException) { }
    }

    @Test
    fun toneAndMetronomeGeneratorsRenderOfflineWavWithExpectedDuration() {
        val tone = NativeAudioWavProcessor.generateTone(8_000, 1.0, 440.0, "sine", -12.0)
        assertTrue(tone.outputWav != null && tone.durationSeconds == 1.0)
        assertTrue(NativeAudioWavProcessor.decode(tone.outputWav!!).frames == 8_000)
        val metro = NativeAudioWavProcessor.generateMetronome(8_000, 120.0, 4, 1, 4)
        assertTrue(kotlin.math.abs((metro.durationSeconds ?: 0.0) - 2.0) < 0.001)
        assertTrue(metro.report.contains("Time signature: 4/4"))
        try { NativeAudioWavProcessor.generateTone(8_000, 1.0, 4_000.0); throw AssertionError("Nyquist frequency should be rejected") }
        catch (_: IllegalArgumentException) { }
    }


    @Test
    fun songMetadataAnalyzerRoutesToItsDedicatedNativeScreen() {
        val analyzer = ToolRecord(
            id = "song-metadata-analyzer",
            name = "Song Metadata Analyzer",
            slug = "song-metadata-analyzer",
            description = "Inspect song metadata and audio signals locally.",
            category = "audio",
            keywords = listOf("song", "metadata", "music", "analysis"),
            tags = listOf("song", "audio"),
            icon = "AudioLines",
            popularity = 99,
            featured = true,
            clientSide = true,
            requiresBackend = false,
            requiresAuth = false,
            status = "active",
            related = listOf("audio-file-inspector"),
            engine = EngineInfo(type = "audio", id = "song-metadata-analyzer")
        )
        assertEquals("song-metadata-analyzer", NativeAudioEngine.operationFor(analyzer))
        assertTrue(NativeAudioEngine.supports(analyzer))
    }

}
