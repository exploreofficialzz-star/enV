import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { buildManifest, checkUploads, openProject, PROJECT_FORMAT, saveProject } from "./project.ts";
import { writeZip } from "./bundle.ts";
import { deflateRaw, inflateRaw } from "./bundle-streams.ts";
import { sha256Hex } from "./sha256.ts";
import { parseScene } from "./index.ts";

const enc = new TextEncoder();
const png = (n = 40) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: n }, (_, i) => (i * 7) & 255)]);
function glb(extra = 20): Uint8Array {
  const b = new Uint8Array(20 + extra);
  b.set(enc.encode("glTF"));
  const v = new DataView(b.buffer);
  v.setUint32(4, 2, true);
  v.setUint32(8, b.length, true);
  return b;
}
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

const sceneText = JSON.stringify({
  version: "1.0",
  settings: { duration: 4 },
  objects: [{ id: "hero", type: "asset", asset: "models/hero.glb", material: { texture: "pics/skin.png" } }],
  audio: [{ id: "boom", asset: "library/kenney_boom", start: 1 }],
});

test("sha256Hex matches the platform's SHA-256 for every padding case", () => {
  assert.equal(sha256Hex(new Uint8Array(0)), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex(enc.encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  for (const n of [1, 3, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 100_000]) {
    const data = new Uint8Array(randomBytes(n));
    assert.equal(sha256Hex(data), createHash("sha256").update(data).digest("hex"), `length ${n}`);
  }
});

function input() {
  return { name: "Flood scene", sceneText, assets: new Map<string, Uint8Array>([["models/hero.glb", glb()], ["pics/skin.png", png()], ["notes/credits.txt", enc.encode("CC0")]]) };
}

test("saving then opening a project gives back the same scene, files and name, verified", async () => {
  const bytes = await saveProject(input());
  const opened = await openProject(bytes, inflateRaw);
  assert.equal(opened.ok, true, JSON.stringify(opened.issues));
  assert.equal(opened.verified, true);
  assert.equal(opened.name, "Flood scene");
  assert.equal(opened.sceneText, sceneText);
  assert.deepEqual([...opened.assets.keys()].sort(), ["models/hero.glb", "notes/credits.txt", "pics/skin.png"]);
  assert.deepEqual(opened.assets.get("models/hero.glb"), glb());
  assert.deepEqual(opened.issues, []);
});

test("a saved project is byte-for-byte repeatable and does not depend on the order files were added", async () => {
  const a = await saveProject(input());
  const reordered = input();
  reordered.assets = new Map([...reordered.assets].reverse());
  assert.deepEqual(a, await saveProject(reordered));
});

test("compressed projects open the same way", async () => {
  const big = input();
  big.assets.set("pics/big.png", Uint8Array.from([...png(), ...new Array(20_000).fill(3)]));
  const stored = await saveProject(big);
  const packed = await saveProject(big, deflateRaw);
  assert.ok(packed.length < stored.length / 2);
  const opened = await openProject(packed, inflateRaw);
  assert.equal(opened.ok, true, JSON.stringify(opened.issues));
  assert.equal(opened.verified, true);
  assert.deepEqual(opened.assets.get("pics/big.png"), big.assets.get("pics/big.png"));
});

test("the manifest lists every file with its size and SHA-256", () => {
  const m = buildManifest(input());
  assert.equal(m.format, PROJECT_FORMAT);
  assert.deepEqual(Object.keys(m.files), ["scene.json", "models/hero.glb", "notes/credits.txt", "pics/skin.png"]);
  assert.equal(m.files["scene.json"].sha256, createHash("sha256").update(sceneText).digest("hex"));
  assert.equal(m.files["pics/skin.png"].size, png().length);
});

test("a zip with no project.json opens as a plain scene zip", async () => {
  const zip = await writeZip([{ name: "scene.json", data: enc.encode(sceneText) }, { name: "pics/skin.png", data: png() }]);
  const opened = await openProject(zip, inflateRaw);
  assert.equal(opened.ok, true);
  assert.equal(opened.verified, false);
  assert.equal(opened.name, "Untitled scene");
  assert.deepEqual(opened.issues, []);
});

async function withManifest(files: { name: string; data: Uint8Array }[], manifest: unknown) {
  return writeZip([...files, { name: "project.json", data: enc.encode(typeof manifest === "string" ? manifest : JSON.stringify(manifest)) }]);
}

test("an edited file is reported with its name", async () => {
  const original = input();
  const manifest = buildManifest(original);
  const edited = png(41); // same name, different contents
  const zip = await withManifest(
    [
      { name: "scene.json", data: enc.encode(sceneText) },
      { name: "models/hero.glb", data: glb() },
      { name: "notes/credits.txt", data: enc.encode("CC0") },
      { name: "pics/skin.png", data: edited },
    ],
    manifest,
  );
  const opened = await openProject(zip, inflateRaw);
  assert.equal(opened.ok, false);
  assert.equal(opened.verified, false);
  assert.deepEqual(opened.issues.map((i) => [i.code, i.path]), [["project-file-changed", "pics/skin.png"]]);
  assert.match(opened.issues[0].message, /edited or damaged/);
});

test("an edited scene is noticed too", async () => {
  const manifest = buildManifest(input());
  const zip = await withManifest(
    [
      { name: "scene.json", data: enc.encode(sceneText.replace('"duration":4', '"duration":5')) },
      { name: "models/hero.glb", data: glb() },
      { name: "notes/credits.txt", data: enc.encode("CC0") },
      { name: "pics/skin.png", data: png() },
    ],
    manifest,
  );
  const opened = await openProject(zip, inflateRaw);
  assert.deepEqual(opened.issues.map((i) => [i.code, i.path]), [["project-file-changed", "scene.json"]]);
});

test("a missing file is an error, an added file is only a warning", async () => {
  const manifest = buildManifest(input());
  const missing = await withManifest([{ name: "scene.json", data: enc.encode(sceneText) }, { name: "models/hero.glb", data: glb() }, { name: "notes/credits.txt", data: enc.encode("CC0") }], manifest);
  const m = await openProject(missing, inflateRaw);
  assert.equal(m.ok, false);
  assert.deepEqual(m.issues.map((i) => [i.code, i.path]), [["project-file-missing", "pics/skin.png"]]);

  const extra = await withManifest(
    [
      { name: "scene.json", data: enc.encode(sceneText) },
      { name: "models/hero.glb", data: glb() },
      { name: "notes/credits.txt", data: enc.encode("CC0") },
      { name: "pics/skin.png", data: png() },
      { name: "pics/new.png", data: png(5) },
    ],
    manifest,
  );
  const e = await openProject(extra, inflateRaw);
  assert.equal(e.ok, true);
  assert.equal(e.verified, false);
  assert.deepEqual(e.issues.map((i) => [i.code, i.severity, i.path]), [["project-file-extra", "warning", "pics/new.png"]]);
});

test("an unreadable or newer project.json never blocks opening", async () => {
  const files = [{ name: "scene.json", data: enc.encode(sceneText) }];
  const garbled = await openProject(await withManifest(files, "{ not json"), inflateRaw);
  assert.equal(garbled.ok, true);
  assert.deepEqual(codes(garbled), ["project-info-unreadable"]);
  const wrong = await openProject(await withManifest(files, { hello: "world" }), inflateRaw);
  assert.equal(wrong.ok, true);
  assert.deepEqual(codes(wrong), ["project-info-unreadable"]);

  const manifest = { ...buildManifest({ name: "Future", sceneText, assets: new Map() }), version: 99 };
  const newer = await openProject(await withManifest(files, manifest), inflateRaw);
  assert.equal(newer.ok, true);
  assert.equal(newer.name, "Future");
  assert.deepEqual(codes(newer), ["project-newer"]);
});

test("bad zips come back as errors from openProject too", async () => {
  const r = await openProject(enc.encode("not a zip at all, just words in a row here"), inflateRaw);
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r), ["not-a-zip"]);
  assert.equal(r.sceneText, undefined);
});

test("saveProject refuses names that would clash with the project's own files", async () => {
  const clash = input();
  clash.assets.set("project.json", enc.encode("{}"));
  await assert.rejects(saveProject(clash), /project\.json/);
});

test("project names are shortened and blank names fall back", async () => {
  const long = await openProject(await saveProject({ ...input(), name: "x".repeat(500) }), inflateRaw);
  assert.equal(long.name.length, 120);
  const blank = await openProject(await saveProject({ ...input(), name: "   " }), inflateRaw);
  assert.equal(blank.name, "Untitled scene");
});

test("checkUploads: missing uploads and unused files are explained; library names are left to the registry check", () => {
  const parsed = parseScene(sceneText);
  assert.ok(parsed.ok && parsed.scene);
  const scene = parsed.scene!;
  const none = checkUploads(scene, new Set());
  assert.deepEqual(none.map((i) => [i.code, i.path]), [["missing-upload", "$.objects[0].asset"], ["missing-upload", "$.objects[0].material.texture"]]);
  assert.match(none[0].fix, /models\/hero\.glb/);

  const all = checkUploads(scene, new Set(["models/hero.glb", "pics/skin.png", "notes/credits.txt"]));
  assert.deepEqual(all, []); // text files are never "unused"

  const extra = checkUploads(scene, new Set(["models/hero.glb", "pics/skin.png", "sound/old.wav"]));
  assert.deepEqual(extra.map((i) => [i.code, i.path]), [["unused-upload", "sound/old.wav"]]);
});
