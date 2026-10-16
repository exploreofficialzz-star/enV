import { useEffect, useRef, useState } from "react";
import { strToU8, zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob } from "@/lib/utils";
import { browserSeparationLimitSeconds, estimateBpm, estimateBrowserSeparationWorkingSetBytes, estimateKey, isSupportedDemucsStemTensorDims, suggestCapoShapes, suggestDiatonicChords } from "@/lib/engines/audio-studio";
import { deleteStoredMusicTake, deleteStoredMusicTakes, listStoredMusicTakes, musicSourceKey, saveStoredMusicTake, type StoredMusicTake } from "@/lib/engines/audio-music-storage";

type StudioMode = "separate" | "mixer" | "practice" | "duet" | "karaoke";
type StemTrack = { id: string; name: string; buffer: AudioBuffer; volume: number; muted: boolean; solo: boolean };
type VocalTake = { id: string; name: string; blob: Blob; startAt: number; url: string; sourceKey: string; savedLocally: boolean };
type LiveMixerState = { context: AudioContext; sources: AudioBufferSourceNode[]; gains: Map<string, GainNode>; masterGain: GainNode; startOffset: number; startedAt: number; playbackRate: number; loopStart: number; loopEnd: number; looping: boolean };
type OrtRuntime = { Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown; InferenceSession: { create: (source: Uint8Array, options?: Record<string, unknown>) => Promise<{ inputNames: string[]; outputNames: string[]; run: (inputs: Record<string, unknown>) => Promise<Record<string, { data: Float32Array; dims?: number[] }>> }> }; env: { wasm: { wasmPaths?: string; numThreads?: number; proxy?: boolean }; webgpu?: { powerPreference?: string } } };

const MODEL_URL = "https://huggingface.co/StemSplitio/htdemucs-onnx/resolve/main/htdemucs_fp16weights.onnx";
const ORT_BASE_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
const MODEL_SAMPLE_RATE = 44100;
const MODEL_DOWNLOAD_ESTIMATE_BYTES = 166_000_000; // Approximate FP16 model size; the progress label marks estimates.
const CHUNK_SAMPLES = Math.round(7.8 * MODEL_SAMPLE_RATE);
const CHUNK_OVERLAP = Math.floor(CHUNK_SAMPLES / 4);
const CHUNK_STRIDE = CHUNK_SAMPLES - CHUNK_OVERLAP;
const STEM_NAMES = ["Drums", "Bass", "Other", "Vocals"];
let runtimePromise: Promise<OrtRuntime> | null = null;
let sessionPromise: Promise<Awaited<ReturnType<OrtRuntime["InferenceSession"]["create"]>>> | null = null;

function contextConstructor() {
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const Ctx = contextConstructor();
  if (!Ctx) throw new Error("This browser does not support Web Audio.");
  const context = new Ctx();
  try { return await context.decodeAudioData(await blob.arrayBuffer()); }
  finally { await context.close().catch(() => undefined); }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const array = new ArrayBuffer(bytes);
  const view = new DataView(array);
  const writeString = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  writeString(0, "RIFF"); view.setUint32(4, bytes - 8, true); writeString(8, "WAVE"); writeString(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); writeString(36, "data"); view.setUint32(40, bytes - 44, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
    const sample = Math.max(-1, Math.min(1, buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1))[i]));
    view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true); offset += 2;
  }
  return new Blob([array], { type: "audio/wav" });
}

async function getOrtRuntime(): Promise<OrtRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      // Load a browser backend only after the user explicitly starts separation.
      // ONNX Runtime documents a dedicated WebGPU entry point; use the WASM build
      // directly when WebGPU is unavailable, and retain a WASM import fallback if
      // the WebGPU bundle itself cannot load on this browser.
      const hasWebGpu = Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
      const preferredUrl = `${ORT_BASE_URL}${hasWebGpu ? "ort.webgpu.min.mjs" : "ort.wasm.min.mjs"}`;
      let runtime: OrtRuntime;
      try {
        runtime = await import(/* @vite-ignore */ preferredUrl) as OrtRuntime;
      } catch (primaryError) {
        if (!hasWebGpu) throw primaryError;
        runtime = await import(/* @vite-ignore */ `${ORT_BASE_URL}ort.wasm.min.mjs`) as OrtRuntime;
      }
      runtime.env.wasm.wasmPaths = ORT_BASE_URL;
      runtime.env.wasm.numThreads = window.crossOriginIsolated ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)) : 1;
      if (runtime.env.webgpu) runtime.env.webgpu.powerPreference = "high-performance";
      return runtime;
    })().catch((error) => { runtimePromise = null; throw error; });
  }
  return runtimePromise;
}

async function getModelSession(
  signal: AbortSignal,
  onProgress: (value: number, detail?: string) => void,
  canceled: () => boolean,
): Promise<Awaited<ReturnType<OrtRuntime["InferenceSession"]["create"]>>> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const runtime = await getOrtRuntime();
    const response = await fetch(MODEL_URL, { signal, cache: "force-cache" });
    if (!response.ok) throw new Error(`Could not download the local separation model (HTTP ${response.status}). Check the connection and try again.`);
    const contentLength = Number(response.headers.get("content-length")) || 0;
    const expectedBytes = contentLength || MODEL_DOWNLOAD_ESTIMATE_BYTES;
    const reader = response.body?.getReader();
    let bytes: Uint8Array;
    if (reader) {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        if (canceled()) throw new Error("Separation canceled.");
        const { done, value } = await reader.read();
        if (done) break;
        if (value) { chunks.push(value); total += value.length; }
        const percent = Math.min(15, Math.max(1, Math.round(total / expectedBytes * 15)));
        const receivedMb = (total / 1_000_000).toFixed(1);
        const sizeText = contentLength ? `${(contentLength / 1_000_000).toFixed(1)} MB total` : `about 166 MB estimated`;
        onProgress(percent, `Downloading local model… ${receivedMb} MB received (${sizeText}).`);
      }
      bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    } else {
      bytes = new Uint8Array(await response.arrayBuffer());
      onProgress(15, `Model download complete (${(bytes.byteLength / 1_000_000).toFixed(1)} MB received).`);
    }
    if (canceled()) throw new Error("Separation canceled.");
    onProgress(18);
    const hasWebGpu = Boolean((navigator as Navigator & { gpu?: unknown }).gpu && runtime.env.webgpu);
    if (hasWebGpu) {
      try {
        return await runtime.InferenceSession.create(bytes, { executionProviders: ["webgpu", "wasm"], graphOptimizationLevel: "all" });
      } catch {
        // Some GPUs expose WebGPU but fail when compiling a particular operator.
        // Retry in WASM so that a provider mismatch isn't a dead end.
        return await runtime.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      }
    }
    return await runtime.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  })();
  try { return await sessionPromise; }
  catch (error) { sessionPromise = null; throw error; }
}

function makeTransitionWindow() {
  const window = new Float32Array(CHUNK_SAMPLES).fill(1);
  for (let i = 0; i < CHUNK_OVERLAP; i++) {
    const weight = (i + 1) / (CHUNK_OVERLAP + 1);
    window[i] = weight;
    window[CHUNK_SAMPLES - 1 - i] = weight;
  }
  return window;
}

async function modelReady(
  signal: AbortSignal,
  onProgress: (value: number, detail?: string) => void,
  canceled: () => boolean,
): Promise<Awaited<ReturnType<OrtRuntime["InferenceSession"]["create"]>>> {
  try { return await getModelSession(signal, onProgress, canceled); }
  catch (error) {
    // Clear a failed/aborted request so the next explicit attempt can retry.
    sessionPromise = null;
    throw error;
  }
}

async function separateWithDemucs(
  input: AudioBuffer,
  signal: AbortSignal,
  onProgress: (value: number, detail?: string) => void,
  canceled: () => boolean,
): Promise<AudioBuffer[]> {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const isMobile = navigatorWithMemory.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const maxSeconds = browserSeparationLimitSeconds(navigatorWithMemory.deviceMemory, isMobile);
  if (input.duration > maxSeconds) {
    const estimateGb = estimateBrowserSeparationWorkingSetBytes(maxSeconds) / 1_000_000_000;
    throw new Error(`This browser is currently limited to ${maxSeconds} seconds per separation based on reported device memory (about ${estimateGb.toFixed(2)} GB estimated working set, before extra runtime/driver allocations). Trim the track or try a higher-memory desktop. Device-memory data is only a hint.`);
  }
  const Ctx = contextConstructor();
  if (!Ctx) throw new Error("This browser does not support Web Audio.");
  let stereo: AudioBuffer = input;
  if (input.sampleRate !== MODEL_SAMPLE_RATE || input.numberOfChannels !== 2) {
    const frames = Math.max(1, Math.ceil(input.duration * MODEL_SAMPLE_RATE));
    const offline = new OfflineAudioContext(2, frames, MODEL_SAMPLE_RATE);
    const source = offline.createBufferSource(); source.buffer = input;
    source.connect(offline.destination); source.start();
    stereo = await offline.startRendering();
  }
  if (stereo.length > MODEL_SAMPLE_RATE * maxSeconds) throw new Error(`The resampled track exceeds this browser's ${maxSeconds}-second local model limit. Trim it and retry.`);
  const left = stereo.getChannelData(0), right = stereo.getChannelData(1);
  const runtime = await getOrtRuntime();
  const session = await modelReady(signal, onProgress, canceled);
  const outputNames = session.outputNames;
  const outputName = outputNames.find((name) => name.toLowerCase().includes("stem")) ?? outputNames[0];
  if (!outputName) throw new Error("The separation model did not expose a stems output.");
  const total = stereo.length;
  const stemData = Array.from({ length: 4 }, () => [new Float32Array(total), new Float32Array(total)]);
  const weights = new Float32Array(total);
  const transition = makeTransitionWindow();
  const chunk = new Float32Array(2 * CHUNK_SAMPLES);
  const totalChunks = Math.ceil(total / CHUNK_STRIDE);
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    if (signal.aborted || canceled()) throw new Error("Separation canceled.");
    const start = chunkIndex * CHUNK_STRIDE;
    const end = Math.min(start + CHUNK_SAMPLES, total);
    const length = end - start;
    chunk.fill(0);
    chunk.subarray(0, length).set(left.subarray(start, end));
    chunk.subarray(CHUNK_SAMPLES, CHUNK_SAMPLES + length).set(right.subarray(start, end));
    const inputName = session.inputNames.find((name) => name.toLowerCase().includes("mix")) ?? session.inputNames[0];
    if (!inputName) throw new Error("The separation model did not expose an audio input.");
    const result = await session.run({ [inputName]: new runtime.Tensor("float32", chunk, [1, 2, CHUNK_SAMPLES]) });
    const output = result[outputName];
    if (!output?.data || output.data.length < 4 * 2 * CHUNK_SAMPLES || !isSupportedDemucsStemTensorDims(output.dims, CHUNK_SAMPLES)) {
      throw new Error(`The loaded model returned an unsupported stem tensor (${output?.dims?.join("×") ?? "shape unavailable"}); separation stopped instead of exporting broken audio.`);
    }
    // Demucs output order: drums, bass, other, vocals. The overlapping chunk blend
    // attenuates edge artifacts that users report with naive chunk concatenation.
    for (let stem = 0; stem < 4; stem++) for (let channel = 0; channel < 2; channel++) {
      const sourceOffset = (stem * 2 + channel) * CHUNK_SAMPLES;
      const target = stemData[stem][channel];
      for (let i = 0; i < length; i++) target[start + i] += output.data[sourceOffset + i] * transition[i];
    }
    for (let i = 0; i < length; i++) weights[start + i] += transition[i];
    onProgress(18 + Math.round((chunkIndex + 1) / totalChunks * 82));
    // Yield so progress/cancel controls remain responsive on CPU-only devices.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  if (canceled()) throw new Error("Separation canceled.");
  const context = new Ctx();
  try {
    return stemData.map((channels) => {
      const buffer = context.createBuffer(2, total, MODEL_SAMPLE_RATE);
      for (let channel = 0; channel < 2; channel++) {
        const target = buffer.getChannelData(channel), source = channels[channel];
        for (let i = 0; i < total; i++) target[i] = source[i] / Math.max(weights[i], 1e-8);
      }
      return buffer;
    });
  } finally { await context.close().catch(() => undefined); }
}

function makeId() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function currentLiveMixerPosition(live: LiveMixerState | null): number | null {
  if (!live) return null;
  const elapsed = Math.max(0, live.context.currentTime - live.startedAt) * live.playbackRate;
  const position = live.startOffset + elapsed;
  if (live.looping && live.loopEnd > live.loopStart && position >= live.loopEnd) {
    return live.loopStart + ((position - live.loopStart) % (live.loopEnd - live.loopStart));
  }
  return position;
}

const STUDIO_LINKS: Array<{ title: string; href: string; text: string }> = [
  { title: "Audio Convert Studio", href: "/tools/audio/audio-convert-studio", text: "WAV conversion, channels, rate and format workflows." },
  { title: "Audio Edit Studio", href: "/tools/audio/audio-edit-studio", text: "Trim, fades, normalize, noise and tonal cleanup." },
  { title: "Audio Analyze Studio", href: "/tools/audio/audio-analyze-studio", text: "Inspect files, levels, silence, waveform, LUFS estimate and spectrogram." },
  { title: "Audio Calc Studio", href: "/tools/audio/audio-calc-studio", text: "Estimate file size, bitrate and practice timing." },
  { title: "Audio Transcribe Studio", href: "/tools/audio/audio-transcribe-studio", text: "Transcription and timed subtitle jobs, when STT is configured." },
  { title: "Audio Import Studio", href: "/tools/audio/audio-import-studio", text: "Bring in local files or record a take in the browser." },
  { title: "Audio Platform Guide Studio", href: "/tools/audio/audio-platform-guide-studio", text: "Podcast, Discord, Spotify, Instagram and Apple Music delivery guidance." },
];

export function AudioStudioGuide({ studio = "platform", initialPlatform }: { studio?: string; initialPlatform?: string }) {
  const headings: Record<string, { title: string; summary: string }> = {
    convert: { title: "Audio Convert Studio", summary: "Choose a reliable local WAV path or a clearly labeled server conversion when FFmpeg is configured." },
    edit: { title: "Audio Edit Studio", summary: "Make non-destructive choices on the original file, preview results, then export a new WAV." },
    analyze: { title: "Audio Analyze Studio", summary: "Inspect real decoded audio; loudness is marked approximate unless a verified BS.1770 engine is configured." },
    calc: { title: "Audio Calc Studio", summary: "Use transparent math for file size, bitrate and timing without uploading media." },
    transcribe: { title: "Audio Transcribe Studio", summary: "Speech recognition depends on the configured transcription endpoint; setup and connectivity errors are shown by the transcription tool." },
    import: { title: "Audio Import Studio", summary: "Select local files or record with microphone permission. No DRM streaming downloaders are offered." },
    platform: { title: "Audio Platform Guide Studio", summary: "Guidance only, not a guarantee of platform acceptance; confirm delivery specs with the destination service." },
  };
  const info = headings[studio] ?? headings.platform;
  const [platform, setPlatform] = useState(initialPlatform ?? "podcast");
  const presets: Record<string, { sample: string; format: string; loudness: string; bitrate: string; note: string }> = {
    podcast: { sample: "44.1 or 48 kHz", format: "MP3/AAC for distribution; WAV for master", loudness: "−16 LUFS stereo / −19 LUFS mono are common podcast targets", bitrate: "128–192 kbps stereo is common", note: "Podcast hosting requirements vary. Keep a high-quality master and check the host's published requirements." },
    discord: { sample: "44.1 or 48 kHz source", format: "Opus is used in voice paths", loudness: "No universal upload LUFS target", bitrate: "Voice bitrate depends on server/channel configuration", note: "Call quality is primarily controlled by the call and channel configuration." },
    spotify: { sample: "Preserve the production master; 44.1 kHz is common", format: "Lossless delivery master (WAV/FLAC) where requested", loudness: "−14 LUFS is a playback-normalization reference, not a mastering requirement", bitrate: "Keep a lossless master", note: "Streaming services transcode for playback; normalization does not mean every master should be forced to one loudness." },
    instagram: { sample: "44.1 or 48 kHz source", format: "AAC in typical video workflows", loudness: "No universal creator-side LUFS acceptance target", bitrate: "Keep the highest-quality source supported by your editor", note: "Audio normally arrives as part of video; the platform may re-encode it." },
    "apple-music": { sample: "Use the native master resolution supported by the distributor", format: "WAV/PCM or the distributor's requested lossless format", loudness: "No universal delivery LUFS target", bitrate: "Do not convert to a lower bitrate unless your workflow requires it", note: "Delivery specifications depend on distributor and asset type; this guide is not an acceptance guarantee." },
    youtube: { sample: "48 kHz is a practical video-workflow target", format: "AAC, Opus or PCM depending on the video pipeline", loudness: "Playback normalization varies; avoid clipping", bitrate: "Keep high-quality source audio; the video encoder controls final output", note: "The uploaded video is commonly transcoded. These are workflow hints, not a universal platform acceptance guarantee." },
    tiktok: { sample: "44.1 or 48 kHz source", format: "AAC audio embedded in the video workflow is common", loudness: "No universal creator-side LUFS acceptance target", bitrate: "Keep a high-quality audio source; export settings depend on the video editor", note: "TikTok may transcode uploaded video/audio; review the final upload on-device." },
    twitch: { sample: "44.1 or 48 kHz source", format: "AAC in common streaming pipelines", loudness: "Avoid clipping; use a consistent broadcast mix", bitrate: "Encoder, stream profile and channel configuration control delivery", note: "Tune your streaming encoder and monitoring chain; this guide cannot guarantee platform acceptance." },
  };
  const p = presets[platform];
  const links: Record<string, Array<[string, string]>> = {
    convert: [["Audio to WAV", "audio-to-wav"], ["Audio to MP3 (server)", "audio-to-mp3-server"], ["Audio Channel Converter", "audio-channel-converter"], ["Sample-rate Converter", "audio-sample-rate-converter"], ["Bitrate Converter", "audio-bitrate-converter"]],
    edit: [["Audio Trimmer", "audio-trimmer"], ["Fade In", "audio-fade-in"], ["Fade Out", "audio-fade-out"], ["Peak Normalizer", "audio-normalizer"], ["Reverse Audio", "audio-reverser"], ["Noise Reducer", "voice-noise-reducer"], ["Noise Gate", "voice-noise-gate"], ["Hum Reducer", "audio-hum-reducer"], ["Silence Trim", "audio-trim-silence"], ["Pitch / Speed", "audio-pitch-shift"], ["Tempo Change", "audio-tempo-change"], ["Compressor", "audio-compressor"], ["3-band EQ", "audio-eq-simple"]],
    analyze: [["File Inspector", "audio-file-inspector"], ["Peak Meter", "audio-peak-meter"], ["RMS Meter", "audio-rms-meter"], ["Silence Detector", "audio-silence-detector"], ["DC Offset", "audio-dc-offset-checker"], ["Waveform PNG", "audio-waveform-generator"], ["LUFS Estimate", "audio-lufs-meter"], ["Spectrogram", "audio-spectrogram"]],
    calc: [["Bitrate Calculator", "audio-bitrate-calculator"], ["File Size Calculator", "audio-file-size-calculator"], ["Duration Tool", "audio-duration-tool"]],
    transcribe: [["Audio to Text", "audio-to-text"], ["Audio to Subtitles", "audio-to-subtitles"]],
    import: [["Audio Recorder", "audio-recorder"], ["Tone Generator", "audio-tone-generator"], ["Metronome", "audio-metronome"], ["Local Audio Joiner", "audio-joiner-local"]],
    platform: [],
  };
  return <section className="space-y-5">
    <div><h2 className="text-xl font-semibold">{info.title}</h2><p className="mt-1 text-sm text-muted-foreground">{info.summary}</p></div>
    {studio === "platform" ? <div className="space-y-4 rounded-xl border border-border p-4">
      <div><p className="mb-2 text-sm font-medium">Choose a platform</p><div className="flex flex-wrap gap-2" role="group" aria-label="Audio platform guide">{[["Podcast", "podcast"], ["Discord", "discord"], ["Spotify", "spotify"], ["Instagram", "instagram"], ["Apple Music", "apple-music"], ["YouTube", "youtube"], ["TikTok", "tiktok"], ["Twitch", "twitch"]].map(([label, value]) => <button key={value} type="button" aria-pressed={platform === value} onClick={() => setPlatform(value)} className={`min-h-10 rounded-full border px-4 py-2 text-sm ${platform === value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-surface-2"}`}>{label}</button>)}</div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[440px] border-collapse text-left text-sm"><thead><tr className="border-b border-border"><th scope="col" className="px-3 py-2 font-semibold">Setting</th><th scope="col" className="px-3 py-2 font-semibold">Practical guidance</th></tr></thead><tbody>{[["Sample rate", p.sample], ["Format", p.format], ["Loudness", p.loudness], ["Bitrate", p.bitrate]].map(([label, value]) => <tr key={label} className="border-b border-border last:border-0"><th scope="row" className="w-32 px-3 py-3 align-top font-medium">{label}</th><td className="px-3 py-3">{value}</td></tr>)}</tbody></table></div>
      <p className="text-sm text-muted-foreground">{p.note}</p>
      <p className="text-xs text-muted-foreground">Guidance only — not a platform acceptance guarantee. Check the destination's current specifications before delivery.</p>
    </div> : null}
    {studio === "transcribe" ? <div className="rounded-xl border border-amber-400/50 bg-amber-50/50 p-4 text-sm dark:bg-amber-950/15"><strong>Transcription depends on server configuration.</strong><p className="mt-1 text-muted-foreground">Choose Audio to Text or Audio to Subtitles below. If the STT service is not configured or reachable, enV reports that state rather than fabricating a transcript. Uploaded audio is sent to the configured transcription endpoint.</p></div> : null}
    {studio === "import" ? <p className="rounded-xl border border-border p-4 text-sm">Use files you own or have rights to. enV does not download DRM-protected Spotify, Apple Music, Amazon Music or Tidal streams.</p> : null}
    {studio === "analyze" ? <p className="rounded-xl border border-border p-4 text-sm">Peak and RMS are measured from decoded PCM. The LUFS tool is explicitly an RMS-based approximation; do not treat it as EBU R128/BS.1770 compliance certification.</p> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(links[studio] ?? []).map(([label, slug]) => <a key={slug} href={`/tools/audio/${slug}`} className="rounded-xl border border-border p-4 transition hover:bg-surface-2"><span className="font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">Open tool</span></a>)}</div>
    {studio !== "platform" ? <div className="pt-1"><h3 className="mb-3 text-base font-semibold">All Audio Studios</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{STUDIO_LINKS.map((item) => <a href={item.href} key={item.href} className="rounded-xl border border-border p-4 transition hover:bg-surface-2"><span className="font-medium">{item.title}</span><span className="mt-1 block text-sm text-muted-foreground">{item.text}</span></a>)}</div></div> : null}
  </section>;
}

export function AudioMusicStudio({ mode = "separate" }: { mode?: string }) {
  const normalizedMode: StudioMode = mode.includes("duet") ? "duet" : mode.includes("karaoke") ? "karaoke" : mode.includes("stem-mixer") || mode.includes("mixer") ? "mixer" : mode.includes("practice") ? "practice" : "separate";
  const [file, setFile] = useState<File | null>(null);
  const [liveMixerPlaying, setLiveMixerPlaying] = useState(false);
  const [separationMode, setSeparationMode] = useState<"2" | "4">("4");
  const [sourceBuffer, setSourceBuffer] = useState<AudioBuffer | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [mixUrl, setMixUrl] = useState("");
  const sourceUrlRef = useRef("");
  const mixUrlRef = useRef("");
  const [tracks, setTracks] = useState<StemTrack[]>([]);
  const [masterVolume, setMasterVolume] = useState(100);
  const [abOriginal, setAbOriginal] = useState(true);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopStart, setLoopStart] = useState("10");
  const [loopEnd, setLoopEnd] = useState("20");
  const [tempo, setTempo] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [countInBars, setCountInBars] = useState("1");
  const [metronomeBpm, setMetronomeBpm] = useState(120);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [takes, setTakes] = useState<VocalTake[]>([]);
  const [recording, setRecording] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [analysis, setAnalysis] = useState<{ bpm: number | null; key: string | null } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const takeStartRef = useRef(0);
  const takesRef = useRef<VocalTake[]>([]);
  const sourceKeyRef = useRef("");
  const recordingSourceKeyRef = useRef("");
  const fileLoadSequenceRef = useRef(0);
  const liveMixerRef = useRef<LiveMixerState | null>(null);

  useEffect(() => { takesRef.current = takes; }, [takes]);
  useEffect(() => {
    const live = liveMixerRef.current;
    if (!live) return;
    const anySolo = tracks.some((track) => track.solo);
    for (const track of tracks) {
      const gain = live.gains.get(track.id);
      if (gain) {
        const shouldMute = track.muted || (anySolo && !track.solo);
        gain.gain.setTargetAtTime(shouldMute ? 0 : track.volume / 100, live.context.currentTime, 0.018);
      }
    }
    live.masterGain.gain.setTargetAtTime(masterVolume / 100, live.context.currentTime, 0.018);
    const rate = Math.max(0.25, Math.min(3, tempo * 2 ** (pitch / 12)));
    // Re-anchor the transport before changing playback rate so take alignment does
    // not drift when musicians adjust tempo/pitch during a live mixer session.
    const position = currentLiveMixerPosition(live);
    if (position !== null) { live.startOffset = position; live.startedAt = live.context.currentTime; live.playbackRate = rate; }
    for (const source of live.sources) source.playbackRate.setTargetAtTime(rate, live.context.currentTime, 0.02);
  }, [tracks, masterVolume, tempo, pitch]);
  useEffect(() => { sourceUrlRef.current = sourceUrl; mixUrlRef.current = mixUrl; }, [sourceUrl, mixUrl]);
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      // Native HTML playback-rate control intentionally combines pitch and speed.
      // Pitch-locked time stretching is not claimed by this basic preview path.
      audio.playbackRate = Math.max(0.25, Math.min(3, tempo * 2 ** (pitch / 12)));
      audio.preservesPitch = false;
    }
  }, [tempo, pitch, abOriginal, mixUrl]);
  useEffect(() => () => {
    abortRef.current?.abort();
    if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (mixUrlRef.current) URL.revokeObjectURL(mixUrlRef.current);
    for (const take of takesRef.current) URL.revokeObjectURL(take.url);
    const live = liveMixerRef.current;
    liveMixerRef.current = null;
    if (live) { for (const source of live.sources) { try { source.stop(); } catch { /* already stopped */ } } void live.context.close().catch(() => undefined); }
  }, []);
  useEffect(() => {
    if (!metronomeOn) return;
    const Ctx = contextConstructor(); if (!Ctx) return;
    const context = new Ctx();
    let nextAt = context.currentTime + 0.05;
    let beatInBar = 0;
    const beatDuration = 60 / Math.max(40, Math.min(240, metronomeBpm));
    const schedule = () => {
      const isPlaying = Boolean((audioRef.current && !audioRef.current.paused) || liveMixerRef.current);
      if (!isPlaying) { nextAt = context.currentTime + 0.05; beatInBar = 0; return; }
      while (nextAt < context.currentTime + 0.12) {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const accented = beatInBar === 0;
        oscillator.type = "sine"; oscillator.frequency.setValueAtTime(accented ? 1400 : 950, nextAt);
        gain.gain.setValueAtTime(0.0001, nextAt); gain.gain.exponentialRampToValueAtTime(accented ? 0.16 : 0.1, nextAt + 0.004); gain.gain.exponentialRampToValueAtTime(0.0001, nextAt + 0.035);
        oscillator.connect(gain).connect(context.destination); oscillator.start(nextAt); oscillator.stop(nextAt + 0.04);
        beatInBar = (beatInBar + 1) % 4;
        nextAt += beatDuration;
      }
    };
    const timer = window.setInterval(schedule, 25); schedule();
    return () => { window.clearInterval(timer); void context.close().catch(() => undefined); };
  }, [metronomeOn, metronomeBpm]);

  async function chooseFile(selected: File | undefined) {
    if (!selected) return;
    if (recording) { setError("Stop the current vocal take before changing the source file."); return; }
    const loadSequence = ++fileLoadSequenceRef.current;
    cancelRef.current = true; abortRef.current?.abort(); stopLiveMixer(false);
    setError(null); setStatus("Decoding audio locally…"); setFile(null); setSourceBuffer(null); setTracks([]); setAnalysis(null); setAbOriginal(true);
    for (const take of takesRef.current) URL.revokeObjectURL(take.url);
    takesRef.current = []; setTakes([]);
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (mixUrlRef.current) URL.revokeObjectURL(mixUrlRef.current);
    sourceUrlRef.current = ""; mixUrlRef.current = ""; sourceKeyRef.current = ""; setSourceUrl(""); setMixUrl("");
    try {
      const buffer = await decodeAudio(selected);
      if (loadSequence !== fileLoadSequenceRef.current) return;
      if (buffer.duration < 0.05) throw new Error("The selected audio is too short to process.");
      const url = URL.createObjectURL(selected);
      const sourceKey = musicSourceKey(selected);
      sourceKeyRef.current = sourceKey;
      setFile(selected); setSourceBuffer(buffer); setSourceUrl(url); sourceUrlRef.current = url;
      let baseStatus = `Ready · ${buffer.duration.toFixed(2)} seconds · ${buffer.sampleRate.toLocaleString()} Hz · ${buffer.numberOfChannels} channel(s)`;
      try {
        const stored = await listStoredMusicTakes(sourceKey);
        if (loadSequence !== fileLoadSequenceRef.current) { URL.revokeObjectURL(url); return; }
        const restored: VocalTake[] = stored.map((take) => ({ ...take, url: URL.createObjectURL(take.blob), savedLocally: true }));
        takesRef.current = restored; setTakes(restored);
        if (restored.length) baseStatus += ` · Restored ${restored.length} locally saved vocal take(s)`;
        else baseStatus += " · Takes you record can be saved in this browser for this source file";
      } catch {
        if (loadSequence === fileLoadSequenceRef.current) baseStatus += " · Persistent browser storage unavailable; takes will remain only in this open session";
      }
      if (loadSequence === fileLoadSequenceRef.current) setStatus(baseStatus);
    } catch (cause) { if (loadSequence === fileLoadSequenceRef.current) { setFile(null); setSourceBuffer(null); setSourceUrl(""); sourceUrlRef.current = ""; setStatus(""); setError(cause instanceof Error ? cause.message : "Could not decode this audio file in the current browser."); } }
  }

  async function loadDemoTrack() {
    const Ctx = contextConstructor();
    if (!Ctx) { setError("This browser does not support Web Audio."); return; }
    const context = new Ctx();
    try {
      const sampleRate = 44100, bpm = 100, beatSeconds = 60 / bpm, duration = beatSeconds * 16;
      const buffer = context.createBuffer(2, Math.ceil(sampleRate * duration), sampleRate);
      const notes = [55, 65.41, 73.42, 65.41];
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < data.length; i++) {
          const t = i / sampleRate, beat = Math.floor(t / beatSeconds), beatPhase = t % beatSeconds;
          const root = notes[Math.floor(beat / 4) % notes.length];
          let sample = 0.055 * Math.sin(2 * Math.PI * root * t) + 0.022 * Math.sin(2 * Math.PI * root * 2 * t);
          if (beatPhase < 0.16) sample += 0.26 * Math.sin(2 * Math.PI * (82 - 42 * (beatPhase / 0.16)) * beatPhase) * Math.exp(-beatPhase * 18);
          if ((beat % 4 === 1 || beat % 4 === 3) && beatPhase < 0.11) sample += 0.11 * Math.sin(2 * Math.PI * 185 * beatPhase) * Math.exp(-beatPhase * 25);
          const hatPhase = t % (beatSeconds / 2);
          if (hatPhase < 0.025) sample += 0.028 * Math.sin(2 * Math.PI * (5000 + 900 * Math.sin(i * 0.17)) * hatPhase) * Math.exp(-hatPhase * 100);
          data[i] = Math.max(-0.8, Math.min(0.8, sample));
        }
      }
      const file = new File([audioBufferToWav(buffer)], "enV-synthesized-demo-track.wav", { type: "audio/wav" });
      await context.close().catch(() => undefined);
      await chooseFile(file);
      setStatus("Synthesized demo groove loaded locally. Try practice loops, mixing and export; this is not a stem-separation quality benchmark.");
    } catch (cause) { await context.close().catch(() => undefined); setError(cause instanceof Error ? cause.message : "Could not create the demo track."); }
  }

  async function runSeparation() {
    if (!sourceBuffer) { setError("Choose an audio file first."); return; }
    cancelRef.current = false; const controller = new AbortController(); abortRef.current = controller;
    stopLiveMixer();
    setWorking(true); setError(null); setProgress(0); setStatus("Preparing the on-device model…");
    try {
      const buffers = await separateWithDemucs(sourceBuffer, controller.signal, (value, detail) => { setProgress(value); setStatus(detail ?? (value < 18 ? "Downloading/caching the local stem model…" : "Separating stems on this device…")); }, () => cancelRef.current);
      let outputBuffers = buffers;
      let names = STEM_NAMES;
      if (separationMode === "2") {
        const Ctx = contextConstructor(); if (!Ctx) throw new Error("Web Audio is unavailable to assemble the instrumental stem.");
        const context = new Ctx();
        try {
          const instrumental = context.createBuffer(2, buffers[0].length, MODEL_SAMPLE_RATE);
          for (let channel = 0; channel < 2; channel++) {
            const target = instrumental.getChannelData(channel);
            for (let i = 0; i < target.length; i++) target[i] = buffers[0].getChannelData(channel)[i] + buffers[1].getChannelData(channel)[i] + buffers[2].getChannelData(channel)[i];
          }
          outputBuffers = [buffers[3], instrumental]; names = ["Vocals", "Instrumental"];
        } finally { await context.close().catch(() => undefined); }
      }
      setTracks(outputBuffers.map((buffer, index) => ({ id: names[index].toLowerCase(), name: names[index], buffer, volume: 100, muted: false, solo: false })));
      setAbOriginal(false); setMixUrl(""); setProgress(100); setStatus("Separation complete. Listen to the stems and check transitions before exporting.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Separation failed.");
      setStatus("No stems were exported because the separation job did not complete successfully.");
    } finally { setWorking(false); abortRef.current = null; }
  }

  function updateTrack(id: string, patch: Partial<StemTrack>) { setTracks((current) => current.map((track) => track.id === id ? { ...track, ...patch } : track)); }

  function stopLiveMixer(updateState = true) {
    const live = liveMixerRef.current;
    liveMixerRef.current = null;
    if (live) {
      for (const source of live.sources) { try { source.stop(); } catch { /* A scheduled source may already have stopped. */ } }
      void live.context.close().catch(() => undefined);
    }
    if (updateState) setLiveMixerPlaying(false);
  }

  async function startLiveMixer() {
    if (!sourceBuffer) { setError("Choose an audio file first."); return; }
    stopLiveMixer(false);
    const Ctx = contextConstructor();
    if (!Ctx) { setError("This browser does not support a live Web Audio mixer."); return; }
    const context = new Ctx();
    try {
      await context.resume();
      const output = context.createGain(); output.gain.value = masterVolume / 100; output.connect(context.destination);
      const sources: AudioBufferSourceNode[] = [], gains = new Map<string, GainNode>();
      const renderTracks = tracks.length ? tracks : [{ id: "original", name: "Original", buffer: sourceBuffer, volume: 100, muted: false, solo: false }];
      const anySolo = renderTracks.some((track) => track.solo);
      const startOffset = Math.max(0, audioRef.current?.currentTime ?? 0);
      const loopStartValue = loopStartNumber;
      const loopEndValue = loopEndNumber;
      const initialRate = Math.max(0.25, Math.min(3, tempo * 2 ** (pitch / 12)));
      for (const track of renderTracks) {
        const gain = context.createGain();
        const muted = track.muted || (anySolo && !track.solo);
        gain.gain.value = muted ? 0 : track.volume / 100;
        gain.connect(output); gains.set(track.id, gain);
        const source = context.createBufferSource(); source.buffer = track.buffer;
        source.playbackRate.value = initialRate;
        if (loopEnabled && loopEndValue > loopStartValue && loopEndValue <= track.buffer.duration) {
          source.loop = true; source.loopStart = loopStartValue; source.loopEnd = loopEndValue;
        }
        source.connect(gain); source.start(0, Math.min(startOffset, Math.max(0, track.buffer.duration - 0.01))); sources.push(source);
      }
      const isLooping = sources.some((source) => source.loop);
      liveMixerRef.current = { context, sources, gains, masterGain: output, startOffset, startedAt: context.currentTime, playbackRate: initialRate, loopStart: loopStartValue, loopEnd: loopEndValue, looping: isLooping };
      audioRef.current?.pause(); setLiveMixerPlaying(true); setAbOriginal(false);
      setStatus("Live mixer playing. Mute, solo, stem faders, master volume, tempo and pitch update the active mix. Pitch and speed are coupled in this real-time preview.");
      if (!isLooping) {
        let endedCount = 0;
        sources.forEach((source) => source.addEventListener("ended", () => {
          endedCount += 1;
          if (endedCount === sources.length && liveMixerRef.current?.context === context) stopLiveMixer();
        }, { once: true }));
      }
    } catch (cause) {
      await context.close().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "Could not start the live mixer."); setLiveMixerPlaying(false);
    }
  }

  async function exportAllStemsZip() {
    if (!tracks.length) { setError("Separate the source first so there are stems to export."); return; }
    try {
      setError(null); setStatus("Packaging the stems into one local ZIP…");
      const entries: Record<string, Uint8Array> = {};
      for (const track of tracks) {
        const filename = track.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "stem";
        entries[`stems/${filename}.wav`] = new Uint8Array(await audioBufferToWav(track.buffer).arrayBuffer());
      }
      const totalBytes = Object.values(entries).reduce((sum, value) => sum + value.byteLength, 0);
      if (totalBytes > 140 * 1024 * 1024) throw new Error("This ZIP would exceed the 140 MB safety limit. Export individual stems instead to avoid a memory spike.");
      const manifest = [
        "enV Music Studio — Stem Export",
        `Source: ${file?.name ?? "local audio"}`,
        `Created: ${new Date().toISOString()}`,
        `Stems: ${tracks.map((track) => track.name).join(", ")}`,
        "Encoding: 16-bit PCM WAV; each stem is rendered at its model sample rate.",
        "Review transitions and separation artifacts before distribution.",
        "Local export only; no audio was uploaded by this export action.",
      ].join("\n");
      entries["README.txt"] = strToU8(manifest);
      const archive = zipSync(entries, { level: 0 });
      const archiveBytes = new Uint8Array(archive);
      const archiveBlob = new Blob([archiveBytes.buffer as ArrayBuffer], { type: "application/zip" });
      downloadBlob(archiveBlob, `env-${(file?.name ?? "music").replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-")}-stems.zip`);
      setStatus(`Packaged ${tracks.length} stems and a README into one ZIP (${(archive.byteLength / 1_000_000).toFixed(1)} MB). The archive was created locally.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not package all stems into a ZIP."); setStatus("ZIP export did not complete; the individual WAV export path is still available."); }
  }

  async function removeTake(take: VocalTake) {
    URL.revokeObjectURL(take.url);
    setTakes((current) => { const updated = current.filter((item) => item.id !== take.id); takesRef.current = updated; return updated; });
    if (take.savedLocally) {
      try { await deleteStoredMusicTake(take.id); setStatus(`Removed ${take.name} from this browser's local Music Studio storage.`); }
      catch (cause) { setError(cause instanceof Error ? `Removed from this screen, but browser storage could not be updated: ${cause.message}` : "Removed from this screen, but browser storage could not be updated."); }
    }
  }

  async function clearMusicSession() {
    fileLoadSequenceRef.current += 1;
    cancelRef.current = true; abortRef.current?.abort();
    stopLiveMixer();
    if (sourceKeyRef.current) {
      try { await deleteStoredMusicTakes(sourceKeyRef.current); }
      catch (cause) { setError(cause instanceof Error ? `Session cleared, but saved takes could not all be removed: ${cause.message}` : "Session cleared, but saved takes could not all be removed."); }
    }
    for (const take of takesRef.current) URL.revokeObjectURL(take.url);
    takesRef.current = []; setTakes([]);
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (mixUrlRef.current) URL.revokeObjectURL(mixUrlRef.current);
    sourceUrlRef.current = ""; mixUrlRef.current = ""; sourceKeyRef.current = "";
    setFile(null); setSourceBuffer(null); setSourceUrl(""); setMixUrl(""); setTracks([]); setAnalysis(null); setStatus("Cleared this Music Studio session and saved takes for its source file."); setProgress(0);
  }

  async function renderMix(includeTakes = false, instrumentalsOnly = false): Promise<Blob> {
    if (!sourceBuffer) throw new Error("Choose an audio file first.");
    const selectedTracks = tracks.length ? tracks.filter((track) => !instrumentalsOnly || track.name.toLowerCase() !== "vocals") : [{ id: "original", name: "Original", buffer: sourceBuffer, volume: 100, muted: false, solo: false }];
    const useSolo = selectedTracks.some((track) => track.solo);
    const Ctx = contextConstructor(); if (!Ctx) throw new Error("This browser does not support Web Audio.");
    const context = new Ctx();
    try {
      const decodedTakes: Array<{ buffer: AudioBuffer; startAt: number }> = [];
      if (includeTakes) for (const take of takes) decodedTakes.push({ buffer: await context.decodeAudioData(await take.blob.arrayBuffer()), startAt: take.startAt });
      const sampleRate = Math.max(...selectedTracks.map((track) => track.buffer.sampleRate), ...decodedTakes.map((take) => take.buffer.sampleRate), sourceBuffer.sampleRate);
      const duration = Math.max(sourceBuffer.duration, ...selectedTracks.map((track) => track.buffer.duration), ...decodedTakes.map((take) => take.startAt + take.buffer.duration));
      const frames = Math.max(1, Math.ceil(duration * sampleRate));
      const offline = new OfflineAudioContext(2, frames, sampleRate);
      for (const track of selectedTracks) {
        const isMuted = track.muted || (useSolo && !track.solo);
        if (isMuted) continue;
        const source = offline.createBufferSource(); source.buffer = track.buffer;
        const gain = offline.createGain(); gain.gain.value = track.volume / 100 * masterVolume / 100;
        source.connect(gain).connect(offline.destination); source.start(0);
      }
      for (const take of decodedTakes) {
        const source = offline.createBufferSource(); source.buffer = take.buffer;
        const gain = offline.createGain(); gain.gain.value = masterVolume / 100;
        source.connect(gain).connect(offline.destination); source.start(Math.max(0, take.startAt));
      }
      return audioBufferToWav(await offline.startRendering());
    } finally { await context.close().catch(() => undefined); }
  }

  async function previewMix(instrumentalsOnly = false) {
    try {
      setError(null); setStatus("Rendering a local preview mix…");
      const blob = await renderMix(false, instrumentalsOnly);
      if (mixUrl) URL.revokeObjectURL(mixUrl);
      setMixUrl(URL.createObjectURL(blob)); setAbOriginal(false); setStatus(instrumentalsOnly ? "Instrumental preview ready." : "Mix preview ready. Nothing was uploaded.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not render the mix."); }
  }

  async function exportMix(instrumentalsOnly = false, includeTakes = true) {
    try {
      setError(null); setStatus("Rendering WAV locally…");
      const blob = await renderMix(includeTakes, instrumentalsOnly);
      downloadBlob(blob, instrumentalsOnly ? "env-karaoke-instrumental.wav" : "env-music-studio-mix.wav");
      setStatus(`WAV export ready · ${(blob.size / 1_000_000).toFixed(2)} MB. Rendered on this device.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not export the mix."); }
  }

  function cancelSeparation() { cancelRef.current = true; abortRef.current?.abort(); setStatus("Cancel requested. Current inference chunk will finish, then processing will stop."); }

  async function startRecording() {
    try {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Microphone recording is not supported by this browser. Use a current browser over HTTPS or localhost.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorderStreamRef.current = stream; recorderRef.current = recorder;
      takeStartRef.current = currentLiveMixerPosition(liveMixerRef.current) ?? audioRef.current?.currentTime ?? 0;
      recordingSourceKeyRef.current = sourceKeyRef.current;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => setError("The microphone recording stopped because the browser reported an error.");
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
        setMicLevel(0); setRecording(false);
        if (!blob.size) { setError("The microphone produced an empty take. Check microphone permissions and try again."); return; }
        const url = URL.createObjectURL(blob);
        const id = makeId();
        const name = `Take ${takesRef.current.length + 1}`;
        const sourceKey = recordingSourceKeyRef.current;
        const take: VocalTake = { id, name, blob, startAt: takeStartRef.current, url, sourceKey, savedLocally: false };
        setTakes((current) => { const updated = [...current, take]; takesRef.current = updated; return updated; });
        if (sourceKey) {
          const storedTake: StoredMusicTake = { id, name, blob, sourceKey, startAt: takeStartRef.current, createdAt: Date.now() };
          void saveStoredMusicTake(storedTake).then(() => {
            setTakes((current) => { const updated = current.map((item) => item.id === id ? { ...item, savedLocally: true } : item); takesRef.current = updated; return updated; });
            setStatus(`${name} saved in this browser's local Music Studio storage. Browser settings can still clear or evict local data; nothing was uploaded.`);
          }).catch((cause) => {
            setStatus(`${name} is available in this open session, but browser storage could not save it: ${cause instanceof Error ? cause.message : "storage unavailable"}. You can download the take before leaving.`);
          });
        } else {
          setStatus(`${name} is available in this open session only. Choose the source again and retry if you want take persistence.`);
        }
      };
      recorder.start(250); setRecording(true); setStatus("Recording microphone take…");
      const Ctx = contextConstructor();
      if (Ctx) {
        const monitor = new Ctx(); const input = monitor.createMediaStreamSource(stream); const analyser = monitor.createAnalyser(); analyser.fftSize = 1024; input.connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        const measure = () => { analyser.getByteTimeDomainData(samples); let peak = 0; for (const value of samples) peak = Math.max(peak, Math.abs(value - 128) / 128); setMicLevel(peak); meterFrameRef.current = requestAnimationFrame(measure); };
        measure();
        recorder.addEventListener("stop", () => { void monitor.close().catch(() => undefined); }, { once: true });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start microphone recording."); setRecording(false); }
  }

  function stopRecording() { recorderRef.current?.stop(); recorderRef.current = null; }

  async function analyzeTrack() {
    if (!sourceBuffer) { setError("Choose an audio file first."); return; }
    try {
      setError(null); setStatus("Estimating tempo and key from local audio…");
      const channel = sourceBuffer.getChannelData(0);
      const bpm = estimateBpm(channel, sourceBuffer.sampleRate);
      const key = estimateKey(channel, sourceBuffer.sampleRate);
      setAnalysis({ bpm, key });
      if (bpm) setMetronomeBpm(bpm);
      setStatus("Analysis complete. Tempo and key are best-effort estimates, not guaranteed labels.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Analysis failed."); }
  }

  async function startWithCountIn() {
    const audio = audioRef.current;
    if (!audio) return;
    const Ctx = contextConstructor(); if (!Ctx) { await audio.play(); return; }
    const context = new Ctx();
    try {
      await context.resume();
      const beatDuration = 60 / Math.max(40, Math.min(240, metronomeBpm));
      const count = Math.max(1, Math.min(2, Number(countInBars) || 1)) * 4;
      const startAt = context.currentTime + 0.05;
      for (let beat = 0; beat < count; beat++) {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const at = startAt + beat * beatDuration;
        oscillator.frequency.setValueAtTime(beat % 4 === 0 ? 1400 : 900, at);
        gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(0.15, at + 0.003); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
        oscillator.connect(gain).connect(context.destination); oscillator.start(at); oscillator.stop(at + 0.04);
      }
      await new Promise((resolve) => window.setTimeout(resolve, count * beatDuration + 60));
      await audio.play().catch(() => undefined);
    } finally { await context.close().catch(() => undefined); }
  }

  const loopStartNumber = Math.max(0, Number(loopStart) || 0);
  const loopEndNumber = Math.max(0, Number(loopEnd) || 0);
  const currentSrc = abOriginal ? sourceUrl : mixUrl || sourceUrl;
  const showTracks = tracks.length > 0;

  return <section className="space-y-5">
    <div className="space-y-2"><div><h2 className="text-xl font-semibold">Music Studio</h2><p className="mt-1 text-sm text-muted-foreground">A private practice and karaoke workspace for files you own or have rights to. Audio is processed locally in your browser; the separation model is downloaded on the first use.</p></div>
      <div className="rounded-xl border border-border bg-surface-2 p-3 text-sm">Use files you own or have rights to. enV does not download DRM-protected Spotify, Apple Music, Amazon Music or Tidal streams.</div>
      <nav className="flex flex-wrap gap-2" aria-label="Music Studio modes">{[["Separate", "music-separator", "separate"], ["Stem mixer", "music-stem-mixer", "mixer"], ["Practice", "music-practice", "practice"], ["Duet / record", "music-duet", "duet"], ["Karaoke", "music-karaoke", "karaoke"]].map(([label, slug, selected]) => <a key={slug} href={`/tools/audio/${slug}`} aria-current={normalizedMode === selected ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm ${normalizedMode === selected ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-surface-2"}`}>{label}</a>)}</nav>
    </div>

    <div className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="font-semibold">1. Import audio</h3>
      <input className="block min-h-12 w-full rounded-lg border border-border bg-surface p-3 text-sm" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm" onChange={(event) => void chooseFile(event.target.files?.[0])} aria-label="Choose a local audio file" />
      <Button type="button" variant="outline" onClick={() => void loadDemoTrack()}>Load synthesized demo groove</Button>
      <label className="mt-3 block text-sm">Separation output<select value={separationMode} onChange={(event) => setSeparationMode(event.target.value as "2" | "4")} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2"><option value="2">2 stems · vocals + instrumental</option><option value="4">4 stems · vocals, drums, bass, other</option></select><span className="mt-1 block text-xs text-muted-foreground">The browser model calculates four stems; 2-stem mode combines drums, bass and other locally into one instrumental mix.</span></label>
      <p className="text-xs text-muted-foreground">MP3, WAV, M4A, OGG, FLAC or WebM when your browser can decode it. Source audio never leaves this device on the local path.</p>
      {file && sourceBuffer ? <div className="rounded-lg bg-surface-2 p-3 text-sm"><strong>{file.name}</strong><p className="mt-1 text-muted-foreground">{sourceBuffer.duration.toFixed(2)} sec · {sourceBuffer.sampleRate.toLocaleString()} Hz · {sourceBuffer.numberOfChannels} channel(s) · {(file.size / 1_000_000).toFixed(2)} MB</p></div> : <p className="text-sm text-muted-foreground">Choose a short music file to unlock local playback, practice and the separator.</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void analyzeTrack()} disabled={!sourceBuffer}>Estimate BPM / key</Button><Button type="button" variant="outline" disabled={recording || working} onClick={() => void clearMusicSession()}>Clear session & saved takes</Button></div>
      {analysis ? <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2">{[["Tempo estimate", analysis.bpm ? `${analysis.bpm} BPM` : "Not confident enough"], ["Key estimate", analysis.key ?? "Not confident enough"]].map(([label, value]) => <div className="rounded-lg border border-border p-3" key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">Best effort — verify by ear.</p></div>)}</div>{analysis.key ? <div className="rounded-lg border border-border p-3"><h4 className="text-sm font-semibold">Diatonic chord suggestions</h4><p className="mt-1 text-xs text-muted-foreground">Theory suggestions derived from the estimated key, not audio chord recognition.</p><div className="mt-2 flex flex-wrap gap-2">{suggestDiatonicChords(analysis.key).map((chord) => <span key={chord.degree} className="rounded-md bg-surface-2 px-3 py-2 text-sm"><strong>{chord.chord}</strong><span className="ml-1 text-xs text-muted-foreground">{chord.degree}</span></span>)}</div><h4 className="mt-4 text-sm font-semibold">Capo / open-shape helper</h4><div className="mt-2 flex flex-wrap gap-2">{suggestCapoShapes(analysis.key).slice(0, 4).map((suggestion) => <span key={`${suggestion.shape}-${suggestion.fret}`} className="rounded-md border border-border px-3 py-2 text-sm">{suggestion.shape} shape · {suggestion.fret === 0 ? "no capo" : `capo ${suggestion.fret}`}</span>)}</div><p className="mt-2 text-xs text-muted-foreground">These are convenient guitar shapes only; tune, voicing and chord spelling may vary.</p></div> : null}</div> : null}
    </div>

    <div className="space-y-3 rounded-xl border border-border p-4">
      <div><h3 className="font-semibold">2. Separate stems</h3><p className="mt-1 text-sm text-muted-foreground">Local ONNX model · WebGPU when available, WASM fallback · overlap-blended chunks to reduce edge discontinuities.</p></div>
      <p className="text-sm text-muted-foreground">The first model download is approximately 166 MB and may be cached by your browser. Memory-aware duration limits are conservative: around 45–75 seconds on lower-memory phones, 1–2 minutes on many devices, and up to 4 minutes on higher-memory desktops. The approximate working-set estimate excludes extra model runtime/GPU allocations and cannot guarantee that memory pressure will not occur. The synthesized demo is only for testing practice/mixing controls, not separation quality.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void runSeparation()} disabled={!sourceBuffer || working}>{working ? "Separating…" : tracks.length ? "Separate again" : separationMode === "2" ? "Separate into 2 stems" : "Separate into 4 stems"}</Button>{working ? <Button type="button" variant="outline" onClick={cancelSeparation}>Cancel</Button> : null}</div>
      {working || progress > 0 ? <div><div className="mb-1 flex justify-between text-xs"><span>{status || "Preparing…"}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div> : null}
      {tracks.length ? <p className="text-sm">{tracks.length === 2 ? "Two stems created: vocals and instrumental." : "Four broad stems created: drums, bass, other and vocals."} These are broad source groups, not isolated kick, snare, cymbals, guitar or piano tracks. Listen for artifacts, missing transients and bleed before using in a final release.</p> : null}
    </div>

    <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">3. Practice & playback</h3><p className="mt-1 text-sm text-muted-foreground">Loop a difficult passage, change playback speed and A/B the source against the rendered mix.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={loopEnabled} onChange={(event) => setLoopEnabled(event.target.checked)} /> Loop A–B</label></div>
      <audio ref={audioRef} controls preload="metadata" src={currentSrc || undefined} onTimeUpdate={() => { const audio = audioRef.current; if (loopEnabled && audio && loopEndNumber > loopStartNumber && audio.currentTime >= loopEndNumber) audio.currentTime = loopStartNumber; }} className="w-full" aria-label="Music Studio playback" />
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Loop start (seconds)<input type="number" min="0" step="0.1" value={loopStart} onChange={(event) => setLoopStart(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label><label className="text-sm">Loop end (seconds)<input type="number" min="0" step="0.1" value={loopEnd} onChange={(event) => setLoopEnd(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Tempo: {tempo.toFixed(2)}×<input type="range" min="0.5" max="1.5" step="0.05" value={tempo} onChange={(event) => setTempo(Number(event.target.value))} className="mt-2 block w-full" /></label><label className="text-sm">Pitch: {pitch > 0 ? "+" : ""}{pitch} semitones<input type="range" min="-12" max="12" step="1" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} className="mt-2 block w-full" /></label></div>
      <p className="text-xs text-muted-foreground">Preview note: this built-in player combines pitch and speed change (pitch is not locked). WAV export preserves the selected stem levels but does not bake browser playback-rate controls into a time-stretched render.</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Count-in bars<select value={countInBars} onChange={(event) => setCountInBars(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2"><option value="1">1 bar</option><option value="2">2 bars</option></select></label><label className="text-sm">Metronome BPM<input type="number" min="40" max="240" step="1" value={metronomeBpm} onChange={(event) => setMetronomeBpm(Number(event.target.value) || 120)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!sourceBuffer} onClick={() => void startWithCountIn()}>Play with count-in</Button><Button type="button" variant={metronomeOn ? "default" : "outline"} onClick={() => setMetronomeOn((current) => !current)}>{metronomeOn ? "Turn metronome off" : "Metronome on"}</Button><Button type="button" variant="outline" onClick={() => { if (abOriginal) void previewMix(); else setAbOriginal(true); }} disabled={!sourceBuffer || !tracks.length}>{abOriginal ? "A/B: original → render current mix" : "A/B: current mix → original"}</Button><Button type="button" variant="outline" onClick={() => void previewMix()} disabled={!sourceBuffer}>Render mix preview</Button></div>
    </div>

    <div className="space-y-4 rounded-xl border border-border p-4">
      <div><h3 className="font-semibold">4. Stem mixer</h3><p className="mt-1 text-sm text-muted-foreground">Live Web Audio playback applies mute, solo, faders and master level immediately. Offline export renders the selected levels to WAV.</p></div>
      {showTracks ? <div className="space-y-3">{tracks.map((track) => <div key={track.id} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{track.name}</strong><span className="text-xs text-muted-foreground">{track.buffer.duration.toFixed(2)} sec</span></div><label className="mt-2 block text-xs">Volume {track.volume}%<input className="mt-1 block w-full" type="range" min="0" max="150" step="1" value={track.volume} onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })} /></label></div><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={track.muted} onChange={(event) => updateTrack(track.id, { muted: event.target.checked })} /> Mute</label><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={track.solo} onChange={(event) => updateTrack(track.id, { solo: event.target.checked })} /> Solo</label></div>)}</div> : <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted-foreground">Separate the imported track to unlock individual drum, bass, other and vocal controls. The original track remains available for A/B playback.</p>}
      <label className="block text-sm">Master volume: {masterVolume}%<input className="mt-2 block w-full" type="range" min="0" max="125" step="1" value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} /></label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant={liveMixerPlaying ? "default" : "outline"} disabled={!sourceBuffer} onClick={() => liveMixerPlaying ? stopLiveMixer() : void startLiveMixer()}>{liveMixerPlaying ? "Stop live mixer" : "Play live mixer"}</Button><Button type="button" variant="outline" disabled={!sourceBuffer} onClick={() => void previewMix()}>Render mix preview</Button><Button type="button" disabled={!sourceBuffer} onClick={() => void exportMix(false, false)}>Export custom mix WAV</Button>{tracks.length ? <><Button type="button" variant="outline" onClick={() => void exportAllStemsZip()}>Download all stems (ZIP)</Button><Button type="button" variant="ghost" onClick={() => { for (const track of tracks) downloadBlob(audioBufferToWav(track.buffer), `env-${track.name.toLowerCase()}.wav`); }}>Export stems individually</Button></> : null}</div>
    </div>

    <div className="space-y-4 rounded-xl border border-border p-4">
      <div><h3 className="font-semibold">5. Duet / vocal replace</h3><p className="mt-1 text-sm text-muted-foreground">Record multiple local takes while the track plays, then export the chosen instrumental/mix plus takes as a WAV.</p></div>
      <div className="rounded-lg bg-surface-2 p-3 text-sm">Microphone audio is kept locally. Takes are saved in this browser when IndexedDB storage is available and are restored when you select the same source file again. Browser data can be cleared or evicted, so download important takes as a backup. For best alignment, seek to the desired song position before recording.</div>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={!sourceBuffer || recording} onClick={() => void startRecording()}>Record vocal take</Button><Button type="button" variant="outline" disabled={!recording} onClick={stopRecording}>Stop recording</Button></div>
      <div><div className="mb-1 flex justify-between text-xs"><span>Microphone peak</span><span>{Math.round(micLevel * 100)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className={`h-full transition-all ${micLevel > 0.92 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${Math.min(100, micLevel * 100)}%` }} /></div>{micLevel > 0.92 ? <p className="mt-1 text-xs text-red-600">Clipping risk — reduce the microphone input level if your device allows it.</p> : null}</div>
      {takes.length ? <div className="space-y-2">{takes.map((take) => <div key={take.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"><div><strong className="text-sm">{take.name}</strong><p className="text-xs text-muted-foreground">Starts at {take.startAt.toFixed(2)} sec · {take.savedLocally ? "saved in this browser" : "session-only; download before leaving"}</p></div><div className="flex gap-2"><audio src={take.url} controls className="max-w-[180px]" aria-label={`Playback for ${take.name}`} /><Button size="sm" variant="outline" onClick={() => downloadBlob(take.blob, `${take.name.toLowerCase().replaceAll(" ", "-")}.${take.blob.type.includes("ogg") ? "ogg" : "webm"}`)}>Save take</Button><Button size="sm" variant="ghost" onClick={() => void removeTake(take)}>Remove</Button></div></div>)}</div> : <p className="text-sm text-muted-foreground">No takes recorded yet.</p>}
      <Button type="button" disabled={!sourceBuffer} onClick={() => void exportMix(false)}>Export duet mix WAV</Button>
    </div>

    <div className="space-y-3 rounded-xl border border-border p-4">
      <div><h3 className="font-semibold">6. Karaoke</h3><p className="mt-1 text-sm text-muted-foreground">Use the instrumental stem, add lyrics for display and export a WAV. Lyrics are not automatically time-synced.</p></div>
      <textarea value={lyrics} onChange={(event) => setLyrics(event.target.value)} rows={5} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" placeholder="Paste lyrics here (display only; no claim of perfect automatic sync)" aria-label="Karaoke lyrics" />
      {lyrics.trim() ? <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{lyrics}</pre> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={!tracks.length} onClick={() => void previewMix(true)}>Preview instrumental only</Button><Button type="button" disabled={!tracks.length} onClick={() => void exportMix(true, false)}>Export karaoke instrumental WAV</Button><a href="/tools/audio/music-separator" className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">Open separator</a></div>
    </div>
    <ErrorBanner message={error} />
    {status ? <p role="status" aria-live="polite" className="rounded-lg bg-surface-2 p-3 text-sm text-muted-foreground">{status}</p> : null}
    <p className="text-xs text-muted-foreground">Separation model source: StemSplit Demucs ONNX browser model. Local audio is not sent to enV servers by this workflow. The downloaded runtime/model are third-party assets requested from their published CDNs; the first model download is large. Results are best-effort and should be checked before commercial use.</p>
  </section>;
}
