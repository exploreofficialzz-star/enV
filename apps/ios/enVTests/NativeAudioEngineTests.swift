import XCTest
@testable import enV

final class NativeAudioEngineTests: XCTestCase {
    func testNativeMicrophoneRecorderIsRoutedToItsRealNativeScreen() {
        let recorder = Tool(
            id: "audio-recorder",
            name: "Audio Recorder",
            slug: "audio-recorder",
            description: "Record local microphone audio and export WAV.",
            category: "audio",
            subcategory: "studio",
            keywords: ["microphone", "record", "wav"],
            tags: ["audio-studio"],
            icon: "audio-lines",
            popularity: 80,
            featured: false,
            clientSide: true,
            requiresBackend: false,
            requiresAuth: false,
            status: "active",
            disclaimer: nil,
            related: [],
            engine: ToolEngine(type: "audio", id: nil, op: "audio-recorder")
        )
        XCTAssertEqual(NativeAudioEngine.operation(for: recorder), "record-mic")
        XCTAssertTrue(NativeAudioEngine.supports(recorder))
    }

    func testSixtySecondsAt128KbpsUsesDecimalMegabytes() throws {
        let result = try NativeAudioEngine.calculate(
            operation: "bitrate", platform: "podcast", duration: 60, bitrate: 128,
            sampleRate: 44_100, channels: 2, bits: 16, bpm: 120, bars: 4
        )
        XCTAssertTrue(result.contains("0.96 MB"), result)
        XCTAssertTrue(result.contains("960000"), result)
    }

    func testTargetSizeConvertsBackToRequiredBitrate() throws {
        let result = try NativeAudioEngine.calculate(
            operation: "bitrate-from-size", platform: "podcast", duration: 60, bitrate: 128,
            sampleRate: 44_100, channels: 2, bits: 16, bpm: 120, bars: 4,
            targetSizeMegabytes: 0.96
        )
        XCTAssertTrue(result.contains("128.00 kbps"), result)
    }

    func testPcmSizeUsesSampleRateChannelsAndBitDepth() throws {
        let result = try NativeAudioEngine.calculate(
            operation: "pcm-size", platform: "podcast", duration: 60, bitrate: 128,
            sampleRate: 44_100, channels: 2, bits: 16, bpm: 120, bars: 4
        )
        XCTAssertTrue(result.contains("10.58 MB"), result)
    }
    func testNativePcmMeterAndEditContractsMatchGoldenValues() {
        let samples: [Float] = [-0.5, 0.5]
        XCTAssertEqual(NativeAudioDsp.peakAmplitude(samples), 0.5, accuracy: 1e-6)
        XCTAssertEqual(NativeAudioDsp.rmsAmplitude(samples), 0.5, accuracy: 1e-6)
        XCTAssertEqual(NativeAudioDsp.dcOffset(samples), 0, accuracy: 1e-6)
        XCTAssertEqual(NativeAudioDsp.reverse([1, 2, 3]), [3, 2, 1])
        XCTAssertLessThanOrEqual(NativeAudioDsp.peakAmplitude(NativeAudioDsp.normalizePeak([0.25, -0.5])), 0.98001)
    }

    func testNativeSoftGateMonoAndSilenceContractsAreDeterministic() throws {
        let gated = NativeAudioDsp.noiseGate([0.001, 0.5])
        XCTAssertLessThan(abs(gated[0]), 0.001)
        XCTAssertEqual(gated[1], 0.5, accuracy: 1e-6)
        let mono = try NativeAudioDsp.toMono([[0.4, -0.2], [0.2, 0.6]])
        XCTAssertEqual(mono[0], 0.3, accuracy: 1e-6)
        XCTAssertEqual(mono[1], 0.2, accuracy: 1e-6)
        XCTAssertEqual(try NativeAudioDsp.totalSilentDurationSeconds(channels: [[0, 0.5]], sampleRateHz: 10), 0.1, accuracy: 1e-6)
    }

    func testNativeTrimFadeAndResampleValidateRangesAndPreserveContracts() throws {
        let input: [Float] = [0, 0.25, 0.5, 0.75, 1]
        XCTAssertEqual(try NativeAudioDsp.trim(input, sampleRateHz: 10, startSeconds: 0.1, endSeconds: 0.4), [0.25, 0.5, 0.75])
        let faded = try NativeAudioDsp.fade([1, 1, 1], sampleRateHz: 1000, durationMs: 2, fadeIn: true)
        XCTAssertEqual(faded.first, 0)
        XCTAssertEqual(faded.last, 1)
        XCTAssertEqual(try NativeAudioDsp.resampleAtPlaybackRate([0, 1, 0, -1], playbackRate: 2).count, 2)
        XCTAssertThrowsError(try NativeAudioDsp.trim(input, sampleRateHz: 10, startSeconds: 0.4, endSeconds: 0.1))
    }

    func testNativeFiltersCompressorAndLoudnessApproximation() throws {
        let rate = 8_000
        let hum = (0..<rate).map { Float(sin(2 * Double.pi * 50 * Double($0) / Double(rate))) }
        let filtered = try NativeAudioDsp.humReduce(hum, sampleRateHz: rate, mainsFrequency: 50)
        let originalTail = NativeAudioDsp.rmsAmplitude(Array(hum[2_000...]))
        let filteredTail = NativeAudioDsp.rmsAmplitude(Array(filtered[2_000...]))
        XCTAssertLessThan(filteredTail, originalTail * 0.2)
        let compressed = try NativeAudioDsp.compress([0.05, 0.8], thresholdDB: -18, ratio: 4)
        XCTAssertLessThan(abs(compressed[1]), 0.8)
        XCTAssertEqual(try NativeAudioDsp.threeBandEQ([0.1, -0.1], sampleRateHz: rate), [0.1, -0.1])
        XCTAssertLessThan(NativeAudioDsp.approximateLUFS([1, -1]), 0)
    }

    func testNativeAudioSessionStoreRoundTripsPrivateSource() throws {
        NativeAudioSessionStore.clear()
        defer { NativeAudioSessionStore.clear() }
        let source = Data(repeating: 0, count: 44)
        try NativeAudioSessionStore.save(data: source, name: "round-trip.wav")
        XCTAssertTrue(NativeAudioSessionStore.hasAvailable)
        let restored = try XCTUnwrap(NativeAudioSessionStore.load())
        XCTAssertEqual(restored.name, "round-trip.wav")
        XCTAssertEqual(restored.data, source)
        NativeAudioSessionStore.clear()
        XCTAssertFalse(NativeAudioSessionStore.hasAvailable)
    }

    func testNativeWavProcessorRoundTripsInspectsTrimsAndRejectsInvalidInput() throws {
        let tone: [Float] = (0..<8_000).map { index in
            if index < 800 || index > 7_200 { return 0 }
            return Float(0.4 * sin(2 * Double.pi * 440 * Double(index) / 8_000))
        }
        let wav = try NativeAudioWavProcessor.encodePCM16(sampleRateHz: 8_000, channels: [tone])
        let decoded = try NativeAudioWavProcessor.decode(wav)
        XCTAssertEqual(decoded.sampleRateHz, 8_000)
        XCTAssertEqual(decoded.frames, 8_000)
        XCTAssertEqual(decoded.channels.count, 1)
        let inspected = try NativeAudioWavProcessor.process(wav, operation: "inspector")
        XCTAssertTrue(inspected.report.contains("Duration: 1.000 s"))
        let trimmed = try NativeAudioWavProcessor.process(wav, operation: "trim", startSeconds: 0.25, endSeconds: 0.75)
        XCTAssertEqual(trimmed.durationSeconds ?? 0, 0.5, accuracy: 1e-6)
        let stereo = try NativeAudioWavProcessor.encodePCM16(sampleRateHz: 8_000, channels: [tone, tone])
        let mono = try NativeAudioWavProcessor.process(stereo, operation: "channels-local", targetChannels: 1)
        XCTAssertEqual(try NativeAudioWavProcessor.decode(mono.outputWav ?? Data()).channels.count, 1)
        let silenceTrimmed = try NativeAudioWavProcessor.process(wav, operation: "audio-trim-silence", silenceThresholdDB: -40)
        XCTAssertLessThan(silenceTrimmed.durationSeconds ?? 1, 1)
        XCTAssertThrowsError(try NativeAudioWavProcessor.decode(Data([1, 2, 3])))
    }

    func testNativeWavJoinerPreservesOrderAndRejectsIncompatibleSources() throws {
        let first = try NativeAudioWavProcessor.encodePCM16(sampleRateHz: 8_000, channels: [[0.1, 0.2]])
        let second = try NativeAudioWavProcessor.encodePCM16(sampleRateHz: 8_000, channels: [[0.3, 0.4]])
        let joined = try NativeAudioWavProcessor.join([first, second])
        let decoded = try NativeAudioWavProcessor.decode(joined.outputWav ?? Data())
        XCTAssertEqual(decoded.frames, 4)
        XCTAssertEqual(decoded.sampleRateHz, 8_000)
        XCTAssertEqual(decoded.channels[0][0], 0.1, accuracy: 0.001)
        XCTAssertEqual(decoded.channels[0][3], 0.4, accuracy: 0.001)
        let incompatible = try NativeAudioWavProcessor.encodePCM16(sampleRateHz: 16_000, channels: [[0.2]])
        XCTAssertThrowsError(try NativeAudioWavProcessor.join([first, incompatible]))
    }

    func testNativeToneAndMetronomeGeneratorsRenderOfflineWav() throws {
        let tone = try NativeAudioWavProcessor.generateTone(sampleRateHz: 8_000, durationSeconds: 1, frequencyHz: 440, waveform: "sine", levelDBFS: -12)
        XCTAssertEqual(tone.durationSeconds ?? 0, 1, accuracy: 1e-6)
        XCTAssertEqual(try NativeAudioWavProcessor.decode(tone.outputWav ?? Data()).frames, 8_000)
        let metronome = try NativeAudioWavProcessor.generateMetronome(sampleRateHz: 8_000, bpm: 120, beatsPerBar: 4, bars: 1, denominator: 4)
        XCTAssertEqual(metronome.durationSeconds ?? 0, 2, accuracy: 0.001)
        XCTAssertTrue(metronome.report.contains("Time signature: 4/4"))
        XCTAssertThrowsError(try NativeAudioWavProcessor.generateTone(sampleRateHz: 8_000, durationSeconds: 1, frequencyHz: 4_000))
    }

}
