import test from "node:test";
import assert from "node:assert/strict";
import { canSpendTokensOffline, classifyOfflineTool, OFFLINE_CAPABILITY_POLICY_VERSION } from "../../src/lib/offline/capabilities.ts";

function tool(overrides = {}) {
  return {
    id: "test-tool",
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    status: "active",
    engine: { type: "text", config: {} },
    ...overrides,
  };
}

test("allows only audited deterministic client-side engines", () => {
  for (const type of ["calculator", "converter", "datetime", "text", "codec", "color", "qr", "barcode", "generator"]) {
    const result = classifyOfflineTool(tool({ engine: { type, config: {} } }));
    assert.equal(result.execution, "device-local", type);
    assert.equal(result.mayRunWithoutNetwork, true, type);
    assert.equal(result.tokenPolicy, "no-offline-spend", type);
  }
});
test("requires the network for server, auth, backend and remote engine dependencies", () => {
  for (const overrides of [
    { clientSide: false },
    { requiresBackend: true },
    { requiresAuth: true },
    { engine: { type: "ai", config: {} } },
    { engine: { type: "network", config: {} } },
  ]) {
    const result = classifyOfflineTool(tool(overrides));
    assert.equal(result.execution, "online-required");
    assert.equal(result.mayRunWithoutNetwork, false);
    assert.equal(result.tokenPolicy, "server-verified-only");
  }
});
test("does not assume unknown client-side engines are offline-safe", () => {
  const result = classifyOfflineTool(tool({ engine: { type: "custom", config: {} } }));
  assert.equal(result.execution, "not-verified");
  assert.equal(result.mayRunWithoutNetwork, false);
});
test("keeps planned tools unavailable", () => {
  const result = classifyOfflineTool(tool({ status: "planned" }));
  assert.equal(result.execution, "unavailable");
});
test("offline token spend remains hard-disabled", () => {
  assert.equal(canSpendTokensOffline(), false);
  assert.equal(OFFLINE_CAPABILITY_POLICY_VERSION, "2026-10-30.v1");
});
