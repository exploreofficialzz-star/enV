import assert from "node:assert/strict";
import test from "node:test";
import {
  getFundingCandidates,
  isCustomerPaymentMethodAvailable,
  parseUsdAmountToCents,
  resolveFlutterwaveFundingMethod,
  formatCardExpiryInput,
  parseCardExpiry,
} from "./payment-methods.ts";

const providers = [
  { id: "paystack" as const, enabled: true, currency: "NGN", localPayments: true },
  { id: "flutterwave" as const, enabled: true, currency: "NGN", paymentMethods: ["card", "mobile_money", "bank_transfer"] },
  { id: "cryptomus" as const, enabled: false, currency: "USD" },
];

test("customer payment methods resolve to eligible providers without exposing provider names", () => {
  assert.equal(isCustomerPaymentMethodAvailable(providers, "card"), true);
  assert.equal(isCustomerPaymentMethodAvailable(providers, "local"), true);
  assert.equal(isCustomerPaymentMethodAvailable(providers, "more"), false);
  assert.deepEqual(getFundingCandidates(providers, "card").map((provider) => provider.id), ["paystack", "flutterwave"]);
  assert.deepEqual(getFundingCandidates(providers, "local").map((provider) => provider.id), ["flutterwave", "paystack"]);
  assert.deepEqual(getFundingCandidates(providers, "more"), []);
});

test("V4 mobile-money and bank-transfer methods expose the generic Local payment choice", () => {
  const v4 = [{ id: "flutterwave" as const, enabled: true, currency: "GHS", paymentMethods: ["card", "mobile_money", "bank_transfer"] }];
  assert.equal(isCustomerPaymentMethodAvailable(v4, "local"), true);
  assert.deepEqual(getFundingCandidates(v4, "local").map((provider) => provider.id), ["flutterwave"]);
});

test("a mobile-money-only market does not advertise Card", () => {
  const mobileMoneyOnly = [{ id: "flutterwave" as const, enabled: true, currency: "KES", paymentMethods: ["mobile_money"] }];
  assert.equal(isCustomerPaymentMethodAvailable(mobileMoneyOnly, "card"), false);
  assert.equal(isCustomerPaymentMethodAvailable(mobileMoneyOnly, "local"), true);
});

test("legacy paymentOptions remain compatible while V4 uses paymentMethods", () => {
  const legacy = [{ id: "flutterwave" as const, enabled: true, currency: "GHS", paymentOptions: ["card", "banktransfer"] }];
  assert.deepEqual(getFundingCandidates(legacy, "local").map((provider) => provider.id), ["flutterwave"]);
});

test("local payments stay unavailable for international-card-only Paystack accounts", () => {
  const international = [{ id: "paystack" as const, enabled: true, currency: "USD", localPayments: false }];
  assert.equal(isCustomerPaymentMethodAvailable(international, "local"), false);
  assert.deepEqual(getFundingCandidates(international, "local"), []);
});

test("US USD Card checkout remains eligible for Flutterwave V4 and resolves card directly", () => {
  const usFlutterwave = [{
    id: "flutterwave" as const,
    enabled: true,
    currency: "USD",
    paymentMethods: ["card"],
  }];
  assert.equal(isCustomerPaymentMethodAvailable(usFlutterwave, "card"), true);
  assert.deepEqual(getFundingCandidates(usFlutterwave, "card").map((provider) => provider.id), ["flutterwave"]);
  assert.equal(resolveFlutterwaveFundingMethod("card", usFlutterwave[0]!.paymentMethods), "card");
  assert.equal(isCustomerPaymentMethodAvailable(usFlutterwave, "local"), false);
});

test("US Card choice resolves directly to the V4 card channel without relying on a second ready flag", () => {
  const usCardChannels = ["card"];
  assert.equal(resolveFlutterwaveFundingMethod("card", usCardChannels), "card");
  assert.equal(resolveFlutterwaveFundingMethod("local", usCardChannels), null);
});

test("generic Local payment resolves to a supported V4 local channel and preserves the customer's choice", () => {
  const localChannels = ["card", "mobile_money", "bank_transfer"];
  assert.equal(resolveFlutterwaveFundingMethod("local", localChannels), "mobile_money");
  assert.equal(resolveFlutterwaveFundingMethod("local", localChannels, "bank_transfer"), "bank_transfer");
  assert.equal(resolveFlutterwaveFundingMethod("card", localChannels, "bank_transfer"), "card");
  assert.equal(resolveFlutterwaveFundingMethod("more", localChannels), null);
});

test("card expiry is captured in one MM/YY field and parsed into V4 month/year values", () => {
  assert.equal(formatCardExpiryInput("0428"), "04/28");
  assert.equal(formatCardExpiryInput("042028"), "04/2028");
  assert.equal(formatCardExpiryInput("04/28"), "04/28");
  assert.deepEqual(parseCardExpiry("04/28", new Date("2026-11-16T12:00:00Z")), {
    month: "04", year: "28",
  });
  assert.deepEqual(parseCardExpiry("04/2028", new Date("2026-11-16T12:00:00Z")), {
    month: "04", year: "2028",
  });
  assert.equal(parseCardExpiry("13/28", new Date("2026-11-16T12:00:00Z")), null);
  assert.equal(parseCardExpiry("00/28", new Date("2026-11-16T12:00:00Z")), null);
  assert.equal(parseCardExpiry("10/26", new Date("2026-11-16T12:00:00Z")), null);
  assert.equal(parseCardExpiry("04/2", new Date("2026-11-16T12:00:00Z")), null);
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
