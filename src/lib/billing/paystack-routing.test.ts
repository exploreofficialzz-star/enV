import assert from "node:assert/strict";
import test from "node:test";
import { resolvePaystackCountryConfiguration } from "./provider-config.ts";

const approvedNigeria = {
  PAYSTACK_MERCHANT_COUNTRY: "NG",
  PAYSTACK_SECRET_KEY: "sk_test_nigeria",
  PAYSTACK_PROVIDER_APPROVED: "true",
};

test("Paystack local checkout is available only in the configured merchant registration country", () => {
  const local = resolvePaystackCountryConfiguration("NG", approvedNigeria);
  assert.equal(local?.enabled, true);
  assert.equal(local?.currency, "NGN");
  assert.equal(local?.international, false);

  // A Ghanaian visitor is not given Ghana local rails by a Nigerian account.
  assert.equal(resolvePaystackCountryConfiguration("GH", approvedNigeria), null);
});

test("Paystack local merchant account requires global and currency-specific approval", () => {
  const ghana = {
    PAYSTACK_MERCHANT_COUNTRY: "GH",
    PAYSTACK_SECRET_KEY: "sk_test_ghana",
    PAYSTACK_PROVIDER_APPROVED: "false",
    PAYSTACK_PROVIDER_APPROVED_GHS: "true",
  };
  assert.equal(resolvePaystackCountryConfiguration("GH", ghana)?.enabled, false);
  assert.equal(resolvePaystackCountryConfiguration("GH", {
    ...ghana,
    PAYSTACK_PROVIDER_APPROVED: "true",
  })?.enabled, true);
  assert.equal(resolvePaystackCountryConfiguration("GH", {
    ...ghana,
    PAYSTACK_PROVIDER_APPROVED: "true",
    PAYSTACK_PROVIDER_APPROVED_GHS: "false",
  })?.enabled, false);
});

test("Paystack international visitors use card-only merchant settlement currency", () => {
  const foreign = resolvePaystackCountryConfiguration("GH", {
    ...approvedNigeria,
    PAYSTACK_INTERNATIONAL_ENABLED: "true",
  });
  assert.equal(foreign?.enabled, true);
  assert.equal(foreign?.currency, "NGN");
  assert.equal(foreign?.international, true);
});

test("Paystack USD international settlement is restricted to merchant countries that support USD", () => {
  const ghanaUsd = resolvePaystackCountryConfiguration("US", {
    PAYSTACK_MERCHANT_COUNTRY: "GH",
    PAYSTACK_PROVIDER_APPROVED: "true",
    PAYSTACK_PROVIDER_APPROVED_USD: "true",
    PAYSTACK_INTERNATIONAL_ENABLED: "true",
    PAYSTACK_INTERNATIONAL_CURRENCY: "USD",
  });
  assert.equal(ghanaUsd, null);
});

test("Paystack USD international settlement requires separate currency approval", () => {
  const usdConfig = {
    ...approvedNigeria,
    PAYSTACK_PROVIDER_APPROVED_USD: "false",
    PAYSTACK_INTERNATIONAL_ENABLED: "true",
    PAYSTACK_INTERNATIONAL_CURRENCY: "USD",
  };
  assert.equal(resolvePaystackCountryConfiguration("US", usdConfig)?.enabled, false);
  assert.equal(resolvePaystackCountryConfiguration("US", {
    ...usdConfig,
    PAYSTACK_PROVIDER_APPROVED_USD: "true",
  })?.enabled, true);
});

test("unknown customers and unsupported merchant countries fail closed", () => {
  assert.equal(resolvePaystackCountryConfiguration(null, approvedNigeria), null);
  assert.equal(resolvePaystackCountryConfiguration("US", {
    PAYSTACK_MERCHANT_COUNTRY: "JP",
    PAYSTACK_INTERNATIONAL_ENABLED: "true",
  }), null);
});
