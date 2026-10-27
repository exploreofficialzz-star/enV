import FFT from "fft.js";

// Spleeter's 44.1 kHz front end: periodic Hann, 4096-point FFT, 1024 hop.
export const SPLEETER_FFT = 4096;
export const SPLEETER_HOP = 1024;
export const SPLEETER_BINS = 2049;
export const SPLEETER_MODEL_BINS = 1024;
export const SPLEETER_FRAMES = 512;
const PAD = SPLEETER_FFT - SPLEETER_HOP;
const windowValues = Float32Array.from({ length: SPLEETER_FFT }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / SPLEETER_FFT));

export type SpleeterSpectrum = { length: number; frames: number; splits: number; complex: Float32Array[]; magnitude: Float32Array };

/** Preserve the complex spectrum so estimates can be applied as masks without losing phase. */
export function createSpleeterSpectrum(channels: readonly Float32Array[]): SpleeterSpectrum {
  if (channels.length !== 2 || channels[0].length !== channels[1].length || !channels[0].length) throw new Error("Separation requires stereo audio.");
  const length = channels[0].length;
  const frames = Math.ceil((PAD + length) / SPLEETER_HOP);
  const splits = Math.ceil(frames / SPLEETER_FRAMES);
  const magnitude = new Float32Array(2 * splits * SPLEETER_FRAMES * SPLEETER_MODEL_BINS);
  const complex = [new Float32Array(frames * SPLEETER_BINS * 2), new Float32Array(frames * SPLEETER_BINS * 2)];
  const fft = new FFT(SPLEETER_FFT);
  const input = new Float32Array(SPLEETER_FFT);
  const output = new Float32Array(SPLEETER_FFT * 2);
  for (let channel = 0; channel < 2; channel++) for (let frame = 0; frame < frames; frame++) {
    const start = frame * SPLEETER_HOP - PAD;
    for (let i = 0; i < SPLEETER_FFT; i++) {
      const at = start + i;
      input[i] = at >= 0 && at < length ? channels[channel][at] * windowValues[i] : 0;
    }
    fft.realTransform(output, input);
    const target = frame * SPLEETER_BINS * 2;
    complex[channel].set(output.subarray(0, SPLEETER_BINS * 2), target);
    const mag = (channel * splits * SPLEETER_FRAMES + frame) * SPLEETER_MODEL_BINS;
    for (let bin = 0; bin < SPLEETER_MODEL_BINS; bin++) magnitude[mag + bin] = Math.hypot(output[bin * 2], output[bin * 2 + 1]);
  }
  return { length, frames, splits, complex, magnitude };
}

/** Ratio masks are normalized over all four stems; bins above 11 kHz use the mean mask. */
export function synthesizeSpleeterStem(spectrum: SpleeterSpectrum, estimates: readonly Float32Array[], stem: number): Float32Array[] {
  const { length, frames, splits, complex } = spectrum;
  if (estimates.length !== 4 || stem < 0 || stem >= 4 || estimates.some((item) => item.length !== spectrum.magnitude.length)) throw new Error("The separator returned an unexpected model output.");
  const fft = new FFT(SPLEETER_FFT);
  const masked = new Float32Array(SPLEETER_FFT * 2);
  const inverse = new Float32Array(SPLEETER_FFT * 2);
  const paddedLength = (frames - 1) * SPLEETER_HOP + SPLEETER_FFT;
  const weights = new Float32Array(paddedLength);
  for (let frame = 0; frame < frames; frame++) {
    const at = frame * SPLEETER_HOP;
    for (let i = 0; i < SPLEETER_FFT; i++) weights[at + i] += windowValues[i] ** 2;
  }
  return [0, 1].map((channel) => {
    const output = new Float32Array(paddedLength);
    for (let frame = 0; frame < frames; frame++) {
      const offset = (channel * splits * SPLEETER_FRAMES + frame) * SPLEETER_MODEL_BINS;
      const source = frame * SPLEETER_BINS * 2;
      let mean = 0;
      for (let bin = 0; bin < SPLEETER_MODEL_BINS; bin++) {
        const i = offset + bin;
        let total = 1e-10;
        for (const estimate of estimates) total += estimate[i] ** 2;
        const mask = (estimates[stem][i] ** 2 + 2.5e-11) / total;
        mean += mask;
        masked[bin * 2] = complex[channel][source + bin * 2] * mask;
        masked[bin * 2 + 1] = complex[channel][source + bin * 2 + 1] * mask;
      }
      mean /= SPLEETER_MODEL_BINS;
      for (let bin = SPLEETER_MODEL_BINS; bin < SPLEETER_BINS; bin++) {
        masked[bin * 2] = complex[channel][source + bin * 2] * mean;
        masked[bin * 2 + 1] = complex[channel][source + bin * 2 + 1] * mean;
      }
      fft.completeSpectrum(masked);
      fft.inverseTransform(inverse, masked);
      const at = frame * SPLEETER_HOP;
      for (let i = 0; i < SPLEETER_FFT; i++) output[at + i] += inverse[i * 2] * windowValues[i];
    }
    return Float32Array.from({ length }, (_, i) => weights[i + PAD] > 1e-8 ? output[i + PAD] / weights[i + PAD] : 0);
  });
}
