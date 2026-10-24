import assert from "node:assert/strict";
import test from "node:test";
import { requirePaystackVerificationSecret } from "./provider-config.ts";

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
