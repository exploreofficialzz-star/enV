import assert from "node:assert/strict";
import test from "node:test";
import { formatEnVTokenBalance } from "./token-display.ts";

test("zero wallet balance is displayed explicitly as 0.00", () => {
  assert.equal(formatEnVTokenBalance(0, "en-US"), "0.00");
});

test("whole token balances retain two decimal places", () => {
  assert.equal(formatEnVTokenBalance(100, "en-US"), "100.00");
});

test("fractional balances preserve the ledger's thousandth-token precision", () => {
  assert.equal(formatEnVTokenBalance(12.345, "en-US"), "12.345");
});

test("invalid balance values never render as NaN or Infinity", () => {
  assert.equal(formatEnVTokenBalance(Number.NaN, "en-US"), "0.00");
  assert.equal(formatEnVTokenBalance(Number.POSITIVE_INFINITY, "en-US"), "0.00");
  assert.equal(formatEnVTokenBalance(-1, "en-US"), "0.00");
});
