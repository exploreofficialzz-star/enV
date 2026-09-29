import test from "node:test";
import assert from "node:assert/strict";
import { buildWebDesignOutput, parseWebDesignToolId, WEB_DESIGN_FAMILIES } from "./webdesign-engine-utils.ts";

const base = { project: "enV", primary: "#0d9f8a", text: "#202124", font: "system-ui, sans-serif", maxWidth: 1200, spacing: 8, columns: 3, radius: 12 };

test("parses every web design tool family and workflow", () => {
  for (const family of WEB_DESIGN_FAMILIES) for (const workflow of ["generator", "builder", "preview", "checklist", "snippet-generator"]) {
    assert.deepEqual(parseWebDesignToolId(`${family}-${workflow}`), { family, workflow });
  }
});

test("generates real responsive CSS", () => {
  const output = buildWebDesignOutput("responsive-layout", "generator", base);
  assert.match(output, /@media/);
  assert.match(output, /--content-max: 1200px/);
});

test("generates accessible form markup", () => {
  const output = buildWebDesignOutput("form", "builder", base);
  assert.match(output, /for="name"/);
  assert.match(output, /id="name"/);
  assert.match(output, /type="email"/);
});

test("generates design checklist", () => {
  const output = buildWebDesignOutput("modal", "checklist", base);
  assert.match(output, /MODAL CHECKLIST/);
  assert.match(output, /focus/i);
});

test("rejects invalid inputs", () => {
  assert.throws(() => buildWebDesignOutput("grid", "generator", { ...base, columns: 0 }), /Columns/);
  assert.throws(() => buildWebDesignOutput("grid", "generator", { ...base, primary: "red" }), /Primary color/);
});
