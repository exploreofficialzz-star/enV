import assert from "node:assert/strict";
import test from "node:test";
import { resolvePaystackCountryConfiguration } from "./provider-config.ts";

const PACKS = [100, 250, 500, 1_000] as const;

const approvedNigeria = {
  PAYSTACK_MERCHANT_COUNTRY: "NG",
  PAYSTACK_SECRET_KEY: "sk_test_nigeria",
  PAYSTACK_PROVIDER_APPROVED: "true",
  PAYSTACK_TOKEN_PRICE_NGN_KOBO: "1",
};

test("Paystack local checkout is available only in the configured merchant registration country", () => {
  const local = resolvePaystackCountryConfiguration("NG", approvedNigeria, PACKS);
  assert.equal(local?.enabled, true);
  assert.equal(local?.currency, "NGN");
  assert.equal(local?.international, false);

  // A Ghanaian visitor is not given Ghana local rails by a Nigerian account.
  assert.equal(resolvePaystackCountryConfiguration("GH", approvedNigeria, PACKS), null);
});

test("Paystack local merchant account requires both global and currency-specific approval", () => {
  const ghana = {
    PAYSTACK_MERCHANT_COUNTRY: "GH",
    PAYSTACK_SECRET_KEY: "sk_test_ghana",
    PAYSTACK_PROVIDER_APPROVED: "false",
    PAYSTACK_PROVIDER_APPROVED_GHS: "true",
    PAYSTACK_TOKEN_PRICE_GHS_MINOR: "1",
  };
  assert.equal(resolvePaystackCountryConfiguration("GH", ghana, PACKS)?.enabled, false);
  assert.equal(resolvePaystackCountryConfiguration("GH", {
    ...ghana,
    PAYSTACK_PROVIDER_APPROVED: "true",
  }, PACKS)?.enabled, true);
  assert.equal(resolvePaystackCountryConfiguration("GH", {
    ...ghana,
    PAYSTACK_PROVIDER_APPROVED: "true",
    PAYSTACK_PROVIDER_APPROVED_GHS: "false",
  }, PACKS)?.enabled, false);
});

test("Paystack international visitors use card-only merchant settlement currency", () => {
  const foreign = resolvePaystackCountryConfiguration("GH", {
    ...approvedNigeria,
    PAYSTACK_INTERNATIONAL_ENABLED: "true",
  }, PACKS);
  assert.equal(foreign?.enabled, true);
  assert.equal(foreign?.currency, "NGN");
  assert.equal(foreign?.international, true);
});

test("Paystack USD international settlement is restricted to merchant countries that support USD", () => {
  const ghanaUsd = resolvePaystackCountryConfiguration("US", {
    PAYSTACK_MERCHANT_COUNTRY: "GH",
    PAYSTACK_PROVIDER_APPROVED: "true",
    PAYSTACK_PROVIDER_APPROVED_USD: "true",
    PAYSTACK_TOKEN_PRICE_USD_MINOR: "1",
    PAYSTACK_INTERNATIONAL_ENABLED: "true",
    PAYSTACK_INTERNATIONAL_CURRENCY: "USD",
  }, PACKS);
  assert.equal(ghanaUsd, null);
});

test("Paystack USD international settlement requires currency approval as well as global merchant approval", () => {
  const usdConfig = {
    ...approvedNigeria,
    PAYSTACK_SECRET_KEY_USD: "sk_test_usd",
    PAYSTACK_PROVIDER_APPROVED_USD: "false",
    PAYSTACK_TOKEN_PRICE_USD_MINOR: "1",
    PAYSTACK_INTERNATIONAL_ENABLED: "true",
    PAYSTACK_INTERNATIONAL_CURRENCY: "USD",
  };
  assert.equal(resolvePaystackCountryConfiguration("US", usdConfig, PACKS)?.enabled, false);
  assert.equal(resolvePaystackCountryConfiguration("US", usdConfig, PACKS)?.secret, "sk_test_nigeria");
  assert.equal(resolvePaystackCountryConfiguration("US", {
    ...usdConfig,
    PAYSTACK_PROVIDER_APPROVED_USD: "true",
  }, PACKS)?.enabled, true);
  assert.equal(resolvePaystackCountryConfiguration("US", {
    ...usdConfig,
    PAYSTACK_PROVIDER_APPROVED_USD: "true",
  }, PACKS)?.secret, "sk_test_nigeria");
});

test("unknown customers and unsupported merchant countries fail closed", () => {
  assert.equal(resolvePaystackCountryConfiguration(null, approvedNigeria, PACKS), null);
  assert.equal(resolvePaystackCountryConfiguration("US", {
    PAYSTACK_MERCHANT_COUNTRY: "JP",
    PAYSTACK_INTERNATIONAL_ENABLED: "true",
  }, PACKS), null);
});
