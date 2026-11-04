import test from "node:test";
import assert from "node:assert/strict";
import { canSpendTokensOffline, classifyOfflineToolRecord, OFFLINE_CAPABILITY_POLICY_VERSION } from "../../src/lib/offline/policy.mjs";

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
  for (const type of ["calculator", "converter", "datetime", "text", "codec", "color", "qr", "barcode", "generator", "image", "pdf"]) {
    const result = classifyOfflineToolRecord(tool({ engine: { type, config: {} } }));
    assert.equal(result.execution, "device-local", type);
    assert.equal(result.mayRunWithoutNetwork, true, type);
    assert.equal(result.tokenPolicy, "offline-allowance-required", type);
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
    const result = classifyOfflineToolRecord(tool(overrides));
    assert.equal(result.execution, "online-required");
    assert.equal(result.mayRunWithoutNetwork, false);
    assert.equal(result.tokenPolicy, "server-verified-only");
  }
});
test("does not assume unknown client-side engines are offline-safe", () => {
  const result = classifyOfflineToolRecord(tool({ engine: { type: "custom", config: {} } }));
  assert.equal(result.execution, "not-verified");
  assert.equal(result.mayRunWithoutNetwork, false);
});
test("allows verified local-only named tools to prepare an offline package", () => {
  for (const [id, engineId] of [["a-book", "a-book"], ["zip-any-file", "zip-any-file"], ["qr-payload-inspector", "qr-payload-inspector"]]) {
    const result = classifyOfflineToolRecord(tool({ id, engine: { type: "custom", id: engineId } }));
    assert.equal(result.execution, "device-local", id);
    assert.equal(result.tokenPolicy, "offline-allowance-required", id);
  }
});
test("keeps planned tools unavailable", () => {
  const result = classifyOfflineToolRecord(tool({ status: "planned" }));
  assert.equal(result.execution, "unavailable");
});
test("local offline execution is token-metered and spend remains disabled without a verified allowance", () => {
  assert.equal(canSpendTokensOffline(), false);
  assert.equal(OFFLINE_CAPABILITY_POLICY_VERSION, "2026-11-04.v2");
});
