import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = resolve(root, "docs/audits/music-analysis-acceptance.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const allowedStatuses = new Set([
  "implemented_pending_ci",
  "not_implemented",
  "intentionally_disabled",
  "not_run",
]);

assert.equal(inventory.schema_version, "env.music-analysis-acceptance.v1", "Music Analyzer acceptance inventory schema is required.");
assert.equal(inventory.repository, "exploreofficialzz-star/enV", "Inventory must identify the intended repository.");
assert.equal(inventory.pull_request, 55, "Inventory must reference the active Analyzer implementation PR.");
assert.ok(Array.isArray(inventory.gates) && inventory.gates.length >= 8, "Inventory must cover core implementation and release gaps.");
assert.ok(inventory.status_definitions && typeof inventory.status_definitions === "object", "Inventory statuses must have explicit definitions.");

const gateIds = new Set();
for (const gate of inventory.gates) {
  assert.ok(gate && typeof gate.id === "string" && /^[a-z0-9][a-z0-9-]+$/.test(gate.id), "Each acceptance gate needs a stable ID.");
  assert.ok(!gateIds.has(gate.id), `Duplicate acceptance gate ID: ${gate.id}`);
  gateIds.add(gate.id);
  assert.ok(allowedStatuses.has(gate.status), `${gate.id} has unsupported or overconfident status: ${gate.status}`);
  assert.ok(typeof gate.scope === "string" && gate.scope.length > 20, `${gate.id} must describe its actual scope.`);

  if (gate.status === "implemented_pending_ci") {
    assert.ok(Array.isArray(gate.code_files) && gate.code_files.length > 0, `${gate.id} needs code evidence.`);
    assert.ok(Array.isArray(gate.test_files) && gate.test_files.length > 0, `${gate.id} needs regression-test evidence.`);
    for (const path of [...gate.code_files, ...gate.test_files]) {
      assert.ok(typeof path === "string" && !path.startsWith("/") && !path.includes(".."), `${gate.id} contains an unsafe evidence path.`);
      assert.ok(existsSync(resolve(root, path)), `${gate.id} references a missing evidence file: ${path}`);
    }
    assert.ok(Array.isArray(gate.limitations) && gate.limitations.length > 0, `${gate.id} must disclose its remaining limitations.`);
  } else {
    assert.ok(gate.limitation || (Array.isArray(gate.limitations) && gate.limitations.length > 0), `${gate.id} must explain why it is not complete.`);
    assert.ok(typeof gate.next_action === "string" && gate.next_action.length > 20, `${gate.id} must state an actionable next step.`);
  }
}

assert.equal(inventory.current_revision_ci, "pending", "Do not claim current-revision CI passed until that exact SHA has authoritative results.");
assert.equal(inventory.tested_commit_sha, null, "Do not invent a tested commit SHA while current-revision verification is pending.");
console.log(`Music Analyzer acceptance inventory passed: ${inventory.gates.length} gates are enumerated, evidence paths exist, and no unverified gate is marked production-ready.`);
