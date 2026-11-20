import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRelatedToolsBaseline } from "./related-tools-baseline.mjs";

const tool = (related = []) => ({ id: "fixture-no-related-links", status: "active", related });
const observed = { dangling: 5, self: 4, toPlanned: 106, toUndiscoverable: 287, noRelated: 496 };
const baseline = {
  counts: { dangling: 5, self: 4, toPlanned: 106, toUndiscoverable: 287, noRelated: 495 },
  noRelatedExceptions: [{
    id: "fixture-no-related-links",
    reason: "The fixture models an active tool with no related suggestions for baseline accounting.",
  }],
};

test("a documented active tool with no related links does not inflate the regression count", () => {
  const result = evaluateRelatedToolsBaseline(observed, baseline, new Map([[tool().id, tool()]]));
  assert.equal(result.passed, true);
  assert.equal(result.adjustedCounts.noRelated, 495);
  assert.deepEqual(result.exceptionIds, ["fixture-no-related-links"]);
});

test("undocumented growth beyond the baseline still fails", () => {
  const result = evaluateRelatedToolsBaseline({ ...observed, noRelated: 497 }, baseline, new Map([[tool().id, tool()]]));
  assert.equal(result.passed, false);
  assert.deepEqual(result.violations.map(([key]) => key), ["noRelated"]);
});

test("a stale exception fails when its tool gains related links", () => {
  const linked = tool(["video-trimmer"]);
  const result = evaluateRelatedToolsBaseline(observed, baseline, new Map([[linked.id, linked]]));
  assert.equal(result.passed, false);
  assert.match(result.errors[0], /stale/);
});

test("an exception cannot refer to a missing or planned tool", () => {
  const missing = evaluateRelatedToolsBaseline(observed, baseline, new Map());
  assert.equal(missing.passed, false);
  assert.match(missing.errors[0], /active registry tool/);
  const planned = { ...tool(), status: "planned" };
  const alsoMissing = evaluateRelatedToolsBaseline(observed, baseline, new Map([[planned.id, planned]]));
  assert.equal(alsoMissing.passed, false);
});

test("duplicate exceptions fail instead of silently reducing the count twice", () => {
  const duplicateBaseline = { ...baseline, noRelatedExceptions: [...baseline.noRelatedExceptions, ...baseline.noRelatedExceptions] };
  const result = evaluateRelatedToolsBaseline(observed, duplicateBaseline, new Map([[tool().id, tool()]]));
  assert.equal(result.passed, false);
  assert.match(result.errors[0], /duplicate/);
});
