import { SongCopyButton } from "./song-copy-button";
import { downloadText } from "@/lib/utils";
import { transcriptToSubtitles, type BrowserSongIntelligence, type SongCandidateGroup } from "@/lib/media/song-intelligence";

const time = (seconds: number | null) => seconds === null ? "—" : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const names: Record<SongCandidateGroup, string> = { genre: "Genre", mood: "Mood", instruments: "Instruments", vocals: "Voice and speech" };

export function SongAudioInsights({ result, filename, onApply, disabled }: { result: BrowserSongIntelligence; filename: string; onApply: (tags: Record<string, string[]>) => void; disabled: boolean }) {
  const tags = result.sound.candidates;
  const available = (Object.keys(tags) as SongCandidateGroup[]).filter((field) => tags[field].length > 0);
  const speech = result.speech;
  const basename = filename.replace(/\.[^.]+$/, "") || "song";
  const timed = speech.segments.filter((item) => item.start_seconds !== null && item.end_seconds !== null && item.end_seconds > item.start_seconds);
  return <section className="min-w-0 space-y-4 rounded-xl border border-border p-3 sm:p-4" aria-label="On-device audio recognition">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">Speech & sound recognition</h3><p className="mt-1 text-xs text-muted">On this device · sound {result.sound.status === "completed" ? `${time(result.sound.coverage_seconds)} / ${time(result.duration_seconds)}` : result.sound.status.replace("_", " ")} · speech {speech.status === "completed" ? `${time(speech.coverage_seconds)} / ${time(result.duration_seconds)}` : speech.status.replace("_", " ")}</p></div><SongCopyButton label="recognition results" value={() => JSON.stringify(result, null, 2)} /></div>
    <div className="min-w-0 rounded-lg bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">Speech & lyrics</h4><SongCopyButton label="transcript" value={speech.text} disabled={!speech.text} /></div>
      {speech.status === "completed" ? <>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">{speech.text || "No transcript produced."}</p>
        <p className="mt-2 text-xs text-muted">Review the words, especially in songs and mixed languages.</p>
        {speech.segments.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer font-medium">Timed transcript · {speech.segments.length}</summary><div className="mt-2 max-h-72 space-y-1 overflow-auto">{speech.segments.map((segment, index) => <div key={`${index}-${segment.start_seconds}`} className="flex items-start gap-2 rounded border border-border bg-surface p-2"><p className="min-w-0 flex-1 break-words"><span className="text-muted">{time(segment.start_seconds)}–{time(segment.end_seconds)} </span>{segment.text}</p><SongCopyButton label={`transcript segment ${index + 1}`} value={segment.text} /></div>)}</div></details>}
        {speech.text && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => downloadText(speech.text, `${basename}-transcript.txt`)} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs">TXT</button>{timed.length > 0 && <><button type="button" onClick={() => downloadText(transcriptToSubtitles(speech.segments, "srt"), `${basename}-transcript.srt`)} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs">SRT</button><button type="button" onClick={() => downloadText(transcriptToSubtitles(speech.segments, "vtt"), `${basename}-transcript.vtt`)} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs">VTT</button></>}</div>}
      </> : <p className="mt-2 text-xs text-muted">{speech.status === "unavailable" ? "Speech recognition was unavailable." : "Speech recognition was not requested."}</p>}
    </div>
    <div className="grid min-w-0 gap-2 @min-[520px]/song:grid-cols-2">
      {(Object.keys(names) as SongCandidateGroup[]).map((field) => <div key={field} className="min-w-0 rounded-lg bg-surface-2 p-3"><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{names[field]}</h4><SongCopyButton label={names[field].toLowerCase()} value={tags[field].map((item) => item.label).join(", ")} disabled={!tags[field].length} /></div><p className="mt-2 break-words text-xs text-muted">{result.sound.status !== "completed" ? "Unavailable" : tags[field].length ? tags[field].map((item) => `${item.label} · ${item.score.toFixed(2)}`).join("  |  ") : "No candidates above the display threshold."}</p></div>)}
    </div>
    {result.sound.status === "completed" && <><p className="text-xs text-muted">Sound scores are uncalibrated suggestions, not verified labels.</p>{available.length > 0 && <button type="button" disabled={disabled} onClick={() => onApply(Object.fromEntries(available.map((field) => [field, tags[field].map((item) => item.label)])))} className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50">Use suggestions as draft tags</button>}
      <details className="text-xs"><summary className="cursor-pointer font-medium">Sound timeline · {result.sound.windows.length} windows</summary><div className="mt-2 max-h-72 space-y-1 overflow-auto">{result.sound.windows.map((window, index) => { const value = (Object.keys(names) as SongCandidateGroup[]).flatMap((group) => window.candidates[group].slice(0, 2).map((candidate) => candidate.label)).join(", "); return <div key={window.start_seconds} className="flex items-center gap-2 rounded-lg bg-surface-2 p-2"><div className="min-w-0 flex-1 break-words"><strong>{time(window.start_seconds)}–{time(window.end_seconds)}</strong><p className="mt-1 text-muted">{window.silent ? "Silent window" : value || "No strong candidates"}</p></div><SongCopyButton label={`sound window ${index + 1}`} value={value} disabled={!value} /></div>; })}</div></details>
    </>}
    {result.warnings.length > 0 && <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"><strong>Processing notes</strong><ul className="mt-1 list-disc pl-4">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><SongCopyButton label="processing notes" value={result.warnings.join("\n")} /></div>}
  </section>;
}
