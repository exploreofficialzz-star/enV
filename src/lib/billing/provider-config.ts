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

/** Parse a positive minor-unit price only when every offered token pack fits safely in integer arithmetic. */
export function readSafePackPrice(
  value: string | undefined,
  packSizes: readonly number[],
): number | null {
  if (!value || !/^\d+$/.test(value.trim()) || packSizes.length === 0) return null;
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  for (const packSize of packSizes) {
    if (!Number.isSafeInteger(packSize) || packSize <= 0) return null;
    const total = packSize * parsed;
    if (!Number.isSafeInteger(total) || total <= 0) return null;
  }
  return parsed;
}
