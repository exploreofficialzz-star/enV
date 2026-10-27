export type SongCandidate = { label: string; score: number };
export type SongCandidateGroup = "instruments" | "genre" | "mood" | "vocals";
export type SongWindow = {
  start_seconds: number;
  end_seconds: number;
  silent: boolean;
  candidates: Record<SongCandidateGroup, SongCandidate[]>;
};
export type SongTranscriptSegment = { start_seconds: number | null; end_seconds: number | null; text: string };
export type BrowserSongIntelligence = {
  schema_version: "env.browser-song-intelligence.v1";
  duration_seconds: number;
  sample_rate_hz: number;
  audio_source: "full_mix" | "vocal_stem" | "separated_stem";
  downmix: "mono" | "stereo_average" | "strongest_channel";
  sound: {
    status: "completed" | "unavailable" | "not_requested";
    model: string;
    revision: string;
    coverage_seconds: number;
    windows: SongWindow[];
    candidates: Record<SongCandidateGroup, SongCandidate[]>;
    note: string;
  };
  speech: {
    status: "completed" | "unavailable" | "not_requested";
    model: string;
    revision: string;
    coverage_seconds: number;
    text: string;
    segments: SongTranscriptSegment[];
    note: string;
  };
  warnings: string[];
};

export const AST_MODEL = "Xenova/ast-finetuned-audioset-10-10-0.4593";
export const AST_REVISION = "249a1fbf0286b40e7f1ed687a8ae396997bf7dc6";
export const WHISPER_MODEL = "Xenova/whisper-tiny";
export const WHISPER_REVISION = "5332fcc35e32a33b86612b9a57a89be7906102b1";

export function emptyCandidates(): Record<SongCandidateGroup, SongCandidate[]> {
  return { instruments: [], genre: [], mood: [], vocals: [] };
}

/** Aggregate independent AudioSet scores by their strongest observed window. */
export function aggregateSongCandidates(windows: readonly SongWindow[]): Record<SongCandidateGroup, SongCandidate[]> {
  const result = emptyCandidates();
  for (const group of Object.keys(result) as SongCandidateGroup[]) {
    const strongest = new Map<string, number>();
    for (const window of windows) {
      for (const candidate of window.candidates[group]) {
        if (!candidate.label || !Number.isFinite(candidate.score)) continue;
        strongest.set(candidate.label, Math.max(strongest.get(candidate.label) ?? 0, candidate.score));
      }
    }
    result[group] = [...strongest].map(([label, score]) => ({ label, score })).sort((a, b) => b.score - a.score).slice(0, 8);
  }
  return result;
}

export function validTranscriptSegments(chunks: Array<{ timestamp?: Array<number | null>; text?: string }>, duration: number): SongTranscriptSegment[] {
  return chunks.slice(0, 1500).flatMap((chunk) => {
    const text = typeof chunk.text === "string" ? chunk.text.trim().slice(0, 4000) : "";
    if (!text) return [];
    const [rawStart, rawEnd] = chunk.timestamp ?? [];
    const start = typeof rawStart === "number" && Number.isFinite(rawStart) && rawStart >= 0 && rawStart <= duration ? rawStart : null;
    const end = typeof rawEnd === "number" && Number.isFinite(rawEnd) && rawEnd >= 0 && rawEnd <= duration + 0.05 && (start === null || rawEnd >= start) ? Math.min(rawEnd, duration) : null;
    return [{ start_seconds: start, end_seconds: end, text }];
  });
}

function subtitleTime(seconds: number, separator: "." | ","): string {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const remainingSeconds = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}${separator}${String(milliseconds % 1000).padStart(3, "0")}`;
}

/** Unknown timestamps remain in the transcript but are omitted from timed subtitle exports. */
export function transcriptToSubtitles(segments: readonly SongTranscriptSegment[], format: "vtt" | "srt"): string {
  const timed = segments.filter((item) => item.start_seconds !== null && item.end_seconds !== null && Math.round(item.end_seconds * 1000) > Math.round(item.start_seconds * 1000));
  const body = timed.map((item, index) => {
    const separator = format === "vtt" ? "." : ",";
    const text = item.text.replace(/-->/g, "→").replace(/\r\n?/g, "\n").replace(/\n\s*\n/g, "\n");
    const line = `${subtitleTime(item.start_seconds!, separator)} --> ${subtitleTime(item.end_seconds!, separator)}\n${text}`;
    return format === "srt" ? `${index + 1}\n${line}` : line;
  }).join("\n\n");
  return format === "vtt" ? `WEBVTT\n\n${body}${body ? "\n" : ""}` : `${body}${body ? "\n" : ""}`;
}
