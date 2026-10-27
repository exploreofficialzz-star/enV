import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { SongCopyButton } from "./song-copy-button";
import { separateSongInBrowser, type SongStem, type StemName } from "@/lib/media/song-stem-separation";
import { createSongIntelligenceWorker, runSongIntelligence } from "@/lib/media/song-intelligence-client";
import { transcriptToSubtitles, type BrowserSongIntelligence } from "@/lib/media/song-intelligence";
import { downloadBlob, downloadText } from "@/lib/utils";
import { currentDevicePrefersBackend, runBackendSong, songBackendAvailable, type BackendSongJob } from "@/lib/media/song-backend";

type StemOption = "all" | StemName;
type PlayableStem = SongStem & { url: string };
const time = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

export function SongStemPanel({ file, duration, vocalResult, onVocalResult, onBackendResult, disabled }: { file: File; duration: number | null; vocalResult?: BrowserSongIntelligence; onVocalResult: (result: BrowserSongIntelligence) => void; onBackendResult: (result: BackendSongJob) => void; disabled: boolean }) {
  const [choice, setChoice] = useState<StemOption>("all");
  const [stems, setStems] = useState<PlayableStem[]>([]);
  const [stemResults, setStemResults] = useState<Partial<Record<StemName, BrowserSongIntelligence>>>({});
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { controller.current?.abort(); for (const url of urls.current) URL.revokeObjectURL(url); }, []);

  async function separate() {
    if (busy) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setProgress(0); setStage("Preparing audio");
    try {
      let triedBackend = false;
      const separateOnBackend = async () => {
        triedBackend = true;
        const job = await runBackendSong(file, { tagging: true, transcription: true, stems: true, pieces: true, llm: false }, abort.signal, (detail, fraction) => { setProgress(Math.round(fraction * 100)); setStage(detail); });
        if (job.result.artifacts.filter((artifact) => artifact.kind === "stem").length !== 4) throw new Error(job.result.warnings[0] || "The backend could not create all four stems.");
        if (!abort.signal.aborted) {
          const artifacts = choice === "all" ? job.result.artifacts : job.result.artifacts.filter((artifact) => artifact.kind !== "stem" || artifact.name.split("/").pop()?.toLowerCase() === `${choice.toLowerCase()}.wav`);
          onBackendResult({ ...job, result: { ...job.result, artifacts } });
        }
      };
      if (currentDevicePrefersBackend() && await songBackendAvailable(abort.signal)) {
        try { await separateOnBackend(); return; }
        catch (error) { if (abort.signal.aborted) throw error; setStage("Backend unavailable; trying this device"); }
      }
      const names: StemName[] = choice === "all" ? ["Drums", "Bass", "Other", "Vocals"] : [choice];
      let result;
      try { result = await separateSongInBrowser(file, duration, names, abort.signal, (fraction, detail) => { setProgress(Math.round(fraction * 100)); setStage(detail || "Separating audio"); }); }
      catch (error) {
        if (abort.signal.aborted) throw error;
        if (!triedBackend && await songBackendAvailable(abort.signal)) { await separateOnBackend(); return; }
        throw error;
      }
      if (abort.signal.aborted) return;
      for (const url of urls.current) URL.revokeObjectURL(url);
      const next = result.map((stem) => ({ ...stem, url: URL.createObjectURL(stem.blob) }));
      urls.current = next.map((stem) => stem.url);
      setStems(next); setStemResults({}); setStage("");
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Sound separation failed.");
    } finally { setBusy(false); setStage(""); }
  }
  async function transcribeVocals() {
    const vocals = stems.find((stem) => stem.name === "Vocals");
    if (!vocals || busy) return;
    const abort = new AbortController(); controller.current = abort;
    const worker = createSongIntelligenceWorker();
    setBusy(true); setError(""); setProgress(0);
    try {
      const vocalFile = new File([vocals.blob], "vocals.wav", { type: "audio/wav" });
      const result = await runSongIntelligence(worker, vocalFile, vocals.duration_seconds, abort.signal, (name, fraction) => { setStage(name); setProgress(Math.round(fraction * 100)); }, { sound: false, speech: true });
      if (!abort.signal.aborted) onVocalResult({ ...result, audio_source: "vocal_stem", speech: { ...result.speech, note: "Candidate speech/lyrics from an estimated vocal stem; review the words and timing." } });
    } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Vocal transcription failed."); }
    finally { worker.terminate(); setBusy(false); setStage(""); }
  }
  async function recognizeStem(stem: PlayableStem) {
    if (busy) return;
    const abort = new AbortController(); controller.current = abort;
    const worker = createSongIntelligenceWorker();
    setBusy(true); setError(""); setProgress(0); setStage(`Preparing ${stem.name.toLowerCase()} stem`);
    try {
      const stemFile = new File([stem.blob], `${stem.name.toLowerCase()}.wav`, { type: "audio/wav" });
      const result = await runSongIntelligence(worker, stemFile, stem.duration_seconds, abort.signal, (name, fraction) => { setStage(name); setProgress(Math.round(fraction * 100)); }, { sound: true, speech: false });
      if (!abort.signal.aborted) setStemResults((current) => ({ ...current, [stem.name]: { ...result, audio_source: "separated_stem" } }));
    } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Stem recognition failed."); }
    finally { worker.terminate(); setBusy(false); setStage(""); }
  }
  function cancel() { controller.current?.abort(); setStage("Stopping…"); }
  return <section className="min-w-0 space-y-3 rounded-xl border border-border p-3 sm:p-4" aria-label="Sound separation">
    <div><h3 className="text-sm font-semibold">Separate sounds</h3><p className="mt-1 text-xs text-muted">Runs on this device or the backend. Local models download on first use (about 79 MB); backend processing uploads the audio.</p></div>
    <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-xs"><span className="mb-1 block text-muted">Stems</span><select value={choice} disabled={busy || disabled} onChange={(event) => setChoice(event.currentTarget.value as StemOption)} className="w-full min-w-0 rounded-lg border border-border bg-bg px-3 py-2 text-base @min-[520px]/song:text-xs"><option value="all">All four stems</option><option value="Vocals">Vocals</option><option value="Drums">Drums</option><option value="Bass">Bass</option><option value="Other">Other instruments</option></select></label><button type="button" disabled={busy || disabled} onClick={() => void separate()} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg disabled:opacity-50">{busy && <LoaderCircle className="mr-1 inline animate-spin" size={14} />}Separate</button>{busy && <button type="button" onClick={cancel} className="rounded-lg border border-border px-3 py-2 text-xs">Cancel</button>}</div>
    {busy && <div role="status" className="text-xs text-muted">{stage} · {progress}%</div>}
    {error && <p role="alert" className="break-words text-xs text-danger">{error}</p>}
    {stems.length > 0 && <div className="space-y-2">{stems.map((stem) => {
      const recognition = stemResults[stem.name];
      const labels = recognition?.sound.candidates.instruments ?? [];
      return <div key={stem.name} className="min-w-0 rounded-lg bg-surface-2 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{stem.name} · {time(stem.duration_seconds)}</strong><div className="flex items-center gap-1"><SongCopyButton label={`${stem.name.toLowerCase()} stem details`} value={`${stem.name} · ${time(stem.duration_seconds)}`} /><button type="button" onClick={() => downloadBlob(stem.blob, `${file.name.replace(/\.[^.]+$/, "")}-${stem.name.toLowerCase()}.wav`)} aria-label={`Download ${stem.name} stem`} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2 text-xs"><Download size={14} />WAV</button></div></div><audio controls preload="none" src={stem.url} aria-label={`Play ${stem.name} stem`} className="mt-2 h-10 min-w-0 w-full max-w-full" /><div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" disabled={busy || disabled} onClick={() => void recognizeStem(stem)} className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50">Recognize {stem.name.toLowerCase()} sounds</button>{recognition && <SongCopyButton label={`${stem.name.toLowerCase()} recognized instruments`} value={labels.map((item) => item.label).join(", ")} disabled={!labels.length} />}</div>{recognition && <p className="mt-2 break-words text-xs text-muted">{recognition.sound.status !== "completed" ? "Sound recognition was unavailable." : labels.length ? labels.map((item) => `${item.label} · ${item.score.toFixed(2)}`).join(" | ") : "No instruments above the display threshold."} {recognition.sound.status === "completed" ? `${time(recognition.sound.coverage_seconds)} analyzed.` : ""} {recognition.warnings.join(" ")}</p>}</div>;
    })}<p className="text-xs text-muted">Stems and instrument labels are estimates and can contain sounds from other parts.</p></div>}
    {stems.some((stem) => stem.name === "Vocals") && <button type="button" disabled={busy || disabled} onClick={() => void transcribeVocals()} className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50">Transcribe vocal stem</button>}
    {vocalResult && <div className="min-w-0 rounded-lg bg-surface-2 p-3"><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">Vocal transcript</h4><SongCopyButton label="vocal transcript" value={vocalResult.speech.text} disabled={!vocalResult.speech.text} /></div><p className="mt-2 whitespace-pre-wrap break-words text-sm">{vocalResult.speech.text || (vocalResult.speech.status === "completed" ? "No transcript produced." : "Speech recognition was unavailable.")}</p><p className="mt-2 text-xs text-muted">Review the words; isolated vocals may still contain accompaniment.</p>{vocalResult.speech.text && <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => downloadText(vocalResult.speech.text, "vocal-transcript.txt")} className="rounded-lg border border-border px-3 py-2 text-xs">TXT</button>{vocalResult.speech.segments.some((segment) => segment.start_seconds !== null && segment.end_seconds !== null && segment.end_seconds > segment.start_seconds) && <button type="button" onClick={() => downloadText(transcriptToSubtitles(vocalResult.speech.segments, "srt"), "vocal-transcript.srt")} className="rounded-lg border border-border px-3 py-2 text-xs">SRT</button>}</div>}{vocalResult.warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-danger">{warning}</p>)}</div>}
  </section>;
}
