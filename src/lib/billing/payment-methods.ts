export type CustomerPaymentMethod = "card" | "local" | "more";
export type FundingProvider = {
  id: "paystack" | "flutterwave" | "cryptomus";
  enabled: boolean;
  currency: string;
  localPayments?: boolean;
  paymentOptions?: readonly string[];
};

/** A customer sees payment methods, never gateway brands. */
export function isCustomerPaymentMethodAvailable(
  providers: readonly FundingProvider[],
  method: CustomerPaymentMethod,
): boolean {
  return getFundingCandidates(providers, method).length > 0;
}

/** Return approved gateway candidates in preferred order for server-side amount-specific routing. */
export function getFundingCandidates<T extends FundingProvider>(
  providers: readonly T[],
  method: CustomerPaymentMethod,
): T[] {
  if (method === "card") {
    return providers.filter((provider) =>
      provider.enabled && (provider.id === "paystack" || provider.id === "flutterwave"),
    );
  }
  if (method === "local") {
    return providers.filter((provider) =>
      provider.enabled && (
        (provider.id === "paystack" && provider.localPayments === true) ||
        (provider.id === "flutterwave" && provider.paymentOptions?.some((option) => option !== "card") === true)
      ),
    ).sort((a, b) => Number(b.id === "flutterwave") - Number(a.id === "flutterwave"));
  }
  return providers.filter((provider) => provider.id === "cryptomus" && provider.enabled);
}

/** USD amount entered in dollars becomes integer cents; each cent is one enV token. */
export function parseUsdAmountToCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) && cents >= 100 && cents <= 9_000_000_000
    ? cents
    : null;
}
