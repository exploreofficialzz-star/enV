import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const FULL_SHA = /^[a-f0-9]{40}$/i;

export function gitBlobSha1(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return createHash("sha1").update("blob " + bytes.byteLength + "\0").update(bytes).digest("hex");
}

/**
 * Validates source-inspection claims against current Git blob content.
 * This is source-review evidence only; it never substitutes for functional tests.
 */
export function validateSourceInspectionEvidence({ evidenceSet, runtimeToolIds, rootDir, readFile = fs.readFileSync } = {}) {
  const byToolId = new Map();
  const validRecords = [];
  const invalidRecords = [];
  const knownIds = new Set(runtimeToolIds ?? []);
  const seenRecords = new Set();
  const claimedTools = new Set();

  if (!evidenceSet || evidenceSet.schemaVersion !== 1 || !Array.isArray(evidenceSet.records)) {
    return { byToolId, validRecords, invalidRecords: [{ id: null, reasons: ["source-inspection-evidence-schema-invalid"] }] };
  }
  if (typeof rootDir !== "string" || !rootDir) {
    return { byToolId, validRecords, invalidRecords: [{ id: null, reasons: ["source-inspection-root-missing"] }] };
  }
  const root = path.resolve(rootDir);

  for (const record of evidenceSet.records) {
    const reasons = [];
    if (!record || typeof record.id !== "string" || !record.id.trim()) {
      invalidRecords.push({ id: null, reasons: ["source-inspection-record-id-missing"] });
      continue;
    }
    const id = record.id.trim();
    if (seenRecords.has(id)) reasons.push("duplicate-source-inspection-record-id");
    seenRecords.add(id);
    if (!FULL_SHA.test(record.inspectedAgainstCommit ?? "")) reasons.push("inspected-against-commit-must-be-full-git-sha");
    if (!Array.isArray(record.toolIds) || !record.toolIds.length) reasons.push("source-inspection-tool-ids-empty");
    if (!Array.isArray(record.reviewedAreas) || !record.reviewedAreas.length || record.reviewedAreas.some(x => typeof x !== "string" || !x.trim())) reasons.push("source-inspection-reviewed-areas-missing");
    if (!Array.isArray(record.files) || !record.files.length) reasons.push("source-inspection-files-empty");

    const toolIds = Array.isArray(record.toolIds) ? record.toolIds : [];
    const localIds = new Set();
    for (const toolId of toolIds) {
      if (typeof toolId !== "string" || !toolId.trim()) reasons.push("source-inspection-tool-id-invalid");
      else if (!knownIds.has(toolId)) reasons.push("source-inspection-references-unknown-tool-id:" + toolId);
      else if (localIds.has(toolId) || claimedTools.has(toolId)) reasons.push("duplicate-source-inspection-tool-id:" + toolId);
      localIds.add(toolId);
    }

    const verifiedFiles = [];
    const filePaths = new Set();
    for (const file of Array.isArray(record.files) ? record.files : []) {
      if (!file || typeof file.path !== "string" || !file.path.trim() || !FULL_SHA.test(file.gitBlobSha1 ?? "")) {
        reasons.push("source-inspection-file-entry-invalid");
        continue;
      }
      const relative = file.path.trim();
      if (path.isAbsolute(relative) || /^[a-zA-Z]:[\\/]/.test(relative) || relative.split(/[\\/]/).includes("..")) {
        reasons.push("source-inspection-path-unsafe:" + relative);
        continue;
      }
      if (filePaths.has(relative)) {
        reasons.push("duplicate-source-inspection-file-path:" + relative);
        continue;
      }
      filePaths.add(relative);
      const absolute = path.resolve(root, relative);
      const fromRoot = path.relative(root, absolute);
      if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(".." + path.sep) || path.isAbsolute(fromRoot)) {
        reasons.push("source-inspection-path-escapes-root:" + relative);
        continue;
      }
      try {
        const actual = gitBlobSha1(readFile(absolute));
        if (actual.toLowerCase() !== file.gitBlobSha1.toLowerCase()) {
          reasons.push("source-inspection-file-hash-mismatch:" + relative);
          continue;
        }
        verifiedFiles.push({ path: relative, gitBlobSha1: actual });
      } catch {
        reasons.push("source-inspection-file-unavailable:" + relative);
      }
    }

    if (reasons.length) {
      invalidRecords.push({ id, toolIds, reasons });
      continue;
    }

    const validated = {
      id,
      inspectedAgainstCommit: record.inspectedAgainstCommit,
      toolIds: [...toolIds],
      reviewedAreas: [...record.reviewedAreas],
      files: verifiedFiles,
      notes: typeof record.notes === "string" ? record.notes : "",
    };
    validRecords.push(validated);
    for (const toolId of toolIds) {
      claimedTools.add(toolId);
      byToolId.set(toolId, [...(byToolId.get(toolId) ?? []), validated]);
    }
  }

  return { byToolId, validRecords, invalidRecords };
}
