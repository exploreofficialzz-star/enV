import assert from "node:assert/strict";
import test from "node:test";
import { isAdFallbackBillingEnabled, resolveAdFallbackUnitSubunits } from "./fallback";

const tool = { id: "example-tool", status: "active", clientSide: true, requiresBackend: false, requiresAuth: false };
const profile = {
  toolId: "example-tool", billingKey: "local.general", pricingMode: "per-unit-hypothesis" as const,
  provisionalSubunitsPerUnit: 200, unitLabel: "operation", optionalAiAssistProfile: null, premiumRequired: false,
};

test("ad fallback requires every server billing approval gate", () => {
  const enabled = {
    fallbackEnabled: "true", launchEnabled: "true", enforcementEnabled: "true", refundDisputeApproved: "true",
  };
  assert.equal(isAdFallbackBillingEnabled(enabled), true);
  assert.equal(isAdFallbackBillingEnabled({ ...enabled, fallbackEnabled: "false" }), false);
  assert.equal(isAdFallbackBillingEnabled({ ...enabled, enforcementEnabled: "false" }), false);
});

test("only active local device-side profiles with fixed rates can use ad fallback", () => {
  assert.equal(resolveAdFallbackUnitSubunits(tool, profile), 200);
  assert.equal(resolveAdFallbackUnitSubunits({ ...tool, status: "planned" }, profile), null);
  assert.equal(resolveAdFallbackUnitSubunits({ ...tool, requiresBackend: true }, profile), null);
  assert.equal(resolveAdFallbackUnitSubunits({ ...tool, requiresAuth: true }, profile), null);
  assert.equal(resolveAdFallbackUnitSubunits(tool, { ...profile, billingKey: "cloud.generic_processing" }), null);
  assert.equal(resolveAdFallbackUnitSubunits(tool, { ...profile, pricingMode: "measured-provider-cost" }), null);
  assert.equal(resolveAdFallbackUnitSubunits(tool, { ...profile, provisionalSubunitsPerUnit: null }), null);
  assert.equal(resolveAdFallbackUnitSubunits(tool, { ...profile, provisionalSubunitsPerUnit: 0 }), null);
  assert.equal(resolveAdFallbackUnitSubunits(tool, { ...profile, premiumRequired: true }), null);
});
