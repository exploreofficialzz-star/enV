import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkManifest, creditsFor, libraryLookup } from "./assets.ts";
import type { AssetManifest } from "./assets.ts";
import { buildAiInstructions, buildFixRequest, EXAMPLE_2D, EXAMPLE_3D } from "./prompt.ts";
import { BUILDERS, BUILDER_TYPES, BUILT_IN_CLIPS, checkAgainstRegistry, resolveParam, resolveParams } from "./registry.ts";
import { LIMITS } from "./constants.ts";
import { parseScene, validateScene } from "./validate.ts";

const shared = join(dirname(fileURLToPath(import.meta.url)), "../../../apps/shared/scene-studio");
const readJson = (rel: string) => JSON.parse(readFileSync(join(shared, rel), "utf8"));
const manifest: AssetManifest = readJson("asset-manifest.json");

test("registry: types are unique, described, and every default sits inside its own range", () => {
  assert.equal(new Set(BUILDER_TYPES).size, BUILDERS.length);
  for (const b of BUILDERS) {
    assert.ok(b.description.length > 10, b.type);
    assert.match(b.type, /^[a-z][a-z0-9]*$/);
    for (const p of b.params) {
      if (p.kind === "number") assert.ok(p.default >= p.min && p.default <= p.max, `${b.type}.${p.name}`);
      if (p.kind === "choice") assert.ok(p.choices.includes(p.default), `${b.type}.${p.name}`);
    }
  }
  for (const t of ["box", "character", "tree", "rain", "water", "pipe", "text", "group", "asset"]) assert.ok(BUILDER_TYPES.includes(t), t);
});

test("resolveParam clamps numbers, rejects bad choices and falls back to defaults", () => {
  const pipe = BUILDERS.find((b) => b.type === "pipe")!;
  const radius = pipe.params.find((p) => p.name === "radius")!;
  assert.equal(resolveParam(radius, 500), 20);
  assert.equal(resolveParam(radius, -4), 0.1);
  assert.equal(resolveParam(radius, "wide"), 1);
  assert.equal(resolveParam(radius, undefined), 1);
  assert.deepEqual(resolveParams("tree", { variant: "banana", height: 9 }), { variant: "oak", height: 9 });
  assert.deepEqual(resolveParams("not-a-type", {}), {});
});

test("every shared valid scene passes the registry check without errors; unknown assets only warn", () => {
  for (const f of ["01-minimal", "02-walk-and-talk", "03-two-speakers-camera", "04-night-flood-cinematic", "05-2d-motion-title"]) {
    const r = validateScene(readJson(`scenes/valid/${f}.json`));
    assert.ok(r.ok && r.scene, f);
    const issues = checkAgainstRegistry(r.scene, libraryLookup(manifest));
    assert.ok(issues.every((i) => i.severity === "warning"), f);
  }
});

test("registry warnings: unknown type, unknown and out-of-range params, bad clip, missing asset", () => {
  const r = validateScene({
    version: "1.0",
    objects: [
      { id: "a", type: "dragon" },
      { id: "b", type: "pipe", params: { radius: 999, colour: "red" } },
      { id: "c", type: "character", clip: "Moonwalk" },
      { id: "d", type: "asset" },
      { id: "e", type: "tree", asset: "library/nope" },
      { id: "f", type: "tree", asset: "library/tree_oak" },
    ],
  });
  assert.ok(r.ok && r.scene);
  const codes = checkAgainstRegistry(r.scene, libraryLookup(manifest)).map((i) => `${i.code}@${i.path}`);
  assert.deepEqual(codes.sort(), [
    "library-asset-not-bundled@$.objects[5].asset",
    "missing-asset@$.objects[3].asset",
    "param-adjusted@$.objects[1].params.radius",
    "unknown-clip@$.objects[2].clip",
    "unknown-library-asset@$.objects[4].asset",
    "unknown-param@$.objects[1].params.colour",
    "unknown-type@$.objects[0].type",
  ]);
});

test("a built-in clip name is accepted on a character; a rigged model may use its own clip names", () => {
  const r = validateScene({ version: "1.0", objects: [{ id: "a", type: "character", clip: BUILT_IN_CLIPS[1] }, { id: "b", type: "character", asset: "library/character_casual", clip: "Whatever" }] });
  assert.ok(r.ok && r.scene);
  assert.deepEqual(checkAgainstRegistry(r.scene).map((i) => i.code), []);
});

test("asset manifest: the shipped manifest passes the license gate", () => {
  assert.deepEqual(checkManifest(manifest), []);
});

test("asset manifest gate rejects bad licenses, missing proof, bad hashes and unsafe paths", () => {
  const base = (patch: object, assetPatch: object = {}): AssetManifest => ({
    version: 1,
    licenseAllowlist: ["CC0-1.0", "CC-BY-4.0"],
    attributionRequired: ["CC-BY-4.0"],
    packs: [{ id: "p", name: "P", author: "A", source: "https://example.org/", license: "CC0-1.0", status: "bundled", licenseProof: "https://example.org/license", verifiedOn: "2026-11-20", assets: [{ id: "library/thing", kind: "model", file: "models/thing.glb", sha256: "a".repeat(64), tags: [], ...assetPatch }], ...patch }],
  });
  assert.deepEqual(checkManifest(base({})), []);
  assert.match(checkManifest(base({ license: "CC-BY-NC-4.0" }))[0].message, /allow-list/);
  assert.match(checkManifest(base({ license: "CC-BY-4.0" })).map((p) => p.message).join("|"), /requires attribution/);
  assert.match(checkManifest(base({ licenseProof: undefined })).map((p) => p.message).join("|"), /licenseProof/);
  assert.match(checkManifest(base({ verifiedOn: "yesterday" })).map((p) => p.message).join("|"), /verifiedOn/);
  assert.match(checkManifest(base({ source: "http://insecure" })).map((p) => p.message).join("|"), /https/);
  assert.match(checkManifest(base({}, { sha256: "xyz" })).map((p) => p.message).join("|"), /sha256/);
  assert.match(checkManifest(base({}, { file: "../../etc/passwd" })).map((p) => p.message).join("|"), /safe relative/);
  assert.match(checkManifest(base({}, { id: "thing" })).map((p) => p.message).join("|"), /must look like/);
  assert.match(checkManifest(base({}), { inspectFile: () => null }).map((p) => p.message).join("|"), /missing/);
  assert.match(checkManifest(base({}), { inspectFile: () => ({ sha256: "b".repeat(64), bytes: 1 }) }).map((p) => p.message).join("|"), /does not match/);
  const dup = base({});
  dup.packs[0].assets.push({ ...dup.packs[0].assets[0] });
  assert.match(checkManifest(dup).map((p) => p.message).join("|"), /Duplicate asset/);
  // planned packs skip file checks but still need a valid license
  assert.deepEqual(checkManifest(base({ status: "planned", licenseProof: undefined, verifiedOn: undefined }, { file: undefined, sha256: undefined })), []);
  assert.ok(checkManifest(base({ status: "planned", license: "GPL-3.0" })).length > 0);
});

test("credits list only bundled attribution-required packs that are actually used", () => {
  const m: AssetManifest = {
    version: 1,
    licenseAllowlist: ["CC0-1.0", "CC-BY-4.0"],
    attributionRequired: ["CC-BY-4.0"],
    packs: [
      { id: "a", name: "A", author: "x", source: "https://x.org/", license: "CC-BY-4.0", attribution: "Model by X (CC BY 4.0)", status: "bundled", assets: [{ id: "library/one", kind: "model", tags: [] }] },
      { id: "b", name: "B", author: "y", source: "https://y.org/", license: "CC0-1.0", status: "bundled", assets: [{ id: "library/two", kind: "model", tags: [] }] },
    ],
  };
  assert.deepEqual(creditsFor(m, ["library/one"]), ["Model by X (CC BY 4.0)"]);
  assert.deepEqual(creditsFor(m, ["library/two"]), []);
  assert.deepEqual(creditsFor(m, []), []);
});

test("AI instructions: mention every builder, enum and limit, and their examples really validate", () => {
  const text = buildAiInstructions({ manifest, uploads: ["my-model.glb"] });
  for (const t of BUILDER_TYPES) assert.ok(text.includes(`"${t}"`), `type ${t}`);
  for (const w of ["quaternion", "rotationOrder", "+Y is up", "+y is DOWN", "shots", "environment", "bloom", "my-model.glb", "none are bundled yet"]) assert.ok(text.includes(w), w);
  assert.ok(text.includes(String(LIMITS.maxObjects)) && text.includes(String(LIMITS.maxDurationSeconds)));
  assert.ok(!/https?:\/\//.test(text), "no URLs in the instructions");
  for (const ex of [EXAMPLE_3D, EXAMPLE_2D]) {
    const r = validateScene(JSON.parse(JSON.stringify(ex)), { knownTypes: BUILDER_TYPES });
    assert.ok(r.ok && r.scene, JSON.stringify(r.issues));
    assert.deepEqual(r.issues, []);
    assert.deepEqual(checkAgainstRegistry(r.scene, libraryLookup(manifest)), []);
  }
  const fenced = /```json\n([\s\S]*?)\n```/g;
  let count = 0;
  for (const m of text.matchAll(fenced)) {
    count++;
    assert.ok(parseScene("```json\n" + m[1] + "\n```", { knownTypes: BUILDER_TYPES }).ok);
  }
  assert.equal(count, 2);
});

test("fix request: lists every error with path, message and fix; echoes the scene; handles warnings and huge scenes", () => {
  const bad = '{"version":"1.0","objects":[{"type":"box"}]}';
  const r = parseScene(bad);
  assert.equal(r.ok, false);
  const text = buildFixRequest(r.issues, bad);
  assert.match(text, /found 1 problem/);
  assert.match(text, /\$\.objects\[0\]\.id/);
  assert.match(text, /Fix: /);
  assert.ok(text.includes(bad));
  const warnOnly = buildFixRequest([{ severity: "warning", code: "unknown-field", path: "$.x", message: "ignored.", fix: "remove it." }], bad);
  assert.match(warnOnly, /can use your scene/);
  assert.match(buildFixRequest(r.issues, "x".repeat(70_000)), /too long to repeat/);
});
