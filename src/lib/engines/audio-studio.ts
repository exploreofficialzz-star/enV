/**
 * Small deterministic audio-analysis helpers shared by the browser studio and tests.
 * Loudness/key estimates intentionally expose their limitations; they are not
 * substitutes for a calibrated BS.1770 meter or a trained transcription model.
 */
export function amplitudeDbfs(amplitude: number): number {
  if (!Number.isFinite(amplitude) || amplitude <= 0) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(amplitude);
}

export function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let total = 0;
  for (const sample of samples) total += sample * sample;
  return Math.sqrt(total / samples.length);
}

/** Conservative local model limit. Device memory is a browser hint, not a guarantee. */
export function browserSeparationLimitSeconds(deviceMemoryGiB?: number | null, isMobile = false): number {
  if (deviceMemoryGiB == null || !Number.isFinite(deviceMemoryGiB) || deviceMemoryGiB <= 0) {
    return isMobile ? 60 : 90;
  }
  if (deviceMemoryGiB <= 4) return isMobile ? 45 : 60;
  if (deviceMemoryGiB <= 8) return isMobile ? 75 : 120;
  if (deviceMemoryGiB <= 16) return isMobile ? 120 : 180;
  return isMobile ? 150 : 240;
}

/** Rough upper-bound estimate for model + stereo input + overlapping stem buffers. */
export function estimateBrowserSeparationWorkingSetBytes(
  durationSeconds: number,
  sampleRate = 44100,
  modelBytes = 166_000_000,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || !Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(modelBytes) || modelBytes < 0) {
    throw new Error("Duration, sample rate and model size must be finite non-negative values; sample rate must be positive.");
  }
  // Includes the source, four float32 stereo stem arrays, four output AudioBuffers,
  // overlap weights and model bytes. Runtime/driver allocations can add more.
  return Math.ceil(modelBytes + durationSeconds * sampleRate * 76);
}

/** Runtime may omit tensor dimensions. If provided, accept only the documented channel-first Demucs layout. */
export function isSupportedDemucsStemTensorDims(dims?: readonly number[], chunkSamples = Math.round(7.8 * 44100)): boolean {
  if (!dims || dims.length === 0) return true;
  const expected = [1, 4, 2, chunkSamples];
  const noBatch = [4, 2, chunkSamples];
  return (dims.length === expected.length && expected.every((size, index) => dims[index] === size)) ||
    (dims.length === noBatch.length && noBatch.every((size, index) => dims[index] === size));
}

/** RMS-based estimate only. True integrated LUFS needs K-weighting and gating. */
export function approximateLufs(samples: Float32Array): number {
  const level = amplitudeDbfs(rms(samples));
  return Number.isFinite(level) ? level - 0.691 : -Infinity;
}

export function trimSilenceBounds(
  samples: Float32Array,
  thresholdDbfs = -60,
  sampleRate = 44100,
  minHoldMs = 80,
): { start: number; end: number; removedStartSeconds: number; removedEndSeconds: number } {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("Sample rate must be positive.");
  if (!Number.isFinite(thresholdDbfs) || thresholdDbfs > 0 || thresholdDbfs < -120) throw new Error("Silence threshold must be between -120 and 0 dBFS.");
  if (!samples.length) return { start: 0, end: 0, removedStartSeconds: 0, removedEndSeconds: 0 };
  const threshold = 10 ** (thresholdDbfs / 20);
  const holdFrames = Math.max(1, Math.floor(sampleRate * minHoldMs / 1000));
  let first = -1, last = -1, activeRun = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= threshold) {
      activeRun++;
      if (activeRun >= holdFrames) {
        const activeStart = i - holdFrames + 1;
        if (first < 0) first = activeStart;
        last = i;
      }
    } else activeRun = 0;
  }
  if (first < 0) return { start: 0, end: 0, removedStartSeconds: samples.length / sampleRate, removedEndSeconds: 0 };
  const end = Math.min(samples.length, last + 1 + holdFrames);
  return {
    start: first,
    end,
    removedStartSeconds: first / sampleRate,
    removedEndSeconds: (samples.length - end) / sampleRate,
  };
}

/** High-pass + adaptive soft gate. Input is one channel of decoded PCM. */
export function reduceVoiceNoiseSamples(samples: Float32Array, sampleRate: number, strength = 0.8): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("Sample rate must be positive.");
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error("Noise reduction strength must be between 0 and 1.");
  if (!samples.length) return new Float32Array();
  const out = new Float32Array(samples.length);
  const analysisFrames = Math.min(samples.length, Math.max(1, Math.floor(sampleRate * 0.2)));
  let noiseSquare = 0;
  for (let i = 0; i < analysisFrames; i++) noiseSquare += samples[i] * samples[i];
  const noiseRms = Math.sqrt(noiseSquare / analysisFrames);
  const threshold = Math.max(0.002, noiseRms * (2 + strength * 2));
  const attack = Math.max(1, Math.floor(sampleRate * 0.006));
  const release = Math.max(1, Math.floor(sampleRate * 0.1));
  const cutoff = 80;
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  let gain = 1, previousInput = 0, previousHighPass = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const filtered = alpha * (previousHighPass + sample - previousInput);
    previousInput = sample;
    previousHighPass = filtered;
    const level = Math.abs(filtered);
    const target = level < threshold ? 0.06 + 0.94 * Math.min(1, level / Math.max(threshold, 1e-9)) : 1;
    const step = target < gain ? 1 / attack : 1 / release;
    gain += (target - gain) * Math.min(1, step);
    out[i] = filtered * (1 - strength * (1 - gain));
  }
  return out;
}

export function noiseGateSamples(samples: Float32Array, sampleRate: number, thresholdDbfs = -42, attenuation = 0.03): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("Sample rate must be positive.");
  if (!Number.isFinite(thresholdDbfs) || thresholdDbfs > 0 || thresholdDbfs < -120) throw new Error("Gate threshold must be between -120 and 0 dBFS.");
  if (!Number.isFinite(attenuation) || attenuation < 0 || attenuation > 1) throw new Error("Gate attenuation must be between 0 and 1.");
  const threshold = 10 ** (thresholdDbfs / 20);
  const attack = Math.max(1, Math.floor(sampleRate * 0.005));
  const release = Math.max(1, Math.floor(sampleRate * 0.04));
  const out = new Float32Array(samples.length);
  let gain = attenuation;
  for (let i = 0; i < samples.length; i++) {
    const target = Math.abs(samples[i]) >= threshold ? 1 : attenuation;
    gain += (target - gain) * Math.min(1, 1 / (target > gain ? attack : release));
    out[i] = samples[i] * gain;
  }
  return out;
}

export function humReduceSamples(samples: Float32Array, sampleRate: number, mainsFrequency: 50 | 60 = 50): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("Sample rate must be positive.");
  const frequencies = [mainsFrequency, mainsFrequency * 2].filter((frequency) => frequency < sampleRate / 2);
  const states = frequencies.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
  const coefficients = frequencies.map((frequency) => {
    const q = 12, w0 = 2 * Math.PI * frequency / sampleRate, alpha = Math.sin(w0) / (2 * q);
    return { b0: 1 / (1 + alpha), b1: -2 * Math.cos(w0) / (1 + alpha), b2: 1 / (1 + alpha), a1: -2 * Math.cos(w0) / (1 + alpha), a2: (1 - alpha) / (1 + alpha) };
  });
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let value = samples[i];
    for (let f = 0; f < frequencies.length; f++) {
      const state = states[f], c = coefficients[f];
      const filtered = c.b0 * value + c.b1 * state.x1 + c.b2 * state.x2 - c.a1 * state.y1 - c.a2 * state.y2;
      state.x2 = state.x1; state.x1 = value; state.y2 = state.y1; state.y1 = filtered;
      value = filtered;
    }
    out[i] = value;
  }
  return out;
}

/** Tempo guess from short-time energy novelty; best-effort, never a guarantee. */
export function estimateBpm(samples: Float32Array, sampleRate: number): number | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length < sampleRate * 2) return null;
  const hop = Math.max(128, Math.round(sampleRate * 0.01));
  const envelope: number[] = [];
  for (let start = 0; start + hop <= samples.length; start += hop) {
    let sum = 0;
    for (let i = start; i < start + hop; i++) sum += samples[i] * samples[i];
    envelope.push(Math.sqrt(sum / hop));
  }
  const novelty = envelope.map((value, index) => index === 0 ? 0 : Math.max(0, value - envelope[index - 1]));
  const minLag = Math.max(1, Math.floor(60 / 180 / (hop / sampleRate)));
  const maxLag = Math.min(novelty.length - 1, Math.ceil(60 / 55 / (hop / sampleRate)));
  if (maxLag <= minLag) return null;
  let bestLag = 0, bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0, normA = 0, normB = 0;
    for (let i = lag; i < novelty.length; i++) {
      score += novelty[i] * novelty[i - lag];
      normA += novelty[i] * novelty[i];
      normB += novelty[i - lag] * novelty[i - lag];
    }
    score /= Math.sqrt(Math.max(normA * normB, 1e-12));
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  if (bestScore < 0.04 || bestLag <= 0) return null;
  let bpm = 60 / (bestLag * hop / sampleRate);
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm);
}

const KEY_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function fftRealImag(real: Float64Array, imag: Float64Array) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = -2 * Math.PI / length;
    const wLengthReal = Math.cos(angle), wLengthImag = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let wReal = 1, wImag = 0;
      for (let j = 0; j < length / 2; j++) {
        const even = start + j, odd = even + length / 2;
        const oddReal = real[odd] * wReal - imag[odd] * wImag;
        const oddImag = real[odd] * wImag + imag[odd] * wReal;
        real[odd] = real[even] - oddReal; imag[odd] = imag[even] - oddImag;
        real[even] += oddReal; imag[even] += oddImag;
        const nextReal = wReal * wLengthReal - wImag * wLengthImag;
        wImag = wReal * wLengthImag + wImag * wLengthReal; wReal = nextReal;
      }
    }
  }
}

/** Lightweight chroma-template key suggestion; label results as approximate. */
export function estimateKey(samples: Float32Array, sampleRate: number): string | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length < sampleRate * 3) return null;
  const size = 4096, hop = Math.max(size, Math.floor(sampleRate * 0.4));
  const chroma = new Array<number>(12).fill(0);
  const real = new Float64Array(size), imag = new Float64Array(size);
  let frames = 0;
  for (let start = 0; start + size <= samples.length; start += hop) {
    real.fill(0); imag.fill(0);
    for (let i = 0; i < size; i++) real[i] = samples[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
    fftRealImag(real, imag);
    for (let bin = 2; bin < size / 2; bin++) {
      const frequency = bin * sampleRate / size;
      if (frequency < 55 || frequency > 2200) continue;
      const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
      const magnitude = Math.hypot(real[bin], imag[bin]);
      chroma[((midi % 12) + 12) % 12] += magnitude;
    }
    frames++;
    if (frames >= 180) break;
  }
  const total = chroma.reduce((sum, item) => sum + item, 0);
  if (!total) return null;
  const mean = chroma.reduce((sum, item) => sum + item, 0) / 12;
  const normalized = chroma.map((item) => item - mean);
  let bestScore = -Infinity, best = "";
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [["major", MAJOR_PROFILE], ["minor", MINOR_PROFILE]] as const) {
      let score = 0, normA = 0, normB = 0;
      for (let i = 0; i < 12; i++) {
        const sample = normalized[(i + tonic) % 12], weight = profile[i] - profile.reduce((s, x) => s + x, 0) / 12;
        score += sample * weight; normA += sample * sample; normB += weight * weight;
      }
      score /= Math.sqrt(Math.max(normA * normB, 1e-12));
      if (score > bestScore) { bestScore = score; best = `${KEY_NAMES[tonic]} ${mode}`; }
    }
  }
  return bestScore >= 0.06 ? best : null;
}

export type DiatonicChord = { degree: string; chord: string; quality: "major" | "minor" | "diminished" };
export type CapoSuggestion = { shape: string; fret: number; soundingKey: string };

const NOTE_INDEX: Record<string, number> = {
  C: 0, "B♯": 0, "C♯": 1, "D♭": 1, D: 2, "D♯": 3, "E♭": 3, E: 4, "F♭": 4,
  F: 5, "E♯": 5, "F♯": 6, "G♭": 6, G: 7, "G♯": 8, "A♭": 8, A: 9,
  "A♯": 10, "B♭": 10, B: 11, "C♭": 11,
};

/** Return diatonic triad suggestions from the estimated key; these are theory hints, not chord recognition. */
export function suggestDiatonicChords(keyLabel: string): DiatonicChord[] {
  const [tonicName, modeName] = keyLabel.trim().split(/\s+/);
  const tonic = NOTE_INDEX[tonicName ?? ""];
  if (tonic === undefined || !["major", "minor"].includes((modeName ?? "").toLowerCase())) return [];
  const isMinor = modeName.toLowerCase() === "minor";
  const offsets = isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const degrees = isMinor ? ["i", "ii°", "III", "iv", "v", "VI", "VII"] : ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
  const qualities: DiatonicChord["quality"][] = isMinor
    ? ["minor", "diminished", "major", "minor", "minor", "major", "major"]
    : ["major", "minor", "minor", "major", "major", "minor", "diminished"];
  return offsets.map((offset, index) => {
    const root = KEY_NAMES[(tonic + offset) % 12];
    const quality = qualities[index];
    const suffix = quality === "minor" ? "m" : quality === "diminished" ? "°" : "";
    return { degree: degrees[index], chord: `${root}${suffix}`, quality };
  });
}

/** Suggest familiar major/minor open-chord shapes that fit the detected key with a capo. */
export function suggestCapoShapes(keyLabel: string, maxFret = 6): CapoSuggestion[] {
  const [tonicName, modeName] = keyLabel.trim().split(/\s+/);
  const tonic = NOTE_INDEX[tonicName ?? ""];
  if (tonic === undefined || !["major", "minor"].includes((modeName ?? "").toLowerCase())) return [];
  const minor = modeName.toLowerCase() === "minor";
  const shapes = minor
    ? [{ shape: "Am", root: 9 }, { shape: "Em", root: 4 }, { shape: "Dm", root: 2 }]
    : [{ shape: "C", root: 0 }, { shape: "G", root: 7 }, { shape: "D", root: 2 }, { shape: "A", root: 9 }, { shape: "E", root: 4 }];
  return shapes
    .map(({ shape, root }) => ({ shape, fret: (tonic - root + 12) % 12, soundingKey: tonicName }))
    .filter((item) => item.fret <= maxFret)
    .sort((a, b) => a.fret - b.fret || a.shape.localeCompare(b.shape));
}

/** Log-frequency magnitude spectrogram, normalized per file for visualization. */
export function spectrogramData(samples: Float32Array, width = 1000, height = 280): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const size = 2048;
  const real = new Float64Array(size), imag = new Float64Array(size);
  const maxStart = Math.max(0, samples.length - size);
  const maxFreq = size / 2 - 1;
  const magnitudes = new Float64Array(height * width);
  let maxMagnitude = 1e-12;
  for (let x = 0; x < width; x++) {
    const start = Math.floor(x / Math.max(1, width - 1) * maxStart);
    real.fill(0); imag.fill(0);
    for (let i = 0; i < size; i++) real[i] = (samples[start + i] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
    fftRealImag(real, imag);
    for (let y = 0; y < height; y++) {
      const fraction = 1 - y / Math.max(1, height - 1);
      const bin = Math.max(1, Math.min(maxFreq, Math.round((Math.exp(fraction * Math.log(maxFreq + 1)) - 1))));
      const value = Math.log1p(Math.hypot(real[bin], imag[bin]));
      magnitudes[y * width + x] = value;
      maxMagnitude = Math.max(maxMagnitude, value);
    }
  }
  for (let i = 0; i < magnitudes.length; i++) {
    const level = Math.max(0, Math.min(255, Math.round(magnitudes[i] / maxMagnitude * 255)));
    const pixel = i * 4;
    // Grayscale is intentionally simple and preserves a useful printable image.
    pixels[pixel] = level; pixels[pixel + 1] = level; pixels[pixel + 2] = level; pixels[pixel + 3] = 255;
  }
  return pixels;
}

/** Estimate compressed audio bytes from duration (seconds) and bitrate (decimal kbps). */
export function estimateCompressedAudioBytes(durationSeconds: number, bitrateKbps: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new RangeError("Duration must be a positive number of seconds.");
  if (!Number.isFinite(bitrateKbps) || bitrateKbps <= 0) throw new RangeError("Bitrate must be a positive number of kbps.");
  return durationSeconds * bitrateKbps * 1000 / 8;
}

/** Inverse of the compressed size estimate. `sizeMegabytes` uses decimal MB (1 MB = 1,000,000 bytes). */
export function estimateBitrateKbpsFromSize(durationSeconds: number, sizeMegabytes: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new RangeError("Duration must be a positive number of seconds.");
  if (!Number.isFinite(sizeMegabytes) || sizeMegabytes <= 0) throw new RangeError("Target size must be a positive decimal MB value.");
  return sizeMegabytes * 1_000_000 * 8 / (durationSeconds * 1000);
}

/** Estimate uncompressed PCM bytes; headers/metadata are not included. */
export function estimatePcmAudioBytes(durationSeconds: number, sampleRateHz: number, channels: number, bitsPerSample: number): number {
  if (![durationSeconds, sampleRateHz, channels, bitsPerSample].every(Number.isFinite) || durationSeconds <= 0 || sampleRateHz <= 0 || channels < 1 || bitsPerSample < 1) throw new RangeError("Duration, sample rate, channels and bit depth must be positive values.");
  return durationSeconds * sampleRateHz * channels * bitsPerSample / 8;
}
