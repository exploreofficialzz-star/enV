import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { ResultPanel } from "@/components/engines/result-panel";
import { downloadBlob } from "@/lib/utils";
import { createServerMediaAdapter } from "@/lib/media/media-backends";
import { MediaJobController } from "@/lib/media/media-runtime";

type Props = { op: string; toolId?: string };

const PLATFORM_PRESETS: Record<string, { bitrate: string; sample: string; channels: string; format: string; notes: string }> = {
  spotify: { bitrate: "Lossless delivery; no bitrate conversion required", sample: "44.1 kHz or higher", channels: "Stereo (2)", format: "FLAC preferred; WAV accepted", notes: "Deliver the native master; don't downsample just for delivery." },
  "apple-music": { bitrate: "Lossless master recommended", sample: "44.1 / 48 / 88.2 / 96 / 176.4 / 192 kHz", channels: "Stereo", format: "WAV/PCM or accepted delivery format", notes: "Use the native mastered resolution where supported." },
  youtube: { bitrate: "128 kbps mono / 384 kbps stereo / 512 kbps 5.1 for video uploads", sample: "48 kHz recommended for video", channels: "Mono / Stereo / 5.1", format: "AAC/MP3/PCM/FLAC depending workflow", notes: "These are upload recommendations, not a universal mastering target." },
  podcast: { bitrate: "128–192 kbps stereo is a common practical target", sample: "44.1 or 48 kHz", channels: "Mono for speech or stereo for music", format: "MP3/AAC for distribution; WAV for masters", notes: "Check your host's current delivery requirements before publishing." },
  tiktok: { bitrate: "Platform-dependent; keep a high-quality source", sample: "44.1 or 48 kHz", channels: "Stereo", format: "High-quality source master", notes: "The platform may transcode uploaded media." },
  instagram: { bitrate: "Platform-dependent; keep a high-quality source", sample: "44.1 or 48 kHz", channels: "Stereo", format: "AAC in video workflows", notes: "Instagram generally receives audio as part of video uploads." },
  twitch: { bitrate: "Stream-dependent; preserve a high-quality source", sample: "44.1 or 48 kHz", channels: "Stereo", format: "AAC/stream audio", notes: "Live-stream settings depend on the encoder and channel configuration." },
  discord: { bitrate: "Server/channel dependent", sample: "44.1 or 48 kHz", channels: "Stereo", format: "Opus in voice workflows", notes: "Discord voice quality is controlled by the call/server configuration." },
};

function platformFromOp(op: string) {
  for (const key of Object.keys(PLATFORM_PRESETS)) if (op.startsWith(`${key}:`)) return key;
  return "";
}
function fmtBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let x = bytes, i = 0;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x.toFixed(i ? 2 : 0)} ${units[i]}`;
}


const SERVER_AUDIO_OPS = new Set(["server-mp3", "server-wav", "server-ogg", "server-flac", "server-volume", "server-bitrate", "server-sample-rate", "server-channels", "server-merge"]);

const serverAudioMediaController = new MediaJobController([createServerMediaAdapter()]);

const LOCAL_AUDIO_OPS = new Set(["inspector", "duration", "waveform", "to-wav", "trim", "reverse", "normalize", "fade-in", "fade-out", "mono", "stereo", "peak", "rms", "silence", "channel-balance", "dc-offset"]);

function audioContextCtor() {
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  if (file.size > 250 * 1024 * 1024) throw new Error("For browser-local processing, choose an audio file under 250 MB.");
  const Ctx = audioContextCtor();
  if (!Ctx) throw new Error("This browser does not support Web Audio decoding.");
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function makeBufferLike(source: AudioBuffer, channels: number, frames = source.length) {
  const OfflineContext = window.OfflineAudioContext ??
    (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error("This device does not support offline audio editing in the browser.");
  const ctx = new OfflineContext(channels, frames, source.sampleRate);
  return ctx.createBuffer(channels, frames, source.sampleRate);
}

function copyMapped(source: AudioBuffer, transform: (sample: number, index: number, channel: number) => number, channels = source.numberOfChannels, start = 0, end = source.length) {
  const frames = Math.max(1, end - start);
  const output = makeBufferLike(source, channels, frames);
  for (let c = 0; c < channels; c++) {
    const target = output.getChannelData(c);
    const sourceChannel = Math.min(c, source.numberOfChannels - 1);
    const sourceData = source.getChannelData(sourceChannel);
    for (let i = 0; i < frames; i++) target[i] = transform(sourceData[start + i], i, c);
  }
  return output;
}

function bufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels, sampleRate = buffer.sampleRate, frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const ab = new ArrayBuffer(bytes), view = new DataView(ab);
  const write = (o: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(o + i, value.charCodeAt(i)); };
  write(0, "RIFF"); view.setUint32(4, bytes - 8, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, bytes - 44, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) {
    const x = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
    view.setInt16(offset, x < 0 ? x * 0x8000 : x * 0x7fff, true); offset += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}

async function waveformPng(buffer: AudioBuffer): Promise<Blob> {
  const width = 1400, height = 360;
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#111111"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
  ctx.beginPath();
  const channel = buffer.getChannelData(0);
  const bucket = Math.max(1, Math.floor(channel.length / width));
  for (let x = 0; x < width; x++) {
    const from = x * bucket, to = Math.min(channel.length, from + bucket);
    let min = 1, max = -1;
    for (let i = from; i < to; i++) { const v = channel[i]; if (v < min) min = v; if (v > max) max = v; }
    const y1 = height / 2 + min * height * 0.43, y2 = height / 2 + max * height * 0.43;
    ctx.moveTo(x, y1); ctx.lineTo(x, y2);
  }
  ctx.stroke();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create waveform image.")), "image/png"));
}

async function runLocalAudioOperation(op: string, file: File, startSeconds: number, endSeconds: number) {
  const buffer = await decodeAudioFile(file);
  const duration = buffer.duration;
  if (op === "inspector" || op === "duration") {
    return { kind: "info" as const, items: [
      { label: "Duration", value: `${duration.toFixed(3)} seconds`, primary: true },
      { label: "Sample rate", value: `${buffer.sampleRate.toLocaleString()} Hz` },
      { label: "Channels", value: String(buffer.numberOfChannels) },
      { label: "Frames", value: buffer.length.toLocaleString() },
      { label: "Source size", value: fmtBytes(file.size) },
    ] };
  }
  if (op === "waveform") return { kind: "blob" as const, blob: await waveformPng(buffer), name: `${file.name.replace(/\.[^.]+$/, "")}-waveform.png`, label: "Waveform image" };
  if (op === "peak" || op === "rms" || op === "silence" || op === "channel-balance" || op === "dc-offset") {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    let peak = 0, sumSquares = 0, sum = 0, count = 0;
    for (const data of channels) for (let i = 0; i < data.length; i++) { const v = data[i]; peak = Math.max(peak, Math.abs(v)); sumSquares += v * v; sum += v; count++; }
    const rms = Math.sqrt(sumSquares / Math.max(1, count));
    const db = (v: number) => v <= 0 ? "-∞ dBFS" : `${(20 * Math.log10(v)).toFixed(2)} dBFS`;
    if (op === "peak") return { kind: "info" as const, items: [{ label: "Peak amplitude", value: peak.toFixed(6), primary: true }, { label: "Peak level", value: db(peak) }] };
    if (op === "rms") return { kind: "info" as const, items: [{ label: "RMS amplitude", value: rms.toFixed(6), primary: true }, { label: "RMS level", value: db(rms) }] };
    if (op === "dc-offset") return { kind: "info" as const, items: [{ label: "DC offset", value: (sum / Math.max(1, count)).toFixed(8), primary: true }, { label: "Interpretation", value: Math.abs(sum / Math.max(1, count)) < 0.001 ? "Very small" : "Noticeable; inspect the source" }] };
    if (op === "channel-balance") {
      if (channels.length < 2) return { kind: "info" as const, items: [{ label: "Channel balance", value: "Mono source", primary: true }] };
      const rmsL = Math.sqrt(channels[0].reduce((a,v)=>a+v*v,0)/channels[0].length);
      const rmsR = Math.sqrt(channels[1].reduce((a,v)=>a+v*v,0)/channels[1].length);
      return { kind: "info" as const, items: [{ label: "Left RMS", value: db(rmsL) }, { label: "Right RMS", value: db(rmsR) }, { label: "Difference", value: `${(20*Math.log10(Math.max(rmsL,1e-12)/Math.max(rmsR,1e-12))).toFixed(2)} dB`, primary: true }] };
    }
    const threshold = 0.001;
    let silentFrames = 0;
    for (let i=0;i<buffer.length;i++) { let framePeak=0; for (const data of channels) framePeak=Math.max(framePeak,Math.abs(data[i])); if(framePeak<threshold) silentFrames++; }
    return { kind: "info" as const, items: [{ label: "Estimated silent duration", value: `${(silentFrames / buffer.sampleRate).toFixed(3)} seconds`, primary: true }, { label: "Threshold", value: "-60 dBFS amplitude approximation" }, { label: "Total duration", value: `${duration.toFixed(3)} seconds` }] };
  }
  if (op === "to-wav") return { kind: "blob" as const, blob: bufferToWav(buffer), name: `${file.name.replace(/\.[^.]+$/, "")}.wav`, label: "WAV conversion" };

  if (op === "trim") {
    const start = Math.max(0, Math.min(duration, startSeconds));
    const end = Math.max(start, Math.min(duration, endSeconds));
    if (end <= start) throw new Error("End time must be greater than start time.");
    const out = copyMapped(buffer, (sample) => sample, buffer.numberOfChannels, Math.floor(start * buffer.sampleRate), Math.floor(end * buffer.sampleRate));
    return { kind: "blob" as const, blob: bufferToWav(out), name: `${file.name.replace(/\.[^.]+$/, "")}-trimmed.wav`, label: `Trimmed ${end - start < 60 ? (end - start).toFixed(2) + "s" : (end - start).toFixed(1) + "s"}` };
  }
  if (op === "reverse") {
    const out = copyMapped(buffer, (sample, index, channel) => buffer.getChannelData(channel)[buffer.length - 1 - index]);
    return { kind: "blob" as const, blob: bufferToWav(out), name: `${file.name.replace(/\.[^.]+$/, "")}-reversed.wav`, label: "Reversed audio" };
  }
  if (op === "normalize") {
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) for (const value of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(value));
    if (peak === 0) throw new Error("The selected audio is silent.");
    const gain = 1 / peak;
    const out = copyMapped(buffer, (sample) => sample * gain);
    return { kind: "blob" as const, blob: bufferToWav(out), name: `${file.name.replace(/\.[^.]+$/, "")}-normalized.wav`, label: `Peak normalized · gain ${gain.toFixed(3)}×` };
  }
  if (op === "fade-in" || op === "fade-out") {
    const fadeSeconds = Math.min(10, duration / 2);
    const fadeFrames = Math.max(1, Math.floor(fadeSeconds * buffer.sampleRate));
    const out = copyMapped(buffer, (sample, index) => {
      const gain = op === "fade-in" ? Math.min(1, index / fadeFrames) : Math.min(1, (buffer.length - index) / fadeFrames);
      return sample * gain;
    });
    return { kind: "blob" as const, blob: bufferToWav(out), name: `${file.name.replace(/\.[^.]+$/, "")}-${op}.wav`, label: `${op === "fade-in" ? "Fade in" : "Fade out"} · ${fadeSeconds.toFixed(2)}s` };
  }
  if (op === "mono") {
    if (buffer.numberOfChannels === 1) return { kind: "blob" as const, blob: bufferToWav(buffer), name: `${file.name.replace(/\.[^.]+$/, "")}-mono.wav`, label: "Already mono" };
    const out = makeBufferLike(buffer, 1);
    const target = out.getChannelData(0);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    for (let i = 0; i < target.length; i++) target[i] = channels.reduce((sum, data) => sum + data[i], 0) / channels.length;
    return { kind: "blob" as const, blob: bufferToWav(out), name: `${file.name.replace(/\.[^.]+$/, "")}-mono.wav`, label: "Converted to mono" };
  }
  if (op === "stereo") {
    if (buffer.numberOfChannels === 2) return { kind: "blob" as const, blob: bufferToWav(buffer), name: `${file.name.replace(/\.[^.]+$/, "")}-stereo.wav`, label: "Already stereo" };
    const out = makeBufferLike(buffer, 2);
    const source = buffer.getChannelData(0);
    out.getChannelData(0).set(source); out.getChannelData(1).set(source);
    return { kind: "blob" as const, blob: bufferToWav(out), name: `${file.name.replace(/\.[^.]+$/, "")}-stereo.wav`, label: "Converted to stereo" };
  }
  throw new Error("Unsupported local audio operation.");
}

export function AudioEngine({ op }: Props) {
  const platform = platformFromOp(op);
  const [duration, setDuration] = useState("180");
  const [bitrate, setBitrate] = useState("320");
  const [sampleRate, setSampleRate] = useState("44100");
  const [channels, setChannels] = useState("2");
  const [bits, setBits] = useState("24");
  const [bpm, setBpm] = useState("120");
  const [bars, setBars] = useState("4");
  const [lufs, setLufs] = useState("-14");
  const [format, setFormat] = useState("FLAC");
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [album, setAlbum] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<{label:string;value:string;hint?:string;primary?:boolean}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isJoiner = op === "joiner";
  const isLocalFileTool = LOCAL_AUDIO_OPS.has(op);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [startSeconds, setStartSeconds] = useState("0");
  const [endSeconds, setEndSeconds] = useState("30");
  const [volume, setVolume] = useState("100");

  const runServerAudio = async () => {
    try {
      setError(null); setResults([]);
      if (op === "server-merge") {
        if (files.length < 2) throw new Error("Choose at least two audio files.");
        const job = await serverAudioMediaController.run({ toolId: op, operation: "server-media:audio-merge", params: { inputs: files, fileNames: files.map((file) => file.name), outputName: "env-merged-audio.wav" } });
        downloadBlob(job.blob, "env-merged-audio.wav");
        setResults([{ label: "Merged audio", value: fmtBytes(job.blob.size), primary: true, hint: "Merged by the configured enV FFmpeg media processor." }]);
        return;
      }
      if (!localFile) throw new Error("Choose an audio file first.");
      const map: Record<string,{extension:string;label:string;operation:string;params:Record<string,unknown>}> = {
        "server-mp3": { extension:"mp3", label:"MP3 conversion", operation:"audio-to-mp3", params:{} },
        "server-wav": { extension:"wav", label:"WAV conversion", operation:"audio-to-wav", params:{} },
        "server-ogg": { extension:"ogg", label:"OGG conversion", operation:"audio-to-ogg", params:{} },
        "server-flac": { extension:"flac", label:"FLAC conversion", operation:"audio-to-flac", params:{} },
        "server-volume": { extension:"mp3", label:"Volume-adjusted audio", operation:"audio-volume", params:{ volume: Number(volume) || 100 } },
        "server-bitrate": { extension:"mp3", label:"Bitrate-converted audio", operation:"audio-bitrate", params:{ bitrate: Number(bitrate) || 192 } },
        "server-sample-rate": { extension:"wav", label:"Sample-rate-converted audio", operation:"audio-sample-rate", params:{ sampleRate: Number(sampleRate) || 44100 } },
        "server-channels": { extension:"wav", label:"Channel-converted audio", operation:"audio-channels", params:{ channels: Number(channels) || 2 } },
        "server-merge": { extension:"wav", label:"Merged audio", operation:"audio-merge", params:{} },
      };
      const selected = map[op];
      const job = await serverAudioMediaController.run({ toolId: op, operation: `server-media:${selected.operation}`, params: { input: localFile, fileName: localFile.name, outputName: `${localFile.name.replace(/\.[^.]+$/, "")}.${selected.extension}`, ...selected.params } });
      const extension = selected.extension;
      const label = selected.label;
      downloadBlob(job.blob, `${localFile.name.replace(/\.[^.]+$/, "")}.${extension}`);
      setResults([{ label, value: fmtBytes(job.blob.size), primary: true, hint: "Processed by the configured enV FFmpeg media processor." }]);
    } catch (e) { setResults([]); setError(e instanceof Error ? e.message : "The audio conversion failed."); }
  };

  const runLocal = async () => {
    try {
      setError(null); setResults([]);
      if (op === "webcodecs-audio") {
        const supported = typeof AudioEncoder !== "undefined" && typeof AudioDecoder !== "undefined";
        setResults([{ label: "WebCodecs audio", value: supported ? "Supported" : "Not supported", primary: supported, hint: supported ? "AudioEncoder and AudioDecoder are available in this browser." : "This browser does not expose both WebCodecs audio APIs." }]);
        return;
      }
      if (!localFile) throw new Error("Choose an audio file first.");
      const result = await runLocalAudioOperation(op, localFile, Number(startSeconds), Number(endSeconds));
      if (result.kind === "info") setResults(result.items);
      else { downloadBlob(result.blob, result.name); setResults([{ label: result.label, value: fmtBytes(result.blob.size), primary: true, hint: "Processed locally and exported as WAV/PNG." }]); }
    } catch (e) { setResults([]); setError(e instanceof Error ? e.message : "The audio operation failed."); }
  };

  const calculate = () => {
    try {
      setError(null);
      const d = Number(duration), br = Number(bitrate), sr = Number(sampleRate), ch = Number(channels), bd = Number(bits);
      if (![d, br, sr, ch, bd].every(Number.isFinite) || d <= 0 || br <= 0 || sr <= 0 || ch <= 0 || bd <= 0) throw new Error("Enter valid positive audio values.");
      const items: typeof results = [];
      if (op.includes("bitrate")) {
        const bytes = d * br * 1000 / 8;
        items.push({ label: "Estimated file size", value: fmtBytes(bytes), primary: true, hint: `${d}s at ${br} kbps` });
        items.push({ label: "Bytes", value: Math.round(bytes).toLocaleString() });
      } else if (op.includes("file-size")) {
        const bytes = d * sr * ch * bd / 8;
        items.push({ label: "Estimated uncompressed PCM size", value: fmtBytes(bytes), primary: true, hint: `${d}s · ${sr.toLocaleString()} Hz · ${ch} channels · ${bd}-bit` });
        items.push({ label: "Decimal megabytes", value: (bytes / 1_000_000).toFixed(2) });
      } else if (op.includes("sample-rate")) {
        const samples = Math.max(1, Math.round(d * sr));
        items.push({ label: "Samples", value: samples.toLocaleString(), primary: true });
        items.push({ label: "Duration from samples", value: `${(samples / sr).toFixed(3)} s`, hint: `${sr.toLocaleString()} Hz` });
      } else if (op.includes("bpm")) {
        const beatSeconds = 60 / Number(bpm);
        const barSeconds = beatSeconds * Math.max(1, Number(bars));
        items.push({ label: "Beat length", value: `${beatSeconds.toFixed(3)} s`, primary: true });
        items.push({ label: `${bars} bars`, value: `${barSeconds.toFixed(3)} s` });
      } else if (op.includes("loudness")) {
        const target = Number(lufs);
        if (!Number.isFinite(target) || target > 0 || target < -60) throw new Error("Enter LUFS between -60 and 0.");
        items.push({ label: "Target integrated loudness", value: `${target.toFixed(1)} LUFS`, primary: true });
        items.push({ label: "True-peak safety reference", value: "-1.0 dBTP", hint: "Spotify delivery guidance; not a universal mastering rule." });
      } else if (op.includes("metadata")) {
        items.push({ label: "Metadata JSON", value: JSON.stringify({ artist, title, album, format }, null, 2), primary: true });
      } else if (op.includes("export-preset") || op.includes("format-guide")) {
        const p = PLATFORM_PRESETS[platform || "podcast"];
        items.push({ label: "Recommended reference", value: p.format, primary: true });
        items.push({ label: "Sample rate", value: p.sample });
        items.push({ label: "Channels", value: p.channels });
        items.push({ label: "Bitrate", value: p.bitrate });
        items.push({ label: "Notes", value: p.notes });
      } else {
        const p = PLATFORM_PRESETS[platform || "podcast"];
        items.push({ label: "Format reference", value: p.format, primary: true });
        items.push({ label: "Sample rate", value: p.sample });
        items.push({ label: "Bitrate", value: p.bitrate });
        items.push({ label: "Loudness reference", value: platform === "spotify" ? "-14 LUFS normalization reference" : "No single universal target; check the current platform workflow." });
      }
      setResults(items);
    } catch (e) { setResults([]); setError(e instanceof Error ? e.message : "Could not calculate."); }
  };

  const joinAudio = async () => {
    try {
      setError(null);
      if (files.length < 2) throw new Error("Choose at least two audio files.");
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) throw new Error("This browser does not support Web Audio decoding.");
      const ctx = new Ctx();
      const buffers: AudioBuffer[] = [];
      for (const file of files) buffers.push(await ctx.decodeAudioData(await file.arrayBuffer()));
      const channelsOut = Math.max(...buffers.map(b => b.numberOfChannels));
      const sampleRateOut = buffers[0].sampleRate;
      const total = buffers.reduce((sum,b) => sum + b.length, 0);
      const joined = ctx.createBuffer(channelsOut, total, sampleRateOut);
      let offset = 0;
      for (const b of buffers) {
        for (let c = 0; c < channelsOut; c++) {
          const source = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
          joined.getChannelData(c).set(source, offset);
        }
        offset += b.length;
      }
      const wav = encodeWav(joined);
      const url = URL.createObjectURL(wav);
      const a = document.createElement("a"); a.href = url; a.download = "env-joined-audio.wav"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setResults([{ label: "Joined audio", value: `${files.length} files · ${(joined.duration).toFixed(2)} seconds`, primary: true, hint: "Exported as 16-bit PCM WAV." }]);
      await ctx.close();
    } catch (e) { setResults([]); setError(e instanceof Error ? e.message : "Could not join the audio files."); }
  };

  if (SERVER_AUDIO_OPS.has(op)) return <div className="space-y-5">
    <div><h2 className="text-lg font-semibold">{{"server-mp3":"Audio to MP3","server-wav":"Audio to WAV","server-ogg":"Audio to OGG","server-flac":"Audio to FLAC","server-volume":"Audio Volume Control","server-bitrate":"Audio Bitrate Converter","server-sample-rate":"Audio Sample Rate Converter","server-channels":"Audio Channel Converter","server-merge":"Audio Merger"}[op] ?? "Audio Converter"}</h2><p className="mt-1 text-sm text-subtle">Convert the selected audio using the enV FFmpeg media processor.</p></div>
    <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm"><strong>FFmpeg media processor required</strong><p className="mt-1 text-subtle">Your audio file is uploaded to the configured media-processing endpoint for conversion.</p></div>
    {op === "server-merge" ? <input className="block w-full rounded-lg border border-border bg-surface p-2 text-sm" type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac" onChange={e => setFiles(Array.from(e.target.files ?? []))}/> : <input className="block w-full rounded-lg border border-border bg-surface p-2 text-sm" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac" onChange={e => setLocalFile(e.target.files?.[0] ?? null)}/>}
    {op === "server-volume" ? <label className="block text-sm">Volume (%)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0" max="500" value={volume} onChange={(e)=>setVolume(e.target.value)} /></label> : null}
    {op === "server-bitrate" ? <label className="block text-sm">MP3 bitrate (kbps)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="32" max="512" value={bitrate} onChange={(e)=>setBitrate(e.target.value)} /></label> : null}
    {op === "server-sample-rate" ? <label className="block text-sm">Sample rate (Hz)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="8000" max="192000" value={sampleRate} onChange={(e)=>setSampleRate(e.target.value)} /></label> : null}
    {op === "server-channels" ? <label className="block text-sm">Channels<select className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" value={channels} onChange={(e)=>setChannels(e.target.value)}><option value="1">Mono</option><option value="2">Stereo</option></select></label> : null}
    <div className="flex gap-2"><Button type="button" onClick={() => void runServerAudio()}>Convert & download</Button><Button type="button" variant="ghost" onClick={() => { setLocalFile(null); setResults([]); setError(null); }}>Reset</Button></div>
    <ErrorBanner message={error}/>{results.length ? <ResultPanel items={results} filename={`env-${op}.txt`}/> : null}
  </div>;

  if (isLocalFileTool) return <div className="space-y-5">
    <div><h2 className="text-lg font-semibold">{op === "inspector" ? "Audio File Inspector" : op === "duration" ? "Audio Duration Tool" : op === "waveform" ? "Audio Waveform Generator" : `Audio ${op.replaceAll("-", " ")}`}</h2><p className="mt-1 text-sm text-subtle">Process the selected audio locally in your browser. Files are not uploaded by this tool.</p></div>
    {op !== "webcodecs-audio" ? <input className="block w-full rounded-lg border border-border bg-surface p-2 text-sm" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac" onChange={e => setLocalFile(e.target.files?.[0] ?? null)}/> : null}
    {op === "trim" ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Start (seconds)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0" step="0.01" value={startSeconds} onChange={e => setStartSeconds(e.target.value)}/></label><label className="text-sm">End (seconds)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0" step="0.01" value={endSeconds} onChange={e => setEndSeconds(e.target.value)}/></label></div> : null}
    <div className="flex gap-2"><Button type="button" onClick={() => void runLocal()}>Run tool</Button><Button type="button" variant="ghost" onClick={() => { setLocalFile(null); setResults([]); setError(null); }}>Reset</Button></div>
    <ErrorBanner message={error}/>{results.length ? <ResultPanel items={results} filename={`env-${op}.txt`}/> : null}
  </div>;

  if (isJoiner) return <div className="space-y-5">
    <div><label className="text-sm font-medium">Audio files</label><input className="mt-2 block w-full rounded-lg border border-border bg-surface p-2 text-sm" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))}/><p className="mt-1 text-xs text-subtle">Decoded locally in your browser; output is a WAV.</p></div>
    <Button onClick={joinAudio}>Join & download WAV</Button>
    <ErrorBanner message={error}/>
    {results.length ? <ResultPanel items={results} filename="env-audio-join.txt"/> : null}
  </div>;

  const p = PLATFORM_PRESETS[platform];
  return <form className="space-y-5" onSubmit={e => {e.preventDefault(); calculate();}}>
    {p ? <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm"><strong>{platform === "apple-music" ? "Apple Music" : platform[0].toUpperCase()+platform.slice(1)} reference</strong><p className="mt-1 text-subtle">{p.notes}</p></div> : null}
    {op.includes("metadata") ? <div className="grid gap-3 sm:grid-cols-2">
      <input className="rounded-lg border border-border bg-surface px-3 py-2" placeholder="Artist" value={artist} onChange={e=>setArtist(e.target.value)}/>
      <input className="rounded-lg border border-border bg-surface px-3 py-2" placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)}/>
      <input className="rounded-lg border border-border bg-surface px-3 py-2" placeholder="Album" value={album} onChange={e=>setAlbum(e.target.value)}/>
      <input className="rounded-lg border border-border bg-surface px-3 py-2" placeholder="Format" value={format} onChange={e=>setFormat(e.target.value)}/>
    </div> : null}
    {op.includes("bitrate") ? <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Duration (seconds)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0.01" step="0.01" value={duration} onChange={e=>setDuration(e.target.value)}/></label>
      <label className="text-sm">Bitrate (kbps)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="1" value={bitrate} onChange={e=>setBitrate(e.target.value)}/></label>
    </div> : null}
    {op.includes("file-size") ? <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Duration (seconds)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0.01" step="0.01" value={duration} onChange={e=>setDuration(e.target.value)}/></label>
      <label className="text-sm">Sample rate (Hz)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="1" value={sampleRate} onChange={e=>setSampleRate(e.target.value)}/></label>
      <label className="text-sm">Channels<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="1" max="32" value={channels} onChange={e=>setChannels(e.target.value)}/></label>
      <label className="text-sm">Bit depth<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="8" max="64" step="8" value={bits} onChange={e=>setBits(e.target.value)}/></label>
    </div> : null}
    {op.includes("sample-rate") ? <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Duration (seconds)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="0.001" step="0.001" value={duration} onChange={e=>setDuration(e.target.value)}/></label>
      <label className="text-sm">Sample rate (Hz)<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="1" value={sampleRate} onChange={e=>setSampleRate(e.target.value)}/></label>
    </div> : null}
    {op.includes("bpm") ? <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">BPM<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="1" value={bpm} onChange={e=>setBpm(e.target.value)}/></label>
      <label className="text-sm">Bars<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="1" value={bars} onChange={e=>setBars(e.target.value)}/></label>
    </div> : null}
    {op.includes("loudness") ? <label className="text-sm">Target LUFS<input className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" type="number" min="-60" max="0" step="0.1" value={lufs} onChange={e=>setLufs(e.target.value)}/></label> : null}
    {!op.includes("metadata") && !op.includes("bitrate") && !op.includes("file-size") && !op.includes("sample-rate") && !op.includes("bpm") && !op.includes("loudness") ? <p className="text-sm text-muted">Use this tool as a quick platform-aware audio reference. Values are guidance, not a guarantee of platform acceptance.</p> : null}
    <div className="flex gap-2"><Button type="submit">Calculate</Button><Button type="button" variant="ghost" onClick={()=>setResults([])}>Reset</Button></div>
    <ErrorBanner message={error}/>
    {results.length ? <ResultPanel items={results} filename={`env-${op.replace(/[:/]/g,"-")}.txt`}/> : null}
  </form>;
}

function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels, sampleRate = buffer.sampleRate, frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const ab = new ArrayBuffer(bytes), view = new DataView(ab);
  const write = (o:number,s:string) => { for(let i=0;i<s.length;i++) view.setUint8(o+i,s.charCodeAt(i)); };
  write(0,"RIFF"); view.setUint32(4,bytes-8,true); write(8,"WAVE"); write(12,"fmt ");
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,channels,true); view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*channels*2,true); view.setUint16(32,channels*2,true); view.setUint16(34,16,true); write(36,"data"); view.setUint32(40,bytes-44,true);
  let off=44;
  for(let i=0;i<frames;i++) for(let c=0;c<channels;c++){const x=Math.max(-1,Math.min(1,buffer.getChannelData(c)[i])); view.setInt16(off,x<0?x*0x8000:x*0x7fff,true); off+=2;}
  return new Blob([ab],{type:"audio/wav"});
}
