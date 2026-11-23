/**
 * Captions: when each spoken word happens, how words are grouped, and exactly where to draw them.
 *
 * Everything here is pure arithmetic on the scene (no clock, no randomness, no drawing), so web, Android and iOS
 * produce the same caption for the same moment. Renderers only draw the rows this file returns.
 *
 * Rules (also in apps/shared/scene-studio/README.md):
 *  - Word timing is an estimate from the text and the voice speed until a voice engine reports real durations.
 *  - Words are shown a few at a time (`wordsPerGroup`), split into balanced groups.
 *  - "pop" highlights the word being spoken and makes it pop in; "classic" shows the group in one colour.
 *  - Text is bold, white with a dark outline, never closer to the edge than 6% of the frame.
 */
import type { CaptionSettings, DialogueLine, VoiceSetting } from "./types.ts";

export interface SpokenWord {
  text: string;
  /** Seconds from scene start. */
  start: number;
  end: number;
}

export interface SpokenLine {
  speaker: string;
  text: string;
  start: number;
  end: number;
  words: SpokenWord[];
}

/** Average speech: about 155 words a minute at speed 1. */
const BASE_SECONDS_PER_WORD = 0.14;
const SECONDS_PER_LETTER = 0.055;
const SHORT_PAUSE = 0.15; // after , ; :
const LONG_PAUSE = 0.3; // after . ! ? and an ellipsis
/** A caption group stays up this long after the last word of its line ends. */
const HOLD_AFTER_LINE = 0.25;
const POP_SECONDS = 0.14;
const POP_FROM = 0.82;
const POP_PEAK = 1.12;

const WHITE = "#ffffff";
const OUTLINE = "#000000";

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

function letterCount(word: string): number {
  let n = 0;
  for (const ch of word) if (/[\p{L}\p{N}]/u.test(ch)) n++;
  return Math.max(1, n);
}

function pauseAfter(word: string): number {
  if (/(?:[.!?]|…)["'”’)\]]*$/u.test(word)) return LONG_PAUSE;
  if (/[,;:]["'”’)\]]*$/u.test(word)) return SHORT_PAUSE;
  return 0;
}

/**
 * Estimated timing for every dialogue line. Lines are returned sorted by start time (ties keep the order they were
 * written in). Lines with no words are dropped.
 */
export function estimateSpokenLines(dialogue: readonly DialogueLine[], voices: Readonly<Record<string, VoiceSetting>> = {}): SpokenLine[] {
  const lines: { line: SpokenLine; index: number }[] = [];
  dialogue.forEach((d, index) => {
    const words = splitWords(d.text);
    if (words.length === 0) return;
    const speed = voices[d.speaker]?.speed ?? 1;
    const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
    let t = d.start;
    const spoken: SpokenWord[] = words.map((text, i) => {
      const start = t;
      const end = start + (BASE_SECONDS_PER_WORD + SECONDS_PER_LETTER * letterCount(text)) / safeSpeed;
      t = end + (i < words.length - 1 ? pauseAfter(text) / safeSpeed : 0);
      return { text, start, end };
    });
    lines.push({ line: { speaker: d.speaker, text: d.text, start: d.start, end: spoken[spoken.length - 1].end, words: spoken }, index });
  });
  lines.sort((a, b) => a.line.start - b.line.start || a.index - b.index);
  return lines.map((l) => l.line);
}

/**
 * Stretch or shrink each line to a real spoken length (from a voice engine or a measured recording).
 * `durations[i]` belongs to `lines[i]`; a missing, zero or invalid duration leaves that line as estimated.
 */
export function retimeFromDurations(lines: readonly SpokenLine[], durations: readonly (number | undefined)[]): SpokenLine[] {
  return lines.map((line, i) => {
    const real = durations[i];
    const old = line.end - line.start;
    if (real === undefined || !Number.isFinite(real) || real <= 0 || old <= 0) return { ...line, words: line.words.map((w) => ({ ...w })) };
    const k = real / old;
    const words = line.words.map((w) => ({ text: w.text, start: line.start + (w.start - line.start) * k, end: line.start + (w.end - line.start) * k }));
    return { ...line, end: line.start + real, words };
  });
}

/** Split words into balanced groups of at most `perGroup`: 7 words at 3 per group become 3, 2, 2 (never 3, 3, 1). */
export function groupWords<T>(words: readonly T[], perGroup: number): T[][] {
  const size = Math.max(1, Math.floor(perGroup));
  if (words.length === 0) return [];
  const count = Math.ceil(words.length / size);
  const base = Math.floor(words.length / count);
  const extra = words.length % count;
  const out: T[][] = [];
  let at = 0;
  for (let g = 0; g < count; g++) {
    const n = base + (g < extra ? 1 : 0);
    out.push(words.slice(at, at + n));
    at += n;
  }
  return out;
}

export interface CaptionGroup {
  lineIndex: number;
  speaker: string;
  words: SpokenWord[];
  /** The group appears when its first word starts and disappears at `end`. */
  start: number;
  end: number;
}

export function captionGroups(lines: readonly SpokenLine[], wordsPerGroup: number): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  lines.forEach((line, lineIndex) => {
    const parts = groupWords(line.words, wordsPerGroup);
    parts.forEach((words, g) => {
      const start = words[0].start;
      let end: number;
      if (g + 1 < parts.length) end = parts[g + 1][0].start;
      else {
        end = line.end + HOLD_AFTER_LINE;
        // never keep talking over the next line that starts after this one
        for (const other of lines) if (other.start > line.start && other.start < end) end = Math.min(end, Math.max(other.start, line.end));
      }
      groups.push({ lineIndex, speaker: line.speaker, words, start, end: Math.max(start, end) });
    });
  });
  return groups;
}

// ---- layout ----------------------------------------------------------------------------------

export interface CaptionFrame {
  width: number;
  height: number;
}

export interface CaptionOptions {
  /** Width in pixels of `text` at `fontSize` for the real font. Defaults to {@link estimateTextWidth}. */
  measure?: (text: string, fontSize: number) => number;
  /** Where each speaker's feet or body bottom is on screen, in pixels, for placement "belowSpeaker". */
  speakerAnchors?: Readonly<Record<string, { x: number; y: number }>>;
}

export interface CaptionDrawWord {
  text: string;
  /** Left edge in pixels, absolute in the frame. */
  x: number;
  width: number;
  color: string;
  /** Draw scaled around the word's centre; never changes where other words sit. */
  scale: number;
}

export interface CaptionRow {
  /** Vertical centre of the row in pixels. */
  y: number;
  words: CaptionDrawWord[];
}

export interface CaptionDraw {
  speaker: string;
  style: CaptionSettings["style"];
  fontSize: number;
  strokeWidth: number;
  strokeColor: string;
  fontWeight: 800;
  rows: CaptionRow[];
  /** Bounding box of all rows (before any pop scaling), in pixels. */
  box: { x: number; y: number; width: number; height: number };
}

/** Rough width of bold sans-serif text; real renderers pass their own `measure`. */
export function estimateTextWidth(text: string, fontSize: number): number {
  return [...text].length * fontSize * 0.56;
}

/** Break words into rows no wider than `maxWidth`. A word wider than the row sits alone on its own row. */
export function wrapWords(widths: readonly number[], space: number, maxWidth: number): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  let used = 0;
  widths.forEach((w, i) => {
    const needed = row.length === 0 ? w : used + space + w;
    if (row.length > 0 && needed > maxWidth) {
      rows.push(row);
      row = [i];
      used = w;
    } else {
      row.push(i);
      used = needed;
    }
  });
  if (row.length > 0) rows.push(row);
  return rows;
}

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

/** Scale of the word being spoken `age` seconds after it started: 0.82 → 1.12 → 1.0 over 0.14 s. */
export function popScale(age: number): number {
  const p = clamp(age / POP_SECONDS, 0, 1);
  return p < 0.5 ? POP_FROM + (POP_PEAK - POP_FROM) * (p / 0.5) : POP_PEAK - (POP_PEAK - 1) * ((p - 0.5) / 0.5);
}

/** Which caption group is on screen at `time`. When two overlap (two people talking at once) the newest one wins. */
export function activeGroup(groups: readonly CaptionGroup[], time: number): CaptionGroup | null {
  let best: CaptionGroup | null = null;
  for (const g of groups) {
    if (time >= g.start && time < g.end && (best === null || g.start >= best.start)) best = g;
  }
  return best;
}

/** What to draw at `time`, or null for nothing. All coordinates are pixels in a frame of `frame` size. */
export function captionAt(groups: readonly CaptionGroup[], time: number, settings: CaptionSettings, frame: CaptionFrame, options: CaptionOptions = {}): CaptionDraw | null {
  if (!settings.enabled) return null;
  const group = activeGroup(groups, time);
  if (!group) return null;

  const measure = options.measure ?? estimateTextWidth;
  const { width, height } = frame;
  const marginX = width * 0.06;
  const maxRow = width - 2 * marginX;
  let fontSize = Math.max(8, Math.round(Math.min(width, height) * 0.07 * settings.fontScale));

  // a single very long word must still fit: shrink the whole caption instead of running off the screen
  const widest = Math.max(...group.words.map((w) => measure(w.text, fontSize)));
  if (widest > maxRow) fontSize = Math.max(8, Math.floor(fontSize * (maxRow / widest)));

  const widths = group.words.map((w) => measure(w.text, fontSize));
  const space = fontSize * 0.28;
  const rowsOfWords = wrapWords(widths, space, maxRow);
  const lineHeight = fontSize * 1.25;
  const rowWidths = rowsOfWords.map((r) => r.reduce((sum, i) => sum + widths[i], 0) + space * (r.length - 1));
  const blockWidth = Math.max(...rowWidths);
  const blockHeight = lineHeight * rowsOfWords.length;

  const anchor = settings.placement === "belowSpeaker" ? options.speakerAnchors?.[group.speaker] : undefined;
  const centreX = clamp(anchor ? anchor.x : width / 2, marginX + blockWidth / 2, width - marginX - blockWidth / 2);
  const topWanted = anchor ? anchor.y + height * 0.02 : settings.anchorY * height - blockHeight / 2;
  const top = clamp(topWanted, height * 0.05, height * 0.95 - blockHeight);

  const accent = settings.speakerColors[group.speaker];
  const pop = settings.style === "pop";
  let active = -1;
  if (pop) for (let i = 0; i < group.words.length; i++) if (group.words[i].start <= time) active = i;

  const rows: CaptionRow[] = rowsOfWords.map((indexes, r) => {
    let x = centreX - rowWidths[r] / 2;
    const words: CaptionDrawWord[] = indexes.map((i) => {
      const isActive = i === active;
      const word: CaptionDrawWord = {
        text: group.words[i].text,
        x,
        width: widths[i],
        color: pop ? (isActive ? (accent ?? settings.highlightColor) : WHITE) : (accent ?? WHITE),
        scale: isActive ? popScale(time - group.words[i].start) : 1,
      };
      x += widths[i] + space;
      return word;
    });
    return { y: top + lineHeight * (r + 0.5), words };
  });

  return {
    speaker: group.speaker,
    style: settings.style,
    fontSize,
    strokeWidth: Math.max(2, Math.round(fontSize * 0.12)),
    strokeColor: OUTLINE,
    fontWeight: 800,
    rows,
    box: { x: centreX - blockWidth / 2, y: top, width: blockWidth, height: blockHeight },
  };
}

/** Subtitle file (.srt) of the caption groups, for people who want to upload captions separately. */
export function toSrt(groups: readonly CaptionGroup[]): string {
  const stamp = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    const pad = (n: number, w: number) => String(n).padStart(w, "0");
    return `${pad(Math.floor(ms / 3_600_000), 2)}:${pad(Math.floor(ms / 60_000) % 60, 2)}:${pad(Math.floor(ms / 1000) % 60, 2)},${pad(ms % 1000, 3)}`;
  };
  return groups.map((g, i) => `${i + 1}\n${stamp(g.start)} --> ${stamp(g.end)}\n${g.words.map((w) => w.text).join(" ")}\n`).join("\n");
}
