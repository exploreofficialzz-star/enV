import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { generateHtmlProject, generateReactProject, type UxCodegenLayer, type UxCodegenProject } from "./ux-ui-studio-codegen.ts";
import { createResponsiveDesign, commitResponsiveElements, responsiveElements } from "./ux-ui-studio-responsive.ts";

const phone = { width: 390, height: 844 }, tablet = { width: 768, height: 1024 };
function fixture(): UxCodegenProject {
  const layer: UxCodegenLayer = {
    id: "search", kind: "search", name: "Search products", x: 24, y: 32, width: 342, height: 48,
    horizontalConstraint: "stretch", verticalConstraint: "top", referenceWidth: 390, referenceHeight: 844,
    text: "Search all products", iconName: "", iconSvg: "", iconViewBox: "", imageDataUrl: "",
    color: "#111111", background: "#ffffff", borderColor: "#444444", borderWidth: 2, borderStyle: "dashed",
    radius: 0, cornerRadii: { topLeft: 0, topRight: 4, bottomRight: 12, bottomLeft: 20 },
    padding: 8, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0,
    fontFamily: "Arial", fontSize: 16, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0,
    textAlign: "left", opacity: 1, shadow: false,
  };
  let responsiveDesign = createResponsiveDesign([layer], "mobile", phone);
  const local = responsiveElements(responsiveDesign, "tablet", tablet);
  responsiveDesign = commitResponsiveElements(responsiveDesign, "tablet", tablet, [{ ...local[0], text: "Tablet catalog search", width: 600, x: 84 }, { ...local[0], id: "tablet-only", kind: "text", name: "Tablet badge", text: "Tablet exclusive" }], "device");
  return { name: "Linked store", target: "mobile", viewport: phone, background: "#eeeeee", breakpoints: { mobile: 480, tablet: 768, desktop: 1024 }, tokens: { colors: [], spacing: [], typography: [] }, elements: [layer], responsiveDesign };
}

function renderReactSource(source: string): string {
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const module = { exports: {} as { default?: React.ComponentType } };
  runInNewContext(compiled.outputText, { module, exports: module.exports, require: createRequire(import.meta.url) });
  assert.ok(module.exports.default, "The generated source exports a React component");
  return renderToStaticMarkup(React.createElement(module.exports.default));
}

function deviceMarkup(markup: string, target: string): string {
  const start = markup.indexOf(' data-device="' + target + '"');
  assert.ok(start >= 0, target + " has a generated artboard");
  const end = markup.indexOf(' data-device="', start + 1);
  return markup.slice(start, end < 0 ? undefined : end);
}

test("HTML handoff includes shared content, per-device fixes and device-only elements", () => {
  const html = generateHtmlProject(fixture());
  assert.match(deviceMarkup(html, "mobile"), /Search all products/);
  assert.doesNotMatch(deviceMarkup(html, "mobile"), /Tablet exclusive|Tablet catalog search/);
  assert.match(deviceMarkup(html, "tablet"), /Tablet catalog search/);
  assert.match(deviceMarkup(html, "tablet"), /Tablet exclusive/);
  assert.match(deviceMarkup(html, "tablet"), /left:84px;width:calc\(600px/);
  assert.doesNotMatch(deviceMarkup(html, "desktop"), /Tablet exclusive|Tablet catalog search/);
  assert.match(html, /@media\(max-width:480px\)/);
  assert.match(html, /data-device="desktop"\]\{display:block/);
});

test("React handoff renders all device variants and preserves corner/stroke controls", () => {
  const source = generateReactProject(fixture());
  const html = renderReactSource(source);
  assert.match(deviceMarkup(html, "mobile"), /Search all products/);
  assert.match(deviceMarkup(html, "tablet"), /Tablet catalog search/);
  assert.match(deviceMarkup(html, "tablet"), /Tablet exclusive/);
  assert.doesNotMatch(deviceMarkup(html, "desktop"), /Tablet exclusive/);
  assert.match(html, /border:2px dashed #444444/);
  assert.match(html, /border-radius:0px 4px 12px 20px/);
  assert.match(html, /left:84px;width:calc\(600px/);
});

test("web handoffs respect device removal and keep legacy projects as a single artboard", () => {
  const project = fixture();
  project.responsiveDesign = commitResponsiveElements(project.responsiveDesign!, "tablet", tablet, [], "device");
  assert.doesNotMatch(deviceMarkup(generateHtmlProject(project), "tablet"), /Search products|Tablet exclusive/);
  assert.doesNotMatch(deviceMarkup(renderReactSource(generateReactProject(project)), "tablet"), /Search products|Tablet exclusive/);
  delete project.responsiveDesign;
  const legacy = generateHtmlProject(project);
  assert.doesNotMatch(legacy, /env-device-artboard/);
  assert.match(legacy, /Search all products/);
  assert.doesNotMatch(generateReactProject(project), /className="env-artboard env-device-artboard"/);
});

test("React handoff deduplicates raster assets and omits editor originals", () => {
  const project = fixture();
  const image = { ...project.elements[0], kind: "image", imageDataUrl: "data:image/png;base64,UNIQUE_CURRENT_ASSET", imageOriginalDataUrl: "data:image/png;base64,EDITOR_ORIGINAL_ASSET" };
  project.elements = [image];
  project.responsiveDesign = createResponsiveDesign([image], "mobile", phone);
  const source = generateReactProject(project);
  assert.equal(source.split(image.imageDataUrl).length - 1, 1);
  assert.doesNotMatch(source, /EDITOR_ORIGINAL_ASSET/);
});

test("web font descriptors match actual bundled static and variable fonts", () => {
  const project = fixture();
  delete project.responsiveDesign;
  const staticFont = readFileSync(new URL("../../../public/uxui/fonts/bebas-neue.ttf", import.meta.url)).toString("base64");
  const variableFont = readFileSync(new URL("../../../public/uxui/fonts/inter.ttf", import.meta.url)).toString("base64");
  project.elements = [
    { ...project.elements[0], fontFamily: "Bebas Neue", fontDataUrl: "data:font/ttf;base64," + staticFont },
    { ...project.elements[0], id: "variable", fontFamily: "Inter", fontDataUrl: "data:font/ttf;base64," + variableFont },
  ];
  for (const html of [generateHtmlProject(project), renderReactSource(generateReactProject(project))]) {
    assert.match(html, /font-weight:400;font-display:swap/);
    assert.match(html, /font-weight:100 900;font-display:swap/);
  }
});

test("HTML textarea export closes its element and preserves following UI", () => {
  const project = fixture();
  delete project.responsiveDesign;
  project.elements = [{ ...project.elements[0], kind: "textarea" }, { ...project.elements[0], id: "after", kind: "button", text: "Send message" }];
  assert.match(generateHtmlProject(project), /<textarea[^>]*><\/textarea><\/div>\n<button[^>]*>Send message<\/button>/);
});

test("generated React handoff passes TypeScript and handles quoted project names", () => {
  const project = fixture();
  project.name = 'Store "Featured" & Friends';
  const source = generateReactProject(project);
  const path = resolve("src/lib/engines/generated-studio-typecheck.tsx");
  const options: ts.CompilerOptions = { strict: true, noEmit: true, jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022, esModuleInterop: true, skipLibCheck: true };
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (file, language, onError, shouldCreateNew) => file === path ? ts.createSourceFile(file, source, language, true, ts.ScriptKind.TSX) : original(file, language, onError, shouldCreateNew);
  const program = ts.createProgram([path], options, host);
  const errors = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, "\n")), []);
  assert.match(renderReactSource(source), /Store &quot;Featured&quot; &amp; Friends design/);
});
