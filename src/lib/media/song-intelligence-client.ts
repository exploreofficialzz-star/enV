import type { BrowserSongIntelligence } from "./song-intelligence";

type AudioContextType = typeof AudioContext;
type DecodedSong = { samples: Float32Array; sampleRate: number; downmix: BrowserSongIntelligence["downmix"] };

/** Decode the complete recording at the models' native 16 kHz, with a bounded working set. */
export async function decodeSongForIntelligence(file: File, durationHint: number | null, signal: AbortSignal): Promise<DecodedSong> {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextType }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error("This browser cannot decode audio on this device.");
  const estimateSeconds = durationHint && durationHint > 0 ? durationHint : file.size * 8 / 32_000;
  if (!Number.isFinite(estimateSeconds) || estimateSeconds > 15 * 60) throw new Error("Local audio models support tracks up to 15 minutes.");
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const budget = deviceMemory && deviceMemory <= 4 ? 128 * 1024 * 1024 : 180 * 1024 * 1024;
  let context: AudioContext;
  try { context = new AudioContextConstructor({ sampleRate: 16_000 }); }
  catch { context = new AudioContextConstructor(); }
  try {
    if (estimateSeconds * context.sampleRate * 3 * 4 > budget) throw new Error("This browser cannot decode the full track within its memory budget. Use the local companion for larger tracks.");
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (decoded.duration > 900 || decoded.length * (decoded.numberOfChannels + 1) * 4 > budget) throw new Error("The decoded track exceeds this device's memory or duration limit.");
    let audio = decoded;
    if (decoded.sampleRate !== 16_000) {
      const offline = new OfflineAudioContext(Math.min(decoded.numberOfChannels, 2), Math.ceil(decoded.duration * 16_000), 16_000);
      const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
      audio = await offline.startRendering();
    }
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));
    const samples = new Float32Array(audio.length);
    const powers = channels.map(() => 0);
    let mixedPower = 0;
    for (let i = 0; i < samples.length; i++) {
      let mixed = 0;
      for (let channel = 0; channel < channels.length; channel++) {
        const sample = channels[channel][i];
        if (!Number.isFinite(sample)) throw new Error("Decoded audio contains invalid samples.");
        powers[channel] += sample * sample;
        mixed += sample / channels.length;
      }
      samples[i] = mixed;
      mixedPower += mixed * mixed;
    }
    const strongest = powers.indexOf(Math.max(...powers));
    const cancellation = channels.length > 1 && powers[strongest] > 1e-8 && mixedPower < powers[strongest] * 0.0025;
    if (cancellation) samples.set(channels[strongest]);
    return { samples, sampleRate: 16_000, downmix: channels.length === 1 ? "mono" : cancellation ? "strongest_channel" : "stereo_average" };
  } finally { await context.close().catch(() => undefined); }
}

export function createSongIntelligenceWorker(): Worker {
  return new Worker(new URL("../../workers/song-intelligence.worker.ts", import.meta.url), { type: "module" });
}

export async function runSongIntelligence(worker: Worker, file: File, durationHint: number | null, signal: AbortSignal, onProgress: (stage: string, fraction: number) => void, options: { sound?: boolean; speech?: boolean } = {}): Promise<BrowserSongIntelligence> {
  onProgress("Decoding the complete track", 0);
  const decoded = await decodeSongForIntelligence(file, durationHint, signal);
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => { signal.removeEventListener("abort", abort); worker.removeEventListener("message", message); worker.removeEventListener("error", failed); };
    const abort = () => { cleanup(); worker.terminate(); reject(new DOMException("Cancelled", "AbortError")); };
    const failed = () => { cleanup(); reject(new Error("The local audio model worker stopped. Try again or use the local companion.")); };
    const message = (event: MessageEvent) => {
      if (event.data?.id !== id) return;
      if (event.data.type === "progress") onProgress(event.data.stage, event.data.fraction);
      if (event.data.type === "error") { cleanup(); reject(new Error(event.data.error)); }
      if (event.data.type === "result") { cleanup(); resolve(event.data.result as BrowserSongIntelligence); }
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.addEventListener("message", message);
    worker.addEventListener("error", failed);
    if (signal.aborted) { abort(); return; }
    worker.postMessage({ id, ...decoded, sound: options.sound ?? true, speech: options.speech ?? true }, [decoded.samples.buffer]);
  });
}
