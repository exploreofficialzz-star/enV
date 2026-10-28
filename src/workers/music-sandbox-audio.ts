import { analyzeMusicAudio } from "../lib/engines/music-analysis";

self.onmessage = (event: MessageEvent<{ samples: Float32Array; sampleRate: number }>) => {
  try {
    const { samples, sampleRate } = event.data;
    const result = analyzeMusicAudio({
      channels: [samples], sampleRate, fileName: "sample", fileSizeBytes: samples.byteLength,
    });
    self.postMessage({
      status: "complete",
      analyzedSeconds: Number((samples.length / sampleRate).toFixed(1)),
      tempo: result.rhythm.tempo_bpm,
      key: result.tonality.key,
      peakDbfs: result.audio.peak_dbfs,
      rmsDbfs: result.audio.rms_dbfs,
      clippedPercent: result.audio.clipped_sample_percent,
      silencePercent: result.audio.silence_percent,
      spectralCentroidHz: result.timbre.spectral_centroid_hz,
    });
  } catch (error) {
    self.postMessage({ status: "unavailable", reason: error instanceof Error ? error.message : "Analysis failed." });
  }
};
