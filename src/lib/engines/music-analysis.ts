import type { MusicMetadata } from "../media/music-metadata.ts";
import { amplitudeDbfs, estimateBpm, estimateKey } from "./audio-studio.ts";

export type MusicAnalysisInput = {
  channels: readonly Float32Array[];
  sampleRate: number;
  fileName: string;
  fileSizeBytes: number;
  mimeType?: string;
  metadata?: MusicMetadata;
};

export type MusicAnalysisResult = {
  schema_version: "env.music-analysis.v1";
  source: { file_name: string; mime_type: string; file_size_bytes: number };
  metadata: {
    title: string | null;
    artist: string | null;
    album: string | null;
    album_artist: string | null;
    year: string | null;
    embedded_genre: string | null;
    track_number: string | null;
    disc_number: string | null;
    composer: string | null;
    publisher: string | null;
    tagged_bpm: number | null;
  };
  audio: {
    duration_seconds: number;
    sample_rate_hz: number;
    channels: number;
    peak_dbfs: number | null;
    rms_dbfs: number | null;
    estimated_loudness_lufs: number | null;
    clipped_sample_percent: number;
    silence_percent: number;
    windowed_rms_spread_db: number | null;
    metric_scope_seconds: number;
  };
  rhythm: { tempo_bpm: number | null; method: string; status: "estimated" | "unavailable" };
  tonality: { key: string | null; method: string; status: "estimated" | "unavailable" };
  timbre: {
    spectral_centroid_hz: number | null;
    spectral_rolloff_85_hz: number | null;
    spectral_flatness: number | null;
    zero_crossing_rate: number | null;
    interpretation: string;
  };
  classification: {
    genre: string | null;
    sub_style: string | null;
    language: string[];
    mood: string[];
    instruments: string[];
    vocal_style: string | null;
    genre_candidates: Array<{ label: string; score: number | null }>;
    status: "requires_model" | "model_completed";
    note: string;
  };
};

function safeDb(amplitude: number): number | null {
  const value = amplitudeDbfs(amplitude);
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[index] ?? null;
}

function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const r = real[i]; real[i] = real[j]; real[j] = r;
      const im = imag[i]; imag[i] = imag[j]; imag[j] = im;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const stepR = Math.cos(angle), stepI = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let wr = 1, wi = 0;
      for (let j = 0; j < size / 2; j++) {
        const even = start + j, odd = even + size / 2;
        const or = real[odd] * wr - imag[odd] * wi;
        const oi = real[odd] * wi + imag[odd] * wr;
        real[odd] = real[even] - or; imag[odd] = imag[even] - oi;
        real[even] += or; imag[even] += oi;
        const nextWr = wr * stepR - wi * stepI;
        wi = wr * stepI + wi * stepR; wr = nextWr;
      }
    }
  }
}

function spectralFeatures(samples: Float32Array, sampleRate: number): {
  centroid: number | null; rolloff85: number | null; flatness: number | null;
} {
  const frameSize = 2048;
  if (samples.length < frameSize || sampleRate <= 0) return { centroid: null, rolloff85: null, flatness: null };
  const hop = 4096;
  const real = new Float64Array(frameSize), imag = new Float64Array(frameSize);
  const centroids: number[] = [], rolloffs: number[] = [], flatnesses: number[] = [];
  const lastStart = Math.min(samples.length - frameSize, Math.max(0, sampleRate * 30 - frameSize));
  for (let start = 0; start <= lastStart; start += hop) {
    for (let i = 0; i < frameSize; i++) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
      real[i] = (samples[start + i] ?? 0) * window;
      imag[i] = 0;
    }
    fft(real, imag);
    let magnitudeSum = 0, weightedFrequency = 0, logMagnitudeSum = 0;
    const magnitudes = new Float64Array(frameSize / 2);
    for (let bin = 1; bin < frameSize / 2; bin++) {
      const magnitude = Math.hypot(real[bin] ?? 0, imag[bin] ?? 0);
      magnitudes[bin] = magnitude;
      magnitudeSum += magnitude;
      weightedFrequency += magnitude * (bin * sampleRate / frameSize);
      logMagnitudeSum += Math.log(Math.max(magnitude, 1e-12));
    }
    if (magnitudeSum <= 1e-10) continue;
    centroids.push(weightedFrequency / magnitudeSum);
    let accumulated = 0, rolloffBin = frameSize / 2 - 1;
    for (let bin = 1; bin < frameSize / 2; bin++) {
      accumulated += magnitudes[bin] ?? 0;
      if (accumulated >= magnitudeSum * 0.85) { rolloffBin = bin; break; }
    }
    rolloffs.push(rolloffBin * sampleRate / frameSize);
    const bins = frameSize / 2 - 1;
    const arithmeticMean = magnitudeSum / bins;
    const geometricMean = Math.exp(logMagnitudeSum / bins);
    flatnesses.push(arithmeticMean > 0 ? geometricMean / arithmeticMean : 0);
  }
  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const centroid = mean(centroids), rolloff85 = mean(rolloffs), flatness = mean(flatnesses);
  return {
    centroid: centroid === null ? null : Number(centroid.toFixed(1)),
    rolloff85: rolloff85 === null ? null : Number(rolloff85.toFixed(1)),
    flatness: flatness === null ? null : Number(flatness.toFixed(5)),
  };
}

/**
 * Derives reproducible signal measurements on decoded PCM. Semantic labels such as
 * genre, language, instrument identity and mood are deliberately left unclassified
 * until a configured, trained model returns them.
 */
export function analyzeMusicAudio(input: MusicAnalysisInput): MusicAnalysisResult {
  const channels = input.channels;
  if (!Number.isFinite(input.sampleRate) || input.sampleRate < 1000) throw new Error("Sample rate must be at least 1,000 Hz.");
  if (!channels.length || !channels[0]?.length) throw new Error("The selected audio file contains no decoded samples.");
  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes < 0) throw new Error("File size must be a non-negative number.");
  const frames = channels[0].length;
  if (channels.some((channel) => channel.length !== frames)) throw new Error("Decoded audio channels must have the same frame count.");
  const durationSeconds = frames / input.sampleRate;

  let peak = 0, sumSquares = 0, totalSamples = 0, clippedSamples = 0, zeroCrossings = 0;
  let previousSample: number | null = null;
  const representative = channels[0]!;
  const windowSamples = Math.max(1, Math.round(input.sampleRate * 0.1));
  const windowRms: number[] = [];
  let silenceWindows = 0, totalWindows = 0;
  const silenceThreshold = 10 ** (-60 / 20);

  for (let start = 0; start < frames; start += windowSamples) {
    const end = Math.min(frames, start + windowSamples);
    let windowSquares = 0, windowCount = 0;
    for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
      const channel = channels[channelIndex]!;
      for (let i = start; i < end; i++) {
        const sample = channel[i] ?? 0;
        if (channelIndex === 0) {
          if (previousSample !== null && ((sample >= 0 && previousSample < 0) || (sample < 0 && previousSample >= 0))) zeroCrossings++;
          previousSample = sample;
        }
        const absolute = Math.abs(sample);
        peak = Math.max(peak, absolute);
        sumSquares += sample * sample;
        windowSquares += sample * sample;
        totalSamples++;
        windowCount++;
        if (absolute >= 0.999) clippedSamples++;
      }
    }
    const localRms = Math.sqrt(windowSquares / Math.max(1, windowCount));
    windowRms.push(localRms);
    if (localRms < silenceThreshold) silenceWindows++;
    totalWindows++;
  }


  const spreadDb = windowRms.map((value) => value > 0 ? 20 * Math.log10(value) : -120);
  const p95 = quantile(spreadDb, 0.95), p10 = quantile(spreadDb, 0.10);
  const spread = p95 === null || p10 === null ? null : Number(Math.max(0, p95 - p10).toFixed(2));
  const rmsAmplitude = Math.sqrt(sumSquares / Math.max(1, totalSamples));
  const lufsEstimate = rmsAmplitude > 0 ? 20 * Math.log10(rmsAmplitude) - 0.691 : Number.NEGATIVE_INFINITY;
  const tempoSamples = representative.subarray(0, Math.min(representative.length, Math.round(input.sampleRate * 90)));
  const keySamples = representative.subarray(0, Math.min(representative.length, Math.round(input.sampleRate * 30)));
  const tempo = estimateBpm(tempoSamples, input.sampleRate);
  const key = estimateKey(keySamples, input.sampleRate);
  const spectrum = spectralFeatures(representative, input.sampleRate);
  const zcr = frames > 1 ? zeroCrossings / (frames - 1) : null;
  const metadata: MusicMetadata = input.metadata ?? {};
  const taggedBpm = metadata.bpm ? Number(metadata.bpm) : NaN;

  return {
    schema_version: "env.music-analysis.v1",
    source: {
      file_name: input.fileName || "audio",
      mime_type: input.mimeType || "application/octet-stream",
      file_size_bytes: input.fileSizeBytes,
    },
    metadata: {
      title: metadata.title || null,
      artist: metadata.artist || null,
      album: metadata.album || null,
      album_artist: metadata.albumArtist || null,
      year: metadata.year || null,
      embedded_genre: metadata.genre || null,
      track_number: metadata.trackNumber || null,
      disc_number: metadata.discNumber || null,
      composer: metadata.composer || null,
      publisher: metadata.publisher || null,
      tagged_bpm: Number.isFinite(taggedBpm) && taggedBpm > 0 ? taggedBpm : null,
    },
    audio: {
      duration_seconds: Number(durationSeconds.toFixed(3)),
      sample_rate_hz: input.sampleRate,
      channels: channels.length,
      peak_dbfs: safeDb(peak),
      rms_dbfs: safeDb(rmsAmplitude),
      estimated_loudness_lufs: Number.isFinite(lufsEstimate) ? Number(lufsEstimate.toFixed(2)) : null,
      clipped_sample_percent: totalSamples ? Number((clippedSamples / totalSamples * 100).toFixed(4)) : 0,
      silence_percent: totalWindows ? Number((silenceWindows / totalWindows * 100).toFixed(2)) : 0,
      windowed_rms_spread_db: spread,
      metric_scope_seconds: Number(Math.min(durationSeconds, 30).toFixed(2)),
    },
    rhythm: { tempo_bpm: tempo, method: "10 ms energy-envelope autocorrelation; best-effort estimate", status: tempo === null ? "unavailable" : "estimated" },
    tonality: { key, method: "chroma-template correlation; best-effort estimate", status: key === null ? "unavailable" : "estimated" },
    timbre: {
      spectral_centroid_hz: spectrum.centroid,
      spectral_rolloff_85_hz: spectrum.rolloff85,
      spectral_flatness: spectrum.flatness,
      zero_crossing_rate: zcr === null ? null : Number(zcr.toFixed(5)),
      interpretation: "These describe signal shape; they do not independently identify genre, instruments, mood or language.",
    },
    classification: {
      genre: null,
      sub_style: null,
      language: [],
      mood: [],
      instruments: [],
      vocal_style: null,
      genre_candidates: [],
      status: "requires_model",
      note: "No trained semantic classifier has been run. Genre, sub-style, language, mood, instruments and vocal style remain unknown rather than guessed.",
    },
  };
}
