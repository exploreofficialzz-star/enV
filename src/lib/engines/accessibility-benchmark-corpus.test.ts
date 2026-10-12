import test from "node:test";
import assert from "node:assert/strict";
import { auditAccessibilityMarkup } from "./accessibility-audit.ts";
import { accessibilityBenchmarkCorpus } from "./accessibility-benchmark-corpus.ts";

test("accessibility benchmark corpus catches each intended static pattern", () => {
  const missed: string[] = [];
  for (const sample of accessibilityBenchmarkCorpus) {
    const result = auditAccessibilityMarkup(sample.category, sample.input);
    if (!result.findings.some((finding) => finding.rule === sample.expectedRule)) {
      missed.push(`${sample.id}: expected ${sample.expectedRule} (${sample.rationale})`);
    }
  }
  assert.deepEqual(missed, [], missed.join("\n"));
});

test("benchmark cases have unique stable IDs and meaningful rationales", () => {
  const ids = accessibilityBenchmarkCorpus.map((sample) => sample.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const sample of accessibilityBenchmarkCorpus) {
    assert.ok(sample.rationale.length > 20, `${sample.id} needs a useful rationale`);
    assert.ok(sample.input.length > 0, `${sample.id} needs a reproducible input`);
  }
});
