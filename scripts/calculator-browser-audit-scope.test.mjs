import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_CALCULATOR_BROWSER_TOOL_IDS,
  selectCalculatorBrowserAuditToolIds,
} from "./calculator-browser-audit-scope.mjs";

function activeCalculatorIds() {
  return [
    ...Array.from({ length: 6469 }, (_, index) => "calculator-" + String(index).padStart(4, "0")),
    ...REQUIRED_CALCULATOR_BROWSER_TOOL_IDS,
  ];
}

test("an exhaustive run selects every active calculator ID exactly once", () => {
  const ids = activeCalculatorIds();
  const selected = selectCalculatorBrowserAuditToolIds(ids);
  assert.deepEqual(selected, ids);
  assert.equal(new Set(selected).size, ids.length);
});

test("the 250-route browser sample adds the three mandatory calculator cases", () => {
  const ids = activeCalculatorIds();
  const selected = selectCalculatorBrowserAuditToolIds(ids, { sampleSize: 250 });
  assert.equal(selected.length, 253);
  assert.equal(new Set(selected).size, 253);
  for (const id of REQUIRED_CALCULATOR_BROWSER_TOOL_IDS) assert.ok(selected.includes(id), id);
  const sampled = new Set(Array.from({ length: 250 }, (_, index) => ids[Math.floor((index * ids.length) / 250)]));
  for (const id of sampled) assert.ok(selected.includes(id), id);
  assert.deepEqual(selected, ids.filter((id) => selected.includes(id)), "selection must preserve runtime registry order");
});

test("sample selection is deterministic for an unchanged runtime ID list", () => {
  const ids = activeCalculatorIds();
  assert.deepEqual(
    selectCalculatorBrowserAuditToolIds(ids, { sampleSize: 250 }),
    selectCalculatorBrowserAuditToolIds(ids, { sampleSize: 250 }),
  );
});

test("an explicit --only ID set is exact and does not inject mandatory sample IDs", () => {
  const ids = activeCalculatorIds();
  const requested = ["calculator-0007", "calculator-0012"];
  assert.deepEqual(
    selectCalculatorBrowserAuditToolIds(ids, { onlyIds: requested }),
    requested,
  );
});

test("limit is applied after deterministic sample and mandatory-ID expansion", () => {
  const selected = selectCalculatorBrowserAuditToolIds(activeCalculatorIds(), {
    sampleSize: 250,
    limit: 251,
  });
  assert.equal(selected.length, 251);
  assert.deepEqual(selected, selectCalculatorBrowserAuditToolIds(activeCalculatorIds(), {
    sampleSize: 250,
  }).slice(0, 251));
});

test("unknown, duplicate and empty explicit IDs are rejected", () => {
  const ids = activeCalculatorIds();
  assert.throws(() => selectCalculatorBrowserAuditToolIds(ids, { onlyIds: ["missing-tool"] }), /Unknown active calculator tool IDs/);
  assert.throws(() => selectCalculatorBrowserAuditToolIds(ids, { onlyIds: ["calculator-0001", "calculator-0001"] }), /must not contain duplicates/);
  assert.throws(() => selectCalculatorBrowserAuditToolIds(ids, { onlyIds: [] }), /non-empty array/);
});

test("invalid sample and limit values are rejected rather than silently becoming an exhaustive run", () => {
  const ids = activeCalculatorIds();
  assert.throws(() => selectCalculatorBrowserAuditToolIds(ids, { sampleSize: 0 }), /positive integer/);
  assert.throws(() => selectCalculatorBrowserAuditToolIds(ids, { sampleSize: Number.NaN }), /positive integer/);
  assert.throws(() => selectCalculatorBrowserAuditToolIds(ids, { limit: -1 }), /positive integer/);
});

test("duplicate runtime IDs and missing mandatory IDs fail closed", () => {
  assert.throws(() => selectCalculatorBrowserAuditToolIds(["same", "same"]), /must be unique/);
  assert.throws(
    () => selectCalculatorBrowserAuditToolIds(["only-one-tool"], { sampleSize: 1 }),
    /Required calculator browser tool IDs are missing/,
  );
});
