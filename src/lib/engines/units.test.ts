import assert from "node:assert/strict";
import test from "node:test";
import { convert } from "./units.ts";

test("data-transfer conversion preserves case-sensitive bit and byte units", () => {
  const pairs = [
    ["bps", "Bps"],
    ["kbps", "kBps"],
    ["mbps", "MBps"],
    ["gbps", "GBps"],
    ["Kibps", "KiBps"],
    ["Mibps", "MiBps"],
  ] as const;

  for (const [bits, bytes] of pairs) {
    assert.equal(convert("data-transfer", 1, bytes, bits), 8, `1 ${bytes} should equal 8 ${bits}`);
    assert.equal(convert("data-transfer", 1, bits, bytes), 0.125, `1 ${bits} should equal 0.125 ${bytes}`);
  }
});

test("unit lookup uses case-insensitive fallback only when the ID is unambiguous", () => {
  assert.equal(convert("length", 1, "M", "cm"), 100);
  assert.throws(() => convert("data-transfer", 1, "KBPS", "bps"), /Unknown unit: KBPS/);
});
