import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowRight, AudioLines, Captions, CheckCircle2, FileAudio, Gauge, Headphones, Mic, Music2, Radio, Scissors, SlidersHorizontal, Sparkles, Upload, Waves, Zap } from "lucide-react";
import { strToU8, zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob } from "@/lib/utils";
import { browserSeparationLimitSeconds, estimateBpm, estimateBrowserSeparationWorkingSetBytes, estimateKey, isSupportedDemucsStemTensorDims, suggestCapoShapes, suggestDiatonicChords } from "@/lib/engines/audio-studio";
import { deleteStoredMusicTake, deleteStoredMusicTakes, listStoredMusicTakes, musicSourceKey, saveStoredMusicTake, type StoredMusicTake } from "@/lib/engines/audio-music-storage";
import { deleteAudioSession, loadAudioSessionFile, saveAudioSessionFile } from "@/lib/engines/audio-session-storage";
import { connectVocalPreset, VOCAL_PRESETS, type VocalPresetId } from "@/lib/engines/vocal-presets";

type StudioMode = "separate" | "mixer" | "practice" | "duet" | "karaoke";
const MUSIC_STUDIO_TABS = [
  { label: "Split stems", slug: "music-separator", key: "separate", Icon: Scissors },
  { label: "Mix stems", slug: "music-stem-mixer", key: "mixer", Icon: SlidersHorizontal },
  { label: "Practice", slug: "music-practice", key: "practice", Icon: Headphones },
  { label: "Record vocals", slug: "music-duet", key: "duet", Icon: Mic },
  { label: "Karaoke", slug: "music-karaoke", key: "karaoke", Icon: Music2 },
] as const;
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

function updateAudioSessionQuery(sessionId: string | null) {
  if (typeof window === "undefined") return;
  const current = new URL(window.location.href);
  if (sessionId) current.searchParams.set("audioSessionId", sessionId);
  else current.searchParams.delete("audioSessionId");
  window.history.replaceState(null, "", `${current.pathname}${current.search}${current.hash}`);
}


function currentLiveMixerPosition(live: LiveMixerState | null): number | null {
  if (!live) return null;
  const elapsed = Math.max(0, live.context.currentTime - live.startedAt) * live.playbackRate;
  const position = live.startOffset + elapsed;
  if (live.looping && live.loopEnd > live.loopStart && position >= live.loopEnd) {
    return live.loopStart + ((position - live.loopStart) % (live.loopEnd - live.loopStart));
  }
  return position;
}

const AUDIO_FILE_HANDOFF_SLUGS = new Set([
  "audio-to-wav", "audio-to-wav-server", "audio-to-mp3-server", "audio-to-ogg-server", "audio-to-flac-server",
  "audio-sample-rate-converter", "audio-channel-converter", "audio-bitrate-converter", "audio-to-mono", "audio-to-stereo",
  "audio-trimmer", "audio-fade-in", "audio-fade-out", "audio-volume-control", "audio-reverser", "audio-normalizer",
  "voice-noise-reducer", "voice-noise-gate", "audio-hum-reducer", "audio-trim-silence", "audio-pitch-shift", "audio-tempo-change",
  "audio-compressor", "audio-eq-simple", "audio-file-inspector", "audio-peak-meter", "audio-rms-meter", "audio-silence-detector",
  "audio-dc-offset-checker", "audio-waveform-generator", "audio-lufs-meter", "audio-spectrogram", "webcodecs-audio-checker",
  "audio-to-text", "audio-to-subtitles", "audio-joiner-local", "audio-joiner", "audio-merger", "music-studio", "music-separator",
  "music-duet", "music-karaoke", "music-stem-mixer", "music-practice",
]);

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
  const [platform, setPlatform] = useState(initialPlatform ?? "podcast");
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [fileMeta, setFileMeta] = useState<{ duration: string; rate: string; channels: string } | null>(null);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [metaError, setMetaError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [persistenceNotice, setPersistenceNotice] = useState("");
  const sourceLoadSequenceRef = useRef(0);
  const pickerRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  const workspaces: Record<string, { title: string; eyebrow: string; subtitle: string; icon: typeof AudioLines; accent: string; actions: Array<{ title: string; slug: string; detail: string; icon: typeof AudioLines; badge?: string }> }> = {
    convert: { title: "Convert Studio", eyebrow: "AUDIO WORKSPACE / 01", subtitle: "Convert formats, sample rates and channel layouts from one focused workspace.", icon: AudioLines, accent: "from-sky-500/15 via-cyan-500/5 to-transparent", actions: [
      { title: "Convert to WAV", slug: "audio-to-wav", detail: "Local PCM export", icon: FileAudio, badge: "LOCAL" }, { title: "Convert format", slug: "audio-to-mp3-server", detail: "MP3, OGG or FLAC via configured media processor", icon: ArrowRight, badge: "SERVER" }, { title: "Sample rate", slug: "audio-sample-rate-converter", detail: "Resample for your delivery workflow", icon: Activity }, { title: "Channels", slug: "audio-channel-converter", detail: "Mono and stereo conversion", icon: SlidersHorizontal }, { title: "Bitrate", slug: "audio-bitrate-converter", detail: "Adjust compressed output bitrate", icon: Gauge },
    ] },
    edit: { title: "Edit Studio", eyebrow: "AUDIO WORKSPACE / 02", subtitle: "Shape a recording with practical edits and cleanup tools. Keep the original untouched.", icon: Scissors, accent: "from-violet-500/15 via-fuchsia-500/5 to-transparent", actions: [
      { title: "Trim & cut", slug: "audio-trimmer", detail: "Choose a precise start and end", icon: Scissors, badge: "START HERE" }, { title: "Fade in / out", slug: "audio-fade-in", detail: "Smooth the beginning or ending", icon: Waves }, { title: "Clean voice", slug: "voice-noise-reducer", detail: "Reduce steady background noise", icon: Activity }, { title: "Remove hum", slug: "audio-hum-reducer", detail: "Target 50 Hz or 60 Hz hum", icon: Radio }, { title: "EQ & compression", slug: "audio-eq-simple", detail: "Tone shaping and dynamics", icon: SlidersHorizontal }, { title: "Normalize", slug: "audio-normalizer", detail: "Set a safer peak level", icon: Gauge },
    ] },
    analyze: { title: "Analyze Studio", eyebrow: "AUDIO WORKSPACE / 03", subtitle: "Inspect levels, structure and spectral content before making changes.", icon: Activity, accent: "from-emerald-500/15 via-teal-500/5 to-transparent", actions: [
      { title: "File inspector", slug: "audio-file-inspector", detail: "Duration, channels, frames and sample rate", icon: FileAudio, badge: "OVERVIEW" }, { title: "Peak & RMS", slug: "audio-peak-meter", detail: "Measure signal level and headroom", icon: Gauge }, { title: "Silence detector", slug: "audio-silence-detector", detail: "Find quiet regions and gaps", icon: Waves }, { title: "Waveform image", slug: "audio-waveform-generator", detail: "Export a visual waveform", icon: AudioLines }, { title: "Spectrogram", slug: "audio-spectrogram", detail: "Inspect frequency energy over time", icon: Activity }, { title: "Loudness estimate", slug: "audio-lufs-meter", detail: "RMS-based estimate, not LUFS certification", icon: Radio },
    ] },
    calc: { title: "Audio Calculator", eyebrow: "AUDIO WORKSPACE / 04", subtitle: "Plan delivery size, bitrate and duration with fast, transparent calculations.", icon: Gauge, accent: "from-amber-500/15 via-orange-500/5 to-transparent", actions: [
      { title: "Bitrate ↔ size", slug: "audio-bitrate-calculator", detail: "Solve for bitrate or estimated file size", icon: Gauge, badge: "POPULAR" }, { title: "File size", slug: "audio-file-size-calculator", detail: "Compare compressed and PCM estimates", icon: FileAudio }, { title: "Duration", slug: "audio-duration-tool", detail: "Calculate audio runtime", icon: Activity },
    ] },
    transcribe: { title: "Transcription Studio", eyebrow: "AUDIO WORKSPACE / 05", subtitle: "Turn speech into text or subtitle files when the transcription service is configured.", icon: Captions, accent: "from-blue-500/15 via-indigo-500/5 to-transparent", actions: [
      { title: "Audio to text", slug: "audio-to-text", detail: "Generate an editable transcript", icon: Captions, badge: "STT SERVICE" }, { title: "Audio to subtitles", slug: "audio-to-subtitles", detail: "Create timed subtitle output", icon: FileAudio, badge: "STT SERVICE" },
    ] },
    import: { title: "Record & Import", eyebrow: "AUDIO WORKSPACE / 06", subtitle: "Bring in a local recording, capture a take, or generate utility audio.", icon: Mic, accent: "from-rose-500/15 via-pink-500/5 to-transparent", actions: [
      { title: "Record audio", slug: "audio-recorder", detail: "Capture microphone audio to WAV", icon: Mic, badge: "LOCAL" }, { title: "Join recordings", slug: "audio-joiner-local", detail: "Arrange files and export one WAV", icon: AudioLines }, { title: "Tone generator", slug: "audio-tone-generator", detail: "Create a test tone or noise", icon: Radio }, { title: "Metronome", slug: "audio-metronome", detail: "Set tempo and generate click tracks", icon: Activity }, { title: "Music Studio", slug: "music-studio", detail: "Separate stems, practice and record a duet", icon: Music2, badge: "FLAGSHIP" },
    ] },
    platform: { title: "Delivery Guide", eyebrow: "AUDIO WORKSPACE / 07", subtitle: "Pick a destination to view practical export references, then open the relevant tool.", icon: Headphones, accent: "from-cyan-500/15 via-blue-500/5 to-transparent", actions: [
      { title: "Prepare a master", slug: "audio-file-inspector", detail: "Check your source before delivery", icon: FileAudio }, { title: "Measure levels", slug: "audio-lufs-meter", detail: "Compare an approximate loudness reading", icon: Gauge }, { title: "Convert format", slug: "audio-to-wav", detail: "Create a local WAV master", icon: AudioLines },
    ] },
  };
  const w = workspaces[studio] ?? workspaces.platform;
  const Icon = w.icon;
  const presets: Record<string, { format: string; sample: string; loudness: string; bitrate: string; note: string }> = {
    podcast: { format: "MP3/AAC for publishing · WAV master", sample: "44.1 or 48 kHz", loudness: "−16 LUFS stereo / −19 LUFS mono are common targets", bitrate: "128–192 kbps stereo is common", note: "Check your hosting provider's current requirements." },
    discord: { format: "Opus in voice workflows", sample: "44.1 or 48 kHz source", loudness: "No universal upload target", bitrate: "Depends on channel and call settings", note: "Call quality is also controlled by codec and network conditions." },
    spotify: { format: "Lossless delivery master when requested", sample: "Preserve the production master; 44.1 kHz is common", loudness: "−14 LUFS is a playback-normalization reference, not a mastering mandate", bitrate: "Keep a lossless master", note: "Confirm distributor delivery requirements." },
    instagram: { format: "AAC in common video workflows", sample: "44.1 or 48 kHz source", loudness: "No universal creator-side target", bitrate: "Keep a high-quality source", note: "The platform may re-encode video and audio." },
    "apple-music": { format: "WAV/PCM or distributor-requested lossless format", sample: "Preserve the native master resolution where supported", loudness: "No universal delivery LUFS target", bitrate: "Avoid unnecessary lossy conversion", note: "Requirements depend on distributor and asset type." },
    youtube: { format: "AAC, Opus or PCM depending on video pipeline", sample: "48 kHz is practical for video workflows", loudness: "Playback normalization varies; avoid clipping", bitrate: "Keep high-quality source audio", note: "These are workflow hints, not acceptance guarantees." },
    tiktok: { format: "AAC commonly embedded in video", sample: "44.1 or 48 kHz source", loudness: "No universal creator-side target", bitrate: "Keep a high-quality source", note: "Review the final upload on-device." },
    twitch: { format: "AAC in common streaming pipelines", sample: "44.1 or 48 kHz source", loudness: "Avoid clipping; use a consistent mix", bitrate: "Set by streaming encoder/profile", note: "Monitor the actual stream output." },
  };
  const preset = presets[platform] ?? presets.podcast;
  const onPickFile = useCallback(async (picked?: File, existingSessionId?: string) => {
    const sequence = ++sourceLoadSequenceRef.current;
    const next = picked ?? null;
    const routeSessionId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("audioSessionId") : null;
    const previousSessionId = sessionId ?? (!existingSessionId ? routeSessionId : null);
    setFile(next); setFileMeta(null); setWaveform([]); setMetaError(""); setSessionId(null); setPersistenceNotice("");
    if (previousSessionId && previousSessionId !== existingSessionId) {
      try { await deleteAudioSession(previousSessionId); }
      catch { if (sequence === sourceLoadSequenceRef.current) setPersistenceNotice("The previous saved handoff could not be removed from local browser storage."); }
      if (sequence !== sourceLoadSequenceRef.current) return;
    }
    if (!existingSessionId && routeSessionId) updateAudioSessionQuery(null);
    setAudioUrl(next ? URL.createObjectURL(next) : "");
    if (!next) return;
    if (next.size > 250 * 1024 * 1024) {
      setMetaError("This dashboard preview and cross-tool handoff support files up to 250 MB. Select a shorter file for the browser workflow.");
      setPersistenceNotice("The file was not copied into browser storage.");
      return;
    }
    if (existingSessionId) {
      setSessionId(existingSessionId);
      setPersistenceNotice("Restored from the existing local browser session. Storage can still be cleared or evicted.");
    } else {
      try {
        const saved = await saveAudioSessionFile(next);
        if (sequence !== sourceLoadSequenceRef.current) { void deleteAudioSession(saved.id).catch(() => undefined); return; }
        setSessionId(saved.id);
        updateAudioSessionQuery(saved.id);
        setPersistenceNotice("Saved locally for up to 7 days for cross-tool handoff. The source ID only works in this browser. Browser storage can still be cleared or evicted.");
      } catch (cause) {
        if (sequence !== sourceLoadSequenceRef.current) return;
        setPersistenceNotice(`Preview is available, but cross-tool handoff could not be saved locally: ${cause instanceof Error ? cause.message : "browser storage unavailable"}. You can still select the file directly inside a tool.`);
      }
    }
    try {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) throw new Error("Audio preview is not supported in this browser.");
      const ctx = new Ctx();
      try {
        const decoded = await ctx.decodeAudioData(await next.arrayBuffer());
        if (sequence !== sourceLoadSequenceRef.current) return;
        setFileMeta({ duration: `${Math.floor(decoded.duration / 60)}:${String(Math.floor(decoded.duration % 60)).padStart(2, "0")}`, rate: `${(decoded.sampleRate / 1000).toFixed(1)} kHz`, channels: decoded.numberOfChannels === 1 ? "Mono" : `${decoded.numberOfChannels} channels` });
        const samples = decoded.getChannelData(0); const bars = 96; const peaks: number[] = [];
        for (let b = 0; b < bars; b++) { const from = Math.floor(b * samples.length / bars); const to = Math.max(from + 1, Math.floor((b + 1) * samples.length / bars)); let peak = 0; for (let i = from; i < Math.min(to, samples.length); i++) peak = Math.max(peak, Math.abs(samples[i])); peaks.push(Math.max(0.035, peak)); }
        setWaveform(peaks);
      } finally { await ctx.close().catch(() => undefined); }
    } catch (e) {
      if (sequence === sourceLoadSequenceRef.current) setMetaError(e instanceof Error ? e.message : "Could not inspect this file in the browser.");
    }
  }, [sessionId]);
  const toolUrl = (slug: string) => {
    const base = `/tools/audio/${slug}`;
    return sessionId && file && AUDIO_FILE_HANDOFF_SLUGS.has(slug) ? `${base}?audioSessionId=${encodeURIComponent(sessionId)}` : base;
  };
  const onPickFileRef = useRef(onPickFile);
  onPickFileRef.current = onPickFile;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("audioSessionId");
    if (!id) return;
    let active = true;
    const initialSequence = sourceLoadSequenceRef.current;
    void loadAudioSessionFile(id).then(async (savedFile) => {
      if (!active || initialSequence !== sourceLoadSequenceRef.current) return;
      if (savedFile) await onPickFileRef.current(savedFile, id);
      else setPersistenceNotice("The previous local audio session is unavailable or expired. Import the file again to continue.");
    }).catch(() => {
      if (active && initialSequence === sourceLoadSequenceRef.current) setPersistenceNotice("Could not restore the local audio session. Import the file again to continue.");
    });
    return () => { active = false; };
  }, []);
  const isPlatform = studio === "platform";
  return <section className="overflow-hidden rounded-2xl border border-border bg-background">
    <div className={`relative overflow-hidden border-b border-border bg-gradient-to-br ${w.accent} px-5 py-6 sm:px-7 sm:py-8`}>
      <div className="absolute right-4 top-3 opacity-[0.07] sm:right-8 sm:top-5"><Icon size={132} strokeWidth={1}/></div>
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl"><div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary"/>{w.eyebrow}</div><h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{w.title}</h2><p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">{w.subtitle}</p></div>
        <div className="flex flex-wrap gap-2"><a href={toolUrl("music-live-video-studio")} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-4 text-sm font-medium transition hover:bg-primary/10"><Music2 size={16}/> Live Video Studio <ArrowRight size={15}/></a><a href={toolUrl("music-studio")} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-background/80 px-4 text-sm font-medium transition hover:bg-surface-2"><Music2 size={16}/> Music Studio <ArrowRight size={15}/></a></div>
      </div>
      <div className="relative mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <div className="rounded-xl border border-border/70 bg-background/75 px-3 py-2"><span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Processing</span><strong className="text-sm">{studio === "transcribe" ? "Configured service" : studio === "convert" ? "Local + server" : "Browser-first"}</strong></div>
        <div className="rounded-xl border border-border/70 bg-background/75 px-3 py-2"><span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Workspace</span><strong className="text-sm">{studio === "edit" ? "Non-destructive source" : studio === "analyze" ? "Inspect before export" : studio === "platform" ? "Delivery references" : "Ready for a file"}</strong></div>
      </div>
    </div>
    <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-5">
        {isPlatform ? <div className="rounded-xl border border-border bg-surface-2/50 p-4"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold">Destination</h3><span className="text-xs text-muted-foreground">Delivery reference</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Podcast","podcast"],["Spotify","spotify"],["Apple Music","apple-music"],["YouTube","youtube"],["Instagram","instagram"],["TikTok","tiktok"],["Twitch","twitch"],["Discord","discord"]].map(([label,value])=><button key={value} type="button" aria-pressed={platform===value} onClick={()=>setPlatform(value)} className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition ${platform===value?"border-primary bg-primary/10 font-semibold":"border-border bg-background hover:bg-surface-2"}`}>{label}</button>)}</div><div className="mt-4 grid gap-2 sm:grid-cols-2">{[["Format",preset.format],["Sample rate",preset.sample],["Loudness",preset.loudness],["Bitrate",preset.bitrate]].map(([label,value])=><div key={label} className="rounded-lg border border-border bg-background p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>)}</div><p className="mt-3 text-xs text-muted-foreground">{preset.note} Guidance only — not a platform acceptance guarantee.</p></div> : <div className="rounded-xl border border-dashed border-border bg-surface-2/40 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Session source</h3><p className="mt-1 text-xs text-muted-foreground">Import once, then carry the same local source into supported tools without selecting it again.</p></div><button type="button" onClick={()=>pickerRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"><Upload size={16}/> Import audio</button></div>
          <input ref={pickerRef} className="sr-only" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac" onChange={e=>{const picked=e.target.files?.[0]; if(picked) void onPickFile(picked); e.currentTarget.value="";}}/>
          {!file ? <button type="button" onClick={()=>pickerRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void onPickFile(e.dataTransfer.files?.[0]);}} className="mt-4 flex min-h-28 w-full flex-col items-center justify-center rounded-xl border border-border bg-background px-4 py-5 text-center transition hover:border-primary/60 hover:bg-surface-2"><FileAudio size={27} className="mb-2 text-muted-foreground"/><span className="text-sm font-medium">Drop an audio file here or browse</span><span className="mt-1 text-xs text-muted-foreground">MP3 · WAV · M4A · OGG · FLAC (browser-supported formats)</span></button> : <div className="mt-4 rounded-xl border border-border bg-background p-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><AudioLines size={22}/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{file.name}</div><div className="mt-1 text-xs text-muted-foreground">{fileMeta ? `${fileMeta.duration} · ${fileMeta.rate} · ${fileMeta.channels} · ${(file.size/1048576).toFixed(2)} MB` : metaError || "Reading audio metadata…"}</div></div><button type="button" onClick={()=>void onPickFile(undefined)} className="rounded-md border border-border px-3 py-2 text-xs hover:bg-surface-2">Clear</button></div>{waveform.length ? <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-950 px-2 py-3" aria-label="Audio waveform preview"><div className="flex h-16 items-center gap-[2px] overflow-hidden">{waveform.map((peak,index)=><span key={index} className="min-w-0 flex-1 rounded-full bg-cyan-300/80" style={{height:`${Math.max(7,peak*100)}%`}}/>)}</div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>0:00</span><span>Waveform preview</span><span>{fileMeta?.duration ?? "—"}</span></div></div> : null}{audioUrl ? <audio className="mt-3 w-full" controls preload="metadata" src={audioUrl}/> : null}<p className="mt-2 text-[11px] text-muted-foreground">{persistenceNotice || "Select a supported workflow to hand this source to its tool."} {sessionId ? "Tools restore it from local browser storage; server tools upload only when you explicitly start conversion." : "If local storage is unavailable, the destination tool will ask you to select the file again."}</p></div>}
        </div>}
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">{isPlatform ? "Recommended actions" : "Choose a workflow"}</h3><p className="mt-1 text-xs text-muted-foreground">Open a focused tool with its own controls and export action.</p></div><span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{w.actions.length} tools</span></div>
        <div className="grid gap-3 sm:grid-cols-2">{w.actions.map((action)=>{const ActionIcon=action.icon;return <a key={action.slug+action.title} href={toolUrl(action.slug)} className="group flex min-h-[112px] gap-3 rounded-xl border border-border bg-background p-4 transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-foreground transition group-hover:bg-primary/10 group-hover:text-primary"><ActionIcon size={21}/></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm">{action.title}</strong>{action.badge?<span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-bold tracking-wide text-muted-foreground">{action.badge}</span>:null}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{action.detail}</span><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">Open tool <ArrowRight size={13} className="transition group-hover:translate-x-0.5"/></span></span></a>})}</div>
      </div>
      <aside className="space-y-4">
        <div className="rounded-xl border border-border p-4"><div className="flex items-center gap-2"><Sparkles size={17} className="text-primary"/><h3 className="font-semibold">Studio shortcuts</h3></div><div className="mt-3 space-y-2">{STUDIO_LINKS.filter(x=>!x.href.endsWith(`audio-${studio}-studio`)).map(item=><a key={item.href} href={sessionId && file ? `${item.href}?audioSessionId=${encodeURIComponent(sessionId)}` : item.href} className="flex min-h-10 items-center justify-between gap-2 rounded-lg px-2 text-sm transition hover:bg-surface-2"><span>{item.title.replace(" Studio","")}</span><ArrowRight size={14} className="text-muted-foreground"/></a>)}</div></div>
        <div className="rounded-xl border border-border bg-surface-2/50 p-4"><div className="flex items-center gap-2"><Zap size={17}/><h3 className="font-semibold">Session notes</h3></div>{studio === "transcribe" ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Transcription uploads audio to the configured media endpoint. If the service is unavailable, the tool reports setup or connection status.</p> : studio === "platform" ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Delivery requirements change by distributor, asset type and workflow. Verify official specifications before final export.</p> : studio === "analyze" ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Peak and RMS are measured from decoded samples. The loudness tool is an estimate, not BS.1770/EBU R128 certification.</p> : studio === "import" ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Use audio you own or have permission to process. enV does not download DRM-protected streaming tracks.</p> : <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Local tools process supported audio in your browser. Server conversion is labeled before upload. Export creates a separate output file.</p>}</div>
      </aside>
    </div>
  </section>;
}

export function AudioMusicStudio({ mode = "separate" }: { mode?: string }) {
  const normalizedMode: StudioMode = mode.includes("duet") ? "duet" : mode.includes("karaoke") ? "karaoke" : mode.includes("stem-mixer") || mode.includes("mixer") ? "mixer" : mode.includes("practice") ? "practice" : "separate";
  const [activeMode, setActiveMode] = useState<StudioMode>(normalizedMode);
  const [file, setFile] = useState<File | null>(null);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [handoffSessionId, setHandoffSessionId] = useState<string | null>(null);
  const handoffSessionIdRef = useRef<string | null>(null);
  const updateHandoffSessionId = (id: string | null) => { handoffSessionIdRef.current = id; setHandoffSessionId(id); };
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
  const [duetPresetId, setDuetPresetId] = useState<VocalPresetId>("pop");
  const [duetMonitorMic, setDuetMonitorMic] = useState(false);
  const [analysis, setAnalysis] = useState<{ bpm: number | null; key: string | null } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recordingContextRef = useRef<AudioContext | null>(null);
  const stopRecordingEffectsRef = useRef<(() => void) | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const takeStartRef = useRef(0);
  const takesRef = useRef<VocalTake[]>([]);
  const sourceKeyRef = useRef("");
  const recordingSourceKeyRef = useRef("");
  const fileLoadSequenceRef = useRef(0);
  const chooseFileRef = useRef<(selected: File | undefined, existingSessionId?: string) => Promise<void>>(async () => undefined);
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
    stopRecordingEffectsRef.current?.(); stopRecordingEffectsRef.current = null;
    const recordingContext = recordingContextRef.current; recordingContextRef.current = null;
    if (recordingContext) void recordingContext.close().catch(() => undefined);
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

  async function chooseFile(selected: File | undefined, existingSessionId?: string) {
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
      let handoffNote = "";
      if (existingSessionId) {
        updateHandoffSessionId(existingSessionId);
        handoffNote = " · Source is available through a short-lived local handoff";
      } else {
        const previousHandoffId = handoffSessionIdRef.current;
        try {
          if (previousHandoffId) {
            await deleteAudioSession(previousHandoffId).catch(() => undefined);
            if (loadSequence !== fileLoadSequenceRef.current) return;
          }
          updateHandoffSessionId(null);
          updateAudioSessionQuery(null);
          const saved = await saveAudioSessionFile(selected);
          if (loadSequence !== fileLoadSequenceRef.current) { void deleteAudioSession(saved.id).catch(() => undefined); return; }
          updateHandoffSessionId(saved.id);
          updateAudioSessionQuery(saved.id);
          handoffNote = " · Source saved locally for up to 7 days for cross-mode handoff; browser storage may be cleared or evicted";
        } catch (cause) {
          if (loadSequence !== fileLoadSequenceRef.current) return;
          handoffNote = ` · Cross-mode handoff unavailable: ${cause instanceof Error ? cause.message : "local browser storage unavailable"}`;
        }
      }
      if (loadSequence !== fileLoadSequenceRef.current) return;
      const url = URL.createObjectURL(selected);
      const sourceKey = musicSourceKey(selected);
      sourceKeyRef.current = sourceKey;
      setFile(selected); setSourceBuffer(buffer); setSourceUrl(url); sourceUrlRef.current = url;
      let baseStatus = `Ready · ${buffer.duration.toFixed(2)} seconds · ${buffer.sampleRate.toLocaleString()} Hz · ${buffer.numberOfChannels} channel(s)${handoffNote}`;
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

  chooseFileRef.current = chooseFile;

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("audioSessionId");
    if (!sessionId) return;
    updateHandoffSessionId(sessionId);
    const initialSequence = fileLoadSequenceRef.current;
    let active = true;
    void loadAudioSessionFile(sessionId).then(async (restored) => {
      if (!active || initialSequence !== fileLoadSequenceRef.current) return;
      if (!restored) { setError("The linked local audio session is unavailable or expired. Import the source file again."); return; }
      await chooseFileRef.current(restored, sessionId);
      if (active) setStatus((current) => current.startsWith("Ready") ? `${current} · Restored from Audio Studio local handoff` : current);
    }).catch((cause) => {
      if (active && initialSequence === fileLoadSequenceRef.current) setError(cause instanceof Error ? `Could not restore the Audio Studio source: ${cause.message}` : "Could not restore the Audio Studio source.");
    });
    return () => { active = false; };
  }, []);

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

  async function sendStemToLiveVideo(track: StemTrack) {
    try {
      setError(null); setStatus(`Preparing ${track.name} for Live Video Studio locally…`);
      const fileName = `env-${track.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-stem.wav`;
      const stemFile = new File([audioBufferToWav(track.buffer)], fileName, { type: "audio/wav" });
      const saved = await saveAudioSessionFile(stemFile);
      window.location.href = `/tools/audio/music-live-video-studio?audioSessionId=${encodeURIComponent(saved.id)}`;
    } catch (cause) {
      setError(cause instanceof Error ? `Could not hand off this stem locally: ${cause.message}` : "Could not hand off this stem locally.");
    }
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
    const handoffId = handoffSessionIdRef.current;
    if (handoffId) {
      try { await deleteAudioSession(handoffId); updateHandoffSessionId(null); }
      catch (cause) { setError(cause instanceof Error ? `Session cleared, but the local source handoff could not be removed: ${cause.message}` : "Session cleared, but the local source handoff could not be removed."); }
    }
    updateAudioSessionQuery(null);
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
      const Ctx = contextConstructor();
      if (!Ctx) { stream.getTracks().forEach((track) => track.stop()); throw new Error("This browser does not support the local vocal-effects chain required for a processed take."); }
      const context = new Ctx(); await context.resume();
      const micInput = context.createMediaStreamSource(stream);
      const recordDestination = context.createMediaStreamDestination();
      const voiceBus = context.createGain();
      const preset = VOCAL_PRESETS.find((item) => item.id === duetPresetId) ?? VOCAL_PRESETS[0];
      const stopEffects = connectVocalPreset(context, micInput, voiceBus, preset.available ? duetPresetId : "clean");
      voiceBus.connect(recordDestination);
      if (duetMonitorMic) voiceBus.connect(context.destination);
      const recorder = new MediaRecorder(recordDestination.stream);
      const chunks: BlobPart[] = [];
      recorderStreamRef.current = stream; recorderRef.current = recorder;
      recordingContextRef.current = context; stopRecordingEffectsRef.current = stopEffects;
      takeStartRef.current = currentLiveMixerPosition(liveMixerRef.current) ?? audioRef.current?.currentTime ?? 0;
      recordingSourceKeyRef.current = sourceKeyRef.current;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => setError("The microphone recording stopped because the browser reported an error.");
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        stopRecordingEffectsRef.current?.(); stopRecordingEffectsRef.current = null;
        const closingContext = recordingContextRef.current; recordingContextRef.current = null;
        if (closingContext) void closingContext.close().catch(() => undefined);
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
      {
        const context = recordingContextRef.current!;
        const input = context.createMediaStreamSource(stream); const analyser = context.createAnalyser(); analyser.fftSize = 1024; input.connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        const measure = () => { analyser.getByteTimeDomainData(samples); let peak = 0; for (const value of samples) peak = Math.max(peak, Math.abs(value - 128) / 128); setMicLevel(peak); meterFrameRef.current = requestAnimationFrame(measure); };
        measure();
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
  const workflowIsReady = Boolean(sourceBuffer);
  const workflowHasOutput = tracks.length > 0 || takes.length > 0 || Boolean(mixUrl);
  const activeWorkspace = MUSIC_STUDIO_TABS.find((tab) => tab.key === activeMode) ?? MUSIC_STUDIO_TABS[0];
  const chooseWorkspace = (nextMode: StudioMode) => {
    setActiveMode(nextMode);
    const nextTab = MUSIC_STUDIO_TABS.find((tab) => tab.key === nextMode);
    if (nextTab && typeof window !== "undefined") {
      const next = new URL(window.location.href);
      next.pathname = `/tools/audio/${nextTab.slug}`;
      if (handoffSessionId) next.searchParams.set("audioSessionId", handoffSessionId);
      else next.searchParams.delete("audioSessionId");
      window.history.replaceState(null, "", `${next.pathname}${next.search}${next.hash}`);
    }
  };
  const studioWave = [18, 31, 23, 48, 37, 59, 26, 40, 72, 35, 24, 54, 83, 44, 29, 63, 38, 24, 50, 70, 32, 19, 42, 61, 34, 49, 76, 30, 22, 46, 64, 28, 39, 56, 24, 43, 68, 33, 20, 50, 72, 36, 25, 45, 60, 30, 41, 55];

  return <section className="space-y-5 sm:space-y-6">
    <header className="relative isolate overflow-hidden rounded-[1.75rem] border border-slate-700/80 bg-gradient-to-br from-slate-950 via-[#0b1016] to-slate-900 px-4 py-5 text-white shadow-[0_20px_60px_-30px_rgba(34,211,238,0.5)] sm:px-7 sm:py-7">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden items-center gap-1 pr-7 opacity-20 sm:flex">
        {studioWave.map((height, index) => <span key={index} className="w-1 rounded-full bg-cyan-300" style={{ height: `${height}%` }} />)}
      </div>
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 shadow-inner"><Music2 size={25} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">enV / audio control room</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-4xl">Music Studio</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Load a source, choose a lane, and keep the signal path in view while you split, practice, mix, record, or build a karaoke take.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs"><span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 font-medium text-emerald-100"><span className="size-1.5 rounded-full bg-emerald-300" /> Local processing</span><span className="inline-flex min-h-8 items-center rounded-full border border-white/15 bg-white/5 px-3 text-slate-200">{workflowIsReady ? "Source ready" : "No source loaded"}</span></div><p className="mt-3 w-full text-xs leading-5 text-slate-400 sm:max-w-xs">Safety & processing: local source stays in this browser; model downloads are cached by the browser when needed.</p>
      </div>
      <div className="relative mt-6 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-3">
        {[{ label: "SOURCE", value: workflowIsReady ? file?.name ?? "Loaded source" : "Import once" }, { label: "ACTIVE LANE", value: activeWorkspace.label }, { label: "OUTPUT", value: workflowHasOutput ? "Review available" : "Work in progress" }].map((item) => <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3"><p className="text-[9px] font-semibold tracking-[0.18em] text-cyan-200/70">{item.label}</p><p className="mt-1 truncate text-sm font-semibold text-white">{item.value}</p></div>)}
      </div>
    </header>

    <section aria-labelledby="music-studio-lanes-title" className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Workspace rail</p><h3 id="music-studio-lanes-title" className="mt-1 text-lg font-semibold">Choose your task <span className="sr-only">Choose a workspace</span></h3></div><span className="text-xs text-muted-foreground">{activeWorkspace.label} <span className="mx-1 text-border">/</span> {workflowIsReady ? "Ready to work" : "Add a source first"}</span></div>
      <nav className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" role="tablist" aria-label="Music Studio workspace">
        {MUSIC_STUDIO_TABS.map(({ label, slug, key, Icon }, index) => <button key={slug} id={`music-tab-${key}`} type="button" role="tab" aria-selected={activeMode === key} aria-controls="music-studio-workspace" onClick={() => chooseWorkspace(key)} onKeyDown={(event) => { if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return; event.preventDefault(); const currentIndex = MUSIC_STUDIO_TABS.findIndex((tab) => tab.key === key); const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? MUSIC_STUDIO_TABS.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + MUSIC_STUDIO_TABS.length) % MUSIC_STUDIO_TABS.length; const nextTab = MUSIC_STUDIO_TABS[nextIndex]; if (nextTab) { chooseWorkspace(nextTab.key); document.getElementById(`music-tab-${nextTab.key}`)?.focus(); } }} className={`group flex min-h-12 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeMode === key ? "border-cyan-400/60 bg-slate-950 text-foreground shadow-sm dark:text-white" : "border-border bg-background hover:border-primary/40 hover:bg-surface-2"}`}><span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${activeMode === key ? "bg-cyan-300 text-slate-950" : "bg-surface-2 text-muted-foreground group-hover:text-foreground"}`}><Icon size={16} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Lane {String(index + 1).padStart(2, "0")}</span><span className="mt-0.5 block truncate font-semibold">{label}</span></span>{activeMode === key ? <CheckCircle2 size={14} className="shrink-0 text-cyan-300" aria-hidden="true" /> : null}</button>)}
      </nav>
    </section>

    <div id="music-studio-import" className={`grid gap-4 rounded-2xl border p-4 shadow-sm transition-colors sm:p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,.65fr)] ${isFileDragOver ? "border-cyan-400 bg-cyan-400/5 ring-2 ring-cyan-400/20" : "border-border bg-card"}`} onDragOver={(event) => { event.preventDefault(); setIsFileDragOver(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFileDragOver(false); }} onDrop={(event) => { event.preventDefault(); setIsFileDragOver(false); void chooseFile(event.dataTransfer.files?.[0]); }}>
      <div className="min-w-0 space-y-4">
        <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-600 dark:text-cyan-300"><FileAudio size={19} aria-hidden="true" /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Source lane / 01</p><h3 className="mt-1 text-lg font-semibold">Session source</h3><p className="mt-1 text-sm text-muted-foreground">Import once, then carry the same local source into the active workspace.</p></div>{file && sourceBuffer ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={13} /> Ready</span> : null}</div>
        <label htmlFor="music-studio-source-picker" aria-label="Add audio" className="flex min-h-[104px] cursor-pointer items-center gap-3 rounded-xl border border-dashed border-cyan-400/50 bg-gradient-to-r from-cyan-400/10 to-transparent px-4 py-3 transition hover:border-cyan-400 hover:bg-cyan-400/10 focus-within:ring-2 focus-within:ring-cyan-400"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-700 dark:text-cyan-200"><Upload size={21} aria-hidden="true" /></span><span className="min-w-0"><strong className="block text-sm">{isFileDragOver ? "Release to import your audio file." : "Drop a file here or browse"}</strong><span id="music-import-formats" className="mt-1 block text-xs text-muted-foreground">MP3 · WAV · M4A · OGG · FLAC · WebM</span><span className="mt-1 block text-xs text-muted-foreground">Decoded in this browser; no upload on the local path.</span></span></label>
        <input id="music-studio-source-picker" className="sr-only" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm" aria-describedby="music-import-formats" onChange={(event) => void chooseFile(event.target.files?.[0])} aria-label="Choose a local audio file" />
        {file && sourceBuffer ? <div className="rounded-xl border border-border bg-background p-3" role="status" aria-live="polite"><div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent"><AudioLines size={17} aria-hidden="true" /></span><div className="min-w-0"><strong className="block truncate text-sm">{file.name}</strong><p className="mt-1 text-xs text-muted-foreground">{sourceBuffer.duration.toFixed(2)} sec · {sourceBuffer.sampleRate.toLocaleString()} Hz · {sourceBuffer.numberOfChannels} channel(s) · {(file.size / 1_000_000).toFixed(2)} MB</p></div></div><div className="mt-3 rounded-lg bg-slate-950 px-2 py-3" aria-label="Waveform preview"><div className="flex h-12 items-center gap-[2px] overflow-hidden">{studioWave.concat(studioWave.slice().reverse()).map((height, index) => <span key={index} className="min-w-0 flex-1 rounded-full bg-cyan-300/80" style={{ height: `${Math.max(8, height * 0.7)}%` }} />)}</div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>0:00</span><span>Waveform preview</span><span>{sourceBuffer.duration.toFixed(2)}s</span></div></div></div> : <p className="text-sm text-muted-foreground">Choose a short source to unlock playback, practice, separation and recording. On phones, start with a short clip to keep memory use manageable.</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" onClick={() => void loadDemoTrack()}><AudioLines size={16} className="mr-2" aria-hidden="true" /> Try a demo groove</Button><span className="self-center text-xs text-muted-foreground">A local test source for the control room.</span></div>
        {activeMode === "separate" ? <label className="block text-sm"><span className="font-medium">Stem layout</span><select value={separationMode} onChange={(event) => setSeparationMode(event.target.value as "2" | "4")} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2"><option value="2">2 stems · vocals + instrumental</option><option value="4">4 stems · vocals, drums, bass, other</option></select><span className="mt-1 block text-xs text-muted-foreground">The local model calculates four groups; 2-stem mode combines the instrumental groups.</span></label> : null}
      </div>
      <aside className="flex flex-col rounded-xl border border-border bg-background p-4" aria-label="Session monitor">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Session monitor</p><h3 className="mt-1 font-semibold">{activeWorkspace.label}</h3></div><span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground"><Activity size={16} aria-hidden="true" /></span></div>
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3"><p className="text-xs text-muted-foreground">Transport state</p><p className="mt-1 text-sm font-semibold">{status || (workflowIsReady ? "Source ready for the next move" : "Waiting for a source")}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${workflowIsReady ? 100 : 14}%` }} /></div></div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg border border-border p-3"><span className="block text-muted-foreground">Source</span><strong className="mt-1 block">{workflowIsReady ? "Loaded" : "Empty"}</strong></div><div className="rounded-lg border border-border p-3"><span className="block text-muted-foreground">Output</span><strong className="mt-1 block">{workflowHasOutput ? "Ready" : "None"}</strong></div></div><div className="mt-3 rounded-lg border border-border p-3"><span className="block text-muted-foreground">BPM / key estimate</span><strong className="mt-1 block">{analysis ? `${analysis.bpm ?? "—"} BPM · ${analysis.key ?? "Key not detected"}` : "Not estimated"}</strong></div><div className="mt-3 rounded-lg border border-border p-3"><span className="block text-muted-foreground">Practice guidance</span><strong className="mt-1 block">{analysis?.key ? suggestDiatonicChords(analysis.key).slice(0, 4).map((item) => item.chord).join(" · ") || "No chord hint" : "Estimate a key for chord hints"}</strong>{analysis?.key ? <p className="mt-1 text-[11px] text-muted-foreground">Capo: {suggestCapoShapes(analysis.key).slice(0, 3).map((item) => item.shape + (item.fret ? ` / fret ${item.fret}` : "")).join(" · ") || "No familiar shape"}</p> : null}</div>
        <div className="mt-auto space-y-2 pt-4"><Button type="button" className="min-h-11 w-full" onClick={() => void analyzeTrack()} disabled={!sourceBuffer}><Activity size={16} className="mr-2" aria-hidden="true" /> Estimate BPM / key</Button><Button type="button" variant="outline" className="min-h-11 w-full" disabled={recording || working} onClick={() => void clearMusicSession()}>Clear session & saved takes</Button></div>
      </aside>
    </div>

    <div className="grid grid-cols-3 gap-2" aria-label="Workflow progress">
      {[{ label: "Source", detail: "Import", done: workflowIsReady }, { label: "Work", detail: activeWorkspace.label, done: workflowHasOutput }, { label: "Deliver", detail: workflowHasOutput ? "Review output" : "Export later", done: workflowHasOutput }].map((step, index) => <div key={step.label} className={`flex min-h-16 items-center gap-2 rounded-xl border px-2.5 py-2 sm:px-3 ${step.done ? "border-cyan-400/40 bg-cyan-400/5" : "border-border bg-background"}`}><span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${step.done ? "bg-cyan-400/15 text-cyan-700 dark:text-cyan-300" : "border border-border text-muted-foreground"}`}>{step.done ? <CheckCircle2 size={14} /> : index + 1}</span><span className="min-w-0"><strong className="block truncate text-xs sm:text-sm">{step.label}</strong><span className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">{step.detail}</span></span></div>)}
    </div>

    <div id="music-studio-workspace" role="tabpanel" aria-labelledby={`music-tab-${activeMode}`} className="space-y-5">
    {activeMode === "separate" ? <div className="space-y-3 rounded-xl border border-border p-4">
      <div><h3 className="font-semibold">2. Separate stems</h3><p className="mt-1 text-sm text-muted-foreground">Local ONNX model · WebGPU when available, WASM fallback · overlap-blended chunks to reduce edge discontinuities.</p></div>
      <p className="text-sm text-muted-foreground">The first model download is approximately 166 MB and may be cached by your browser. Memory-aware duration limits are conservative: around 45–75 seconds on lower-memory phones, 1–2 minutes on many devices, and up to 4 minutes on higher-memory desktops. The approximate working-set estimate excludes extra model runtime/GPU allocations and cannot guarantee that memory pressure will not occur. The synthesized demo is only for testing practice/mixing controls, not separation quality.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void runSeparation()} disabled={!sourceBuffer || working}>{working ? "Separating…" : tracks.length ? "Separate again" : separationMode === "2" ? "Separate into 2 stems" : "Separate into 4 stems"}</Button>{working ? <Button type="button" variant="outline" onClick={cancelSeparation}>Cancel</Button> : null}</div>
      {working || progress > 0 ? <div><div className="mb-1 flex justify-between text-xs"><span>{status || "Preparing…"}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div> : null}
      {tracks.length ? <p className="text-sm">{tracks.length === 2 ? "Two stems created: vocals and instrumental." : "Four broad stems created: drums, bass, other and vocals."} These are broad source groups, not isolated kick, snare, cymbals, guitar or piano tracks. Listen for artifacts, missing transients and bleed before using in a final release.</p> : null}
    </div> : null}

    {activeMode === "practice" ? <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">3. Practice & playback</h3><p className="mt-1 text-sm text-muted-foreground">Loop a difficult passage, change playback speed and A/B the source against the rendered mix.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={loopEnabled} onChange={(event) => setLoopEnabled(event.target.checked)} /> Loop A–B</label></div>
      <audio ref={audioRef} controls preload="metadata" src={currentSrc || undefined} onTimeUpdate={() => { const audio = audioRef.current; if (loopEnabled && audio && loopEndNumber > loopStartNumber && audio.currentTime >= loopEndNumber) audio.currentTime = loopStartNumber; }} className="w-full" aria-label="Music Studio playback" />
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Loop start (seconds)<input type="number" min="0" step="0.1" value={loopStart} onChange={(event) => setLoopStart(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label><label className="text-sm">Loop end (seconds)<input type="number" min="0" step="0.1" value={loopEnd} onChange={(event) => setLoopEnd(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Tempo: {tempo.toFixed(2)}×<input type="range" min="0.5" max="1.5" step="0.05" value={tempo} onChange={(event) => setTempo(Number(event.target.value))} className="mt-2 block w-full" /></label><label className="text-sm">Pitch: {pitch > 0 ? "+" : ""}{pitch} semitones<input type="range" min="-12" max="12" step="1" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} className="mt-2 block w-full" /></label></div>
      <p className="text-xs text-muted-foreground">Preview note: this built-in player combines pitch and speed change (pitch is not locked). WAV export preserves the selected stem levels but does not bake browser playback-rate controls into a time-stretched render.</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Count-in bars<select value={countInBars} onChange={(event) => setCountInBars(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2"><option value="1">1 bar</option><option value="2">2 bars</option></select></label><label className="text-sm">Metronome BPM<input type="number" min="40" max="240" step="1" value={metronomeBpm} onChange={(event) => setMetronomeBpm(Number(event.target.value) || 120)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2" /></label></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!sourceBuffer} onClick={() => void startWithCountIn()}>Play with count-in</Button><Button type="button" variant={metronomeOn ? "default" : "outline"} onClick={() => setMetronomeOn((current) => !current)}>{metronomeOn ? "Turn metronome off" : "Metronome on"}</Button><Button type="button" variant="outline" onClick={() => { if (abOriginal) void previewMix(); else setAbOriginal(true); }} disabled={!sourceBuffer || !tracks.length}>{abOriginal ? "A/B: original → render current mix" : "A/B: current mix → original"}</Button><Button type="button" variant="outline" onClick={() => void previewMix()} disabled={!sourceBuffer}>Render mix preview</Button></div>
    </div> : null}

    {activeMode === "mixer" ? <div className="space-y-4 rounded-xl border border-border p-4">
      <div><h3 className="font-semibold">4. Stem mixer</h3><p className="mt-1 text-sm text-muted-foreground">Live Web Audio playback applies mute, solo, faders and master level immediately. Offline export renders the selected levels to WAV.</p></div>
      {showTracks ? <div className="space-y-3">{tracks.map((track) => <div key={track.id} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong>{track.name}</strong><span className="text-xs text-muted-foreground">{track.buffer.duration.toFixed(2)} sec</span></div><label className="mt-2 block text-xs">Volume {track.volume}%<input className="mt-1 block w-full" type="range" min="0" max="150" step="1" value={track.volume} onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })} /></label></div><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={track.muted} onChange={(event) => updateTrack(track.id, { muted: event.target.checked })} /> Mute</label><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={track.solo} onChange={(event) => updateTrack(track.id, { solo: event.target.checked })} /> Solo</label><Button type="button" size="sm" variant="outline" onClick={() => void sendStemToLiveVideo(track)} title={`Open ${track.name} in Live Video Studio`}>Send to Live Video</Button></div>)}</div> : <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted-foreground">Separate the imported track to unlock individual drum, bass, other and vocal controls. The original track remains available for A/B playback.</p>}
      <label className="block text-sm">Master volume: {masterVolume}%<input className="mt-2 block w-full" type="range" min="0" max="125" step="1" value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} /></label>
      <div className="flex flex-wrap gap-2"><Button type="button" variant={liveMixerPlaying ? "default" : "outline"} disabled={!sourceBuffer} onClick={() => liveMixerPlaying ? stopLiveMixer() : void startLiveMixer()}>{liveMixerPlaying ? "Stop live mixer" : "Play live mixer"}</Button><Button type="button" variant="outline" disabled={!sourceBuffer} onClick={() => void previewMix()}>Render mix preview</Button><Button type="button" disabled={!sourceBuffer} onClick={() => void exportMix(false, false)}>Export custom mix WAV</Button>{tracks.length ? <><Button type="button" variant="outline" onClick={() => void exportAllStemsZip()}>Download all stems (ZIP)</Button><Button type="button" variant="ghost" onClick={() => { for (const track of tracks) downloadBlob(audioBufferToWav(track.buffer), `env-${track.name.toLowerCase()}.wav`); }}>Export stems individually</Button></> : null}</div>
    </div> : null}

    {activeMode === "duet" ? <div className="space-y-4 rounded-xl border border-border p-4">
      <div><h3 className="font-semibold">5. Duet / vocal replace</h3><p className="mt-1 text-sm text-muted-foreground">Record multiple local takes while the track plays, then export the chosen instrumental/mix plus takes as a WAV. The selected local effects chain is printed into each new take.</p></div>
      <div className="rounded-lg bg-surface-2 p-3 text-sm">Microphone audio is kept locally. Takes are saved in this browser when IndexedDB storage is available and are restored when you select the same source file again. Browser data can be cleared or evicted, so download important takes as a backup. For best alignment, seek to the desired song position before recording.</div>
      <div className="grid gap-3 sm:grid-cols-2">{VOCAL_PRESETS.map((preset) => <button key={preset.id} type="button" disabled={!preset.available || recording} onClick={() => setDuetPresetId(preset.id)} aria-pressed={duetPresetId === preset.id} className={`min-h-11 rounded-lg border p-3 text-left ${duetPresetId === preset.id ? "border-primary bg-primary/10" : "border-border hover:bg-surface-2"} ${!preset.available ? "cursor-not-allowed opacity-60" : ""}`}><strong className="block text-sm">{preset.label}</strong><span className="mt-1 block text-xs text-muted-foreground">{preset.description}</span></button>)}</div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={duetMonitorMic} disabled={recording} onChange={(event) => setDuetMonitorMic(event.target.checked)} /><span>Monitor processed microphone live <span className="block text-xs text-muted-foreground">Wired headphones recommended to avoid feedback. Monitoring can have device-dependent latency.</span></span></label>
      {!(VOCAL_PRESETS.find((preset) => preset.id === duetPresetId)?.available ?? false) ? <p className="text-xs text-muted-foreground">AutoPitch is not applied until a key-aware pitch-correction engine is configured; recording falls back to Clean Studio.</p> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={!sourceBuffer || recording} onClick={() => void startRecording()}>Record vocal take</Button><Button type="button" variant="outline" disabled={!recording} onClick={stopRecording}>Stop recording</Button></div>
      <div><div className="mb-1 flex justify-between text-xs"><span>Microphone peak</span><span>{Math.round(micLevel * 100)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className={`h-full transition-all ${micLevel > 0.92 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${Math.min(100, micLevel * 100)}%` }} /></div>{micLevel > 0.92 ? <p className="mt-1 text-xs text-red-600">Clipping risk — reduce the microphone input level if your device allows it.</p> : null}</div>
      {takes.length ? <div className="space-y-2">{takes.map((take) => <div key={take.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"><div><strong className="text-sm">{take.name}</strong><p className="text-xs text-muted-foreground">Starts at {take.startAt.toFixed(2)} sec · {take.savedLocally ? "saved in this browser" : "session-only; download before leaving"}</p></div><div className="flex gap-2"><audio src={take.url} controls className="max-w-[180px]" aria-label={`Playback for ${take.name}`} /><Button size="sm" variant="outline" onClick={() => downloadBlob(take.blob, `${take.name.toLowerCase().replaceAll(" ", "-")}.${take.blob.type.includes("ogg") ? "ogg" : "webm"}`)}>Save take</Button><Button size="sm" variant="ghost" onClick={() => void removeTake(take)}>Remove</Button></div></div>)}</div> : <p className="text-sm text-muted-foreground">No takes recorded yet.</p>}
      <Button type="button" disabled={!sourceBuffer} onClick={() => void exportMix(false)}>Export duet mix WAV</Button>
    </div> : null}

    {activeMode === "karaoke" ? <div className="space-y-3 rounded-xl border border-border p-4">
      <div><h3 className="font-semibold">6. Karaoke</h3><p className="mt-1 text-sm text-muted-foreground">Use the instrumental stem, add lyrics for display and export a WAV. Lyrics are not automatically time-synced.</p></div>
      <textarea value={lyrics} onChange={(event) => setLyrics(event.target.value)} rows={5} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" placeholder="Paste lyrics here (display only; no claim of perfect automatic sync)" aria-label="Karaoke lyrics" />
      {lyrics.trim() ? <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{lyrics}</pre> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={!tracks.length} onClick={() => void previewMix(true)}>Preview instrumental only</Button><Button type="button" disabled={!tracks.length} onClick={() => void exportMix(true, false)}>Export karaoke instrumental WAV</Button><button type="button" onClick={() => setActiveMode("separate")} className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">Open separator</button></div>
    </div> : null}
    </div>
    <ErrorBanner message={error} />
    {status ? <p role="status" aria-live="polite" className="rounded-lg bg-surface-2 p-3 text-sm text-muted-foreground">{status}</p> : null}
    <p className="text-xs text-muted-foreground">Separation model source: StemSplit Demucs ONNX browser model. Local audio is not sent to enV servers by this workflow. The downloaded runtime/model are third-party assets requested from their published CDNs; the first model download is large. Results are best-effort and should be checked before commercial use.</p>
  </section>;
}
