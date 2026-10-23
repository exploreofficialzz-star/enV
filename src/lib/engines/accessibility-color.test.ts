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
import { parseUxUiStudioChartData } from "./ux-ui-studio-chart.ts";
import { generateHtmlProject, generateKotlinProject, generateReactProject, generateSwiftProject, type UxCodegenProject } from "./ux-ui-studio-codegen.ts";

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
    { id: "opacity", kind: "text", name: "Faded label", text: "Cancel", color: "#111827", background: "#FFFFFF", fontSize: 16, fontWeight: 400, opacity: 0.5 },
  ], "#FFFFFF");
  assert.ok(findings.some((finding) => finding.includes("Low contrast heading") && finding.includes("4.48:1") && finding.includes("4.5:1")));
  assert.ok(!findings.some((finding) => finding.includes("Large title")));
  assert.ok(findings.some((finding) => finding.includes("Translucent label") && finding.includes("3.98:1")));
  assert.ok(findings.some((finding) => finding.includes("Gradient label") && finding.includes("manually review")));
  assert.ok(findings.some((finding) => finding.includes("Faded label") && finding.includes("reduced layer opacity")));
});

test("UX/UI Studio chart rows are parsed and invalid rows are reported", () => {
  const chart = parseUxUiStudioChartData("Monthly activity\nJan: 36\nFeb, 62.5\nMar=0\nBroken row\nApr: -3\nMay: 18");
  assert.equal(chart.title, "Monthly activity");
  assert.deepEqual(chart.points, [
    { label: "Jan", value: 36 },
    { label: "Feb", value: 62.5 },
    { label: "Mar", value: 0 },
    { label: "May", value: 18 },
  ]);
  assert.equal(chart.invalidRows, 2);
  const empty = parseUxUiStudioChartData("Chart title\nNo numeric value");
  assert.equal(empty.points.length, 0);
  assert.equal(empty.invalidRows, 1);
});

test("UX/UI Studio generated Web, Compose and SwiftUI handoff renders saved chart data", () => {
  const project: UxCodegenProject = {
    name: "Chart QA",
    target: "mobile",
    background: "#FFFFFF",
    viewport: { width: 390, height: 844 },
    breakpoints: { mobile: 480, tablet: 768, desktop: 1024 },
    tokens: { colors: [], typography: [], spacing: [] },
    elements: [{
      id: "chart-qa", kind: "chart", name: "Monthly activity", x: 10, y: 20, width: 300, height: 180,
      text: "Monthly activity\nJan: 36\nFeb: 62",
      iconName: "", iconSvg: "", iconViewBox: "0 0 24 24", imageDataUrl: "",
      color: "#2563EB", background: "#FFFFFF", borderColor: "#E5E7EB", borderWidth: 1, radius: 8, padding: 8,
      marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
      fontFamily: "Inter", fontSize: 13, fontWeight: 600, lineHeight: 1.35, letterSpacing: 0, textAlign: "left",
      opacity: 1, shadow: false, horizontalConstraint: "left", verticalConstraint: "top",
      minWidth: 0, maxWidth: 0, visibleOn: ["mobile"], referenceWidth: 390, referenceHeight: 844, componentKey: ""
    }]
  };
  const html = generateHtmlProject(project);
  const react = generateReactProject(project);
  const kotlin = generateKotlinProject(project);
  const swift = generateSwiftProject(project);
  assert.ok(html.includes('role="img" aria-label="Chart: Monthly activity'));
  assert.ok(html.includes(">Jan</text>") || html.includes(">Jan</text>"));
  assert.ok(react.includes("const chartData: Record"));
  assert.ok(react.includes('role="img" aria-label={"Chart: "'));
  assert.ok(react.includes("Jan"));
  assert.ok(kotlin.includes("generatedChartPoints"));
  assert.ok(kotlin.includes('"Jan" to 36.0'));
  assert.ok(swift.includes("chartPoints"));
  assert.ok(swift.includes("Monthly activity"));
  assert.ok(swift.includes("Jan"));
  assert.ok(swift.includes('String(format: "%.0f", point.value)'), "SwiftUI chart export must emit valid numeric formatting");
  assert.ok(swift.includes(".font(.system(size: 7))"), "SwiftUI chart export must emit a concrete font size");
  assert.ok(!swift.includes("* scale"), "SwiftUI chart export must not depend on an undefined scale variable");
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
