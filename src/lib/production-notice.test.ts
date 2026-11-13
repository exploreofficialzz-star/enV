import assert from "node:assert/strict";
import test from "node:test";
import { isToolUnderProduction } from "./production-notice.ts";

const releasedCategories = [
  "accessibility", "ai", "audio", "business", "calculators", "career", "communication", "converters",
  "creators", "datetime", "design", "developer", "ecommerce", "education", "events", "files", "fitness",
  "gaming", "generators", "image", "interactive", "marketing", "network", "personal", "productivity",
  "qr", "random", "relationships", "security", "seo", "social", "streaming", "testdata", "text", "video",
  "webdesign",
] as const;

test("implemented categories are available across platforms", () => {
  for (const category of releasedCategories) {
    assert.equal(isToolUnderProduction({ id: `test-${category}`, category }), false, `${category} should be released`);
  }
});

test("unfinished categories remain protected", () => {
  for (const category of ["celebrations", "food", "mockups", "pdf", "photography", "screenshots", "travel"] as const) {
    assert.equal(isToolUnderProduction({ id: `unfinished-${category}`, category }), true, `${category} should remain gated`);
  }
});

test("A book, ZIP and Camera Studio remain individually available", () => {
  assert.equal(isToolUnderProduction({ id: "a-book", category: "productivity" }), false);
  assert.equal(isToolUnderProduction({ id: "zip-any-file", category: "files" }), false);
  assert.equal(isToolUnderProduction({ id: "camera-studio", category: "photography" }), false);
});

test("completed PDF operations are individually available without releasing unfinished PDF tools", () => {
  for (const id of ["pdf-merger", "pdf-metadata-viewer", "pdf-page-extractor", "pdf-splitter", "pdf-rotator"]) {
    assert.equal(isToolUnderProduction({ id, category: "pdf" }), false, `${id} should be available`);
  }
  for (const id of ["pdf-metadata-tool", "pdf-text-extractor", "docx-text-extractor", "pdf-to-word"]) {
    assert.equal(isToolUnderProduction({ id, category: "pdf" }), true, `${id} should remain gated`);
  }
});
