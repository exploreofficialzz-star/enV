import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assetSource, planNotes, planObjects } from "./object-plan.ts";
import { libraryLookup } from "./assets.ts";
import type { AssetManifest } from "./assets.ts";
import { parseScene } from "./index.ts";

const manifest = JSON.parse(readFileSync(new URL("../../../apps/shared/scene-studio/asset-manifest.json", import.meta.url), "utf8")) as AssetManifest;
const library = libraryLookup(manifest);
const sceneOf = (objects: object[]) => {
  const r = parseScene(JSON.stringify({ objects }));
  assert.ok(r.ok && r.scene, JSON.stringify(r.issues));
  return r.scene!;
};

test("assetSource: none, library (planned → unavailable), upload present or missing", () => {
  const env = { library, uploads: new Set(["hero.glb"]) };
  assert.deepEqual(assetSource(undefined, env), { kind: "none" });
  assert.deepEqual(assetSource("hero.glb", env), { kind: "upload", name: "hero.glb", available: true });
  assert.deepEqual(assetSource("other.glb", env), { kind: "upload", name: "other.glb", available: false });
  assert.deepEqual(assetSource("library/character_casual", env), { kind: "library", name: "library/character_casual", available: false }); // planned, not bundled
  assert.deepEqual(assetSource("library/does_not_exist", env), { kind: "library", name: "library/does_not_exist", available: false });
  assert.deepEqual(assetSource("library/x", { uploads: new Set() }), { kind: "library", name: "library/x", available: false });
});

test("planObjects: known types are built as asked, with settings filled in and clamped", () => {
  const [tree, rain] = planObjects(sceneOf([{ id: "t", type: "tree", params: { height: 999 } }, { id: "r", type: "rain" }]), { uploads: new Set() });
  assert.equal(tree.type, "tree");
  assert.equal(tree.standIn, false);
  assert.equal(tree.params.height, 30); // clamped to the builder's maximum
  assert.equal(tree.params.variant, "oak"); // default filled in
  assert.deepEqual(tree.notes, []);
  assert.equal(rain.params.intensity, 0.5);
});

test("planObjects: an unknown type becomes a box stand-in with a plain explanation", () => {
  const [o] = planObjects(sceneOf([{ id: "u", type: "dragon" }]), { uploads: new Set() });
  assert.equal(o.requestedType, "dragon");
  assert.equal(o.type, "box");
  assert.equal(o.standIn, true);
  assert.match(o.notes[0], /"dragon" is not a type/);
});

test("planObjects: a missing model keeps the built-in character, but an asset object becomes a stand-in", () => {
  const plans = planObjects(
    sceneOf([
      { id: "hero", type: "character", asset: "hero.glb" },
      { id: "prop", type: "asset", asset: "prop.glb" },
      { id: "empty", type: "asset" },
      { id: "ok", type: "asset", asset: "ok.glb" },
      { id: "lib", type: "character", asset: "library/character_casual" },
    ]),
    { library, uploads: new Set(["ok.glb"]) },
  );
  assert.equal(plans[0].type, "character");
  assert.equal(plans[0].standIn, false);
  assert.match(plans[0].notes[0], /"hero\.glb" was not uploaded, so the built-in character is shown instead/);
  assert.equal(plans[1].standIn, true);
  assert.match(plans[1].notes[0], /stand-in box/);
  assert.equal(plans[2].standIn, true);
  assert.match(plans[2].notes[0], /no model name/);
  assert.equal(plans[3].standIn, false);
  assert.deepEqual(plans[3].notes, []);
  assert.deepEqual(plans[3].asset, { kind: "upload", name: "ok.glb", available: true });
  assert.match(plans[4].notes[0], /planned but not installed yet/);
});

test("planNotes collects every note once, in object order", () => {
  const plans = planObjects(sceneOf([{ id: "a", type: "nope" }, { id: "b", type: "asset", asset: "b.glb" }, { id: "c", type: "box" }]), { uploads: new Set() });
  assert.equal(planNotes(plans).length, 2);
});

test("the shipped example scenes plan cleanly; the only stand-ins are library models that are planned but not installed yet", () => {
  const dir = new URL("../../../apps/shared/scene-studio/scenes/valid/", import.meta.url);
  for (const name of ["01-minimal.json", "02-walk-and-talk.json", "03-two-speakers-camera.json", "04-night-flood-cinematic.json", "05-2d-motion-title.json"]) {
    const r = parseScene(readFileSync(new URL(name, dir), "utf8"));
    assert.ok(r.ok && r.scene, name);
    for (const p of planObjects(r.scene!, { library, uploads: new Set() })) {
      assert.ok(p.type.length > 0);
      if (p.standIn) assert.ok(p.asset.kind === "library" && p.notes.some((n) => /planned but not installed yet/.test(n)), `${name}: ${p.id} (${p.notes.join(" ")})`);
    }
  }
});
