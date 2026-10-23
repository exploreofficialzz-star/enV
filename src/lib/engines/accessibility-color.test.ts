import test from "node:test";
import assert from "node:assert/strict";
import {
  contrastRatio,
  evaluateContrast,
  formatColorSummary,
  parseCssColor,
  resolveRenderedPair,
  suggestContrastCorrections,
  toHex,
} from "./accessibility-color.ts";
import { auditUxUiStudioTextContrast } from "./ux-ui-studio-qa.ts";

test("parses 3/4/6/8 digit hex colors", () => {
  assert.deepEqual(parseCssColor("#fff"), { r: 255, g: 255, b: 255, a: 1, format: "hex", input: "#fff" });
  assert.equal(parseCssColor("#0008")?.a, 136 / 255);
  assert.equal(parseCssColor("#336699cc")?.a, 0.8,);
  assert.equal(parseCssColor("#336699")?.r, 51);
});

test("parses rgb and hsl with alpha", () => {
  const rgb = parseCssColor("rgba(255, 0, 128, 50%)");
  assert.ok(rgb);
  assert.equal(Math.round(rgb.r), 255);
  assert.equal(Math.round(rgb.b), 128);
  assert.equal(rgb.a, 0.5);

  const hsl = parseCssColor("hsl(120 100% 50% / 25%)");
  assert.ok(hsl);
  assert.equal(Math.round(hsl.r), 0);
  assert.equal(Math.round(hsl.g), 255);
  assert.equal(Math.round(hsl.b), 0);
  assert.equal(hsl.a, 0.25);
});

test("matches the WCAG contrast ratio reference values", () => {
  const black = parseCssColor("#000000")!;
  const white = parseCssColor("#ffffff")!;
  const gray = parseCssColor("#777777")!;
  assert.equal(Number(contrastRatio(black, white).toFixed(2)), 21);
  assert.equal(Number(contrastRatio(gray, white).toFixed(2)), 4.48);
  assert.equal(evaluateContrast(gray, white, "normal-aa").passes, false);
  assert.equal(evaluateContrast(gray, white, "large-aa").passes, true);
});

test("alpha is composited before contrast evaluation", () => {
  const black50 = parseCssColor("rgba(0,0,0,0.5)")!;
  const white = parseCssColor("#fff")!;
  const rendered = resolveRenderedPair(black50, white);
  assert.equal(Math.round(rendered.foreground.r), 128);
  assert.equal(Number(contrastRatio(black50, white).toFixed(2)), 3.98);
});

test("formatColorSummary keeps explicit alpha information", () => {
  const color = parseCssColor("rgba(34, 68, 102, 0.5)")!;
  const summary = formatColorSummary(color);
  assert.equal(summary.hex, "#22446680");
  assert.match(summary.rgb, /^rgba\(34, 68, 102, 0\.5\)$/);
  assert.equal(summary.alpha, "50%");
});

test("corrections find a passing color without changing the opposite color", () => {
  const fg = parseCssColor("#777777")!;
  const bg = parseCssColor("#ffffff")!;
  const suggestions = suggestContrastCorrections(fg, bg, "normal-aa");
  assert.ok(suggestions.foreground);
  const after = suggestions.foreground!;
  assert.ok(contrastRatio(after, bg) >= 4.5);
  assert.ok(after.a === fg.a);
  assert.notEqual(toHex(after), toHex(fg));
});

test("UX/UI Studio QA detects WCAG AA text contrast and preserves manual-review limits", () => {
  const findings = auditUxUiStudioTextContrast([
    { id: "low", kind: "text", name: "Low contrast heading", text: "Welcome", color: "#777777", background: "#FFFFFF", fontSize: 16, fontWeight: 400, opacity: 1 },
    { id: "large", kind: "text", name: "Large title", text: "Design better", color: "#FFFFFF", background: "#0050A4", fontSize: 24, fontWeight: 400, opacity: 1 },
    { id: "alpha", kind: "text", name: "Translucent label", text: "Save", color: "rgba(0, 0, 0, 0.5)", background: "transparent", fontSize: 16, fontWeight: 400, opacity: 1 },
    { id: "gradient", kind: "text", name: "Gradient label", text: "Explore", color: "#111827", background: "linear-gradient(red, blue)", fontSize: 16, fontWeight: 400, opacity: 1 },
  ], "#FFFFFF");
  assert.ok(findings.some((finding) => finding.includes("Low contrast heading") && finding.includes("4.48:1") && finding.includes("4.5:1")));
  assert.ok(!findings.some((finding) => finding.includes("Large title")));
  assert.ok(findings.some((finding) => finding.includes("Translucent label") && finding.includes("3.98:1")));
  assert.ok(findings.some((finding) => finding.includes("Gradient label") && finding.includes("manually review")));
});

test("invalid values are rejected", () => {
  assert.equal(parseCssColor(""), null);
  assert.equal(parseCssColor("#12"), null);
  assert.equal(parseCssColor("rgb(255, 255)"), null);
  assert.equal(parseCssColor("hsl(120 50 50)"), null);
  assert.equal(parseCssColor("rgb(12oops, 0, 0)"), null);
  assert.equal(parseCssColor("rgba(0, 0, 0, 0.5oops)"), null);
  assert.equal(parseCssColor("hsl(120degish 50% 50%)"), null);
});

test("opacity corrections never reduce opacity below the supplied alpha", () => {
  const fg = { r: 0, g: 0, b: 0, a: 0.1 };
  const bg = parseCssColor("#ffffff")!;
  const suggestion = suggestContrastCorrections(fg, bg, "normal-aa").foregroundOpacity;
  assert.ok(suggestion);
  assert.ok(suggestion.a >= fg.a);
  assert.ok(contrastRatio(suggestion, bg) >= 4.5);
});
