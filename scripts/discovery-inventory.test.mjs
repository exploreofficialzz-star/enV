import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const inventory = JSON.parse(fs.readFileSync(path.join(root, "audit/discovery-inventory.json"), "utf8"));

function ids(records) {
  return records.map((record) => record.id);
}

test("generated discovery inventory has a stable schema and unique IDs", () => {
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.generatedBy, "scripts/generate-discovery-inventory.mjs");
  assert.match(inventory.sourceCommit, /^[a-f0-9]{40}$/i);
  assert.ok(Array.isArray(inventory.records));
  assert.equal(new Set(ids(inventory.records)).size, inventory.records.length);
  assert.equal(inventory.counts.records, inventory.records.length);
});

test("every inventory record exposes explicit surface presence and disposition", () => {
  for (const record of inventory.records) {
    assert.match(record.id, /^\S+$/);
    assert.equal(typeof record.name, "string");
    assert.equal(typeof record.source.present, "boolean");
    assert.equal(typeof record.runtime.present, "boolean");
    assert.equal(typeof record.searchable.present, "boolean");
    assert.equal(typeof record.disposition, "string");
    if (record.runtime.present) assert.match(record.canonicalRoute, /^\/tools\/[^/]+\/[^/]+$/);
    if (record.guideRoute) assert.equal(record.guideRoute, `/blog/tool-${record.id}`);
    if (record.runtime.status === "planned") assert.equal(record.guideRoute, null);
  }
});

test("reconciliation lists are sorted and match their reported counts", () => {
  const reconciliation = inventory.reconciliation;
  for (const [key, values] of Object.entries(reconciliation)) {
    if (!Array.isArray(values)) continue;
    assert.deepEqual(values, [...values].sort(), `${key} must be deterministic and sorted`);
  }
  assert.equal(inventory.counts.source.records, inventory.reconciliation.source.recordCount);
  assert.equal(inventory.counts.runtime.records, inventory.reconciliation.runtime.recordCount);
  assert.equal(inventory.counts.searchable.records, inventory.reconciliation.searchable.recordCount);
});

test("the committed human report is generated from the same inventory", () => {
  const report = fs.readFileSync(path.join(root, "docs/discovery-reconciliation.md"), "utf8");
  assert.ok(report.includes(`source commit \`${inventory.sourceCommit}\``));
  assert.match(report, /## Exact disposition lists/);
  assert.match(report, /Functional verification, crawl outcomes, search ranking, AI citation/);
});
