import assert from "node:assert/strict";
import test from "node:test";
import {
  findNearbyFlutterwaveAmountSuggestions,
  usdCentsForTokenPack,
  usdCentsToMinorAmount,
  formatUsdReferenceForTokenPack,
} from "./fx.server.ts";

test("enV token reference pricing is fixed at one US cent per token", () => {
  assert.equal(usdCentsForTokenPack(100), 100);
  assert.equal(usdCentsForTokenPack(250), 250);
  assert.equal(usdCentsForTokenPack(500), 500);
  assert.equal(usdCentsForTokenPack(1_000), 1_000);
  assert.equal(formatUsdReferenceForTokenPack(100), "$1.00");
  assert.equal(formatUsdReferenceForTokenPack(250), "$2.50");
  assert.throws(() => usdCentsForTokenPack(0), RangeError);
  assert.throws(() => usdCentsForTokenPack(100.5), RangeError);
});

test("Flutterwave V3 suggestions preserve exact USD-cent pricing and produce whole major-unit charges", () => {
  const suggestions = findNearbyFlutterwaveAmountSuggestions("GBP", 1_000, 0.78);
  assert.equal(suggestions.length, 2);
  assert.ok(suggestions[0]!.usdAmountCents < 1_000);
  assert.ok(suggestions[1]!.usdAmountCents > 1_000);
  assert.ok(suggestions.every((item) => item.amountMinor % 100 === 0));
  assert.ok(suggestions.every((item) => item.amountMajor === item.amountMinor / 100));
  assert.equal(findNearbyFlutterwaveAmountSuggestions("XOF", 100, 655.957).length, 0);
  assert.deepEqual(findNearbyFlutterwaveAmountSuggestions("GBP", 1_000, 0), []);
});

test("FX conversion uses currency minor units and rounds half up with integer arithmetic", () => {
  assert.equal(usdCentsToMinorAmount(100, "USD", 1), 100);
  assert.equal(usdCentsToMinorAmount(100, "NGN", 1_500), 150_000);
  assert.equal(usdCentsToMinorAmount(250, "NGN", 1_500), 375_000);
  assert.equal(usdCentsToMinorAmount(100, "KES", 129.4567), 12_946);
  assert.equal(usdCentsToMinorAmount(100, "XOF", 655.957), 656);
  assert.equal(usdCentsToMinorAmount(100, "UGX", 3_700.25), 3_700);
  assert.throws(() => usdCentsToMinorAmount(100, "XXX", 1), RangeError);
  assert.throws(() => usdCentsToMinorAmount(0, "NGN", 1_500), RangeError);
  assert.throws(() => usdCentsToMinorAmount(100, "NGN", 0), RangeError);
});
