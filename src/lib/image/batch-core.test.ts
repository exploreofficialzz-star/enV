// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import { runBatch } from "./batch-engine.ts";

test("batch runner reports per-file success", async () => {
  const files = [new File(["a"], "a.txt"), new File(["b"], "b.txt")];
  const states = [];
  const result = await runBatch(files, async (file, signal, onProgress) => {
    assert.equal(signal.aborted, false);
    onProgress(50);
    return file.name.toUpperCase();
  }, undefined, (items) => states.push(items));
  assert.deepEqual(result.map((item) => item.status), ["completed", "completed"]);
  assert.deepEqual(result.map((item) => item.result), ["A.TXT", "B.TXT"]);
  assert.equal(states.some((items) => items.some((item) => item.status === "running")), true);
});

test("batch runner records failures without faking completion", async () => {
  const files = [new File(["a"], "ok.txt"), new File(["b"], "bad.txt")];
  const result = await runBatch(files, async (file) => {
    if (file.name === "bad.txt") throw new Error("bad input");
    return file.name;
  });
  assert.equal(result[0].status, "completed");
  assert.equal(result[1].status, "failed");
  assert.equal(result[1].error, "bad input");
  assert.equal(result[1].result, undefined);
});
