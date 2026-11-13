import assert from "node:assert/strict";
import test from "node:test";
import { getPaystackLocalChannels, isFlutterwavePaymentOptionsConfigured, isPaystackLocalCustomer, requirePaystackVerificationSecret } from "./provider-config.ts";

test("Paystack is offered only to customers in the configured merchant country", () => {
  const env = { PAYSTACK_MERCHANT_COUNTRY: "NG", PAYSTACK_INTERNATIONAL_ENABLED: "true" };
  assert.equal(isPaystackLocalCustomer("NG", env), true);
  assert.equal(isPaystackLocalCustomer("GH", env), false);
  assert.equal(isPaystackLocalCustomer("US", env), false);
  assert.equal(isPaystackLocalCustomer(null, env), false);
  assert.equal(isPaystackLocalCustomer("XX", env), false);
  assert.equal(isPaystackLocalCustomer("NG", {}), false);
  assert.equal(isPaystackLocalCustomer(" ng ", { PAYSTACK_MERCHANT_COUNTRY: " ng " }), true);
});

test("Paystack settlement credentials remain usable with new-checkout switches disabled", () => {
  assert.equal(requirePaystackVerificationSecret({
    PAYSTACK_SECRET_KEY: "  sk_test_example  ",
    BILLING_LAUNCH_ENABLED: "false",
    BILLING_ENFORCEMENT_ENABLED: "false",
    PAYSTACK_PROVIDER_APPROVED: "false",
  }), "sk_test_example");
});

test("Paystack settlement refuses to call the provider when its server secret is missing", () => {
  assert.throws(
    () => requirePaystackVerificationSecret({ BILLING_LAUNCH_ENABLED: "true" }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "PAYSTACK_NOT_CONFIGURED");
      assert.equal((error as { status?: number }).status, 503);
      return true;
    },
  );
});

test("Flutterwave per-payment methods stay disabled until dashboard-wide methods are turned off", () => {
  assert.equal(isFlutterwavePaymentOptionsConfigured({}), false);
  assert.equal(isFlutterwavePaymentOptionsConfigured({
    FLUTTERWAVE_PAYMENT_OPTIONS_DASHBOARD_DISABLED: "false",
  }), false);
  assert.equal(isFlutterwavePaymentOptionsConfigured({
    FLUTTERWAVE_PAYMENT_OPTIONS_DASHBOARD_DISABLED: "true",
  }), true);
});


test("Paystack local channels only include methods documented for each supported country", () => {
  assert.deepEqual(getPaystackLocalChannels("NG"), ["bank", "ussd", "bank_transfer"]);
  assert.deepEqual(getPaystackLocalChannels("GH"), ["mobile_money", "bank_transfer"]);
  assert.deepEqual(getPaystackLocalChannels("KE"), ["mobile_money"]);
  assert.deepEqual(getPaystackLocalChannels("CI"), ["mobile_money"]);
  assert.deepEqual(getPaystackLocalChannels("ZA"), ["qr", "eft", "capitec_pay"]);
  assert.deepEqual(getPaystackLocalChannels("US"), []);
  assert.deepEqual(getPaystackLocalChannels(null), []);
});
