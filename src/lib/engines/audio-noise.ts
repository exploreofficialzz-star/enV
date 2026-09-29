export function reduceVoiceNoiseSamples(samples: Float32Array, sampleRate: number, strength = 1) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("Sample rate must be positive.");
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error("Noise reduction strength must be between 0 and 1.");
  if (!samples.length) return new Float32Array();
  const out = new Float32Array(samples.length);
  const analysisFrames = Math.min(samples.length, Math.max(1, Math.floor(sampleRate * 0.25)));
  let noiseRms = 0;
  for (let i = 0; i < analysisFrames; i++) noiseRms += samples[i] * samples[i];
  noiseRms = Math.sqrt(noiseRms / analysisFrames);
  const threshold = Math.max(0.004, noiseRms * (2.2 + strength * 1.8));
  const attack = Math.max(1, Math.floor(sampleRate * 0.008));
  const release = Math.max(1, Math.floor(sampleRate * 0.12));
  let gain = 1, prevX = 0, prevY = 0;
  const cutoff = 80;
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const hp = alpha * (prevY + x - prevX);
    prevX = x; prevY = hp;
    const level = Math.abs(hp);
    const target = level < threshold ? 0.08 + 0.92 * Math.min(1, level / Math.max(threshold, 1e-9)) : 1;
    const step = target < gain ? 1 / attack : 1 / release;
    gain += (target - gain) * Math.min(1, step);
    out[i] = hp * (1 - strength * (1 - gain));
  }
  return out;
}

export function humReduceSamples(samples: Float32Array, sampleRate: number) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("Sample rate must be positive.");
  const out = new Float32Array(samples.length);
  const filters = [50, 100];
  const states = filters.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
  for (let i = 0; i < samples.length; i++) {
    let x = samples[i];
    for (let f = 0; f < filters.length; f++) {
      const freq = filters[f], q = 8, w0 = 2 * Math.PI * freq / sampleRate, alpha = Math.sin(w0) / (2 * q);
      const b0 = 1, b1 = -2 * Math.cos(w0), b2 = 1, a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
      const st = states[f];
      const y = (b0/a0)*x + (b1/a0)*st.x1 + (b2/a0)*st.x2 - (a1/a0)*st.y1 - (a2/a0)*st.y2;
      st.x2=st.x1; st.x1=x; st.y2=st.y1; st.y1=y; x=y;
    }
    out[i]=x;
  }
  return out;
}
