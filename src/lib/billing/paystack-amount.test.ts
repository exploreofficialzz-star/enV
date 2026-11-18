import assert from "node:assert/strict";
import test from "node:test";
import { resolvePaystackVerifiedAmount } from "./paystack-amount.ts";

test("accepts a Nigerian Paystack transaction with the fee passed through to the customer", () => {
  const verified = resolvePaystackVerifiedAmount({
    amount: 137_271,
    requested_amount: 135_211,
    fees: 2_060,
  }, 135_211);

  assert.deepEqual(verified, {
    requestedAmountMinor: 135_211,
    grossAmountMinor: 137_271,
    providerFeesMinor: 2_060,
    customerSurchargeMinor: 2_060,
  });
});

test("matches Paystack's documented gross amount, requested amount and fee response shape", () => {
  const verified = resolvePaystackVerifiedAmount({
    amount: 40_333,
    requested_amount: 30_050,
    fees: 10_283,
  }, 30_050);

  assert.equal(verified?.requestedAmountMinor, 30_050);
  assert.equal(verified?.grossAmountMinor, 40_333);
  assert.equal(verified?.customerSurchargeMinor, 10_283);
});

test("accepts the original requested amount when Paystack fees are absorbed by the merchant", () => {
  const verified = resolvePaystackVerifiedAmount({
    amount: 135_211,
    requested_amount: 135_211,
    fees: 2_060,
  }, 135_211);

  assert.equal(verified?.requestedAmountMinor, 135_211);
  assert.equal(verified?.customerSurchargeMinor, 0);
  assert.equal(verified?.providerFeesMinor, 2_060);
});

test("retains compatibility with exact-amount responses that omit requested_amount", () => {
  assert.deepEqual(resolvePaystackVerifiedAmount({ amount: 135_211 }, 135_211), {
    requestedAmountMinor: 135_211,
    grossAmountMinor: 135_211,
    providerFeesMinor: null,
    customerSurchargeMinor: 0,
  });
});

test("rejects a gross charge without Paystack's matching requested_amount", () => {
  assert.equal(resolvePaystackVerifiedAmount({
    amount: 137_271,
    fees: 2_060,
  }, 135_211), null);
});

test("rejects a different requested product amount even when the gross/fee arithmetic balances", () => {
  assert.equal(resolvePaystackVerifiedAmount({
    amount: 137_271,
    requested_amount: 135_210,
    fees: 2_061,
  }, 135_211), null);
});

test("rejects a surcharge that is not exactly explained by Paystack's fee field", () => {
  assert.equal(resolvePaystackVerifiedAmount({
    amount: 137_271,
    requested_amount: 135_211,
    fees: 2_059,
  }, 135_211), null);
});

test("rejects non-integer, negative, unsafe or malformed amounts and fees", () => {
  assert.equal(resolvePaystackVerifiedAmount({ amount: 135_211.5 }, 135_211), null);
  assert.equal(resolvePaystackVerifiedAmount({ amount: -1 }, 135_211), null);
  assert.equal(resolvePaystackVerifiedAmount({ amount: Number.MAX_SAFE_INTEGER + 1 }, 135_211), null);
  assert.equal(resolvePaystackVerifiedAmount({
    amount: 137_271, requested_amount: 135_211, fees: "2060",
  }, 135_211), null);
  assert.equal(resolvePaystackVerifiedAmount({
    amount: 137_271, requested_amount: 135_211, fees: -1,
  }, 135_211), null);
});
