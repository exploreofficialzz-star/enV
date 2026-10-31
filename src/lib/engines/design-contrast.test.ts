import test from "node:test";
import assert from "node:assert/strict";
import {
  contrastRatio,
  evaluateContrast,
  parseCssColor,
  resolveRenderedPair,
  suggestContrastCorrections,
  toHex,
} from "./accessibility-color.ts";

test("translucent text and background are composited over the selected canvas", () => {
  const foreground = parseCssColor("rgba(0, 0, 0, 0.5)")!;
  const background = parseCssColor("rgba(255, 255, 255, 0.5)")!;
  const blueCanvas = parseCssColor("#0000ff")!;
  const whiteCanvas = parseCssColor("#ffffff")!;
  const bluePair = resolveRenderedPair(foreground, background, blueCanvas);
  const whitePair = resolveRenderedPair(foreground, background, whiteCanvas);
  assert.notEqual(toHex(bluePair.background), toHex(whitePair.background));
  assert.notEqual(contrastRatio(foreground, background, blueCanvas), contrastRatio(foreground, background, whiteCanvas));
  const result = evaluateContrast(foreground, background, "normal-aa", blueCanvas);
  assert.equal(result.ratio, contrastRatio(foreground, background, blueCanvas));
});

test("contrast correction suggestions use the same selected canvas as evaluation", () => {
  const foreground = parseCssColor("rgba(119, 119, 119, 0.9)")!;
  const background = parseCssColor("rgba(255, 255, 255, 0.6)")!;
  const canvas = parseCssColor("#102a43")!;
  const suggestion = suggestContrastCorrections(foreground, background, "normal-aa", canvas).foreground;
  assert.ok(suggestion);
  assert.ok(contrastRatio(suggestion, background, canvas) >= 4.5);
});
