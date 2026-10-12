import test from "node:test";
import assert from "node:assert/strict";
import { apcaContrast } from "./accessibility-apca.ts";

test("matches APCA-W3 0.1.9 black-on-white reference score and polarity", () => {
  assert.ok(Math.abs(apcaContrast("#000000", "#ffffff")! - 106.04067321268862) < 1e-9);
  assert.ok(Math.abs(apcaContrast("#ffffff", "#000000")! + 107.88473318309848) < 1e-9);
});

test("reports polarity-sensitive neutral contrast scores without WCAG-style pass labels", () => {
  assert.ok(Math.abs(apcaContrast("#777777", "#ffffff")! - 71.11110332561125) < 1e-9);
  assert.ok(apcaContrast("#ffffff", "#777777")! < 0);
});

test("composites alpha and translucent surfaces against the supplied canvas", () => {
  const actual = apcaContrast("rgba(0,0,0,0.5)", "#ffffff", "#ffffff");
  const equivalentOpaque = apcaContrast("#808080", "#ffffff", "#ffffff");
  assert.ok(actual !== null && equivalentOpaque !== null);
  assert.ok(Math.abs(actual - equivalentOpaque) < 0.3);
  const translucentOnWhite = apcaContrast("#000000", "rgba(255,255,255,0.5)", "#ffffff");
  const translucentOnBlack = apcaContrast("#000000", "rgba(255,255,255,0.5)", "#000000");
  assert.notEqual(translucentOnWhite, translucentOnBlack);
});

test("rejects invalid color inputs rather than manufacturing a score", () => {
  assert.equal(apcaContrast("nonsense", "#ffffff"), null);
  assert.equal(apcaContrast("#000000", "#ffffff", "invalid"), null);
});
