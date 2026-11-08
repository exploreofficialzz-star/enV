import assert from "node:assert/strict";
import test from "node:test";
import { canShowAdForTool, isHybridAccessToolId, isHybridAdSupportedToolId, resolveAdConfig } from "./policy.ts";

const goodEnvironment = {
  enabled: "true",
  privacyConfigured: "true",
  clientId: "ca-pub-1234567890123456",
  toolSlotId: "1234567890",
  toolIds: "average-speed-calculator, json-formatter,average-speed-calculator",
};

function eligibleTool(overrides = {}) {
  return {
    id: "average-speed-calculator",
    category: "calculators",
    status: "active",
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    engine: { type: "calculator", formula: "distance / time" },
    ...overrides,
  };
}

test("ads remain disabled unless every provider and privacy gate is configured", () => {
  assert.equal(resolveAdConfig({ ...goodEnvironment, enabled: "false" }), null);
  assert.equal(resolveAdConfig({ ...goodEnvironment, privacyConfigured: "false" }), null);
  assert.equal(resolveAdConfig({ ...goodEnvironment, clientId: "" }), null);
  assert.equal(resolveAdConfig({ ...goodEnvironment, toolSlotId: "not-a-slot" }), null);
  assert.equal(resolveAdConfig({ ...goodEnvironment, toolIds: "" }), null);
});

test("ads configuration accepts a valid publisher, slot and deduplicated explicit allowlist", () => {
  const config = resolveAdConfig(goodEnvironment);
  assert.ok(config);
  assert.equal(config.clientId, "ca-pub-1234567890123456");
  assert.equal(config.allowedToolIds.size, 2);
  assert.ok(config.allowedToolIds.has("json-formatter"));
  assert.equal(canShowAdForTool(eligibleTool({ id: "json-formatter" }), config), false, "Unmetered local tools cannot join the hybrid ad cohort.");
});

test("hybrid offline policy only applies to explicitly selected cross-platform metered tools", () => {
  assert.equal(isHybridAdSupportedToolId("average-speed-calculator", goodEnvironment, eligibleTool()), true);
  assert.equal(isHybridAdSupportedToolId("json-formatter", goodEnvironment, eligibleTool({ id: "json-formatter" })), false);
  assert.equal(isHybridAdSupportedToolId("finance-apr-calculator", { ...goodEnvironment, toolIds: `${goodEnvironment.toolIds},finance-apr-calculator` }, eligibleTool({ id: "finance-apr-calculator" })), false, "Finance calculators must never be enrolled in the hybrid ad cohort.");
  assert.equal(isHybridAdSupportedToolId("average-speed-calculator", goodEnvironment, eligibleTool({ disclaimer: "health" })), false, "Health-disclaimer tools must not enter the offline billing cohort.");
  assert.equal(isHybridAdSupportedToolId("average-speed-calculator", goodEnvironment, eligibleTool({ category: "fitness" })), false, "Fitness tools must not enter the offline billing cohort.");
  assert.equal(isHybridAdSupportedToolId("average-speed-calculator", { ...goodEnvironment, enabled: "false" }, eligibleTool()), false);
  assert.equal(isHybridAdSupportedToolId("average-speed-calculator", { ...goodEnvironment, privacyConfigured: "false" }, eligibleTool()), false);
  assert.equal(isHybridAdSupportedToolId("average-speed-calculator", { ...goodEnvironment, toolSlotId: "" }, eligibleTool()), false);
});


test("offline access enforcement is independent from ad-serving and CMP readiness", () => {
  const adsDisabled = { ...goodEnvironment, enabled: "false" };
  const cmpNotReady = { ...goodEnvironment, privacyConfigured: "false" };
  assert.equal(isHybridAccessToolId("average-speed-calculator", adsDisabled, eligibleTool()), true);
  assert.equal(isHybridAccessToolId("average-speed-calculator", cmpNotReady, eligibleTool()), true);
  assert.equal(isHybridAdSupportedToolId("average-speed-calculator", adsDisabled, eligibleTool()), false);
  assert.equal(isHybridAdSupportedToolId("average-speed-calculator", cmpNotReady, eligibleTool()), false);
  assert.equal(isHybridAccessToolId("average-speed-calculator", { ...goodEnvironment, toolIds: "" }, eligibleTool()), false);
  assert.equal(canShowAdForTool(eligibleTool(), null), false);
});

test("only explicitly selected, active, public device-local tools can show an ad", () => {
  const config = resolveAdConfig(goodEnvironment);
  assert.ok(config);
  assert.equal(canShowAdForTool(eligibleTool(), config), true);
  assert.equal(canShowAdForTool(eligibleTool({ id: "not-allowlisted" }), config), false);
  assert.equal(canShowAdForTool(eligibleTool({ status: "beta" }), config), false);
  assert.equal(canShowAdForTool(eligibleTool({ requiresBackend: true }), config), false);
  assert.equal(canShowAdForTool(eligibleTool({ requiresAuth: true }), config), false);
  assert.equal(canShowAdForTool(eligibleTool({ clientSide: false }), config), false);
  assert.equal(canShowAdForTool(eligibleTool({ disclaimer: "health" }), config), false);
  assert.equal(canShowAdForTool(eligibleTool({ disclaimer: "finance" }), config), false);
  assert.equal(canShowAdForTool(eligibleTool({ category: "fitness" }), config), false);
  assert.equal(canShowAdForTool(eligibleTool({ id: "finance-apr-calculator" }), config), false);
  assert.equal(canShowAdForTool(eligibleTool({ engine: { type: "url-media", op: "inspect" } }), config), false);
});
