import { browserSeparationLimitSeconds } from "../engines/audio-studio.ts";
import { encodeSongSection } from "./song-audio-export.ts";

export type StemName = "Drums" | "Bass" | "Other" | "Vocals";
export const STEM_NAMES: readonly StemName[] = ["Drums", "Bass", "Other", "Vocals"];
export type SongStem = { name: StemName; blob: Blob; duration_seconds: number };
type Separator = (input: AudioBuffer, signal: AbortSignal, onProgress: (value: number, detail?: string) => void, canceled: () => boolean) => Promise<AudioBuffer[]>;

function wavHeader(frames: number, sampleRate: number, channels: number): Uint8Array {
  const bytes = new Uint8Array(44), view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  const dataSize = frames * channels * 2;
  if (!Number.isSafeInteger(dataSize) || dataSize > 0xffffffff - 36) throw new Error("The separated WAV is too large.");
  text(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, dataSize, true);
  return bytes;
}

/** Join overlapping model windows as continuous PCM, preserving the tail and channel order. */
export async function separateSongChunks(input: AudioBuffer, selected: readonly StemName[], signal: AbortSignal, separator: Separator, createBuffer: (channels: number, frames: number, rate: number) => AudioBuffer, blockSeconds: number, onProgress: (fraction: number, detail?: string) => void): Promise<SongStem[]> {
  if (!selected.length || selected.some((name) => !STEM_NAMES.includes(name)) || new Set(selected).size !== selected.length) throw new Error("Choose at least one valid stem.");
  if (!Number.isFinite(blockSeconds) || blockSeconds < 1 || input.duration <= 0 || input.duration > 900) throw new Error("The audio duration is outside the supported range.");
  const chunks = new Map<StemName, Uint8Array[]>(selected.map((name) => [name, []]));
  const frameCounts = new Map<StemName, number>(selected.map((name) => [name, 0]));
  const blockFrames = Math.max(1, Math.round(blockSeconds * input.sampleRate));
  const paddingFrames = Math.min(Math.round(input.sampleRate * 2), Math.floor(blockFrames / 2));
  const totalBlocks = Math.ceil(input.length / blockFrames);
  for (let index = 0, start = 0; start < input.length; index++, start += blockFrames) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const end = Math.min(input.length, start + blockFrames);
    const paddedStart = Math.max(0, start - paddingFrames), paddedEnd = Math.min(input.length, end + paddingFrames);
    const chunk = createBuffer(input.numberOfChannels, paddedEnd - paddedStart, input.sampleRate);
    for (let channel = 0; channel < input.numberOfChannels; channel++) chunk.copyToChannel(input.getChannelData(channel).subarray(paddedStart, paddedEnd), channel);
    const output = await separator(chunk, signal, (percent, detail) => onProgress((index + percent / 100) / totalBlocks, detail), () => signal.aborted);
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (output.length !== STEM_NAMES.length || output.some((item) => item.numberOfChannels !== 2 || item.sampleRate !== 44_100)) throw new Error("The separator returned an unexpected stem format.");
    const startSeconds = (start - paddedStart) / input.sampleRate;
    const endSeconds = (end - paddedStart) / input.sampleRate;
    for (const name of selected) {
      const stem = output[STEM_NAMES.indexOf(name)];
      if (endSeconds > stem.duration + 1 / stem.sampleRate) throw new Error("The separator returned an incomplete audio window.");
      const bytes = encodeSongSection([stem.getChannelData(0), stem.getChannelData(1)], stem.sampleRate, startSeconds, endSeconds);
      const pcm = bytes.slice(44);
      chunks.get(name)!.push(pcm);
      frameCounts.set(name, frameCounts.get(name)! + pcm.length / 4);
    }
    onProgress((index + 1) / totalBlocks, "Separating the full track");
  }
  return selected.map((name) => {
    const frames = frameCounts.get(name)!;
    const parts = chunks.get(name)!.map((bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    return { name, blob: new Blob([wavHeader(frames, 44_100, 2).buffer as ArrayBuffer, ...parts], { type: "audio/wav" }), duration_seconds: frames / 44_100 };
  });
}

export async function separateSongInBrowser(file: File, durationHint: number | null, selected: readonly StemName[], signal: AbortSignal, onProgress: (fraction: number, detail?: string) => void): Promise<SongStem[]> {
  const estimatedDuration = durationHint && durationHint > 0 ? durationHint : file.size * 8 / 32_000;
  const device = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const isMobile = device.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const maxBlock = browserSeparationLimitSeconds(device.deviceMemory, isMobile);
  const maxOutputBytes = isMobile || (device.deviceMemory && device.deviceMemory <= 4) ? 192 * 1024 * 1024 : 480 * 1024 * 1024;
  if (!Number.isFinite(estimatedDuration) || estimatedDuration <= 0 || estimatedDuration > 900) throw new Error("Local separation supports tracks up to 15 minutes.");
  if (estimatedDuration * 44_100 * 4 * selected.length > maxOutputBytes) throw new Error("The selected stems exceed this device's memory budget. Select fewer stems or use the local companion.");
  const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error("This browser cannot decode audio on this device.");
  const context = new AudioContextConstructor();
  try {
    if (estimatedDuration * context.sampleRate * 2 * 4 > 180 * 1024 * 1024) throw new Error("The decoded track exceeds this browser's memory budget. Use the local companion for longer tracks.");
    onProgress(0, "Decoding the complete track");
    const input = await context.decodeAudioData(await file.arrayBuffer());
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (input.duration > 900 || input.length * input.numberOfChannels * 4 > 180 * 1024 * 1024 || input.duration * 44_100 * 4 * selected.length > maxOutputBytes) throw new Error("The decoded track or selected stems exceed this device's memory budget.");
    const worker = new Worker(new URL("../../workers/song-separation.worker.ts", import.meta.url), { type: "module" });
    const separator: Separator = async (chunk, abort, report) => {
      const frames = Math.ceil(chunk.duration * 44_100);
      const offline = new OfflineAudioContext(2, frames, 44_100);
      const source = offline.createBufferSource(); source.buffer = chunk; source.connect(offline.destination); source.start();
      const stereo = await offline.startRendering();
      if (abort.aborted) throw new DOMException("Cancelled", "AbortError");
      const channels = [stereo.getChannelData(0).slice(), stereo.getChannelData(1).slice()];
      const id = crypto.randomUUID();
      return await new Promise<AudioBuffer[]>((resolve, reject) => {
        const cleanup = () => { abort.removeEventListener("abort", onAbort); worker.removeEventListener("message", onMessage); worker.removeEventListener("error", onError); };
        const onAbort = () => { cleanup(); worker.terminate(); reject(new DOMException("Cancelled", "AbortError")); };
        const onError = () => { cleanup(); reject(new Error("The separation worker stopped unexpectedly. Try a smaller track or the local companion.")); };
        const onMessage = (event: MessageEvent) => {
          if (event.data?.id !== id) return;
          if (event.data.type === "progress") { report(event.data.fraction, event.data.stage); return; }
          cleanup();
          if (event.data.type === "error") { reject(new Error(event.data.error)); return; }
          try {
            const stems = event.data.stems as Float32Array[][];
            if (!Array.isArray(stems) || stems.length !== 4 || stems.some((item) => item.length !== 2 || item.some((channel) => !(channel instanceof Float32Array) || channel.length !== frames))) throw new Error("The separator returned incomplete audio.");
            resolve(stems.map((item) => { const buffer = context.createBuffer(2, frames, 44_100); buffer.getChannelData(0).set(item[0]); buffer.getChannelData(1).set(item[1]); return buffer; }));
          } catch (error) { reject(error); }
        };
        abort.addEventListener("abort", onAbort, { once: true });
        worker.addEventListener("message", onMessage); worker.addEventListener("error", onError);
        if (abort.aborted) { onAbort(); return; }
        worker.postMessage({ id, channels }, channels.map((channel) => channel.buffer));
      });
    };
    try {
      return await separateSongChunks(input, selected, signal, separator, (channels, frames, rate) => context.createBuffer(channels, frames, rate), Math.min(7, maxBlock - 4), onProgress);
    } finally { worker.terminate(); }
  } finally { await context.close().catch(() => undefined); }
}
