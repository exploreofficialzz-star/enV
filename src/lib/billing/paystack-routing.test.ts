import assert from "node:assert/strict";
import test from "node:test";
import { getPaystackFundingOption } from "./paystack.server.ts";

const KEYS = [
  "BETTER_AUTH_URL",
  "BILLING_LAUNCH_ENABLED",
  "BILLING_ENFORCEMENT_ENABLED",
  "BILLING_REFUND_DISPUTE_HANDLING_APPROVED",
  "PAYSTACK_MERCHANT_COUNTRY",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_SECRET_KEY_NGN",
  "PAYSTACK_SECRET_KEY_GHS",
  "PAYSTACK_SECRET_KEY_KES",
  "PAYSTACK_SECRET_KEY_ZAR",
  "PAYSTACK_SECRET_KEY_USD",
  "PAYSTACK_PROVIDER_APPROVED",
  "PAYSTACK_PROVIDER_APPROVED_GHS",
  "PAYSTACK_PROVIDER_APPROVED_KES",
  "PAYSTACK_PROVIDER_APPROVED_ZAR",
  "PAYSTACK_PROVIDER_APPROVED_USD",
  "PAYSTACK_TOKEN_PRICE_NGN_KOBO",
  "PAYSTACK_TOKEN_PRICE_GHS_MINOR",
  "PAYSTACK_TOKEN_PRICE_KES_MINOR",
  "PAYSTACK_TOKEN_PRICE_ZAR_MINOR",
  "PAYSTACK_TOKEN_PRICE_USD_MINOR",
  "PAYSTACK_INTERNATIONAL_ENABLED",
  "PAYSTACK_INTERNATIONAL_CURRENCY",
];

function withEnvironment(values: Record<string, string>, run: () => void) {
  const previous = new Map(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try {
    run();
  } finally {
    for (const key of KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const approvedNigeria = {
  BETTER_AUTH_URL: "https://envtools.store",
  BILLING_LAUNCH_ENABLED: "true",
  BILLING_ENFORCEMENT_ENABLED: "true",
  BILLING_REFUND_DISPUTE_HANDLING_APPROVED: "true",
  PAYSTACK_MERCHANT_COUNTRY: "NG",
  PAYSTACK_SECRET_KEY: "sk_test_nigeria",
  PAYSTACK_PROVIDER_APPROVED: "true",
  PAYSTACK_TOKEN_PRICE_NGN_KOBO: "1",
};

test("Paystack local checkout is shown only in the merchant's registration country", () => {
  withEnvironment(approvedNigeria, () => {
    const local = getPaystackFundingOption("NG");
    assert.equal(local?.enabled, true);
    assert.equal(local?.currency, "NGN");
    assert.match(local?.label ?? "", /Paystack · NGN/);

    // A Ghanaian customer is not offered Ghana local money rails by a
    // Nigerian merchant account merely because the visitor is in Ghana.
    assert.equal(getPaystackFundingOption("GH"), null);
  });
});

test("Paystack international visitors receive a card-only route in an approved merchant currency", () => {
  withEnvironment({
    ...approvedNigeria,
    PAYSTACK_INTERNATIONAL_ENABLED: "true",
  }, () => {
    const foreignCustomer = getPaystackFundingOption("GH");
    assert.equal(foreignCustomer?.enabled, true);
    assert.equal(foreignCustomer?.currency, "NGN");
    assert.match(foreignCustomer?.label ?? "", /international cards/);
  });
});

test("Paystack USD international settlement is restricted to merchant countries that support USD", () => {
  withEnvironment({
    BETTER_AUTH_URL: "https://envtools.store",
    BILLING_LAUNCH_ENABLED: "true",
    BILLING_ENFORCEMENT_ENABLED: "true",
    BILLING_REFUND_DISPUTE_HANDLING_APPROVED: "true",
    PAYSTACK_MERCHANT_COUNTRY: "GH",
    PAYSTACK_SECRET_KEY_USD: "sk_test_usd",
    PAYSTACK_PROVIDER_APPROVED: "true",
    PAYSTACK_TOKEN_PRICE_USD_MINOR: "1",
    PAYSTACK_INTERNATIONAL_ENABLED: "true",
    PAYSTACK_INTERNATIONAL_CURRENCY: "USD",
  }, () => {
    assert.equal(getPaystackFundingOption("US"), null);
  });
});
