import assert from "node:assert/strict";
import test from "node:test";
import { readSafePackPrice, requirePaystackVerificationSecret } from "./provider-config.ts";

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

test("token-pack pricing rejects values that overflow safe integer arithmetic", () => {
  const packs = [100, 250, 500, 1_000] as const;
  assert.equal(readSafePackPrice("1", packs), 1);
  assert.equal(readSafePackPrice(" 25 ", packs), 25);
  assert.equal(readSafePackPrice("", packs), null);
  assert.equal(readSafePackPrice("0", packs), null);
  assert.equal(readSafePackPrice("1.5", packs), null);
  assert.equal(readSafePackPrice("9007199254741", packs), null);
  assert.equal(readSafePackPrice("1", []), null);
  assert.equal(readSafePackPrice("1", [0]), null);
});
