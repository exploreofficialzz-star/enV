import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generateHtmlProject, generateKotlinProject, generateSwiftProject, type UxCodegenProject } from "./ux-ui-studio-codegen.ts";

function iconProject(svg: string): UxCodegenProject {
  return {
    name: "Icon regression", target: "mobile", background: "#FFFFFF",
    viewport: { width: 390, height: 844 }, breakpoints: { mobile: 480, tablet: 768, desktop: 1024 },
    tokens: { colors: [], spacing: [], typography: [] },
    elements: [{
      id: "icon", kind: "icon", name: "Library icon", x: 20, y: 20, width: 48, height: 48,
      text: "", iconName: "lucide:house", iconSvg: svg, iconViewBox: "0 0 24 24", imageDataUrl: "",
      color: "#2563EB", background: "transparent", borderColor: "#000000", borderWidth: 0, radius: 0,
      padding: 0, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
      fontFamily: "Inter", fontSize: 16, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0,
      textAlign: "left", opacity: 0.65, shadow: true,
    }],
  };
}

test("bundled outline icons retain inherited SVG strokes in both native handoffs", () => {
  const svg = '<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M4 12h16"/></g>';
  const kotlin = generateKotlinProject(iconProject(svg));
  const swift = generateSwiftProject(iconProject(svg));
  assert.equal((kotlin.match(/style = android.graphics.Paint.Style.STROKE/g) || []).length, 2);
  assert.equal((kotlin.match(/style = android.graphics.Paint.Style.FILL/g) || []).length, 0);
  assert.equal((swift.match(/\.stroke\(Color\(hex: "#2563EB"\)/g) || []).length, 2);
  assert.equal((swift.match(/\.fill\(Color\(hex: "#2563EB"\)/g) || []).length, 0);
});

test("relative, rotated and scaled SVG arcs export curved Swift paths with exact endpoints", () => {
  const svg = '<path fill="none" stroke="currentColor" d="M2 12a10 10 0 0 1 20 0A6 3 35 1 0 2 12"/>';
  const swift = generateSwiftProject(iconProject(svg));
  assert.ok((swift.match(/path\.addCurve\(/g) || []).length >= 4);
  assert.match(swift, /path\.addCurve\(to: CGPoint\(x: 22, y: 12\)/);
  assert.match(swift, /path\.addCurve\(to: CGPoint\(x: 2, y: 12\)/);
  assert.doesNotMatch(swift, /\b(?:NaN|Infinity)\b/);
});

test("group paint overrides remain scoped and effects survive all handoffs", () => {
  const project = iconProject('<g fill="none" stroke="currentColor"><path d="M1 1L2 2"/><g stroke="none" fill="#DC2626"><circle cx="4" cy="4" r="1"/></g><path d="M8 8L9 9"/></g>');
  const kotlin = generateKotlinProject(project), swift = generateSwiftProject(project), html = generateHtmlProject(project);
  assert.equal((kotlin.match(/style = android.graphics.Paint.Style.STROKE/g) || []).length, 2);
  assert.equal((kotlin.match(/style = android.graphics.Paint.Style.FILL/g) || []).length, 1);
  assert.match(kotlin, /graphicsLayer\(alpha = 0\.65f\)/);
  assert.match(kotlin, /\.shadow\(10\.dp/);
  assert.match(swift, /\.opacity\(0\.65\)/);
  assert.match(swift, /\.shadow\(color:/);
  assert.match(html, /opacity:0\.65/);
  assert.match(html, /box-shadow:0 3px 10px/);
});

test("every shipped icon produces finite native geometry and bundled copies agree", () => {
  const web = readFileSync(new URL("../../../public/uxui/icons.json", import.meta.url), "utf8");
  for (const relative of ["../../../apps/shared/uxui-icons.json", "../../../apps/ios/enV/StudioAssets/uxui-icons.json"]) {
    assert.equal(readFileSync(new URL(relative, import.meta.url), "utf8"), web);
  }
  const icons = JSON.parse(web) as Record<string, string>;
  assert.ok(Object.keys(icons).length >= 676);
  for (const [id, svg] of Object.entries(icons)) {
    const project = iconProject(svg);
    const swift = generateSwiftProject(project), kotlin = generateKotlinProject(project);
    assert.doesNotMatch(swift, /\b(?:NaN|Infinity)\b/, id);
    assert.doesNotMatch(kotlin, /\b(?:NaN|Infinity)\b/, id);
    assert.match(swift, /GeometryReader \{ geometry in ZStack/, id);
    assert.match(kotlin, /nativeCanvas\.drawPath/, id);
  }
});


test("real bundled fonts and large image payloads stay below Kotlin JVM string limits", () => {
  const project = iconProject("");
  const font = readFileSync(new URL("../../../public/uxui/fonts/inter.ttf", import.meta.url)).toString("base64");
  project.elements[0].kind = "text";
  project.elements[0].fontDataUrl = "data:font/ttf;base64," + font;
  project.elements.push({ ...project.elements[0], id: "image", kind: "image", fontDataUrl: "", imageDataUrl: "data:image/png;base64," + "A".repeat(80000) });
  const source = generateKotlinProject(project);
  assert.equal((source.match(/\.joinToString\(""\)/g) || []).length, 2);
  for (const literal of source.matchAll(/"(?:\\.|[^"\\])*"/g)) {
    assert.ok(Buffer.byteLength(literal[0], "utf8") < 65535, "Generated Kotlin never embeds an oversized JVM constant");
  }
});
