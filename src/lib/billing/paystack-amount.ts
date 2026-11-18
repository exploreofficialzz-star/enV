/**
 * Normalize Paystack's customer-paid amount and merchant-requested amount.
 *
 * When a Nigerian merchant passes processing fees to the customer, Paystack
 * can return the gross customer charge in data.amount, the original product
 * price in data.requested_amount, and the passed-through fee in data.fees.
 * Wallet purchase intents store the original requested price, not the gross
 * charge. Never infer a requested amount from a surcharge: require Paystack's
 * requested_amount and verify that the fee explains the exact difference.
 */
export interface PaystackAmountFields {
  amount?: unknown;
  requested_amount?: unknown;
  fees?: unknown;
}

export interface PaystackVerifiedAmount {
  requestedAmountMinor: number;
  grossAmountMinor: number;
  providerFeesMinor: number | null;
  customerSurchargeMinor: number;
}

export function resolvePaystackVerifiedAmount(
  transaction: PaystackAmountFields,
  expectedRequestedAmountMinor: number,
): PaystackVerifiedAmount | null {
  if (!Number.isSafeInteger(expectedRequestedAmountMinor) || expectedRequestedAmountMinor <= 0) {
    return null;
  }

  const grossAmountMinor = transaction.amount;
  if (typeof grossAmountMinor !== "number" ||
      !Number.isSafeInteger(grossAmountMinor) || grossAmountMinor <= 0) {
    return null;
  }

  const hasRequestedAmount = transaction.requested_amount !== undefined &&
    transaction.requested_amount !== null;
  const requestedAmountMinor = hasRequestedAmount
    ? transaction.requested_amount
    : grossAmountMinor;
  if (typeof requestedAmountMinor !== "number" ||
      !Number.isSafeInteger(requestedAmountMinor) || requestedAmountMinor <= 0 ||
      requestedAmountMinor !== expectedRequestedAmountMinor) {
    return null;
  }

  const customerSurchargeMinor = grossAmountMinor - requestedAmountMinor;
  if (customerSurchargeMinor < 0) return null;

  const rawFees = transaction.fees;
  let providerFeesMinor: number | null = null;
  if (rawFees !== undefined && rawFees !== null) {
    if (typeof rawFees !== "number" || !Number.isSafeInteger(rawFees) || rawFees < 0) {
      return null;
    }
    providerFeesMinor = rawFees;
  }

  // A gross amount above the stored product price is accepted only when
  // Paystack independently reports the exact fee that accounts for the gap.
  if (customerSurchargeMinor > 0 && providerFeesMinor !== customerSurchargeMinor) {
    return null;
  }

  return {
    requestedAmountMinor,
    grossAmountMinor,
    providerFeesMinor,
    customerSurchargeMinor,
  };
}
