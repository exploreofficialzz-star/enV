import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { packStudioProjectAssets, unpackStudioProjectAssets } from "./ux-ui-studio-storage.ts";

test("linked views share actual embedded font and image bytes across local save/reload", () => {
  const layer = { id: "heading", fontDataUrl: "data:font/ttf;base64,AAAA", imageDataUrl: "data:image/png;base64,BBBB", imageOriginalDataUrl: "data:image/png;base64,BBBB" };
  const project = { elements: [layer], responsiveDesign: { baseElements: [layer], overrides: { tablet: { added: [layer] } } }, screens: [{ elements: [layer], responsiveDesign: { baseElements: [layer] } }] };
  const original = JSON.stringify(project);
  const packed = packStudioProjectAssets(project);
  assert.equal(packed.elements[0].fontDataUrl, layer.fontDataUrl);
  assert.equal(JSON.stringify(packed).split(layer.fontDataUrl).length - 1, 1);
  assert.equal(JSON.stringify(packed).split(layer.imageDataUrl).length - 1, 1);
  assert.deepEqual(unpackStudioProjectAssets(JSON.parse(JSON.stringify(packed))), project);
  assert.equal(JSON.stringify(project), original);
});

test("a real bundled Inter project with linked views fits both browser draft copies", () => {
  const font = "data:font/ttf;base64," + readFileSync("public/uxui/fonts/inter.ttf").toString("base64");
  const layer = { id: "heading", fontDataUrl: font };
  const project = { elements: [layer], responsiveDesign: { baseElements: [layer] }, screens: [{ elements: [layer], responsiveDesign: { baseElements: [layer] } }] };
  const full = JSON.stringify(project), packed = JSON.stringify(packStudioProjectAssets(project));
  assert.ok(full.length * 2 > 5 * 1024 * 1024, "Previous repeated copies exceed local storage");
  assert.ok(packed.length * 2 < 3 * 1024 * 1024, "Active project and draft-list copy fit together");
  assert.deepEqual(unpackStudioProjectAssets(JSON.parse(packed)), project);
});

test("legacy drafts stay readable and text that resembles a reference stays literal", () => {
  const legacy = { elements: [{ text: "env-uxui-asset:asset-0", fontDataUrl: "" }] };
  assert.deepEqual(unpackStudioProjectAssets(legacy), legacy);
  const packed = packStudioProjectAssets({ ...legacy, screens: [{ fontDataUrl: "data:font/ttf;base64,A" }, { fontDataUrl: "data:font/ttf;base64,A" }] });
  assert.equal(unpackStudioProjectAssets(packed).elements[0].text, "env-uxui-asset:asset-0");
});

test("missing, inherited and invalid asset references fail explicitly", () => {
  for (const path of [["missing"], ["__proto__"], ["elements", 0, "text"]]) assert.throws(() => unpackStudioProjectAssets({ elements: [{ text: "hello", fontDataUrl: "env-uxui-asset:asset-0" }], studioAssetReferences: { version: 1, paths: { "asset-0": path } } }));
});
