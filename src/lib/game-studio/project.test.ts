import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blankProject,
  makeObject,
  starterProject,
  validateGlb,
  validatePng,
  validateProject,
} from "./project.ts";

test("starter worlds contain a playable player and real obstacles", () => {
  for (const template of ["starter", "courtyard", "gallery"] as const) {
    const project = validateProject(starterProject(template));
    assert.equal(project.objects.filter((object) => object.player).length, 1);
    assert.ok(project.objects.some((object) => object.collider && object.kind !== "ground"));
  }
});

test("Android's bundled preview presets match the web starter scenes", () => {
  for (const template of ["starter", "courtyard", "gallery"] as const) {
    const expected = starterProject(template);
    expected.id = `preset-${template}`;
    expected.objects.forEach((object, index) => { object.id = `preset-${template}-${index}`; });
    const bundled = JSON.parse(readFileSync(new URL(`../../../apps/android/app/src/main/assets/game-presets/${template}.json`, import.meta.url), "utf8"));
    assert.deepEqual(validateProject(bundled), validateProject(expected));
  }
});

test("the shared native compatibility fixture preserves its embedded assets and transforms", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("../../../tests/fixtures/game-studio-project-v1.json", import.meta.url),
      "utf8",
    ),
  );
  const project = validateProject(fixture);
  assert.equal(project.objects[1].position.x, 1.25);
  assert.equal(project.objects[2].assetId, "artboard-1");
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))), project);
  const png = Uint8Array.from(atob(project.assets[0].dataUrl.split(",")[1]), (character) =>
    character.charCodeAt(0),
  );
  assert.deepEqual(validatePng(png), { width: 1, height: 1 });
  png[30] ^= 1;
  assert.throws(() => validatePng(png), /valid PNG/);
});

function glb(json: object): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  const length = Math.ceil(bytes.length / 4) * 4;
  const result = new Uint8Array(20 + length);
  result.fill(32, 20);
  result.set(bytes, 20);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.length, true);
  view.setUint32(12, length, true);
  view.setUint32(16, 0x4e4f534a, true);
  return result;
}
test("a versioned scene round-trips transforms and gameplay settings", () => {
  const project = blankProject();
  const player = makeObject("box", "Hero");
  player.position.x = 3.25;
  player.rotation.y = 45;
  player.scale.z = 2;
  player.player = true;
  player.speed = 4;
  project.objects.push(player);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))), project);
});
test("invalid versions, missing assets, duplicate IDs and negative scale are rejected", () => {
  const project = blankProject();
  assert.throws(() => validateProject({ ...project, version: 2 }), /version is unsupported/);
  const model = makeObject("model");
  model.assetId = "missing";
  assert.throws(
    () => validateProject({ ...project, objects: [model] }),
    /missing or incompatible asset/,
  );
  const box = makeObject("box");
  assert.throws(() => validateProject({ ...project, objects: [box, box] }), /duplicate IDs/);
  box.scale.x = -1;
  assert.throws(() => validateProject({ ...project, objects: [box] }), /positive scale/);
});
test("GLB validation rejects malformed, external and decoder-dependent content", () => {
  assert.doesNotThrow(() =>
    validateGlb(glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 0 }] })),
  );
  assert.throws(() => validateGlb(new Uint8Array([1, 2, 3])), /valid GLB/);
  assert.throws(
    () =>
      validateGlb(
        glb({ asset: { version: "2.0" }, images: [{ uri: "https://example.test/texture.png" }] }),
      ),
    /external files/,
  );
  assert.throws(
    () =>
      validateGlb(
        glb({ asset: { version: "2.0" }, extensionsUsed: ["KHR_draco_mesh_compression"] }),
      ),
    /external decoder/,
  );
});
