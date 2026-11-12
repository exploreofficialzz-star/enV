import assert from "node:assert/strict";
import test from "node:test";
import {
  isCustomerPaymentMethodAvailable,
  parseUsdAmountToCents,
  selectFundingProvider,
} from "./payment-methods.ts";

const providers = [
  { id: "paystack" as const, enabled: true, localPayments: true },
  { id: "flutterwave" as const, enabled: true, paymentOptions: ["card", "ussd", "banktransfer"] },
  { id: "cryptomus" as const, enabled: false },
];

test("customer payment methods resolve to eligible providers without exposing provider names", () => {
  assert.equal(isCustomerPaymentMethodAvailable(providers, "card"), true);
  assert.equal(isCustomerPaymentMethodAvailable(providers, "local"), true);
  assert.equal(isCustomerPaymentMethodAvailable(providers, "more"), false);
  assert.equal(selectFundingProvider(providers, "card")?.id, "paystack");
  assert.equal(selectFundingProvider(providers, "local")?.id, "flutterwave");
  assert.equal(selectFundingProvider(providers, "more"), null);
});

test("local payments stay unavailable for international-card-only Paystack accounts", () => {
  const international = [{ id: "paystack" as const, enabled: true, localPayments: false }];
  assert.equal(isCustomerPaymentMethodAvailable(international, "local"), false);
  assert.equal(selectFundingProvider(international, "local"), null);
});

test("custom USD input converts cents to matching enV token units and enforces the $1 minimum", () => {
  assert.equal(parseUsdAmountToCents("1"), 100);
  assert.equal(parseUsdAmountToCents("10"), 1_000);
  assert.equal(parseUsdAmountToCents("50.25"), 5_025);
  assert.equal(parseUsdAmountToCents("100"), 10_000);
  assert.equal(parseUsdAmountToCents("0.99"), null);
  assert.equal(parseUsdAmountToCents("1.001"), null);
  assert.equal(parseUsdAmountToCents("abc"), null);
});
