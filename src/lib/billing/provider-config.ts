/**
 * Payment-provider configuration rules that must not depend on checkout availability.
 *
 * Disabling new purchases must never prevent the server from verifying an existing
 * transaction: customers may have completed payment immediately before a kill switch
 * was activated. Keep this helper small and free of database/network dependencies.
 */
export function requirePaystackVerificationSecret(
  env: Record<string, string | undefined>,
): string {
  const secret = env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    throw Object.assign(new Error("Paystack transaction verification is not configured."), {
      code: "PAYSTACK_NOT_CONFIGURED",
      status: 503,
    });
  }
  return secret;
}
