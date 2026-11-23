import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { buildSpeechTimeline, checkSpeech, hasSound, mixAudio, SilentVoiceEngine, unavailableVoiceEngine } from "./voice.ts";
import type { VoiceEngine } from "./voice.ts";
import { estimateSpokenLines } from "./captions.ts";
import { parseScene } from "./index.ts";
import type { DialogueLine } from "./types.ts";

const line = (speaker: string, text: string, start: number): DialogueLine => ({ speaker, text, start });

test("the silent engine makes silence exactly as long as the speech should take", async () => {
  const audio = (await SilentVoiceEngine.speak({ text: "Hello there my friend", voice: "default", speed: 1, sampleRate: 1000 }))!;
  const [est] = estimateSpokenLines([line("x", "Hello there my friend", 0)]);
  assert.equal(audio.samples.length, Math.ceil(est.end * 1000));
  assert.equal(audio.sampleRate, 1000);
  assert.equal(hasSound(audio.samples), false);
  const fast = (await SilentVoiceEngine.speak({ text: "Hello there my friend", voice: "default", speed: 2, sampleRate: 1000 }))!;
  assert.ok(Math.abs(fast.samples.length - audio.samples.length / 2) <= 1);
  assert.equal((await SilentVoiceEngine.speak({ text: "   ", voice: "default", speed: 1, sampleRate: 1000 }))!.samples.length, 0);
});

test("the unavailable engine says why and speaks nothing", async () => {
  const e = unavailableVoiceEngine("This device has no speech voices.");
  assert.equal(await e.speak({ text: "hi", voice: "default", speed: 1, sampleRate: 100 }), null);
  assert.equal(e.note, "This device has no speech voices.");
});

function fakeEngine(secondsFor: (text: string) => number | null, rate = 100): VoiceEngine & { calls: { text: string; voice: string; speed: number }[] } {
  const calls: { text: string; voice: string; speed: number }[] = [];
  return {
    id: "fake",
    calls,
    async speak(req) {
      calls.push({ text: req.text, voice: req.voice, speed: req.speed });
      const s = secondsFor(req.text);
      return s === null ? null : { samples: new Float32Array(Math.round(s * rate)).fill(0.1), sampleRate: rate };
    },
  };
}

test("buildSpeechTimeline retimes captions to the real spoken length and keeps one clip per line", async () => {
  const lines = estimateSpokenLines([line("ana", "one two three four", 3), line("ben", "next line here", 10)], { ben: { voice: "deep", speed: 0.8 } });
  const engine = fakeEngine((t) => (t.startsWith("one") ? 4 : 1.5));
  const timeline = await buildSpeechTimeline(lines, { ben: { voice: "deep", speed: 0.8 } }, engine, 100);
  assert.equal(timeline.engineId, "fake");
  assert.equal(timeline.clips.length, 2);
  assert.deepEqual(
    timeline.clips.map((c) => [c.lineIndex, c.speaker, c.start]),
    [
      [0, "ana", 3],
      [1, "ben", 10],
    ],
  );
  assert.ok(Math.abs(timeline.lines[0].end - 7) < 1e-9);
  assert.ok(Math.abs(timeline.lines[1].end - 11.5) < 1e-9);
  assert.deepEqual(engine.calls[0], { text: "one two three four", voice: "default", speed: 1 }); // no voice entry -> defaults
  assert.deepEqual(engine.calls[1], { text: "next line here", voice: "deep", speed: 0.8 });
  assert.deepEqual(timeline.notes, []);
});

test("buildSpeechTimeline keeps estimated timing and explains what could not be spoken", async () => {
  const lines = estimateSpokenLines([line("ana", "works fine", 0), line("ben", "cannot speak this", 5)]);
  const engine = fakeEngine((t) => (t.startsWith("works") ? 1 : null));
  const timeline = await buildSpeechTimeline(lines, {}, engine, 100);
  assert.equal(timeline.clips.length, 1);
  assert.deepEqual(timeline.lines[1], lines[1]);
  assert.match(timeline.notes.join(" "), /No speech could be made for: ben/);

  const throwing: VoiceEngine = {
    id: "boom",
    async speak() {
      throw new Error("model not loaded");
    },
  };
  const t2 = await buildSpeechTimeline(lines, {}, throwing, 100);
  assert.equal(t2.clips.length, 0);
  assert.match(t2.notes.join(" "), /model not loaded/);
  assert.deepEqual(t2.lines, lines);
});

test("buildSpeechTimeline with the silent engine reports the engine's own note, not a failure", async () => {
  const lines = estimateSpokenLines([line("ana", "hello world", 1)]);
  const t = await buildSpeechTimeline(lines, {}, SilentVoiceEngine, 8000);
  assert.deepEqual(t.notes, [SilentVoiceEngine.note]);
  assert.equal(t.clips.length, 1);
  assert.equal(hasSound(t.clips[0].audio.samples), false);
  // the silent clip is exactly as long as the estimate, so the captions do not move
  assert.ok(Math.abs(t.lines[0].end - lines[0].end) < 1 / 8000 + 1e-9);
});

test("buildSpeechTimeline stops when cancelled", async () => {
  const controller = new AbortController();
  controller.abort();
  const lines = estimateSpokenLines([line("ana", "hello", 0)]);
  await assert.rejects(buildSpeechTimeline(lines, {}, SilentVoiceEngine, 100, controller.signal), (e: Error) => e.name === "AbortError");
});

// ---- mixing ----------------------------------------------------------------------------------

const source = (samples: number[], sampleRate: number, start: number, volume = 1, loop = false) => ({ samples: Float32Array.from(samples), sampleRate, start, volume, loop });

test("mixAudio places a source at its start time and applies volume", () => {
  const out = mixAudio([source([0.5, 0.5, 0.5, 0.5], 10, 1, 0.5)], 10, 2);
  assert.equal(out.length, 20);
  assert.deepEqual([...out.slice(0, 10)], new Array(10).fill(0));
  assert.deepEqual([...out.slice(10, 14)], [0.25, 0.25, 0.25, 0.25]);
  assert.deepEqual([...out.slice(14)], new Array(6).fill(0));
});

test("mixAudio cuts a source at the end of the scene and ignores bad sources", () => {
  const out = mixAudio([source([0.2, 0.2, 0.2, 0.2, 0.2, 0.2], 10, 0.4)], 10, 0.8);
  assert.equal(out.length, 8);
  assert.deepEqual([...out].map((v) => Math.round(v * 10) / 10), [0, 0, 0, 0, 0.2, 0.2, 0.2, 0.2]);
  const silent = mixAudio([source([], 10, 0), source([1], 0, 0), source([1], 10, 0, 0), source([1], 10, 99)], 10, 1);
  assert.equal(hasSound(silent), false);
  assert.equal(mixAudio([], 10, 0).length, 0);
});

test("mixAudio loops a source until the end", () => {
  const out = mixAudio([source([0.1, 0.2, 0.3], 10, 0.2, 1, true)], 10, 1);
  assert.deepEqual([...out].map((v) => Math.round(v * 10) / 10), [0, 0, 0.1, 0.2, 0.3, 0.1, 0.2, 0.3, 0.1, 0.2]);
});

test("mixAudio resamples with linear interpolation", () => {
  // a ramp at 5 Hz played at 10 Hz: every other output sample is halfway between two input samples
  const out = mixAudio([source([0, 0.4, 0.8], 5, 0)], 10, 0.6);
  assert.deepEqual(
    [...out].map((v) => Math.round(v * 1000) / 1000),
    [0, 0.2, 0.4, 0.6, 0.8, 0.8],
  );
});

test("mixAudio only turns loud mixes down, to a peak of 0.98", () => {
  const loud = mixAudio([source([0.8, 0.4], 10, 0), source([0.8, 0.4], 10, 0)], 10, 0.2);
  assert.ok(Math.abs(Math.max(...loud) - 0.98) < 1e-6);
  assert.ok(Math.abs(loud[1] / loud[0] - 0.5) < 1e-6); // proportions kept
  const quiet = mixAudio([source([0.2, 0.1], 10, 0)], 10, 0.2);
  assert.deepEqual([...quiet].map((v) => Math.round(v * 100) / 100), [0.2, 0.1]); // never boosted
});

test("mixAudio is repeatable and does not change its inputs", () => {
  const src = source([0.3, -0.3, 0.2, -0.9], 8, 0.1, 0.7, true);
  const copy = Float32Array.from(src.samples);
  const a = mixAudio([src], 44, 1.5);
  const b = mixAudio([src], 44, 1.5);
  assert.deepEqual(a, b);
  assert.deepEqual(src.samples, copy);
});

test("hasSound", () => {
  assert.equal(hasSound(new Float32Array(10)), false);
  assert.equal(hasSound(Float32Array.of(0, 0, 0.001)), true);
  assert.equal(hasSound(new Float32Array(0)), false);
});

// ---- warnings --------------------------------------------------------------------------------

const settings = (duration: number) => ({ width: 640, height: 360, fps: 30, duration, background: "#000000", seed: 1 });

test("checkSpeech warns when speech runs past the end, with the right path and a usable fix", () => {
  const dialogue = [line("ana", "Short.", 0), line("ana", "This sentence is long enough that it cannot possibly finish before the scene ends.", 4)];
  const lines = estimateSpokenLines(dialogue);
  const issues = checkSpeech({ settings: settings(6), dialogue }, lines);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "speech-past-end");
  assert.equal(issues[0].severity, "warning");
  assert.equal(issues[0].path, "$.dialogue[1].start");
  assert.match(issues[0].message, /This sentence/);
  assert.match(issues[0].fix, /settings\.duration/);
  assert.deepEqual(checkSpeech({ settings: settings(30), dialogue }, lines), []);
});

test("checkSpeech finds paths correctly even when the dialogue is written out of order or repeated", () => {
  const dialogue = [line("a", "later words go here now", 5), line("a", "Hi", 0), line("a", "Hi", 0)];
  const lines = estimateSpokenLines(dialogue);
  const issues = checkSpeech({ settings: settings(5.5), dialogue }, lines);
  const past = issues.filter((i) => i.code === "speech-past-end");
  assert.deepEqual(past.map((i) => i.path), ["$.dialogue[0].start"]);
  assert.ok(issues.some((i) => i.code === "speech-overlap" && i.path === "$.dialogue[2].start"));
});

test("checkSpeech warns when one speaker talks over themselves, but not two different speakers", () => {
  const same = [line("ana", "one two three four five six", 0), line("ana", "again", 1)];
  const issues = checkSpeech({ settings: settings(30), dialogue: same }, estimateSpokenLines(same));
  assert.deepEqual(issues.map((i) => [i.code, i.path]), [["speech-overlap", "$.dialogue[1].start"]]);
  assert.match(issues[0].fix, /or later/);
  const different = [line("ana", "one two three four five six", 0), line("ben", "again", 1)];
  assert.deepEqual(checkSpeech({ settings: settings(30), dialogue: different }, estimateSpokenLines(different)), []);
});

test("the shipped example scenes have no speech warnings", () => {
  const dir = new URL("../../../apps/shared/scene-studio/scenes/valid/", import.meta.url);
  let checked = 0;
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const r = parseScene(readFileSync(new URL(name, dir), "utf8"));
    assert.ok(r.ok && r.scene, name);
    const scene = r.scene!;
    assert.deepEqual(checkSpeech(scene, estimateSpokenLines(scene.dialogue, scene.voices)), [], name);
    checked++;
  }
  assert.ok(checked >= 5);
});
