import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { gitBlobSha1, validateSourceInspectionEvidence } from "./source-inspection-evidence.mjs";

const commit = "a".repeat(40);
function fixture(rootDir, overrides = {}) {
  const bytes = fs.readFileSync(path.join(rootDir, "src/tool.ts"));
  return {
    schemaVersion: 1,
    records: [{
      id: "tool-source-review",
      inspectedAgainstCommit: commit,
      toolIds: ["tool-one"],
      reviewedAreas: ["Implementation and dispatch"],
      files: [{ path: "src/tool.ts", gitBlobSha1: gitBlobSha1(bytes) }],
      ...overrides,
    }],
  };
}
function withRoot(run) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-source-evidence-"));
  try {
    fs.mkdirSync(path.join(rootDir, "src"));
    fs.writeFileSync(path.join(rootDir, "src/tool.ts"), "export const value = 1;\n");
    return run(rootDir);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

test("accepts exact current source blobs and known runtime IDs", () => withRoot((rootDir) => {
  const result = validateSourceInspectionEvidence({ evidenceSet: fixture(rootDir), runtimeToolIds: ["tool-one"], rootDir });
  assert.equal(result.validRecords.length, 1);
  assert.deepEqual([...result.byToolId.keys()], ["tool-one"]);
}));

test("rejects a changed source file instead of accepting stale inspection evidence", () => withRoot((rootDir) => {
  const evidenceSet = fixture(rootDir);
  fs.writeFileSync(path.join(rootDir, "src/tool.ts"), "export const value = 2;\n");
  const result = validateSourceInspectionEvidence({ evidenceSet, runtimeToolIds: ["tool-one"], rootDir });
  assert.equal(result.validRecords.length, 0);
  assert.ok(result.invalidRecords[0].reasons.includes("source-inspection-file-hash-mismatch:src/tool.ts"));
}));

test("rejects unknown runtime IDs", () => withRoot((rootDir) => {
  const evidenceSet = fixture(rootDir, { toolIds: ["not-in-runtime"] });
  const result = validateSourceInspectionEvidence({ evidenceSet, runtimeToolIds: ["tool-one"], rootDir });
  assert.equal(result.byToolId.size, 0);
  assert.ok(result.invalidRecords[0].reasons.includes("source-inspection-references-unknown-tool-id:not-in-runtime"));
}));

test("rejects duplicate tool claims across source-review records", () => withRoot((rootDir) => {
  const evidenceSet = fixture(rootDir);
  evidenceSet.records.push({ ...evidenceSet.records[0], id: "second-source-review" });
  const result = validateSourceInspectionEvidence({ evidenceSet, runtimeToolIds: ["tool-one"], rootDir });
  assert.equal(result.validRecords.length, 1);
  assert.ok(result.invalidRecords[0].reasons.includes("duplicate-source-inspection-tool-id:tool-one"));
}));

test("rejects traversal paths and empty review details", () => withRoot((rootDir) => {
  const evidenceSet = fixture(rootDir, { reviewedAreas: [], files: [{ path: "../outside.ts", gitBlobSha1: commit }] });
  const result = validateSourceInspectionEvidence({ evidenceSet, runtimeToolIds: ["tool-one"], rootDir });
  assert.equal(result.validRecords.length, 0);
  assert.ok(result.invalidRecords[0].reasons.includes("source-inspection-reviewed-areas-missing"));
  assert.ok(result.invalidRecords[0].reasons.includes("source-inspection-path-unsafe:../outside.ts"));
}));

test("computes Git blob SHA-1 framing", () => {
  assert.equal(gitBlobSha1(Buffer.from("hello\n", "utf8")), "ce013625030ba8dba906f756967f9e9ca394464a");
});
