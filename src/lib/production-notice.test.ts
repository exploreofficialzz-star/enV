import assert from "node:assert/strict";
import test from "node:test";
import { isToolUnderProduction } from "./production-notice.ts";

test("explicitly available categories stay accessible", () => {
  for (const category of ["accessibility", "audio", "business", "calculators", "communication", "creators", "datetime", "developer", "design", "ecommerce", "files", "ai", "qr", "video"] as const) {
    assert.equal(isToolUnderProduction({ id: `test-${category}`, category }), false, `${category} should be exempt`);
  }
});

test("A book is accessible without exposing the Productivity category", () => {
  assert.equal(isToolUnderProduction({ id: "a-book", category: "productivity" }), false);
  assert.equal(isToolUnderProduction({ id: "another-productivity-tool", category: "productivity" }), true);
});

test("completed PDF/document operations are individually accessible without opening the whole PDF category", () => {
  for (const id of ["pdf-merger", "pdf-metadata-viewer", "pdf-metadata-tool", "pdf-page-extractor", "pdf-splitter", "pdf-rotator", "pdf-text-extractor", "docx-text-extractor"]) {
    assert.equal(isToolUnderProduction({ id, category: "pdf" }), false, `${id} should be accessible`);
  }
  assert.equal(isToolUnderProduction({ id: "pdf-to-word", category: "pdf" }), true);
});

test("all other non-exempt categories show the production notice", () => {
  for (const category of ["career", "image", "pdf", "productivity"] as const) {
    assert.equal(isToolUnderProduction({ id: `unreleased-${category}`, category }), true, `${category} should be restricted`);
  }
});
