/** Client-safe subtitle formatting. Pure functions: timestamps in, SRT/VTT text out. */
export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

export function formatTimestamp(seconds: number, separator: "," | "."): string {
  const totalMs = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${separator}${pad(ms, 3)}`;
}

function usable(segments: readonly SubtitleSegment[]): SubtitleSegment[] {
  return segments
    .map((s) => ({ start: s.start, end: Math.max(s.end, s.start + 0.2), text: s.text.replace(/\s+/g, " ").trim() }))
    .filter((s) => s.text.length > 0);
}

export function toSrt(segments: readonly SubtitleSegment[]): string {
  return (
    usable(segments)
      .map((s, index) => `${index + 1}\n${formatTimestamp(s.start, ",")} --> ${formatTimestamp(s.end, ",")}\n${s.text}`)
      .join("\n\n") + "\n"
  );
}

function escapeVtt(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/-->/g, "--&gt;");
}

export function toVtt(segments: readonly SubtitleSegment[]): string {
  const cues = usable(segments).map((s) => `${formatTimestamp(s.start, ".")} --> ${formatTimestamp(s.end, ".")}\n${escapeVtt(s.text)}`);
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
