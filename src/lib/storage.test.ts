import assert from "node:assert/strict";
import test from "node:test";
import { rankMostUsedToolIds } from "./storage.ts";

test("rankMostUsedToolIds orders by local use count, then recent use", () => {
  assert.deepEqual(
    rankMostUsedToolIds(["latest", "frequent", "tie"], { frequent: 9, tie: 3, other: 3 }, 5),
    ["frequent", "tie", "other", "latest"],
  );
});

test("rankMostUsedToolIds falls back to this user's recent tools", () => {
  assert.deepEqual(rankMostUsedToolIds(["one", "two", "three"], {}, 2), ["one", "two"]);
  assert.deepEqual(rankMostUsedToolIds([], {}, 5), []);
});
