import test from "node:test";
import assert from "node:assert/strict";
import { analyseScene, downloadName, EXAMPLE_SCENES, extraNotes, fileSizeLabel, frameAtElapsed, issueSummary, previewSize, timeLabel } from "./studio-session.ts";

const none = { uploads: new Set<string>() };
const scene = (extra: object = {}) => JSON.stringify({ version: "1.0", settings: { width: 640, height: 360, fps: 30, duration: 2 }, ...extra });

test("both ready-made examples are usable scenes with no problems", () => {
  for (const [name, text] of Object.entries(EXAMPLE_SCENES)) {
    const a = analyseScene(text, none);
    assert.ok(a.ok, `${name}: ${JSON.stringify(a.issues)}`);
    assert.equal(a.errors, 0, name);
  }
  assert.ok(analyseScene(EXAMPLE_SCENES["3d"], none).has3d);
  assert.ok(!analyseScene(EXAMPLE_SCENES["2d"], none).has3d);
});

test("text that is not JSON is reported in plain words and nothing else is computed", () => {
  const a = analyseScene("hello there", none);
  assert.equal(a.ok, false);
  assert.equal(a.scene, null);
  assert.ok(a.errors >= 1);
  assert.deepEqual(a.plans, []);
  assert.equal(a.frameCount, 0);
  assert.ok(a.issues[0].fix.length > 0);
});

test("an empty paste is an error, not a crash", () => {
  const a = analyseScene("   ", none);
  assert.equal(a.ok, false);
  assert.equal(a.issues[0].code, "empty");
});

test("a chatbot's code fence around the JSON is accepted", () => {
  assert.ok(analyseScene("```json\n" + scene() + "\n```", none).ok);
});

test("frame count and 3D flags follow the scene", () => {
  const a = analyseScene(scene({ objects: [{ id: "box1", type: "box" }] }), none);
  assert.ok(a.ok);
  assert.equal(a.frameCount, 60);
  assert.ok(a.has3d);
  assert.equal(a.seeThrough3d, false);
  const b = analyseScene(scene({ objects: [{ id: "box1", type: "box" }], layers: [{ id: "bg", type: "solid", plane: "back", color: "#112233" }] }), none);
  assert.ok(b.ok, JSON.stringify(b.issues));
  assert.ok(b.seeThrough3d);
});

test("an object type that does not exist is a note and a stand-in, never an error", () => {
  const a = analyseScene(scene({ objects: [{ id: "thing", type: "dragon" }] }), none);
  assert.ok(a.ok);
  assert.ok(a.warnings >= 1);
  assert.equal(a.plans[0].standIn, true);
  assert.ok(a.notes.some((n) => n.includes("dragon")));
});

test("a model that was not uploaded warns, and uploading it clears the warning", () => {
  const text = scene({ objects: [{ id: "hero", type: "asset", asset: "hero.glb" }] });
  const missing = analyseScene(text, none);
  assert.ok(missing.ok);
  assert.ok(missing.issues.some((i) => i.severity === "warning" && /hero\.glb/.test(i.message)));
  assert.equal(missing.plans[0].standIn, true);
  const present = analyseScene(text, { uploads: new Set(["hero.glb"]) });
  assert.ok(present.ok);
  assert.equal(present.plans[0].standIn, false);
  assert.ok(!present.issues.some((i) => /hero\.glb/.test(i.message) && /not uploaded|not in|missing/i.test(i.message)));
});

test("errors are listed before notes, and the summary counts both", () => {
  const a = analyseScene(scene({ objects: [{ id: "a", type: "dragon" }, { id: "b", type: "box", position: "left" }] }), none);
  assert.ok(!a.ok);
  const firstWarning = a.issues.findIndex((i) => i.severity === "warning");
  const lastError = a.issues.map((i) => i.severity).lastIndexOf("error");
  assert.ok(firstWarning === -1 || lastError < firstWarning);
  assert.equal(a.errors + a.warnings, a.issues.length);
});

test("dialogue that runs past the end of the scene is warned about", () => {
  const a = analyseScene(scene({ settings: { width: 640, height: 360, fps: 30, duration: 2 }, dialogue: [{ speaker: "Ann", text: "This is a very long line that cannot possibly be finished before the scene ends because it keeps going and going", start: 0.5 }] }), none);
  assert.ok(a.ok);
  assert.ok(a.issues.some((i) => i.code === "speech-past-end"));
  assert.equal(a.spokenLines.length, 1);
});

test("preview size keeps the shape, never grows past the real size, and never becomes empty", () => {
  assert.deepEqual(previewSize(1920, 1080, 960), { width: 960, height: 540, scale: 0.5 });
  assert.deepEqual(previewSize(640, 360, 2000), { width: 640, height: 360, scale: 1 });
  const tiny = previewSize(1920, 1080, 0);
  assert.ok(tiny.width >= 2 && tiny.height >= 2);
  assert.ok(Math.abs(tiny.width / tiny.height - 16 / 9) < 0.2);
});

test("playback picks the frame by elapsed time and loops", () => {
  assert.equal(frameAtElapsed(0, 30, 60), 0);
  assert.equal(frameAtElapsed(0.5, 30, 60), 15);
  assert.equal(frameAtElapsed(1.999, 30, 60), 59);
  assert.equal(frameAtElapsed(2, 30, 60), 0);
  assert.equal(frameAtElapsed(2.5, 30, 60), 15);
  assert.equal(frameAtElapsed(-3, 30, 60), 0);
  assert.equal(frameAtElapsed(Number.NaN, 30, 60), 0);
  assert.equal(frameAtElapsed(1, 30, 0), 0);
});

test("labels read naturally", () => {
  assert.equal(timeLabel(0), "0:00.0");
  assert.equal(timeLabel(65.25), "1:05.3");
  assert.equal(timeLabel(Number.NaN), "0:00.0");
  assert.equal(downloadName("My Great Scene!", "mp4"), "my-great-scene.mp4");
  assert.equal(downloadName("  ", "zip"), "scene.zip");
  assert.equal(downloadName(undefined, "srt"), "scene.srt");
  assert.equal(downloadName("../../etc/passwd", "mp4"), "etc-passwd.mp4");
  assert.equal(fileSizeLabel(500), "500 bytes");
  assert.equal(fileSizeLabel(2048), "2 KB");
  assert.equal(fileSizeLabel(5 * 1048576), "5.0 MB");
  assert.equal(issueSummary(0, 0), "No problems");
  assert.equal(issueSummary(1, 0), "1 problem");
  assert.equal(issueSummary(0, 3), "3 notes");
  assert.equal(issueSummary(2, 1), "2 problems and 1 note");
});

test("a stand-in note is not repeated when an issue already explains the same file", () => {
  const missing = analyseScene(scene({ objects: [{ id: "hero", type: "asset", asset: "hero.glb" }] }), none);
  assert.equal(missing.notes.length, 1);
  assert.deepEqual(extraNotes(missing), []);
  const unknownType = analyseScene(scene({ objects: [{ id: "thing", type: "dragon" }] }), none);
  assert.ok(extraNotes(unknownType).length + unknownType.issues.length >= 1);
  assert.deepEqual(extraNotes({ notes: ["something plain"], issues: [] }), ["something plain"]);
});
