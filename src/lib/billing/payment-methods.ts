export type CustomerPaymentMethod = "card" | "local" | "more";
export type FundingProvider = {
  id: "paystack" | "flutterwave" | "cryptomus";
  enabled: boolean;
  localPayments?: boolean;
  paymentOptions?: readonly string[];
};

/** A customer sees payment methods, never gateway brands. */
export function isCustomerPaymentMethodAvailable(
  providers: readonly FundingProvider[],
  method: CustomerPaymentMethod,
): boolean {
  if (method === "card") {
    return providers.some((provider) =>
      provider.enabled && (provider.id === "paystack" || provider.id === "flutterwave"),
    );
  }
  if (method === "local") {
    return providers.some((provider) =>
      provider.enabled && (
        (provider.id === "paystack" && provider.localPayments === true) ||
        (provider.id === "flutterwave" && provider.paymentOptions?.some((option) => option !== "card") === true)
      ),
    );
  }
  return providers.some((provider) => provider.id === "cryptomus" && provider.enabled);
}

/** Resolve a customer choice to an approved provider without exposing that choice in the UI. */
export function selectFundingProvider(
  providers: readonly FundingProvider[],
  method: CustomerPaymentMethod,
): FundingProvider | null {
  if (method === "card") {
    return providers.find((provider) =>
      provider.enabled && provider.id === "paystack",
    ) ?? providers.find((provider) =>
      provider.enabled && provider.id === "flutterwave",
    ) ?? null;
  }
  if (method === "local") {
    return providers.find((provider) =>
      provider.enabled && provider.id === "flutterwave" &&
      provider.paymentOptions?.some((option) => option !== "card") === true,
    ) ?? providers.find((provider) =>
      provider.enabled && provider.id === "paystack" && provider.localPayments === true,
    ) ?? null;
  }
  return providers.find((provider) => provider.id === "cryptomus" && provider.enabled) ?? null;
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
