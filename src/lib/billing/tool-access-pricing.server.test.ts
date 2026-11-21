import assert from "node:assert/strict";
import test from "node:test";
import offlineEligibleTools from "../../data/offline-eligible-tools.json" with { type: "json" };
import { getApprovedToolAccessPrice, getToolAccessPricingSummary } from "./tool-access-pricing.server.ts";

test("only the existing cross-platform local calculator tariff is approved for ad-free access", () => {
  const expected = (offlineEligibleTools as {
    profiles: { toolId: string; billingKey: string; subunitsPerUnit: number; platforms: string[] }[];
  }).profiles.filter((profile) =>
    profile.billingKey === "local.calculator" &&
    profile.subunitsPerUnit === 100 &&
    ["web", "android", "ios"].every((platform) => profile.platforms.includes(platform))
  );

  assert.equal(expected.length, 267);
  assert.deepEqual(getToolAccessPricingSummary(), {
    pricingVersion: "env-tool-access-local-calculator-v1",
    approvedToolCount: expected.length,
  });

  for (const profile of expected) {
    assert.deepEqual(getApprovedToolAccessPrice(profile.toolId), {
      toolId: profile.toolId,
      subunitsPerSession: profile.subunitsPerUnit,
      unitLabel: "calculation",
      pricingVersion: "env-tool-access-local-calculator-v1",
      adFreeAccessEnabled: true,
    });
  }
});

test("unreviewed, unknown and malformed tool IDs do not resolve to an approved price", () => {
  assert.equal(getApprovedToolAccessPrice("json-formatter"), null);
  assert.equal(getApprovedToolAccessPrice("ai-chat-assistant"), null);
  assert.equal(getApprovedToolAccessPrice("../wallet"), null);
  assert.equal(getApprovedToolAccessPrice(""), null);
});
