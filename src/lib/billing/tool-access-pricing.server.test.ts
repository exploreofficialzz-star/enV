import assert from "node:assert/strict";
import test from "node:test";
import { getApprovedToolAccessPrice, getToolAccessPricingSummary } from "./tool-access-pricing.server.ts";

test("generated provisional tool prices are not silently promoted to paid access rates", () => {
  assert.equal(getApprovedToolAccessPrice("average-speed-calculator"), null);
  assert.equal(getApprovedToolAccessPrice("json-formatter"), null);
  assert.deepEqual(getToolAccessPricingSummary(), {
    pricingVersion: "env-tool-access-review-v1",
    approvedToolCount: 0,
  });
});

test("invalid tool IDs do not resolve to an approved price", () => {
  assert.equal(getApprovedToolAccessPrice("../wallet"), null);
  assert.equal(getApprovedToolAccessPrice(""), null);
});
