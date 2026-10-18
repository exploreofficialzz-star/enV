import assert from "node:assert/strict";
import test from "node:test";
import {
  TOKEN_SUBUNITS_PER_TOKEN,
  METERED_OPERATION_RULES,
  PRICING_VERSION,
  formatTokens,
  providerCostToSubunits,
  quoteOperation,
  publicBillingCatalog,
  referenceUsdMicrosForSubunits,
} from "./catalog.ts";

test("reference unit is 100 enV Tokens per USD dollar", () => {
  assert.equal(TOKEN_SUBUNITS_PER_TOKEN, 1_000);
  assert.equal(referenceUsdMicrosForSubunits(100 * TOKEN_SUBUNITS_PER_TOKEN), 1_000_000);
  assert.equal(PRICING_VERSION, "env-metering-preview-2026-10-18-v1");
});

test("ten basic calculator operations are one token in the initial hypothesis", () => {
  const quote = quoteOperation("local.calculator", 10);
  assert.equal(quote.status, "quoted");
  assert.equal(quote.estimatedSubunits, 1_000);
  assert.equal(quote.estimatedTokens, 1);
  assert.equal(quote.estimatedUsdMicros, 10_000);
  assert.match(quote.note, /not an active charge/i);
});

test("display formatting supports fractional-token operations", () => {
  assert.equal(formatTokens(100), "0.1");
  assert.equal(formatTokens(1_050), "1.05");
  assert.equal(formatTokens(100_000), "100");
});

test("provider-cost pricing applies a gross-margin target using integer math", () => {
  // $0.01 = 10,000 USD micros. At 60% gross margin, required revenue is $0.025.
  assert.equal(providerCostToSubunits(10_000, 6_000), 2_500);
  assert.equal(referenceUsdMicrosForSubunits(providerCostToSubunits(10_000, 6_000)), 25_000);
  assert.equal(providerCostToSubunits(10_000, 0), 1_000);
});

test("provider-priced operations refuse to invent a quote without measured cost", () => {
  const quote = quoteOperation("cloud.transcription", 60);
  assert.equal(quote.status, "requires-cost-measurement");
  assert.equal(quote.estimatedSubunits, null);
  assert.equal(quote.estimatedTokens, null);
});

test("frontier model operation requires an entitlement before a cost quote", () => {
  const quote = quoteOperation("ai.frontier", 1);
  assert.equal(quote.status, "premium-required");
  assert.equal(quote.premiumRequired, true);
  assert.equal(quote.estimatedSubunits, null);
});

test("catalog covers each monetization class without activating live payments", () => {
  assert.ok(METERED_OPERATION_RULES.some((rule) => rule.class === "local"));
  assert.ok(METERED_OPERATION_RULES.some((rule) => rule.class === "cloud"));
  assert.ok(METERED_OPERATION_RULES.some((rule) => rule.class === "ai"));
  assert.ok(METERED_OPERATION_RULES.some((rule) => rule.class === "agent"));
});

test("public policy uses enV Tokens, no advertising and inactive checkout", () => {
  const catalog = publicBillingCatalog();
  assert.equal(catalog.token.label, "enV Token");
  assert.equal(catalog.token.notModelTokens, true);
  assert.equal(catalog.token.purchasedTokensExpire, false);
  assert.equal(catalog.monetization.advertising, false);
  assert.equal(catalog.monetization.realPaymentsEnabled, false);
  assert.equal(catalog.purchaseAvailability.status, "not-configured");
});

test("invalid units, margins and unknown operations fail closed", () => {
  assert.throws(() => quoteOperation("local.calculator", 0), /Units must be an integer/);
  assert.throws(() => quoteOperation("local.calculator", 1.5), /Units must be an integer/);
  assert.throws(() => quoteOperation("not.a.tool", 1), /Unknown billing operation/);
  assert.throws(() => providerCostToSubunits(1_000, 10_000), /Gross margin must be/);
  assert.throws(() => providerCostToSubunits(-1), /Provider cost must be/);
  assert.throws(() => providerCostToSubunits(Number.MAX_SAFE_INTEGER, 9_999), /too large/);
});
