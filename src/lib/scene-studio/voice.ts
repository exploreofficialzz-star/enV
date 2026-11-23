/**
 * Voice and sound: turn dialogue into timed speech, and mix speech with sound tracks into one mono audio buffer.
 *
 * Honest scope: Scene Studio does not contain a speech synthesiser. A {@link VoiceEngine} is the plug-in point for
 * one that runs on the person's own device. Without one, the scene still gets correct caption timing (estimated)
 * and a silent speech track, and says so in plain words. Recorded narration goes in as normal audio tracks.
 *
 * The mixing rules are plain arithmetic so Android and iOS can reproduce them exactly:
 *  - each source is placed at `start` seconds, read with linear interpolation, multiplied by `volume`;
 *  - looping sources repeat until the end of the scene;
 *  - the sum is only ever turned DOWN (to a peak of 0.98) when it would clip, never boosted.
 */
import { estimateSpokenLines, retimeFromDurations } from "./captions.ts";
import type { SpokenLine } from "./captions.ts";
import type { Scene, SceneIssue, VoiceSetting } from "./types.ts";

export interface SpeakRequest {
  text: string;
  voice: string;
  /** 0.5 to 2; the engine applies it. */
  speed: number;
  sampleRate: number;
}

export interface SpokenAudio {
  samples: Float32Array;
  sampleRate: number;
}

export interface VoiceEngine {
  id: string;
  /** Plain-words note shown to the person when this engine is in use, if any. */
  note?: string;
  /** Speak `text`, or return null when this engine cannot (the caption timing then stays estimated). */
  speak(req: SpeakRequest): Promise<SpokenAudio | null>;
}

/** Keeps timing and captions working with no sound: a silent track as long as the speech should take. */
export const SilentVoiceEngine: VoiceEngine = {
  id: "silent",
  note: "No voice is installed, so the speech is silent. Captions are timed to how long the words should take.",
  async speak(req) {
    const [line] = estimateSpokenLines([{ speaker: "x", text: req.text, start: 0 }], { x: { voice: req.voice, speed: req.speed } });
    const seconds = line ? line.end : 0;
    return { samples: new Float32Array(Math.ceil(seconds * req.sampleRate)), sampleRate: req.sampleRate };
  },
};

/** For devices where speech was asked for but nothing can make it: returns nothing and keeps the reason. */
export function unavailableVoiceEngine(reason: string): VoiceEngine {
  return { id: "unavailable", note: reason, async speak() { return null; } };
}

export interface SpeechClip {
  lineIndex: number;
  speaker: string;
  start: number;
  audio: SpokenAudio;
}

export interface SpeechTimeline {
  engineId: string;
  /** Lines retimed to the real spoken length where the engine returned audio. */
  lines: SpokenLine[];
  clips: SpeechClip[];
  /** Plain-words notes for the person (what could not be spoken, which engine is used). */
  notes: string[];
}

/** Ask the engine to speak every line, in order, and retime the captions to the real lengths. */
export async function buildSpeechTimeline(
  lines: readonly SpokenLine[],
  voices: Readonly<Record<string, VoiceSetting>>,
  engine: VoiceEngine,
  sampleRate: number,
  signal?: AbortSignal,
): Promise<SpeechTimeline> {
  const clips: SpeechClip[] = [];
  const durations: (number | undefined)[] = [];
  const notes: string[] = [];
  const missing = new Set<string>();
  if (engine.note) notes.push(engine.note);
  for (let i = 0; i < lines.length; i++) {
    if (signal?.aborted) {
      const e = new Error("The voice was cancelled.");
      e.name = "AbortError";
      throw e;
    }
    const line = lines[i];
    const setting = voices[line.speaker];
    let audio: SpokenAudio | null = null;
    try {
      audio = await engine.speak({ text: line.text, voice: setting?.voice ?? "default", speed: setting?.speed ?? 1, sampleRate });
    } catch (e) {
      notes.push(`The voice could not speak "${line.text.slice(0, 40)}": ${e instanceof Error ? e.message : String(e)}`);
    }
    if (audio && audio.samples.length > 0 && audio.sampleRate > 0) {
      clips.push({ lineIndex: i, speaker: line.speaker, start: line.start, audio });
      durations.push(audio.samples.length / audio.sampleRate);
    } else {
      durations.push(undefined);
      missing.add(line.speaker);
    }
  }
  if (missing.size > 0 && engine.id !== "silent") notes.push(`No speech could be made for: ${[...missing].join(", ")}. Their captions are timed by estimate.`);
  return { engineId: engine.id, lines: retimeFromDurations(lines, durations), clips, notes };
}

// ---- mixing ----------------------------------------------------------------------------------

export interface MixSource {
  samples: Float32Array;
  sampleRate: number;
  /** Seconds from scene start. */
  start: number;
  volume: number;
  loop: boolean;
}

const PEAK = 0.98;

/** Mono mix of all sources, `ceil(seconds × sampleRate)` samples long. */
export function mixAudio(sources: readonly MixSource[], sampleRate: number, seconds: number): Float32Array {
  const total = Math.max(0, Math.ceil(seconds * sampleRate));
  const out = new Float32Array(total);
  for (const s of sources) {
    const n = s.samples.length;
    if (n === 0 || !(s.sampleRate > 0) || !(s.volume > 0)) continue;
    const first = Math.max(0, Math.ceil(s.start * sampleRate));
    const lengthOut = (n / s.sampleRate) * sampleRate; // length of the source in output samples
    const last = s.loop ? total : Math.min(total, Math.ceil(s.start * sampleRate + lengthOut));
    for (let i = first; i < last; i++) {
      let pos = (i / sampleRate - s.start) * s.sampleRate;
      if (s.loop) pos = pos % n;
      const a = Math.floor(pos);
      const frac = pos - a;
      const x = s.samples[a] ?? 0;
      const y = a + 1 < n ? s.samples[a + 1] : s.loop ? s.samples[0] : x;
      out[i] += (x + (y - x) * frac) * s.volume;
    }
  }
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > PEAK) {
    const gain = PEAK / peak;
    for (let i = 0; i < total; i++) out[i] *= gain;
  }
  return out;
}

/** True when the buffer contains any sound at all (so a silent scene can skip the audio track). */
export function hasSound(samples: Float32Array): boolean {
  for (let i = 0; i < samples.length; i++) if (samples[i] !== 0) return true;
  return false;
}

// ---- warnings --------------------------------------------------------------------------------

/**
 * Plain-words warnings about the speech, from the (estimated or real) timing: speech that runs past the end of
 * the scene, and one speaker talking over themselves.
 */
export function checkSpeech(scene: Pick<Scene, "settings" | "dialogue">, lines: readonly SpokenLine[]): SceneIssue[] {
  const issues: SceneIssue[] = [];
  const duration = scene.settings.duration;
  const index = new Map<string, number[]>();
  scene.dialogue.forEach((d, i) => index.set(`${d.speaker}\u0000${d.text}\u0000${d.start}`, [...(index.get(`${d.speaker}\u0000${d.text}\u0000${d.start}`) ?? []), i]));
  const pathOf = (l: SpokenLine) => {
    const hit = index.get(`${l.speaker}\u0000${l.text}\u0000${l.start}`)?.shift();
    return hit === undefined ? "$.dialogue" : `$.dialogue[${hit}]`;
  };
  const paths = lines.map(pathOf);
  lines.forEach((l, i) => {
    if (l.start < duration && l.end > duration + 0.05) {
      issues.push({
        severity: "warning",
        code: "speech-past-end",
        path: `${paths[i]}.start`,
        message: `"${l.text.slice(0, 40)}" will still be spoken when the scene ends at ${duration}s (it needs until about ${Math.round(l.end * 10) / 10}s), so the end is cut off.`,
        fix: `Start this line earlier, shorten it, or make "settings.duration" at least ${Math.ceil(l.end + 0.5)}.`,
      });
    }
  });
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].start >= lines[i].end) continue;
      if (lines[i].speaker !== lines[j].speaker) continue;
      issues.push({
        severity: "warning",
        code: "speech-overlap",
        path: `${paths[j]}.start`,
        message: `"${lines[j].speaker}" starts a new line at ${lines[j].start}s while still saying "${lines[i].text.slice(0, 40)}" (until about ${Math.round(lines[i].end * 10) / 10}s).`,
        fix: `Start the second line at ${Math.ceil(lines[i].end * 10) / 10}s or later, or give it to a different speaker.`,
      });
    }
  }
  return issues;
}
