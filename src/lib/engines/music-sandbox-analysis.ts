import type { SandboxAnalysis, SandboxAudio, SandboxTrack } from "./music-sandbox";

const MAX_DECODE_BYTES = 80 * 1024 * 1024;
const MAX_SAMPLE_SECONDS = 45;

/** A conservative budget for the decoder, independent of the compressed file size. */
export function sandboxAnalysisLimit(audio: SandboxAudio, duration: number | null): string | null {
  if (!duration || !Number.isFinite(duration) || duration < 3)
    return "A readable recording of at least 3 seconds is needed.";
  const rate = Math.max(audio.sampleRate || 48000, 48000);
  const channels = Math.max(audio.channels || 2, 2);
  if (rate > 192000 || channels > 8 || duration * rate * channels * 4 > MAX_DECODE_BYTES)
    return "This recording is too large for safe local analysis on this device.";
  return null;
}

/** A simple, reviewable grouping derived from BPM, not a musical classification. */
export function sandboxTempoBand(tempo: number | null): string {
  if (tempo === null || !Number.isFinite(tempo) || tempo < 1 || tempo > 400) return "";
  return tempo < 90 ? "slow" : tempo < 130 ? "mid" : "fast";
}

/** Only fill empty fields; imported and manually edited values always win. */
export function applySandboxAnalysis(track: SandboxTrack, analysis: SandboxAnalysis): SandboxTrack {
  const next = { ...track, tags: { ...track.tags }, provenance: { ...track.provenance }, analysis };
  if (analysis.status === "complete") {
    if (next.provenance.tempo_bpm === "estimated" || (next.tags.tempo_bpm === null && next.provenance.tempo_bpm !== "edited" && analysis.tempo !== null)) {
      next.tags.tempo_bpm = analysis.tempo;
      next.provenance.tempo_bpm = "estimated";
    }
    if (next.provenance.key === "estimated" || (!next.tags.key.trim() && next.provenance.key !== "edited" && analysis.key)) {
      next.tags.key = analysis.key || "";
      next.provenance.key = "estimated";
    }
    if (next.provenance.tempo_band === "estimated" || (!next.tags.tempo_band.trim() && next.provenance.tempo_band !== "edited")) {
      const band = sandboxTempoBand(next.tags.tempo_bpm);
      if (band || next.provenance.tempo_band === "estimated") {
        next.tags.tempo_band = band;
        next.provenance.tempo_band = "estimated";
      }
    }
  }
  return next;
}

export async function analyzeSandboxAudio(
  blob: Blob, audio: SandboxAudio, duration: number | null, signal: AbortSignal,
): Promise<SandboxAnalysis> {
  const limit = sandboxAnalysisLimit(audio, duration);
  if (limit) return { status: "unavailable", reason: limit };
  signal.throwIfAborted();
  let context: AudioContext | undefined;
  try {
    try { context = new AudioContext({ sampleRate: 16000 }); }
    catch { context = new AudioContext(); }
    const data = await blob.arrayBuffer();
    signal.throwIfAborted();
    const decoded = await context.decodeAudioData(data);
    signal.throwIfAborted();
    // Reject inaccurate metadata before copying any decoded audio into the worker.
    if (decoded.duration * Math.max(decoded.sampleRate, audio.sampleRate || 48000, 48000) * Math.max(decoded.numberOfChannels, 2) * 4 > MAX_DECODE_BYTES)
      return { status: "unavailable", reason: "This recording is too large for safe local analysis on this device." };
    const count = Math.min(decoded.length, Math.floor(decoded.sampleRate * MAX_SAMPLE_SECONDS));
    const start = Math.max(0, Math.floor((decoded.length - count) * 0.25));
    const samples = new Float32Array(count);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const source = decoded.getChannelData(channel);
      for (let i = 0; i < count; i++) samples[i] += source[start + i]! / decoded.numberOfChannels;
    }
    const sampleRate = decoded.sampleRate;
    await context.close();
    context = undefined;
    signal.throwIfAborted();
    return await new Promise<SandboxAnalysis>((resolve, reject) => {
      const worker = new Worker(new URL("../../workers/music-sandbox-audio.ts", import.meta.url), { type: "module" });
      const finish = (result: SandboxAnalysis) => { cleanup(); resolve(result); };
      const abort = () => { cleanup(); reject(new DOMException("Analysis cancelled", "AbortError")); };
      const timeout = setTimeout(() => finish({ status: "unavailable", reason: "Analysis took too long on this device." }), 15000);
      const cleanup = () => { clearTimeout(timeout); signal.removeEventListener("abort", abort); worker.terminate(); };
      signal.addEventListener("abort", abort, { once: true });
      worker.onmessage = (event: MessageEvent<SandboxAnalysis>) => finish(event.data);
      worker.onerror = () => finish({ status: "unavailable", reason: "Audio analysis is unavailable in this browser." });
      worker.postMessage({ samples, sampleRate }, [samples.buffer]);
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return { status: "unavailable", reason: "This browser could not analyze the audio format." };
  } finally {
    if (context && context.state !== "closed") await context.close().catch(() => {});
  }
}
