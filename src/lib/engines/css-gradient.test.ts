import test from "node:test";
import assert from "node:assert/strict";
import { buildCssGradient, moveGradientStop, normalizeGradientStops, type GradientStop } from "./css-gradient.ts";

const sample: GradientStop[] = [
  { id: "end", color: "#ffffff", position: 100 },
  { id: "start", color: "#000000", position: 0 },
  { id: "middle", color: "#00aa88", position: 52.5 },
];

test("linear gradient keeps editable, sorted stop positions", () => {
  assert.equal(buildCssGradient({ kind: "linear", angle: 135, stops: sample }), "linear-gradient(135deg, #000000 0%, #00aa88 52.5%, #ffffff 100%)");
});

test("radial and conic gradients emit their selected geometry", () => {
  assert.equal(buildCssGradient({ kind: "radial", shape: "ellipse", position: "top right", stops: sample }), "radial-gradient(ellipse at top right, #000000 0%, #00aa88 52.5%, #ffffff 100%)");
  assert.equal(buildCssGradient({ kind: "conic", angle: 45, position: "center", stops: sample }), "conic-gradient(from 45deg at center, #000000 0%, #00aa88 52.5%, #ffffff 100%)");
});

test("repeating gradients and numeric limits are explicit", () => {
  assert.equal(buildCssGradient({ kind: "linear", angle: 999, repeating: true, stops: sample }), "repeating-linear-gradient(360deg, #000000 0%, #00aa88 52.5%, #ffffff 100%)");
  const normalized = normalizeGradientStops([{ id: "b", color: "", position: 130 }, { id: "a", color: "  #222222  ", position: -5 }]);
  assert.deepEqual(normalized.map((stop) => [stop.color, stop.position]), [["#222222", 0], ["#000000", 100]]);
});

test("perceptual interpolation and radial sizing use valid CSS syntax", () => {
  assert.equal(buildCssGradient({ kind: "linear", angle: 90, colorSpace: "oklch", hueMethod: "longer", stops: sample }), "linear-gradient(90deg in oklch longer hue, #000000 0%, #00aa88 52.5%, #ffffff 100%)");
  assert.equal(buildCssGradient({ kind: "radial", shape: "circle", size: "farthest-corner", position: "25% 80%", colorSpace: "oklab", stops: sample }), "radial-gradient(circle farthest-corner at 25% 80% in oklab, #000000 0%, #00aa88 52.5%, #ffffff 100%)");
  assert.equal(buildCssGradient({ kind: "conic", position: "300% -2%", colorSpace: "display-p3", stops: sample }), "conic-gradient(from 135deg at 100% 0% in display-p3, #000000 0%, #00aa88 52.5%, #ffffff 100%)");
});

test("gradient stop ordering can be adjusted with keyboard-accessible controls", () => {
  const moved = moveGradientStop(sample, "middle", -1);
  assert.deepEqual(moved.map((stop) => stop.id), ["middle", "start", "end"]);
  assert.deepEqual(moved.map((stop) => stop.position), [0, 52.5, 100]);
  assert.deepEqual(moveGradientStop(sample, "start", -1).map((stop) => stop.id), ["start", "middle", "end"]);
});

test("gradient builder rejects less than two stops", () => {
  assert.throws(() => buildCssGradient({ kind: "linear", stops: [sample[0]] }), /at least two/);
});
