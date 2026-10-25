import { useEffect, useMemo, useState } from "react";
import { Activity, AudioLines, FileAudio, FileJson, LoaderCircle, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/utils";
import { analyzeMusicAudio, type MusicAnalysisResult } from "@/lib/engines/music-analysis";
import { extractMusicMetadata } from "@/lib/media/music-metadata";
import { createMusicAnalysisProfile } from "@/lib/media/music-analysis-profile";

const LOCAL_FILE_LIMIT = 25 * 1024 * 1024;
const MODEL_FILE_LIMIT = 25 * 1024 * 1024;
const MAX_AUDIO_DURATION_SECONDS = 2 * 60;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return hours > 0
    ? [hours, String(minutes).padStart(2, "0"), String(secs).padStart(2, "0")].join(":")
    : [minutes, String(secs).padStart(2, "0")].join(":");
}

function displayNumber(value: number | null, suffix = ""): string {
  return value === null || !Number.isFinite(value) ? "Not available" : String(value) + suffix;
}

async function probeAudioDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  const media = document.createElement("audio");
  media.preload = "metadata";
  let timeout: number | undefined;
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const finish = (callback: (value: number | Error) => void, value: number | Error) => {
        if (timeout !== undefined) window.clearTimeout(timeout);
        media.onloadedmetadata = null;
        media.onerror = null;
        callback(value);
      };
      media.onloadedmetadata = () => {
        const durationSeconds = media.duration;
        if (Number.isFinite(durationSeconds) && durationSeconds > 0) finish((value) => resolve(value as number), durationSeconds);
        else finish((value) => reject(value as Error), new Error("The browser could not determine this file's duration safely before decoding."));
      };
      media.onerror = () => finish((value) => reject(value as Error), new Error("The browser could not read this audio file's metadata. Try MP3, WAV or M4A."));
      timeout = window.setTimeout(() => finish((value) => reject(value as Error), new Error("Reading audio metadata timed out. Try a shorter or more compatible audio file.")), 10000);
      media.src = url;
      media.load();
    });
    return duration;
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
    media.pause();
    media.removeAttribute("src");
    media.load();
    URL.revokeObjectURL(url);
  }
}

function listValue(value: string[]): string {
  return value.length ? value.join(", ") : "Not identified";
}


export function MusicAnalyzerStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysis, setAnalysis] = useState<MusicAnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const [allowModelUpload, setAllowModelUpload] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const metricCards = useMemo(() => {
    if (!analysis) return [];
    return [
      { label: "Tempo", value: displayNumber(analysis.rhythm.tempo_bpm, " BPM"), hint: "Approximate beat estimate" },
      { label: "Key", value: analysis.tonality.key ?? "Not available", hint: "Approximate tonal center" },
      { label: "Duration", value: formatDuration(analysis.audio.duration_seconds), hint: "Decoded audio length" },
      { label: "Loudness", value: displayNumber(analysis.audio.estimated_loudness_lufs, " LUFS est."), hint: "RMS proxy, not standards LUFS" },
      { label: "Peak", value: displayNumber(analysis.audio.peak_dbfs, " dBFS"), hint: "Highest decoded sample" },
      { label: "RMS", value: displayNumber(analysis.audio.rms_dbfs, " dBFS"), hint: "Mean signal energy" },
      { label: "Silence", value: displayNumber(analysis.audio.silence_percent, "%"), hint: "100 ms windows below −60 dBFS" },
      { label: "Clipping", value: displayNumber(analysis.audio.clipped_sample_percent, "%"), hint: "Samples at or above 0.999 magnitude" },
    ];
  }, [analysis]);

  function chooseFile(selected: File | null) {
    setError("");
    setNotice("");
    setAnalysis(null);
    setAllowModelUpload(false);
    setFile(selected);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return selected ? URL.createObjectURL(selected) : "";
    });
    if (selected && selected.size > LOCAL_FILE_LIMIT) {
      setError("Choose a file smaller than 25 MB for predictable on-device analysis, especially on phones.");
    }
  }

  async function runLocalAnalysis() {
    if (!file) {
      setError("Choose an audio file first.");
      return;
    }
    if (file.size > LOCAL_FILE_LIMIT) {
      setError("This file is larger than the 25 MB on-device analysis limit. Choose a smaller file.");
      return;
    }
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      setError("This browser does not support Web Audio decoding. Try an up-to-date browser.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("Checking file duration, then measuring the audio on this device. Nothing is uploaded for local analysis.");
    try {
      const probedDuration = await probeAudioDuration(file);
      if (probedDuration > MAX_AUDIO_DURATION_SECONDS) throw new Error("For device memory safety, analyze clips up to 2 minutes. Split longer files into sections first.");
      const bytes = await file.arrayBuffer();
      const context = new Ctx();
      let buffer: AudioBuffer;
      try {
        buffer = await context.decodeAudioData(bytes.slice(0));
      } finally {
        await context.close().catch(() => undefined);
      }
      if (buffer.duration <= 0 || buffer.length <= 0) throw new Error("The selected file did not decode to usable audio.");
      if (buffer.duration > MAX_AUDIO_DURATION_SECONDS) throw new Error("For device memory safety, analyze clips up to 2 minutes. Split longer files into sections first.");
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
      const metadata = extractMusicMetadata(new Uint8Array(bytes), file.name);
      const result = analyzeMusicAudio({
        channels,
        sampleRate: buffer.sampleRate,
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type,
        metadata,
      });
      setAnalysis(result);
      setNotice("Local signal analysis finished. Genre, sub-style, language, mood and instrument labels require a trained model and are not guessed here.");
    } catch (cause) {
      setAnalysis(null);
      setError(cause instanceof Error ? cause.message : "Could not analyze this audio file.");
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  async function runModelAnalysis() {
    if (!file || !analysis) {
      setError("Run local analysis before requesting model-based tags.");
      return;
    }
    if (!allowModelUpload) {
      setError("Confirm the upload consent before sending audio to enV's configured AI model.");
      return;
    }
    if (file.size > MODEL_FILE_LIMIT) {
      setError("enV's built-in AI tagging accepts files up to about 2.8 MB. Local signal measurements still work on larger files.");
      return;
    }
    setModelBusy(true);
    setError("");
    setNotice("Sending the selected audio to the configured enV AI route, as you approved.");
    try {
      const body = new FormData();
      body.append("audio", file, file.name);
      const response = await fetch("/api/music-analysis", { method: "POST", body, headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as { message?: string; classification?: MusicAnalysisResult["classification"] };
      if (!response.ok) throw new Error(payload.message || "The model service could not analyze this audio.");
      if (!payload.classification) throw new Error("The model service returned no classification result.");
      setAnalysis((current) => current ? { ...current, classification: payload.classification! } : current);
      setNotice("Model response received. Review the predicted labels and scores; the model may be wrong, particularly on mixed vocals or unfamiliar styles.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Model-based analysis failed.");
      setNotice("Your local measurements remain available. No model result was added.");
    } finally {
      setModelBusy(false);
    }
  }

  function exportJson() {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, file ? file.name.replace(/\.[^.]+$/, "") + "-env-music-analysis.json" : "env-music-analysis.json");
  }

  function exportSongProfile() {
    if (!analysis) return;
    const profile = createMusicAnalysisProfile(analysis);
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json;charset=utf-8" });
    const baseName = file?.name.replace(/\.[^.]+$/, "").trim() || "env-song";
    downloadBlob(blob, baseName + "-song-profile.json");
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Activity size={22} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">enV · Audio intelligence</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Music Analyzer</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Measure the actual audio first. Export tempo, key, level, silence, clipping and timbral features as structured JSON. Model-based tags are a separate, explicit step.</p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><FileAudio size={18} aria-hidden="true" /> Audio source</div>
        <label className="mt-3 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-4 py-5 text-center transition hover:border-accent">
          <Upload size={24} className="mb-2 text-accent" aria-hidden="true" />
          <span className="text-sm font-medium">{file ? "Choose a different audio file" : "Select an audio file"}</span>
          <span className="mt-1 text-xs text-muted-foreground">MP3 · WAV · M4A · OGG · FLAC · WebM · up to 25 MB and 2 minutes</span>
          <input className="sr-only" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm" onChange={(event) => { chooseFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} />
        </label>
        {file ? (
          <div className="mt-3 rounded-xl border border-border bg-background p-3">
            <div className="flex items-start gap-3">
              <AudioLines size={20} className="mt-1 shrink-0 text-accent" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-semibold">{file.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size)} · {file.type || "Audio format detected by browser"}</p>
              </div>
              <Button type="button" variant="ghost" onClick={() => chooseFile(null)}>Clear</Button>
            </div>
            {previewUrl ? <audio className="mt-3 w-full" controls preload="metadata" src={previewUrl} aria-label="Preview selected audio" /> : null}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={!file || busy || file.size > LOCAL_FILE_LIMIT} onClick={() => void runLocalAnalysis()}>{busy ? <><LoaderCircle size={16} className="mr-2 animate-spin" />Analyzing…</> : "Analyze on this device"}</Button>
          <Button type="button" variant="outline" disabled={!analysis} onClick={exportSongProfile}><FileJson size={16} className="mr-2" />Song profile JSON</Button>
          <Button type="button" variant="ghost" disabled={!analysis} onClick={exportJson}><FileJson size={16} className="mr-2" />Full analysis</Button>
        </div>
        {error ? <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
        {notice ? <p className="mt-3 rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground" role="status" aria-live="polite">{notice}</p> : null}
      </section>

      {analysis ? (
        <>
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div><h2 className="text-lg font-semibold">Audio measurements</h2><p className="mt-1 text-xs text-muted-foreground">Computed from decoded samples, not guessed from the filename.</p></div>
              <span className="rounded-full border border-border px-2.5 py-1 text-xs">{analysis.audio.channels} channel{analysis.audio.channels === 1 ? "" : "s"}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {metricCards.map((card) => <div key={card.label} className="min-w-0 rounded-xl border border-border bg-surface p-3 sm:p-4"><p className="text-xs text-muted-foreground">{card.label}</p><p className="mt-2 break-words text-xl font-semibold tracking-tight sm:text-2xl">{card.value}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{card.hint}</p></div>)}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Music identity</h2>
            <p className="mt-1 text-sm text-muted-foreground">These are separate from physical measurements. Use a deployed, trained model to estimate the tags.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: "Genre", value: analysis.classification.genre ?? "Needs a trained model" },
                { label: "Sub-style", value: analysis.classification.sub_style ?? "Needs a trained model" },
                { label: "Language", value: listValue(analysis.classification.language) },
                { label: "Mood", value: listValue(analysis.classification.mood) },
                { label: "Instruments", value: listValue(analysis.classification.instruments) },
                { label: "Vocal style", value: analysis.classification.vocal_style ?? "Needs a trained model" },
              ].map((item) => <div key={item.label} className="rounded-xl border border-border bg-background p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 break-words text-sm font-semibold">{item.value}</p></div>)}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{analysis.classification.note}</p>
            <div className="mt-4 rounded-xl border border-border bg-background p-3">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={allowModelUpload} onChange={(event) => setAllowModelUpload(event.target.checked)} /><span><strong>Allow model analysis</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">This uploads the selected audio to enV AI, or to a custom classifier endpoint if the deployment has one configured. Provider privacy and retention depend on deployment settings. Local analysis above never uploads audio. Built-in AI accepts clips up to about 2.8 MB; larger files need a configured custom endpoint.</span></span></label>
              <Button type="button" className="mt-3" variant="outline" disabled={!allowModelUpload || modelBusy || !file || file.size > MODEL_FILE_LIMIT} onClick={() => void runModelAnalysis()}>{modelBusy ? <><LoaderCircle size={16} className="mr-2 animate-spin" />Requesting model…</> : <><Sparkles size={16} className="mr-2" />Identify genre and tags</>}</Button>
              {file && file.size > MODEL_FILE_LIMIT ? <p className="mt-2 text-xs text-muted-foreground">Built-in AI accepts up to about 2.8 MB; larger clips require a configured custom endpoint. On-device measurements remain available.</p> : null}
            </div>
            {analysis.classification.genre_candidates.length ? (
              <div className="mt-4">
                <h3 className="text-sm font-semibold">Model genre candidates</h3>
                <div className="mt-2 space-y-2">{analysis.classification.genre_candidates.map((candidate) => <div key={candidate.label} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"><span className="min-w-0 flex-1 break-words text-sm">{candidate.label}</span><span className="text-xs tabular-nums text-muted-foreground">{candidate.score === null ? "Score not supplied" : (candidate.score * 100).toFixed(1) + "%"}</span></div>)}</div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="text-lg font-semibold">File tags and signal detail</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Tagged title", value: analysis.metadata.title },
                { label: "Artist", value: analysis.metadata.artist },
                { label: "Album", value: analysis.metadata.album },
                { label: "Embedded genre", value: analysis.metadata.embedded_genre },
                { label: "Spectral centroid", value: displayNumber(analysis.timbre.spectral_centroid_hz, " Hz") },
                { label: "Spectral rolloff (85%)", value: displayNumber(analysis.timbre.spectral_rolloff_85_hz, " Hz") },
                { label: "Spectral flatness", value: displayNumber(analysis.timbre.spectral_flatness) },
                { label: "Zero-crossing rate", value: displayNumber(analysis.timbre.zero_crossing_rate) },
                { label: "Windowed RMS spread", value: displayNumber(analysis.audio.windowed_rms_spread_db, " dB") },
                { label: "Tagged BPM", value: displayNumber(analysis.metadata.tagged_bpm, " BPM") },
                { label: "Sample rate", value: analysis.audio.sample_rate_hz.toLocaleString() + " Hz" },
                { label: "Analyzed section", value: analysis.audio.metric_scope_seconds + " sec for timbre features" },
              ].map((item) => <div key={item.label} className="min-w-0 rounded-lg border border-border bg-background p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 break-words text-sm font-medium">{item.value ?? "No embedded tag"}</p></div>)}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
