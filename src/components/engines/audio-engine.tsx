import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { ResultPanel } from "@/components/engines/result-panel";

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
