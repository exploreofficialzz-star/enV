/**
 * Transparent, browser-native vocal effect presets for enV Music Studio.
 * Presets use built-in Web Audio nodes; no dependency, model download or upload is needed.
 * Key-aware AutoPitch entries are advertised in the picker but disabled until a real
 * pitch-correction processor is configured. Do not substitute fixed pitch shifting for tuning.
 */
export type VocalPresetId = "clean" | "warm" | "pop" | "rap" | "dream-hall" | "slapback" | "lofi" | "telephone" | "wide-chorus" | "studio-room" | "ambient" | "megaphone" | "vocal-double" | "podcast" | "acoustic" | "rnb" | "arena" | "natural-tune" | "hard-tune";

/** Fixed graphic-EQ centres. The UI uses a logarithmic frequency axis like conventional studio EQs. */
export const EQ_BAND_FREQUENCIES = [60, 120, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000] as const;
export type EqProfileId = "flat" | "vocal-clarity" | "warm" | "bright" | "soft" | "radio" | "podcast" | "air" | "de-ess" | "intimate" | "lead-vocal" | "low-cut";
export type AmpCharacter = "clean" | "tube" | "crunch" | "fuzz";
export const EQ_PROFILES: Readonly<Record<EqProfileId, { label: string; description: string; bandsDb: readonly number[] }>> = {
  flat: { label: "Flat", description: "Neutral starting point; make small changes by ear.", bandsDb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  "vocal-clarity": { label: "Vocal clarity", description: "Reduce low rumble and add modest speech presence.", bandsDb: [-3, -2, -1, 0, 1, 2, 2.5, 1.5, 1, 0] },
  warm: { label: "Warm", description: "Gentle low-mid weight with smoother upper presence.", bandsDb: [1.5, 1.5, 1, 0.5, 0, -0.5, -1, -1, -0.5, -0.5] },
  bright: { label: "Bright", description: "A restrained presence lift; reduce if sibilance becomes sharp.", bandsDb: [-1, -1, -0.5, 0, 0.5, 1.5, 2, 2, 1.5, 1] },
  soft: { label: "Soft top", description: "Tame upper frequencies for a softer, less bright presentation.", bandsDb: [0, 0, 0.5, 0.5, 0, -0.5, -1, -2, -2.5, -3] },
  radio: { label: "Radio tone", description: "Mid-forward character curve. This is a creative EQ, not noise removal.", bandsDb: [-4, -3, -1, 1.5, 2, 2, 1, -1, -3, -4] },
  podcast: { label: "Podcast speech", description: "Moderate presence with reduced rumble for spoken-word clarity.", bandsDb: [-3, -2, -0.5, 0, 1, 1.5, 1.5, 0.8, 0, 0] },
  air: { label: "Air & openness", description: "A gentle upper-frequency lift; lower it if the mic sounds harsh or sibilant.", bandsDb: [-0.5, -0.5, 0, 0, 0.3, 0.6, 1, 1.5, 2, 1.5] },
  "de-ess": { label: "Sibilance soften", description: "Reduces upper presence as a starting point; it is not a dynamic de-esser.", bandsDb: [0, 0, 0, 0, 0, -0.5, -1.5, -2.5, -2.5, -1.5] },
  intimate: { label: "Intimate vocal", description: "Adds gentle low-mid body with restrained top end.", bandsDb: [0, 0, 0.5, 1, 1.2, 0.8, 0.3, 0, -0.5, -1] },
  "lead-vocal": { label: "Lead vocal", description: "A balanced presence curve designed to help a lead part sit forward.", bandsDb: [-2, -1, 0, 0.5, 1, 1.5, 2, 1.5, 1, 0.5] },
  "low-cut": { label: "Rumble reduction", description: "Reduces the lowest graphic bands; use the high-pass preset for stronger rumble filtering.", bandsDb: [-5, -3, -1.5, -0.5, 0, 0, 0, 0, 0, 0] },
};

export interface VocalProcessingOptions {
  /** Ten-band custom graphic EQ in dB, bounded by the processor to ±9 dB. */
  eqBandsDb?: readonly number[];
  /** Optional per-take cutoff overrides; omission preserves the selected preset's filters. */
  highPassHz?: number;
  /** 20000 Hz is treated as bypass for a manual low-pass override. */
  lowPassHz?: number;
  compressorThresholdDb?: number;
  compressorRatio?: number;
  outputGainDb?: number;
  /** Scales the chosen preset's ambience send from 0 to 150%. */
  reverbAmount?: number;
  /** Scales the chosen preset's delay send from 0 to 150%. */
  delayAmount?: number;
  /** Creative preamp coloration. This is not a physical amplifier/cabinet model. */
  ampCharacter?: AmpCharacter;
  /** Amount of added saturation, 0–100. Clean bypasses the nonlinear stage. */
  ampDrive?: number;
  /** Post-drive amp tone stack, in dB, each bounded to ±6 dB. */
  ampBassDb?: number;
  ampMidDb?: number;
  ampTrebleDb?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export interface VocalPresetDefinition {
  id: VocalPresetId;
  label: string;
  description: string;
  available: boolean;
  requiresPitchProcessor?: boolean;
  highPassHz: number;
  compressorThresholdDb: number;
  compressorRatio: number;
  lowShelfDb?: number;
  presenceDb?: number;
  highShelfDb?: number;
  lowPassHz?: number;
  reverbMix?: number;
  reverbSeconds?: number;
  delayMix?: number;
  delayMs?: number;
  distortion?: number;
  chorusMix?: number;
  chorusRateHz?: number;
  chorusDepthMs?: number;
}

export const VOCAL_PRESETS: readonly VocalPresetDefinition[] = [
  { id: "clean", label: "Clean Studio", description: "High-pass cleanup and gentle dynamics; dry and natural.", available: true, highPassHz: 70, compressorThresholdDb: -20, compressorRatio: 2 },
  { id: "warm", label: "Warm Vocal", description: "Low warmth, soft compression and a short room tail.", available: true, highPassHz: 75, compressorThresholdDb: -23, compressorRatio: 2.8, lowShelfDb: 1.5, presenceDb: 0.5, reverbMix: 0.1, reverbSeconds: 0.75 },
  { id: "pop", label: "Pop Shine", description: "More presence, controlled dynamics and a bright reverb tail.", available: true, highPassHz: 90, compressorThresholdDb: -24, compressorRatio: 3.2, presenceDb: 2, highShelfDb: 1.7, reverbMix: 0.16, reverbSeconds: 1.15 },
  { id: "rap", label: "Rap Punch", description: "Firm compression and clear presence with restrained ambience.", available: true, highPassHz: 100, compressorThresholdDb: -26, compressorRatio: 4.5, presenceDb: 1.5, reverbMix: 0.06, reverbSeconds: 0.55, delayMix: 0.08, delayMs: 92 },
  { id: "dream-hall", label: "Dream Hall", description: "Longer reverb for a spacious, atmospheric performance.", available: true, highPassHz: 80, compressorThresholdDb: -21, compressorRatio: 2.2, reverbMix: 0.3, reverbSeconds: 2.4 },
  { id: "slapback", label: "Slapback Echo", description: "Short echo for character; monitor with headphones to avoid feedback.", available: true, highPassHz: 85, compressorThresholdDb: -22, compressorRatio: 2.8, delayMix: 0.2, delayMs: 105 },
  { id: "lofi", label: "Lo-Fi / Radio", description: "Bandwidth-limited, lightly saturated character effect.", available: true, highPassHz: 180, compressorThresholdDb: -25, compressorRatio: 4, lowPassHz: 5200, distortion: 0.12 },
  { id: "telephone", label: "Telephone / Broadcast", description: "Narrow-band, forward vocal tone for skits, voice-over and radio character.", available: true, highPassHz: 340, compressorThresholdDb: -25, compressorRatio: 3.8, lowPassHz: 3400, presenceDb: 1.2 },
  { id: "wide-chorus", label: "Wide Chorus", description: "Subtle modulated delay for a wider vocal color; use headphones for monitoring.", available: true, highPassHz: 85, compressorThresholdDb: -22, compressorRatio: 2.4, chorusMix: 0.20, chorusRateHz: 0.28, chorusDepthMs: 6 },
  { id: "studio-room", label: "Studio Room", description: "Short, restrained room ambience for a close vocal that does not wash out the words.", available: true, highPassHz: 75, compressorThresholdDb: -22, compressorRatio: 2.4, reverbMix: 0.12, reverbSeconds: 0.45 },
  { id: "ambient", label: "Ambient Dream", description: "Longer ambience with a soft echo tail for atmospheric takes.", available: true, highPassHz: 80, compressorThresholdDb: -21, compressorRatio: 2.4, reverbMix: 0.22, reverbSeconds: 1.75, delayMix: 0.08, delayMs: 280 },
  { id: "megaphone", label: "Megaphone", description: "Narrow-band, gently saturated character vocal; not a speech-enhancement or noise-removal filter.", available: true, highPassHz: 500, compressorThresholdDb: -25, compressorRatio: 4.5, lowPassHz: 2600, distortion: 0.16 },
  { id: "vocal-double", label: "Vocal Double", description: "Subtle short delay and modulation to approximate a doubled vocal; it does not create a second real performance.", available: true, highPassHz: 85, compressorThresholdDb: -22, compressorRatio: 2.5, delayMix: 0.12, delayMs: 22, chorusMix: 0.18, chorusRateHz: 0.12, chorusDepthMs: 3 },
  { id: "podcast", label: "Podcast Clarity", description: "Speech-focused cleanup, controlled dynamics and clear presence for spoken voice.", available: true, highPassHz: 95, compressorThresholdDb: -25, compressorRatio: 3.4, presenceDb: 1.5, highShelfDb: 0.7 },
  { id: "acoustic", label: "Acoustic Warmth", description: "Natural, gentle dynamics with a little body and restrained room ambience.", available: true, highPassHz: 70, compressorThresholdDb: -22, compressorRatio: 2.2, lowShelfDb: 1.2, presenceDb: 0.4, reverbMix: 0.08, reverbSeconds: 0.65 },
  { id: "rnb", label: "R&B Silk", description: "Smooth presence, balanced compression and soft ambience for melodic vocals.", available: true, highPassHz: 80, compressorThresholdDb: -23, compressorRatio: 2.8, presenceDb: 1.1, highShelfDb: 0.5, reverbMix: 0.18, reverbSeconds: 1.35, delayMix: 0.06, delayMs: 180 },
  { id: "arena", label: "Arena Vocal", description: "Broad, roomy performance effect with a longer echo tail; keep the backing level in check.", available: true, highPassHz: 90, compressorThresholdDb: -24, compressorRatio: 3, presenceDb: 1, reverbMix: 0.28, reverbSeconds: 2.1, delayMix: 0.12, delayMs: 320 },
  { id: "natural-tune", label: "Natural AutoPitch", description: "Key-aware pitch correction; requires a configured pitch-correction engine. Not applied in this build.", available: false, requiresPitchProcessor: true, highPassHz: 80, compressorThresholdDb: -20, compressorRatio: 2 },
  { id: "hard-tune", label: "Hard Tune", description: "Fast note snapping; requires a configured real-time pitch-correction engine. Not applied in this build.", available: false, requiresPitchProcessor: true, highPassHz: 80, compressorThresholdDb: -20, compressorRatio: 2 },
] as const;

export function getVocalPreset(id: string): VocalPresetDefinition {
  return VOCAL_PRESETS.find((preset) => preset.id === id) ?? VOCAL_PRESETS[0];
}

/** Connect a mic source to the destination using a chosen preset plus bounded manual EQ/dynamics overrides. */
export function connectVocalPreset(
  context: AudioContext,
  source: AudioNode,
  destination: AudioNode,
  id: string,
  options: VocalProcessingOptions = {},
): () => void {
  const preset = getVocalPreset(id);
  const active = preset.available ? preset : getVocalPreset("clean");
  const highPass = context.createBiquadFilter();
  highPass.type = "highpass"; highPass.frequency.value = clamp(options.highPassHz ?? active.highPassHz, 20, 1000); highPass.Q.value = 0.707;
  source.connect(highPass);
  let tail: AudioNode = highPass;
  const filters: BiquadFilterNode[] = [];
  const addFilter = (type: BiquadFilterType, frequency: number, gainDb = 0) => {
    const filter = context.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency; filter.gain.value = gainDb; filter.Q.value = 0.9;
    tail.connect(filter); tail = filter; filters.push(filter);
  };
  if (active.lowShelfDb) addFilter("lowshelf", 160, active.lowShelfDb);
  if (active.presenceDb) addFilter("peaking", 3200, active.presenceDb);
  if (active.highShelfDb) addFilter("highshelf", 9500, active.highShelfDb);
  const resolvedLowPassHz = options.lowPassHz ?? active.lowPassHz;
  if (resolvedLowPassHz && resolvedLowPassHz < 20_000) addFilter("lowpass", clamp(resolvedLowPassHz, 1000, 20_000));

  // Always build the ten-band stage so a flat curve and a shaped curve have the same signal path.
  // Peaking biquads are available in Web Audio and keep this path local without extra plug-ins.
  const eqValues = EQ_BAND_FREQUENCIES.map((_, index) => clamp(options.eqBandsDb?.[index] ?? 0, -9, 9));
  EQ_BAND_FREQUENCIES.forEach((frequency, index) => {
    const filter = context.createBiquadFilter();
    filter.type = "peaking"; filter.frequency.value = Math.min(frequency, context.sampleRate * 0.45);
    filter.Q.value = 1.05; filter.gain.value = eqValues[index];
    tail.connect(filter); tail = filter; filters.push(filter);
  });

  // A practical three-control preamp tone stack layered after the graphic EQ.
  // Neutral filters are omitted so a flat setup does not add unnecessary nodes.
  const ampBassDb = clamp(options.ampBassDb ?? 0, -6, 6);
  const ampMidDb = clamp(options.ampMidDb ?? 0, -6, 6);
  const ampTrebleDb = clamp(options.ampTrebleDb ?? 0, -6, 6);
  if (ampBassDb !== 0) addFilter("lowshelf", 140, ampBassDb);
  if (ampMidDb !== 0) addFilter("peaking", 850, ampMidDb);
  if (ampTrebleDb !== 0) addFilter("highshelf", 4200, ampTrebleDb);

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = clamp(options.compressorThresholdDb ?? active.compressorThresholdDb, -36, -8);
  compressor.knee.value = 18;
  compressor.ratio.value = clamp(options.compressorRatio ?? active.compressorRatio, 1, 8);
  compressor.attack.value = 0.008; compressor.release.value = 0.16;
  tail.connect(compressor);
  let effectTail: AudioNode = compressor;
  let distortionNode: WaveShaperNode | null = null;
  if (active.distortion) {
    distortionNode = context.createWaveShaper();
    const curve = new Float32Array(2048);
    const amount = 1 + active.distortion * 24;
    for (let i = 0; i < curve.length; i++) {
      const x = (i * 2) / (curve.length - 1) - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    distortionNode.curve = curve; distortionNode.oversample = "2x";
    compressor.connect(distortionNode); effectTail = distortionNode;
  }
  let ampShaper: WaveShaperNode | null = null;
  const ampCharacter = options.ampCharacter ?? "clean";
  const ampDrive = clamp(options.ampDrive ?? 0, 0, 100) / 100;
  if (ampCharacter !== "clean" && ampDrive > 0) {
    ampShaper = context.createWaveShaper();
    const curve = new Float32Array(2048);
    const drive = 1 + ampDrive * 11;
    const tubeNorm = Math.tanh(drive);
    const crunchNorm = Math.atan(drive);
    for (let i = 0; i < curve.length; i++) {
      const x = (i * 2) / (curve.length - 1) - 1;
      if (ampCharacter === "tube") curve[i] = Math.tanh(x * drive) / tubeNorm;
      else if (ampCharacter === "crunch") curve[i] = Math.atan(x * drive) / crunchNorm;
      else curve[i] = clamp(x * drive, -1, 1);
    }
    ampShaper.curve = curve;
    ampShaper.oversample = "4x";
    effectTail.connect(ampShaper);
    effectTail = ampShaper;
  }

  const outputGain = context.createGain();
  outputGain.gain.value = 10 ** (clamp(options.outputGainDb ?? 0, -12, 6) / 20);
  effectTail.connect(outputGain);
  const reverbMix = clamp((active.reverbMix ?? 0) * clamp(options.reverbAmount ?? 100, 0, 150) / 100, 0, 0.8);
  const delayMix = clamp((active.delayMix ?? 0) * clamp(options.delayAmount ?? 100, 0, 150) / 100, 0, 0.8);
  const dryGain = context.createGain(); dryGain.gain.value = 1 - reverbMix * 0.45;
  const mixBus = context.createGain();
  outputGain.connect(dryGain).connect(mixBus);
  // Final guard catches peaks created by cumulative EQ boosts and overlapping wet effects.
  // It is deliberately conservative; it is not advertised as a mastering loudness processor.
  const peakGuard = context.createDynamicsCompressor();
  peakGuard.threshold.value = -2; peakGuard.knee.value = 0; peakGuard.ratio.value = 12;
  peakGuard.attack.value = 0.003; peakGuard.release.value = 0.08;
  mixBus.connect(peakGuard).connect(destination);
  const cleanup: Array<() => void> = [];
  if (reverbMix && active.reverbSeconds) {
    const convolver = context.createConvolver();
    const length = Math.max(1, Math.floor(context.sampleRate * active.reverbSeconds));
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const samples = impulse.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 2.2);
    }
    convolver.buffer = impulse;
    const wet = context.createGain(); wet.gain.value = reverbMix;
    outputGain.connect(convolver).connect(wet).connect(mixBus);
    cleanup.push(() => { try { convolver.disconnect(); wet.disconnect(); } catch { /* Nodes may already be disposed. */ } });
  }
  if (active.chorusMix && active.chorusRateHz && active.chorusDepthMs) {
    const delay = context.createDelay(0.1);
    delay.delayTime.value = 0.025;
    const wet = context.createGain(); wet.gain.value = active.chorusMix;
    const oscillator = context.createOscillator(); oscillator.type = "sine"; oscillator.frequency.value = active.chorusRateHz;
    const depth = context.createGain(); depth.gain.value = active.chorusDepthMs / 1000;
    oscillator.connect(depth).connect(delay.delayTime);
    outputGain.connect(delay).connect(wet).connect(mixBus);
    oscillator.start();
    cleanup.push(() => { try { oscillator.stop(); oscillator.disconnect(); depth.disconnect(); delay.disconnect(); wet.disconnect(); } catch { /* Nodes may already be disposed. */ } });
  }
  if (delayMix && active.delayMs) {
    const delay = context.createDelay(1); delay.delayTime.value = active.delayMs / 1000;
    const wet = context.createGain(); wet.gain.value = delayMix;
    const feedback = context.createGain(); feedback.gain.value = 0.14;
    outputGain.connect(delay); delay.connect(wet).connect(mixBus); delay.connect(feedback).connect(delay);
    cleanup.push(() => { try { feedback.disconnect(); delay.disconnect(); wet.disconnect(); } catch { /* Nodes may already be disposed. */ } });
  }
  return () => {
    for (const dispose of cleanup) dispose();
    for (const node of [source, highPass, ...filters, compressor, distortionNode, ampShaper, outputGain, dryGain, mixBus, peakGuard]) {
      try { node?.disconnect(); } catch { /* Nodes may already be disposed. */ }
    }
  };
}
