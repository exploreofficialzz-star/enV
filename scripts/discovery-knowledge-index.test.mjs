import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const index = JSON.parse(fs.readFileSync(path.join(root, "audit/discovery-knowledge-index.json"), "utf8"));

test("knowledge index is versioned, stable-ID keyed, and commit-bound", () => {
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.generatedBy, "scripts/generate-discovery-knowledge-index.mjs");
  assert.match(index.sourceCommit, /^[a-f0-9]{40}$/i);
  assert.ok(index.records.length > 0);
  assert.equal(new Set(index.records.map((record) => record.stableToolId)).size, index.records.length);
});

test("each record separates catalogue metadata from verified capability evidence", () => {
  for (const record of index.records) {
    assert.match(record.stableToolId, /^\S+$/);
    assert.equal(typeof record.catalogue.description, "string");
    assert.equal(record.verifiedCapability.status, "NOT_INSPECTED");
    assert.deepEqual(record.verifiedCapability.capabilities, []);
    assert.deepEqual(record.verifiedCapability.evidenceReferences, []);
    assert.equal(record.evidence.status, "NOT_INSPECTED");
    assert.deepEqual(record.evidence.browserEvidenceReferences, []);
    assert.deepEqual(record.evidence.nativeEvidenceReferences, []);
  }
});

test("planned records are not emitted as currently usable guides", () => {
  const planned = index.records.filter((record) => record.catalogue.lifecycleStatus === "planned");
  assert.ok(planned.length > 0);
  for (const record of planned) {
    assert.equal(record.guideRoute, null);
    assert.equal(record.seo.eligible, false);
    assert.equal(record.seo.canonicalUrl, null);
  }
});

test("platform and privacy fields never imply functional or offline verification", () => {
  for (const record of index.records) {
    assert.equal(record.execution.native.evidenceStatus, "NOT_INSPECTED");
    assert.equal(record.accessAndPrivacy.offlineCapability, "not-verified");
    assert.ok(record.execution.browserHandoff === "not-verified" || record.execution.browserHandoff === "not-searchable-in-web-registry");
  }
});
