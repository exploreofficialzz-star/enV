import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AudioLines, FileAudio, FileJson, FolderArchive, LoaderCircle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { strToU8, zipSync } from "fflate";
import { downloadBlob } from "@/lib/utils";
import { analyzeMusicAudio, type MusicAnalysisResult } from "@/lib/engines/music-analysis";
import { analyzeMusicDatasetAudio, createLocalSignalLayers, encodeMonoPcm16Wav, type MusicDatasetAnalysis, type MusicDatasetAnnotations } from "@/lib/engines/music-dataset-analysis";
import { extractMusicMetadata } from "@/lib/media/music-metadata";
import { createMusicAnalysisProfile } from "@/lib/media/music-analysis-profile";

const LOCAL_FILE_LIMIT = 25 * 1024 * 1024;
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

type AnnotationListKey = Exclude<keyof MusicDatasetAnnotations, "notes" | "reviewed" | "reviewer">;

const ANNOTATION_FIELDS: Array<{ key: AnnotationListKey; label: string; placeholder: string }> = [
  { key: "genre", label: "Genre", placeholder: "Afrobeats, R&B" },
  { key: "sub_style", label: "Sub-style", placeholder: "Afro-pop, Amapiano" },
  { key: "style_influences", label: "Style influences", placeholder: "Highlife, dancehall, soul" },
  { key: "language", label: "Language", placeholder: "Nigerian Pidgin, Yoruba" },
  { key: "energy", label: "Energy", placeholder: "Low, medium, high" },
  { key: "mood", label: "Mood", placeholder: "Celebratory, soulful" },
  { key: "source_role", label: "Audio part / stem role", placeholder: "Full mix, vocals, drums, bass, melody" },
  { key: "vocals", label: "Vocal content", placeholder: "Lead vocal, backing vocals, ad-libs" },
  { key: "vocal_delivery", label: "Vocal delivery", placeholder: "Melodic singing, rap, chant" },
  { key: "vocal_register", label: "Vocal pitch / register", placeholder: "High pitch, low pitch, soprano, alto, tenor, baritone" },
  { key: "vocal_harmony", label: "Vocal harmony", placeholder: "Doubles, thirds, call-and-response" },
  { key: "performance_technique", label: "Performance techniques", placeholder: "Vibrato, falsetto, melisma, breathy" },
  { key: "instruments", label: "Instruments", placeholder: "Log drum, shakers, synth bass" },
  { key: "themes", label: "Themes", placeholder: "Love, celebration" },
  { key: "listening_scene", label: "Listening scene", placeholder: "Club, road trip" },
  { key: "production_traits", label: "Production traits", placeholder: "Reverb, sidechain, saturation" },
  { key: "arrangement", label: "Arrangement", placeholder: "Intro build, drum drop, instrumental break" },
];

function blankAnnotations(): MusicDatasetAnnotations {
  return { genre: [], sub_style: [], style_influences: [], language: [], energy: [], mood: [], source_role: [], vocals: [], vocal_delivery: [], vocal_register: [], vocal_harmony: [], performance_technique: [], instruments: [], themes: [], listening_scene: [], production_traits: [], arrangement: [], notes: "", reviewed: false, reviewer: null };
}

function layerExportLimitSeconds(): number {
  const memory = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  if (memory !== undefined && memory <= 4) return 15;
  if (memory !== undefined && memory <= 8) return 30;
  return 60;
}


export function MusicAnalyzerStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysis, setAnalysis] = useState<MusicAnalysisResult | null>(null);
  const [datasetAnalysis, setDatasetAnalysis] = useState<MusicDatasetAnalysis | null>(null);
  const [annotations, setAnnotations] = useState<MusicDatasetAnnotations>(blankAnnotations);
  const [busy, setBusy] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [layersBusy, setLayersBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const analysisControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    analysisControllerRef.current?.abort();
  }, []);

  const metricCards = useMemo(() => {
    if (!analysis) return [];
    return [
      { label: "Tempo", value: displayNumber(analysis.rhythm.tempo_bpm, " BPM"), hint: "Estimate from first 90 seconds max" },
      { label: "Key", value: analysis.tonality.key ?? "Not available", hint: "Estimate from first 30 seconds max" },
      { label: "Duration", value: formatDuration(analysis.audio.duration_seconds), hint: "Decoded audio length" },
      { label: "Loudness proxy", value: displayNumber(analysis.audio.rms_loudness_proxy_db, " dB proxy"), hint: "RMS proxy across full track; not standard LUFS" },
      { label: "Peak", value: displayNumber(analysis.audio.peak_dbfs, " dBFS"), hint: "Highest decoded sample across full track" },
      { label: "RMS", value: displayNumber(analysis.audio.rms_dbfs, " dBFS"), hint: "Mean signal energy across full track" },
      { label: "Silence", value: displayNumber(analysis.audio.silence_percent, "%"), hint: "100 ms windows under −60 dBFS across full track" },
      { label: "Clipping", value: displayNumber(analysis.audio.clipped_sample_percent, "%"), hint: "Samples at/above 0.999 magnitude across full track" },
    ];
  }, [analysis]);

  function chooseFile(selected: File | null) {
    analysisControllerRef.current?.abort();
    analysisControllerRef.current = null;
    setBusy(false);
    setAnalysisProgress(0);
    setError("");
    setNotice("");
    setAnalysis(null);
    setDatasetAnalysis(null);
    setAnnotations(blankAnnotations());
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
    analysisControllerRef.current?.abort();
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    const ensureCurrent = () => {
      if (analysisControllerRef.current !== controller) return false;
      if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      return true;
    };
    setBusy(true);
    setAnalysisProgress(0);
    setAnalysis(null);
    setDatasetAnalysis(null);
    setAnnotations(blankAnnotations());
    setError("");
    setNotice("Checking file duration, then measuring the audio on this device. Nothing is uploaded for local analysis.");
    try {
      const probedDuration = await probeAudioDuration(file);
      if (!ensureCurrent()) return;
      if (probedDuration > MAX_AUDIO_DURATION_SECONDS) throw new Error("For device memory safety, analyze clips up to 2 minutes. Split longer files into sections first.");
      const bytes = await file.arrayBuffer();
      if (!ensureCurrent()) return;
      const context = new Ctx();
      let buffer: AudioBuffer;
      try {
        buffer = await context.decodeAudioData(bytes.slice(0));
      } finally {
        await context.close().catch(() => undefined);
      }
      if (!ensureCurrent()) return;
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
      if (!ensureCurrent()) return;
      const dataset = await analyzeMusicDatasetAudio(
        { channels, sampleRate: buffer.sampleRate, fileName: file.name },
        {
          signal: controller.signal,
          onProgress: (fraction) => {
            if (analysisControllerRef.current === controller && !controller.signal.aborted) setAnalysisProgress(fraction);
          },
        },
      );
      if (!ensureCurrent()) return;
      setAnalysis(result);
      setDatasetAnalysis(dataset);
      setAnnotations(dataset.annotations);
      setNotice("Local DSP analysis finished on this device. No AI model or remote API was used. Add and review semantic labels below before exporting training data.");
    } catch (cause) {
      if (analysisControllerRef.current !== controller) return;
      if (cause instanceof Error && cause.name === "AbortError") {
        setError("");
        setNotice("Analysis cancelled.");
      } else {
        setAnalysis(null);
        setDatasetAnalysis(null);
        setError(cause instanceof Error ? cause.message : "Could not analyze this audio file.");
        setNotice("");
      }
    } finally {
      if (analysisControllerRef.current === controller) {
        analysisControllerRef.current = null;
        setBusy(false);
      }
    }
  }

  function exportJson() {
    if (!analysis || !datasetAnalysis) return;
    const payload = {
      schema_version: "env.music-training-example.v1",
      exported_at: new Date().toISOString(),
      measurements: analysis,
      dataset_analysis: { ...datasetAnalysis, annotations },
      labeling_policy: "DSP-derived measurements are estimates; semantic labels are supplied and reviewed by a human. No hosted model or remote API was used.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, file ? file.name.replace(/\.[^.]+$/, "") + "-env-music-dataset.json" : "env-music-dataset.json");
  }

  function exportSongProfile() {
    if (!analysis || !datasetAnalysis) return;
    const profile = {
      ...createMusicAnalysisProfile(analysis),
      schema_version: "env.music-training-profile.v2",
      dataset_analysis: { ...datasetAnalysis, annotations },
    };
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json;charset=utf-8" });
    const baseName = file?.name.replace(/\.[^.]+$/, "").trim() || "env-song";
    downloadBlob(blob, baseName + "-song-profile.json");
  }

  function updateAnnotationList(key: AnnotationListKey, value: string) {
    const tags = value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 80);
    setAnnotations((current) => ({ ...current, [key]: tags, reviewed: false }));
  }

  async function exportSignalLayers() {
    if (!file || !datasetAnalysis || layersBusy) return;
    setLayersBusy(true);
    setError("");
    setNotice("Preparing local frequency/spatial layers. These are not isolated vocal, drum, or instrument stems.");
    let context: AudioContext | null = null;
    try {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) throw new Error("This browser cannot decode audio for layer export.");
      context = new Ctx();
      const decoded = await context.decodeAudioData((await file.arrayBuffer()).slice(0));
      const maxSeconds = layerExportLimitSeconds();
      const sampleCount = Math.min(decoded.length, Math.round(decoded.sampleRate * maxSeconds));
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index).subarray(0, sampleCount));
      const layers = createLocalSignalLayers(channels, decoded.sampleRate);
      const safeBase = (file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "audio");
      const archive: Record<string, Uint8Array> = {};
      for (const layer of layers) archive[`layers/${layer.id}.wav`] = encodeMonoPcm16Wav(layer.samples, decoded.sampleRate);
      archive["README.json"] = strToU8(JSON.stringify({
        schema_version: "env.local-signal-layers.v1",
        source_file: file.name,
        exported_seconds: Number((sampleCount / decoded.sampleRate).toFixed(3)),
        sample_rate_hz: decoded.sampleRate,
        channel_count: decoded.numberOfChannels,
        method: "Local digital filters and stereo mid/side arithmetic. No AI model or network call.",
        warning: "These outputs are frequency/spatial layers, not source-separated vocals/drums/bass. Do not label them as true source stems.",
        layers: layers.map(({ id, label, channels: channelCount, meaning }) => ({ id, label, channels: channelCount, meaning })),
        dataset_annotations: annotations,
      }, null, 2));
      const zipped = zipSync(archive, { level: 0 });
      const blob = new Blob([zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer], { type: "application/zip" });
      downloadBlob(blob, safeBase + "-local-signal-layers.zip");
      setNotice(`Local signal-layer ZIP exported (${(sampleCount / decoded.sampleRate).toFixed(0)} seconds). These layers are not clean instrument or vocal stems.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export local signal layers.");
      setNotice("");
    } finally {
      if (context) await context.close().catch(() => undefined);
      setLayersBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Activity size={22} aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">enV · Audio intelligence</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Music Analyzer</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Local-only dataset preparation: extract timed musical features, pitch and chord estimates, structure cues, and human-reviewed tags for your music generator.</p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><FileAudio size={18} aria-hidden="true" /> Audio source</div>
        <label className="mt-3 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background px-4 py-5 text-center transition hover:border-accent">
          <Upload size={24} className="mb-2 text-accent" aria-hidden="true" />
          <span className="text-sm font-medium">{file ? "Choose a different audio file" : "Select an audio file"}</span>
          <span className="mt-1 text-xs text-muted-foreground">MP3 · WAV · M4A · OGG · FLAC · WebM · up to 25 MB and 2 minutes · processed locally</span>
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
        {busy ? <div className="mt-4" role="status" aria-live="polite"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Local analysis</span><span>{Math.round(analysisProgress * 100)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(analysisProgress * 100)}%` }} /></div></div> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={!file || busy || file.size > LOCAL_FILE_LIMIT} onClick={() => void runLocalAnalysis()}>{busy ? <><LoaderCircle size={16} className="mr-2 animate-spin" />Analyzing…</> : "Analyze on this device"}</Button>
          {busy ? <Button type="button" variant="outline" onClick={() => analysisControllerRef.current?.abort()}>Cancel analysis</Button> : null}
          <Button type="button" variant="outline" disabled={!analysis || !datasetAnalysis} onClick={exportSongProfile}><FileJson size={16} className="mr-2" />Song profile JSON</Button>
          <Button type="button" variant="ghost" disabled={!analysis || !datasetAnalysis} onClick={exportJson}><FileJson size={16} className="mr-2" />Training metadata JSON</Button>
          <Button type="button" variant="outline" disabled={!file || !datasetAnalysis || layersBusy} onClick={() => void exportSignalLayers()}>{layersBusy ? <><LoaderCircle size={16} className="mr-2 animate-spin" />Preparing layers…</> : <><FolderArchive size={16} className="mr-2" />Signal layers ZIP ({layerExportLimitSeconds()}s max)</>}</Button>
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
            <h2 className="text-lg font-semibold">Local feature analysis</h2>
            <p className="mt-1 text-sm text-muted-foreground">These measurements are computed from the decoded samples. They are not AI-generated classifications.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[
                { label: "Dominant pitch range", value: datasetAnalysis?.pitch.lowest_detected_note && datasetAnalysis.pitch.highest_detected_note ? `${datasetAnalysis.pitch.lowest_detected_note}–${datasetAnalysis.pitch.highest_detected_note}` : "Not enough stable pitch" },
                { label: "Pitch observations", value: String(datasetAnalysis?.pitch.points.length ?? 0) },
                { label: "Chord estimates", value: String(datasetAnalysis?.tonality.chord_estimates.filter((chord) => chord.chord).length ?? 0) },
                { label: "Transient density", value: displayNumber(datasetAnalysis?.rhythm.transient_density_per_second ?? null, " / sec") },
                { label: "Crest factor", value: displayNumber(datasetAnalysis?.technical.crest_factor_db ?? null, " dB") },
                { label: "Dynamic range estimate", value: displayNumber(datasetAnalysis?.technical.dynamic_range_estimate_db ?? null, " dB") },
                { label: "Low-band energy", value: displayNumber(datasetAnalysis?.timbre.mean_low_frequency_energy_ratio === null || datasetAnalysis?.timbre.mean_low_frequency_energy_ratio === undefined ? null : datasetAnalysis.timbre.mean_low_frequency_energy_ratio * 100, "%") },
                { label: "Mid-band energy", value: displayNumber(datasetAnalysis?.timbre.mean_mid_frequency_energy_ratio === null || datasetAnalysis?.timbre.mean_mid_frequency_energy_ratio === undefined ? null : datasetAnalysis.timbre.mean_mid_frequency_energy_ratio * 100, "%") },
                { label: "High-band energy", value: displayNumber(datasetAnalysis?.timbre.mean_high_frequency_energy_ratio === null || datasetAnalysis?.timbre.mean_high_frequency_energy_ratio === undefined ? null : datasetAnalysis.timbre.mean_high_frequency_energy_ratio * 100, "%") },
                { label: "Stereo side/mid ratio", value: displayNumber(datasetAnalysis?.technical.stereo_side_to_mid_ratio ?? null) },
                { label: "Detected feature changes", value: String(datasetAnalysis?.structure.change_points.length ?? 0) },
                { label: "Signal frames", value: String(datasetAnalysis?.timeline.length ?? 0) },
              ].map((item) => <div key={item.label} className="min-w-0 rounded-lg border border-border bg-background p-3"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 break-words text-sm font-semibold">{item.value}</p></div>)}
            </div>
            {datasetAnalysis ? <div className="mt-4 space-y-3">
              <div><h3 className="text-sm font-semibold">Estimated chord timeline</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Approximate triad guesses based on spectral chroma, not confirmed note transcription.</p><div className="mt-2 flex flex-wrap gap-1.5">{datasetAnalysis.tonality.chord_estimates.slice(0, 30).map((chord) => <span key={`${chord.start_seconds}-${chord.chord}`} className="rounded-md border border-border px-2 py-1 text-xs">{Math.floor(chord.start_seconds)}–{Math.floor(chord.end_seconds)}s: {chord.chord ?? "Unknown"}</span>)}</div></div>
              <div><h3 className="text-sm font-semibold">Automatic section boundaries</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{datasetAnalysis.structure.note}</p><div className="mt-2 flex flex-wrap gap-1.5">{datasetAnalysis.structure.sections.slice(0, 24).map((section) => <span key={section.label} className="rounded-md border border-border px-2 py-1 text-xs">{section.label}: {Math.floor(section.start_seconds)}–{Math.floor(section.end_seconds)}s</span>)}</div></div>
              <div><h3 className="text-sm font-semibold">Measured style clues</h3><div className="mt-2 space-y-2">{datasetAnalysis.style_cues.map((cue) => <div key={cue.tag} className="rounded-lg bg-background p-3"><p className="text-sm font-medium">{cue.tag.replace(/-/g, " ")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{cue.evidence}</p></div>)}</div></div>
              <p className="rounded-lg border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">{datasetAnalysis.pitch.note} {datasetAnalysis.separation.note}</p>
            </div> : null}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Training labels</h2>
            <p className="mt-1 text-sm text-muted-foreground">Semantic labels are deliberately human-supplied in this no-model workflow. Separate measurable facts from listening judgments; these labels will be included in the exported dataset.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ANNOTATION_FIELDS.map((field) => <label key={field.key} className="block min-w-0"><span className="mb-1.5 block text-xs font-semibold">{field.label}</span><input className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" value={annotations[field.key].join(", ")} placeholder={field.placeholder} onChange={(event) => updateAnnotationList(field.key, event.currentTarget.value)} /></label>)}
            </div>
            <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold">Annotation notes</span><textarea className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" value={annotations.notes} placeholder="Describe the musical parts, changes, uncertainty, or what another annotator should verify." onChange={(event) => setAnnotations((current) => ({ ...current, notes: event.currentTarget.value.slice(0, 4000), reviewed: false }))} /></label>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={annotations.reviewed} onChange={(event) => setAnnotations((current) => ({ ...current, reviewed: event.currentTarget.checked }))} />Reviewed for dataset use</label>
              <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">Reviewer <input className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" value={annotations.reviewer ?? ""} placeholder="Reviewer initials or team ID" onChange={(event) => setAnnotations((current) => ({ ...current, reviewer: event.currentTarget.value.slice(0, 100), reviewed: false }))} /></label>
            </div>
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
