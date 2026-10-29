import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleExportEntries } from "./export-readiness.ts";

test("scene export refuses to silently omit a visible object that failed to load", () => {
  const objects = [{ id: "ground", visible: true }, { id: "model", visible: true }];
  assert.throws(
    () => visibleExportEntries(objects, new Map([["ground", { name: "Ground" }]])),
    /visible object could not be loaded/,
  );
  const model = { name: "Model" };
  assert.deepEqual(visibleExportEntries(objects, new Map([["ground", { name: "Ground" }], ["model", model]])),
    [{ name: "Ground" }, model]);
});

test("hidden objects need not load, and an empty visible scene cannot be exported", () => {
  assert.deepEqual(visibleExportEntries([{ id: "hidden", visible: false }, { id: "shown", visible: true }],
    new Map([["shown", "ready"]])), ["ready"]);
  assert.throws(() => visibleExportEntries([{ id: "hidden", visible: false }], new Map()), /Add a visible object/);
});
