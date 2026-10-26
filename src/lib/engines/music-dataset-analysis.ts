import { estimateBpm, estimateKey } from "./audio-studio.ts";

export const MUSIC_DATASET_SCHEMA_VERSION = "env.music-dataset-analysis.v1" as const;
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
const FFT_SIZE = 2048;
const FFT_HOP_SECONDS = 0.5;

export type PitchPoint = {
  time_seconds: number;
  frequency_hz: number;
  midi_note: number;
  note: string;
  confidence: number;
};

export type FeatureFrame = {
  start_seconds: number;
  end_seconds: number;
  rms_dbfs: number | null;
  peak_dbfs: number | null;
  spectral_centroid_hz: number | null;
  spectral_rolloff_85_hz: number | null;
  spectral_flatness: number | null;
  low_frequency_energy_ratio: number | null;
  mid_frequency_energy_ratio: number | null;
  high_frequency_energy_ratio: number | null;
  spectral_flux: number | null;
  zero_crossing_rate: number | null;
};

export type ChordEstimate = {
  start_seconds: number;
  end_seconds: number;
  chord: string | null;
  confidence: number | null;
  method: "spectral-chroma-triad-template";
};

export type MusicDatasetAnnotations = {
  genre: string[];
  sub_style: string[];
  style_influences: string[];
  language: string[];
  energy: string[];
  mood: string[];
  source_role: string[];
  vocals: string[];
  vocal_delivery: string[];
  vocal_register: string[];
  vocal_harmony: string[];
  performance_technique: string[];
  instruments: string[];
  themes: string[];
  listening_scene: string[];
  production_traits: string[];
  arrangement: string[];
  notes: string;
  reviewed: boolean;
  reviewer: string | null;
};

export type MusicDatasetAnalysis = {
  schema_version: typeof MUSIC_DATASET_SCHEMA_VERSION;
  source: { file_name: string; sample_rate_hz: number; channels: number; frame_count: number; duration_seconds: number };
  processing: {
    method: "local-digital-signal-processing";
    uses_remote_api: false;
    uses_hosted_model: false;
    model_inference: false;
    feature_frame_seconds: number;
    note: string;
  };
  technical: {
    duration_seconds: number;
    sample_rate_hz: number;
    channels: number;
    peak_dbfs: number | null;
    rms_dbfs: number | null;
    crest_factor_db: number | null;
    dynamic_range_estimate_db: number | null;
    clipped_sample_percent: number;
    dc_offset_by_channel: number[];
    stereo_side_to_mid_ratio: number | null;
  };
  rhythm: {
    tempo_bpm: number | null;
    tempo_method: string;
    transient_density_per_second: number | null;
    transient_event_count: number;
    interpretation: string;
  };
  tonality: {
    key_estimate: string | null;
    key_method: string;
    pitch_class_profile: Array<{ note: string; energy: number }>;
    chord_estimates: ChordEstimate[];
    interpretation: string;
  };
  pitch: {
    source: "full_mix_dominant_pitch_estimate";
    points: PitchPoint[];
    lowest_detected_note: string | null;
    highest_detected_note: string | null;
    pitch_range_semitones: number | null;
    note: string;
  };
  timbre: {
    mean_spectral_centroid_hz: number | null;
    mean_spectral_rolloff_85_hz: number | null;
    mean_spectral_flatness: number | null;
    mean_low_frequency_energy_ratio: number | null;
    mean_mid_frequency_energy_ratio: number | null;
    mean_high_frequency_energy_ratio: number | null;
    mean_zero_crossing_rate: number | null;
    descriptors: string[];
  };
  timeline: FeatureFrame[];
  structure: {
    change_points: Array<{ time_seconds: number; change_score: number; reason: string }>;
    sections: Array<{ start_seconds: number; end_seconds: number; label: string; label_source: "automatic_feature_change"; semantic_section: null }>;
    note: string;
  };
  style_cues: Array<{ tag: string; evidence: string; is_genre_classification: false }>;
  separation: {
    status: "not_performed";
    reason: string;
    supported_local_layers: string[];
    note: string;
  };
  annotations: MusicDatasetAnnotations;
  warnings: string[];
};

export type MusicDatasetAnalysisInput = {
  channels: readonly Float32Array[];
  sampleRate: number;
  fileName?: string;
};

export type LocalSignalLayer = {
  id: "mono_mix" | "low_frequency" | "mid_frequency" | "high_frequency" | "stereo_center" | "stereo_side";
  label: string;
  samples: Float32Array;
  channels: 1 | 2;
  meaning: string;
};

function dbfs(amplitude: number): number | null {
  if (!Number.isFinite(amplitude) || amplitude < 0) return null;
  if (amplitude === 0) return -120;
  return Number(Math.max(-120, 20 * Math.log10(amplitude)).toFixed(2));
}

function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function noteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
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
      for (let j = 0; j < size / 2; j += 1) {
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

function spectrumAt(samples: Float32Array, start: number, sampleRate: number): {
  magnitudes: Float64Array;
  centroid: number | null;
  rolloff85: number | null;
  flatness: number | null;
  lowRatio: number | null;
  midRatio: number | null;
  highRatio: number | null;
  chroma: number[];
} {
  const magnitudes = new Float64Array(FFT_SIZE / 2);
  if (samples.length < FFT_SIZE || sampleRate <= 0 || start + FFT_SIZE > samples.length) {
    return { magnitudes, centroid: null, rolloff85: null, flatness: null, lowRatio: null, midRatio: null, highRatio: null, chroma: Array(12).fill(0) };
  }
  const real = new Float64Array(FFT_SIZE);
  const imag = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
    real[i] = (samples[start + i] ?? 0) * window;
  }
  fft(real, imag);
  let magnitudeSum = 0, weightedFrequency = 0, logSum = 0, powerSum = 0;
  let lowPower = 0, midPower = 0, highPower = 0;
  const chroma = Array(12).fill(0) as number[];
  let rolloffBin = 1;
  for (let bin = 1; bin < magnitudes.length; bin += 1) {
    const magnitude = Math.hypot(real[bin] ?? 0, imag[bin] ?? 0);
    magnitudes[bin] = magnitude;
    const frequency = bin * sampleRate / FFT_SIZE;
    const power = magnitude * magnitude;
    magnitudeSum += magnitude;
    weightedFrequency += magnitude * frequency;
    logSum += Math.log(Math.max(magnitude, 1e-12));
    powerSum += power;
    if (frequency < 160) lowPower += power;
    else if (frequency < 2000) midPower += power;
    else highPower += power;
    if (frequency >= 45 && frequency <= Math.min(5000, sampleRate / 2)) {
      const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
      chroma[((midi % 12) + 12) % 12] += magnitude;
    }
  }
  if (magnitudeSum <= 1e-10 || powerSum <= 1e-16) {
    return { magnitudes, centroid: null, rolloff85: null, flatness: null, lowRatio: 0, midRatio: 0, highRatio: 0, chroma };
  }
  let accumulated = 0;
  for (let bin = 1; bin < magnitudes.length; bin += 1) {
    accumulated += magnitudes[bin] ?? 0;
    if (accumulated >= magnitudeSum * 0.85) { rolloffBin = bin; break; }
  }
  const bins = magnitudes.length - 1;
  const arithmetic = magnitudeSum / bins;
  const flatness = arithmetic > 0 ? Math.exp(logSum / bins) / arithmetic : 0;
  return {
    magnitudes,
    centroid: weightedFrequency / magnitudeSum,
    rolloff85: rolloffBin * sampleRate / FFT_SIZE,
    flatness,
    lowRatio: lowPower / powerSum,
    midRatio: midPower / powerSum,
    highRatio: highPower / powerSum,
    chroma,
  };
}

function frameLevels(samples: Float32Array): { rms: number | null; peak: number | null; zcr: number | null } {
  if (!samples.length) return { rms: null, peak: null, zcr: null };
  let squares = 0, peak = 0, crossings = 0, previous = samples[0] ?? 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] ?? 0;
    squares += value * value;
    peak = Math.max(peak, Math.abs(value));
    if (i > 0 && ((value >= 0 && previous < 0) || (value < 0 && previous >= 0))) crossings += 1;
    previous = value;
  }
  return { rms: Math.sqrt(squares / samples.length), peak, zcr: samples.length > 1 ? crossings / (samples.length - 1) : 0 };
}

function estimatePitch(samples: Float32Array, sampleRate: number, start: number, seconds: number): PitchPoint | null {
  const windowLength = Math.min(4096, samples.length - start);
  if (windowLength < 1024) return null;
  const decimation = Math.max(1, Math.ceil(sampleRate / 11025));
  const reduced: number[] = [];
  for (let i = 0; i < windowLength; i += decimation) {
    const value = samples[start + i] ?? 0;
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, windowLength - 1));
    reduced.push(value * window);
  }
  const reducedRate = sampleRate / decimation;
  const minLag = Math.max(2, Math.floor(reducedRate / 1000));
  const maxLag = Math.min(Math.floor(reducedRate / 55), Math.floor(reduced.length / 2));
  if (maxLag <= minLag) return null;
  let bestLag = 0, bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let dot = 0, leftEnergy = 0, rightEnergy = 0;
    for (let i = 0; i < reduced.length - lag; i += 1) {
      const left = reduced[i] ?? 0, right = reduced[i + lag] ?? 0;
      dot += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const score = dot / Math.sqrt(Math.max(1e-16, leftEnergy * rightEnergy));
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  if (!bestLag || bestScore < 0.55) return null;
  const frequency = reducedRate / bestLag;
  if (!Number.isFinite(frequency) || frequency < 55 || frequency > 1000) return null;
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return { time_seconds: Number(seconds.toFixed(3)), frequency_hz: Number(frequency.toFixed(2)), midi_note: midi, note: noteName(midi), confidence: Number(clamp(bestScore, 0, 1).toFixed(3)) };
}

function estimateChord(chroma: readonly number[], start: number, end: number): ChordEstimate {
  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (total <= 1e-8) return { start_seconds: start, end_seconds: end, chord: null, confidence: null, method: "spectral-chroma-triad-template" };
  const normalized = chroma.map((value) => value / total);
  let bestChord: string | null = null, bestScore = -Infinity, secondScore = -Infinity;
  for (let root = 0; root < 12; root += 1) {
    for (const mode of ["major", "minor"] as const) {
      const third = (root + (mode === "major" ? 4 : 3)) % 12;
      const fifth = (root + 7) % 12;
      let score = normalized[root]! + 0.8 * normalized[third]! + 0.6 * normalized[fifth]!;
      const scaleTone = new Set([root, third, fifth]);
      for (let note = 0; note < 12; note += 1) if (!scaleTone.has(note)) score -= normalized[note]! * 0.15;
      if (score > bestScore) { secondScore = bestScore; bestScore = score; bestChord = NOTE_NAMES[root] + (mode === "minor" ? "m" : ""); }
      else if (score > secondScore) secondScore = score;
    }
  }
  const confidence = bestScore > 0 ? clamp((bestScore - Math.max(0, secondScore)) / bestScore * 3 + 0.3, 0, 0.99) : 0;
  return { start_seconds: Number(start.toFixed(3)), end_seconds: Number(end.toFixed(3)), chord: bestChord, confidence: Number(confidence.toFixed(3)), method: "spectral-chroma-triad-template" };
}

function emptyAnnotations(): MusicDatasetAnnotations {
  return { genre: [], sub_style: [], style_influences: [], language: [], energy: [], mood: [], source_role: [], vocals: [], vocal_delivery: [], vocal_register: [], vocal_harmony: [], performance_technique: [], instruments: [], themes: [], listening_scene: [], production_traits: [], arrangement: [], notes: "", reviewed: false, reviewer: null };
}

function createSections(frames: FeatureFrame[], duration: number) {
  if (!frames.length || duration <= 0) return { change_points: [] as MusicDatasetAnalysis["structure"]["change_points"], sections: [] as MusicDatasetAnalysis["structure"]["sections"] };
  const changePoints: MusicDatasetAnalysis["structure"]["change_points"] = [];
  let lastBoundary = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const previous = frames[i - 1]!;
    const current = frames[i]!;
    const rmsDelta = Math.abs((current.rms_dbfs ?? -120) - (previous.rms_dbfs ?? -120)) / 24;
    const centroidDelta = Math.abs((current.spectral_centroid_hz ?? 0) - (previous.spectral_centroid_hz ?? 0)) / Math.max(1000, previous.spectral_centroid_hz ?? 1000);
    const lowDelta = Math.abs((current.low_frequency_energy_ratio ?? 0) - (previous.low_frequency_energy_ratio ?? 0));
    const flux = clamp(current.spectral_flux ?? 0, 0, 1);
    const score = clamp(rmsDelta * 0.45 + centroidDelta * 0.25 + lowDelta * 0.2 + flux * 0.1, 0, 1);
    const time = current.start_seconds;
    if (score >= 0.27 && time - lastBoundary >= 4 && duration - time >= 3) {
      changePoints.push({ time_seconds: Number(time.toFixed(3)), change_score: Number(score.toFixed(3)), reason: "A measurable change in level, spectral brightness, frequency balance, or spectral flux; this is not a confirmed verse/chorus label." });
      lastBoundary = time;
    }
  }
  const boundaries = [0, ...changePoints.map((point) => point.time_seconds), duration];
  const sections: MusicDatasetAnalysis["structure"]["sections"] = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i]!, end = boundaries[i + 1]!;
    if (end - start < 1) continue;
    sections.push({ start_seconds: Number(start.toFixed(3)), end_seconds: Number(end.toFixed(3)), label: `section_${sections.length + 1}`, label_source: "automatic_feature_change", semantic_section: null });
  }
  return { change_points: changePoints, sections };
}

export async function analyzeMusicDatasetAudio(input: MusicDatasetAnalysisInput, options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {}): Promise<MusicDatasetAnalysis> {
  const { channels, sampleRate } = input;
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error("Audio sample rate must be between 8 kHz and 192 kHz.");
  if (!channels.length || !channels[0]?.length) throw new Error("No decoded audio samples were supplied.");
  const frameCount = channels[0]!.length;
  if (channels.some((channel) => channel.length !== frameCount)) throw new Error("Decoded channels must have equal frame counts.");
  if (channels.some((channel) => channel.some((sample) => !Number.isFinite(sample)))) throw new Error("Audio contains a non-finite sample; decoding was stopped.");
  const duration = frameCount / sampleRate;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Decoded audio duration is invalid.");
  if (frameCount > sampleRate * 15 * 60) throw new Error("Local deep analysis is limited to 15 minutes per track for device memory and responsiveness.");

  const mono = new Float32Array(frameCount);
  const dcOffset: number[] = [];
  for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
    const channel = channels[channelIndex]!;
    let sum = 0;
    for (let i = 0; i < frameCount; i += 1) {
      mono[i] += channel[i]! / channels.length;
      sum += channel[i]!;
    }
    dcOffset.push(Number((sum / Math.max(1, frameCount)).toFixed(6)));
  }

  const allLevels = frameLevels(mono);
  const frames: FeatureFrame[] = [];
  const previousMagnitude = new Float64Array(FFT_SIZE / 2);
  let transientEvents = 0, previousRmsDb: number | null = null;
  const stepSamples = Math.max(1, Math.round(sampleRate * FFT_HOP_SECONDS));
  const durationPitchPoints: PitchPoint[] = [];
  const maxSpectralFrames = Math.ceil(duration / FFT_HOP_SECONDS);
  const pitchStepFrames = Math.max(1, Math.round(1 / FFT_HOP_SECONDS));
  const chromaByBlock = new Map<number, number[]>();
  const frameFluxes: number[] = [];

  for (let frameIndex = 0, start = 0; start < frameCount; frameIndex += 1, start += stepSamples) {
    if (frameIndex % 8 === 0) {
      if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      options.onProgress?.(clamp(frameIndex / Math.max(1, maxSpectralFrames), 0, 1));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const end = Math.min(frameCount, start + stepSamples);
    const samples = mono.subarray(start, end);
    const levels = frameLevels(samples);
    const spectrumStart = Math.min(Math.max(0, start + Math.floor((end - start - FFT_SIZE) / 2)), Math.max(0, frameCount - FFT_SIZE));
    const spec = spectrumAt(mono, spectrumStart, sampleRate);
    const rmsDb = dbfs(levels.rms ?? 0);
    const peakDb = dbfs(levels.peak ?? 0);
    const fluxNumerator = spec.magnitudes.reduce((sum, value, index) => sum + Math.max(0, value - (previousMagnitude[index] ?? 0)), 0);
    const magnitudeTotal = spec.magnitudes.reduce((sum, value) => sum + value, 0);
    const spectralFlux = magnitudeTotal > 1e-10 ? fluxNumerator / magnitudeTotal : 0;
    if (rmsDb !== null && previousRmsDb !== null && rmsDb - previousRmsDb >= 3 && (spec.lowRatio ?? 0) + (spec.midRatio ?? 0) > 0.2) transientEvents += 1;
    if (spectralFlux > 0.22) transientEvents += 1;
    previousRmsDb = rmsDb;
    previousMagnitude.set(spec.magnitudes);
    frameFluxes.push(spectralFlux);
    for (let note = 0; note < 12; note += 1) {
      const block = Math.floor((start / sampleRate) / 2);
      const values = chromaByBlock.get(block) ?? Array(12).fill(0) as number[];
      values[note] += spec.chroma[note] ?? 0;
      chromaByBlock.set(block, values);
    }
    frames.push({
      start_seconds: Number((start / sampleRate).toFixed(3)),
      end_seconds: Number((end / sampleRate).toFixed(3)),
      rms_dbfs: rmsDb,
      peak_dbfs: peakDb,
      spectral_centroid_hz: spec.centroid === null ? null : Number(spec.centroid.toFixed(1)),
      spectral_rolloff_85_hz: spec.rolloff85 === null ? null : Number(spec.rolloff85.toFixed(1)),
      spectral_flatness: spec.flatness === null ? null : Number(spec.flatness.toFixed(5)),
      low_frequency_energy_ratio: spec.lowRatio === null ? null : Number(spec.lowRatio.toFixed(4)),
      mid_frequency_energy_ratio: spec.midRatio === null ? null : Number(spec.midRatio.toFixed(4)),
      high_frequency_energy_ratio: spec.highRatio === null ? null : Number(spec.highRatio.toFixed(4)),
      spectral_flux: Number(spectralFlux.toFixed(5)),
      zero_crossing_rate: levels.zcr === null ? null : Number(levels.zcr.toFixed(5)),
    });
    if (frameIndex % pitchStepFrames === 0) {
      const pitch = estimatePitch(mono, sampleRate, start, start / sampleRate);
      if (pitch) durationPitchPoints.push(pitch);
    }
    if (frameIndex + 1 >= maxSpectralFrames) break;
  }

  const pitchMidis = durationPitchPoints.map((point) => point.midi_note);
  const minMidi = pitchMidis.length ? Math.min(...pitchMidis) : null;
  const maxMidi = pitchMidis.length ? Math.max(...pitchMidis) : null;
  const globalRms = allLevels.rms ?? 0;
  const peak = allLevels.peak ?? 0;
  const crestFactor = globalRms > 0 ? 20 * Math.log10(Math.max(1e-12, peak) / globalRms) : null;
  const sortedDb = frames.map((frame) => frame.rms_dbfs ?? -120).sort((a, b) => a - b);
  const rangeEstimate = sortedDb.length > 1 ? sortedDb[Math.floor((sortedDb.length - 1) * 0.95)]! - sortedDb[Math.floor((sortedDb.length - 1) * 0.1)]! : null;
  let clipped = 0, total = 0;
  for (const channel of channels) for (const value of channel) { total += 1; if (Math.abs(value) >= 0.999) clipped += 1; }
  const sideToMid = channels.length >= 2 ? (() => {
    const left = channels[0]!, right = channels[1]!;
    let side = 0, mid = 0;
    for (let i = 0; i < frameCount; i += 1) {
      const m = ((left[i] ?? 0) + (right[i] ?? 0)) * 0.5;
      const s = ((left[i] ?? 0) - (right[i] ?? 0)) * 0.5;
      mid += m * m; side += s * s;
    }
    return Number(Math.sqrt(side / Math.max(1e-12, mid)).toFixed(4));
  })() : null;

  const pitchClass = Array(12).fill(0) as number[];
  for (const block of chromaByBlock.values()) for (let note = 0; note < 12; note += 1) pitchClass[note] += block[note] ?? 0;
  const totalChroma = pitchClass.reduce((sum, value) => sum + value, 0);
  const normalizedChroma = totalChroma > 0 ? pitchClass.map((value) => value / totalChroma) : pitchClass;
  const chordEstimates = [...chromaByBlock.entries()].sort(([a], [b]) => a - b).map(([block, chroma]) => estimateChord(chroma, block * 2, Math.min(duration, (block + 1) * 2)));
  const tempoSamples = mono.subarray(0, Math.min(mono.length, sampleRate * 90));
  const tempo = estimateBpm(tempoSamples, sampleRate);
  const key = estimateKey(mono.subarray(0, Math.min(mono.length, sampleRate * 30)), sampleRate);
  const meanCentroid = mean(frames.map((frame) => frame.spectral_centroid_hz ?? 0).filter((v) => v > 0));
  const meanRolloff = mean(frames.map((frame) => frame.spectral_rolloff_85_hz ?? 0).filter((v) => v > 0));
  const meanFlatness = mean(frames.map((frame) => frame.spectral_flatness ?? 0).filter((v) => v > 0));
  const meanLow = mean(frames.map((frame) => frame.low_frequency_energy_ratio ?? 0));
  const meanMid = mean(frames.map((frame) => frame.mid_frequency_energy_ratio ?? 0));
  const meanHigh = mean(frames.map((frame) => frame.high_frequency_energy_ratio ?? 0));
  const meanZcr = mean(frames.map((frame) => frame.zero_crossing_rate ?? 0));
  const fluxThreshold = Math.max(0.15, (mean(frameFluxes) ?? 0) * 1.4);
  const fluxEvents = frameFluxes.filter((value) => value >= fluxThreshold).length;
  const transientDensity = duration > 0 ? Number((Math.max(transientEvents, fluxEvents) / duration).toFixed(3)) : null;
  const structure = createSections(frames, duration);
  const styleCues: MusicDatasetAnalysis["style_cues"] = [];
  if ((meanLow ?? 0) >= 0.35) styleCues.push({ tag: "low-frequency-prominent", evidence: `Low band carries ${Math.round((meanLow ?? 0) * 100)}% of measured spectral energy on average.`, is_genre_classification: false });
  if ((meanHigh ?? 0) >= 0.3) styleCues.push({ tag: "high-frequency-prominent", evidence: `High band carries ${Math.round((meanHigh ?? 0) * 100)}% of measured spectral energy on average.`, is_genre_classification: false });
  if ((transientDensity ?? 0) >= 3) styleCues.push({ tag: "transient-dense", evidence: `Approximately ${transientDensity} onset-like changes per second were detected using local signal thresholds.`, is_genre_classification: false });
  if ((meanCentroid ?? 0) >= 3000) styleCues.push({ tag: "spectrally-bright", evidence: `Mean spectral centroid is ${Math.round(meanCentroid ?? 0)} Hz.`, is_genre_classification: false });
  if (sideToMid !== null && sideToMid >= 0.35) styleCues.push({ tag: "wide-stereo-content", evidence: `Measured side-to-mid energy ratio is ${sideToMid}.`, is_genre_classification: false });
  if (!styleCues.length) styleCues.push({ tag: "no-dominant-rule-cue", evidence: "Measured features did not cross the conservative rule thresholds.", is_genre_classification: false });
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  options.onProgress?.(1);
  const warnings: string[] = [
    "No remote API or pretrained model was used. Genre, sub-style, language, mood and instrument identities require human annotation or a separately trained classifier.",
    "Pitch and chord results are estimates from the complete mix. Instruments, harmonics, percussion and overlapping voices can produce false notes or chords.",
    "Automatic section boundaries describe feature changes, not verified intro/verse/chorus labels.",
    "This module analyzes audio in the browser; high sample rates and long tracks may take longer on low-memory phones.",
  ];
  if (!durationPitchPoints.length) warnings.push("No stable dominant pitch could be tracked with sufficient autocorrelation confidence.");
  if (channels.length > 2) warnings.push("For stereo-width diagnostics, only the first two channels are treated as left/right.");
  return {
    schema_version: MUSIC_DATASET_SCHEMA_VERSION,
    source: { file_name: input.fileName || "audio", sample_rate_hz: sampleRate, channels: channels.length, frame_count: frameCount, duration_seconds: Number(duration.toFixed(3)) },
    processing: {
      method: "local-digital-signal-processing", uses_remote_api: false, uses_hosted_model: false, model_inference: false,
      feature_frame_seconds: FFT_HOP_SECONDS,
      note: "All calculations run locally on decoded PCM. Semantic labels are human-supplied; detected pitches/chords and audio descriptors are estimates.",
    },
    technical: {
      duration_seconds: Number(duration.toFixed(3)), sample_rate_hz: sampleRate, channels: channels.length,
      peak_dbfs: dbfs(peak), rms_dbfs: dbfs(globalRms), crest_factor_db: crestFactor === null ? null : Number(crestFactor.toFixed(2)),
      dynamic_range_estimate_db: rangeEstimate === null ? null : Number(rangeEstimate.toFixed(2)),
      clipped_sample_percent: total ? Number((clipped / total * 100).toFixed(4)) : 0,
      dc_offset_by_channel: dcOffset,
      stereo_side_to_mid_ratio: sideToMid,
    },
    rhythm: {
      tempo_bpm: tempo, tempo_method: "Local onset/energy autocorrelation estimator; estimate only.",
      transient_density_per_second: transientDensity, transient_event_count: Math.max(transientEvents, fluxEvents),
      interpretation: "Transient density counts rule-triggered changes, not verified drum hits. Tempo may be half/double-time.",
    },
    tonality: {
      key_estimate: key, key_method: "Local chroma-template comparison; estimate only.",
      pitch_class_profile: NOTE_NAMES.map((note, index) => ({ note, energy: Number((normalizedChroma[index] ?? 0).toFixed(5)) })),
      chord_estimates: chordEstimates,
      interpretation: "Chroma and triad-template matches are not guaranteed chords; rhythm, bass harmonics and mixed sources can confuse them.",
    },
    pitch: {
      source: "full_mix_dominant_pitch_estimate",
      points: durationPitchPoints,
      lowest_detected_note: minMidi === null ? null : noteName(minMidi),
      highest_detected_note: maxMidi === null ? null : noteName(maxMidi),
      pitch_range_semitones: minMidi === null || maxMidi === null ? null : maxMidi - minMidi,
      note: "This is the dominant periodic pitch in the full mix, not a vocal-only contour. Soprano/alto/tenor/baritone labels cannot be established from a mixed track alone.",
    },
    timbre: {
      mean_spectral_centroid_hz: meanCentroid === null ? null : Number(meanCentroid.toFixed(2)),
      mean_spectral_rolloff_85_hz: meanRolloff === null ? null : Number(meanRolloff.toFixed(2)),
      mean_spectral_flatness: meanFlatness === null ? null : Number(meanFlatness.toFixed(5)),
      mean_low_frequency_energy_ratio: meanLow === null ? null : Number(meanLow.toFixed(5)),
      mean_mid_frequency_energy_ratio: meanMid === null ? null : Number(meanMid.toFixed(5)),
      mean_high_frequency_energy_ratio: meanHigh === null ? null : Number(meanHigh.toFixed(5)),
      mean_zero_crossing_rate: meanZcr === null ? null : Number(meanZcr.toFixed(5)),
      descriptors: styleCues.map((cue) => cue.tag),
    },
    timeline: frames,
    structure: { ...structure, note: "Generic sections are cut at strong measurable feature changes; they are not semantic labels such as verse, chorus, or drop." },
    style_cues: styleCues,
    separation: {
      status: "not_performed",
      reason: "Clean vocal/drum/bass source separation cannot be inferred by ordinary FFT/tempo/key analysis alone. This local-only mode does not download or run a pretrained separator.",
      supported_local_layers: ["low_frequency", "mid_frequency", "high_frequency", "stereo_center", "stereo_side"],
      note: "These are frequency/spatial layers, not isolated vocal, drum, bass or instrument stems. Review them before using them as training targets.",
    },
    annotations: emptyAnnotations(),
    warnings,
  };
}

/**
 * Create additive, non-semantic signal layers using local filters.
 * These bands reconstruct the mono downmix (apart from floating-point roundoff).
 * They are explicitly not advertised as vocal/drum/bass stems.
 */
export function createLocalSignalLayers(channels: readonly Float32Array[], sampleRate: number): LocalSignalLayer[] {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error("Sample rate must be between 8 kHz and 192 kHz.");
  if (!channels.length || !channels[0]?.length) throw new Error("No decoded audio samples were supplied.");
  const length = channels[0]!.length;
  if (channels.some((channel) => channel.length !== length)) throw new Error("Decoded channels must have equal frame counts.");
  const mono = new Float32Array(length);
  for (const channel of channels) for (let i = 0; i < length; i += 1) mono[i] += channel[i]! / channels.length;
  const low = new Float32Array(length), mid = new Float32Array(length), high = new Float32Array(length);
  const alphaLow = 1 - Math.exp((-2 * Math.PI * 160) / sampleRate);
  const alphaHigh = 1 - Math.exp((-2 * Math.PI * 2000) / sampleRate);
  let lowState = 0, broadLowState = 0;
  for (let i = 0; i < length; i += 1) {
    const sample = mono[i] ?? 0;
    lowState += alphaLow * (sample - lowState);
    broadLowState += alphaHigh * (sample - broadLowState);
    low[i] = lowState;
    mid[i] = broadLowState - lowState;
    high[i] = sample - broadLowState;
  }
  const layers: LocalSignalLayer[] = [
    { id: "mono_mix", label: "Mono mix", samples: mono, channels: 1, meaning: "Downmixed reference signal." },
    { id: "low_frequency", label: "Low-frequency band (< approx. 160 Hz)", samples: low, channels: 1, meaning: "Frequency band; bass/kick are possible contributors but are not isolated." },
    { id: "mid_frequency", label: "Mid-frequency band (approx. 160 Hz–2 kHz)", samples: mid, channels: 1, meaning: "Frequency band containing overlapping vocals and instruments; not a vocal stem." },
    { id: "high_frequency", label: "High-frequency band (> approx. 2 kHz)", samples: high, channels: 1, meaning: "Frequency band containing transients, sibilance and instrument harmonics; not a drum stem." },
  ];
  if (channels.length >= 2) {
    const left = channels[0]!, right = channels[1]!;
    const center = new Float32Array(length), side = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      center[i] = ((left[i] ?? 0) + (right[i] ?? 0)) * 0.5;
      side[i] = ((left[i] ?? 0) - (right[i] ?? 0)) * 0.5;
    }
    layers.push(
      { id: "stereo_center", label: "Stereo center (mid)", samples: center, channels: 1, meaning: "Content common to left/right; can include lead vocals, bass, kick and centered instruments." },
      { id: "stereo_side", label: "Stereo side", samples: side, channels: 1, meaning: "Left/right difference content; can include stereo effects and panned instruments, not a clean accompaniment stem." },
    );
  }
  return layers;
}

/** Encode a mono Float32 signal as a standards-compatible PCM16 WAV file. */
export function encodeMonoPcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error("Invalid WAV sample rate.");
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, value: string) => { for (let i = 0; i < value.length; i += 1) bytes[offset + i] = value.charCodeAt(i); };
  writeAscii(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); writeAscii(8, "WAVE");
  writeAscii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeAscii(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = clamp(samples[i] ?? 0, -1, 1);
    view.setInt16(44 + i * 2, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true);
  }
  return bytes;
}
