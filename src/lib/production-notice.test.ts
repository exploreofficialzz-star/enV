import assert from "node:assert/strict";
import test from "node:test";
import { isToolUnderProduction } from "./production-notice.ts";

test("explicitly available categories stay accessible", () => {
  for (const category of ["accessibility", "audio", "business", "calculators", "datetime", "developer", "design", "ecommerce", "qr", "video"] as const) {
    assert.equal(isToolUnderProduction({ id: `test-${category}`, category }), false, `${category} should be exempt`);
  }
});

test("A book is accessible without exposing the Productivity category", () => {
  assert.equal(isToolUnderProduction({ id: "a-book", category: "productivity" }), false);
  assert.equal(isToolUnderProduction({ id: "another-productivity-tool", category: "productivity" }), true);
});

test("all other non-exempt categories show the production notice", () => {
  for (const category of ["ai", "career", "image", "pdf", "productivity", "creators"] as const) {
    assert.equal(isToolUnderProduction({ id: `unreleased-${category}`, category }), true, `${category} should be restricted`);
  }
});
