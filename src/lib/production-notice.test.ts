import assert from "node:assert/strict";
import test from "node:test";
import { isToolUnderProduction } from "./production-notice.ts";

test("explicitly available categories stay accessible", () => {
  for (const category of ["accessibility", "audio", "business", "calculators", "developer", "video"] as const) {
    assert.equal(isToolUnderProduction({ category }), false, `${category} should be exempt`);
  }
});

test("all non-exempt categories show the production notice", () => {
  for (const category of ["ai", "career", "image", "pdf", "productivity", "creators"] as const) {
    assert.equal(isToolUnderProduction({ category }), true, `${category} should be restricted`);
  }
});
