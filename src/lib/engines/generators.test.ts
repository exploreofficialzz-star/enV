import test from "node:test";
import assert from "node:assert/strict";
import { runGenerator } from "./generators.ts";

test("secure-token generator produces bounded URL-safe output and rejects invalid lengths", () => {
  const token = runGenerator("secure-token", { length: "64" });
  assert.equal(token.length, 64);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  for (const length of ["0", "-1", "501", "1.5", "NaN"]) {
    assert.throws(() => runGenerator("secure-token", { length }), /integer from 1 through 500/);
  }
  assert.equal(runGenerator("secure-token", {}).length, 32);
});
