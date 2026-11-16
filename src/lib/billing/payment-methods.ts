export type CustomerPaymentMethod = "card" | "local" | "more";
export type FlutterwaveFundingMethod = "card" | "mobile_money" | "bank_transfer";
export type FundingProvider = {
  id: "paystack" | "flutterwave" | "cryptomus";
  enabled: boolean;
  currency: string;
  localPayments?: boolean;
  paymentOptions?: readonly string[];
  paymentMethods?: readonly string[];
};

/** Resolve generic customer choices to an enabled V4 channel without exposing the gateway.
 * The caller must first confirm the matching generic method is available from the server.
 */
export function resolveFlutterwaveFundingMethod(
  customerMethod: CustomerPaymentMethod,
  supportedMethods: readonly string[],
  preferredLocalMethod?: string,
): FlutterwaveFundingMethod | null {
  if (customerMethod === "card") {
    return supportedMethods.includes("card") ? "card" : null;
  }
  if (customerMethod !== "local") return null;
  const localMethods = supportedMethods.filter((value): value is FlutterwaveFundingMethod =>
    value === "mobile_money" || value === "bank_transfer",
  );
  if (preferredLocalMethod && localMethods.includes(preferredLocalMethod as FlutterwaveFundingMethod)) {
    return preferredLocalMethod as FlutterwaveFundingMethod;
  }
  return localMethods[0] ?? null;
}

/** Optional customer contact phone. Returns null when blank and undefined when malformed. */
export function normalizeOptionalPhoneNumber(value: string | null | undefined): string | null | undefined {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("0") ? digits.slice(1) : digits;
  return /^\d{7,10}$/.test(normalized) ? normalized : undefined;
}

/** Format card expiry input as MM/YY while accepting a 4-digit year too. */
export function formatCardExpiryInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  return digits.length > 2 ? digits.slice(0, 2) + "/" + digits.slice(2) : digits;
}

/** Parse and validate a card expiry value entered as MM/YY or MM/YYYY. */
export function parseCardExpiry(
  value: string,
  currentDate: Date = new Date(),
): { month: string; year: string } | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 4 && digits.length !== 6) return null;
  const month = digits.slice(0, 2);
  const year = digits.slice(2);
  const monthNumber = Number(month);
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return null;
  const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  if (!Number.isInteger(fullYear) || fullYear < currentYear ||
      (fullYear === currentYear && monthNumber < currentMonth)) return null;
  return { month, year };
}

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
    return providers.filter((provider) => {
      if (!provider.enabled) return false;
      if (provider.id === "paystack") return true;
      const flutterwaveMethods = provider.paymentMethods ?? provider.paymentOptions;
      return provider.id === "flutterwave" && flutterwaveMethods?.includes("card") === true;
    });
  }
  if (method === "local") {
    return providers.filter((provider) => {
      const flutterwaveMethods = provider.paymentMethods ?? provider.paymentOptions;
      return provider.enabled && (
        (provider.id === "paystack" && provider.localPayments === true) ||
        (provider.id === "flutterwave" && flutterwaveMethods?.some((option) => option !== "card") === true)
      );
    }).sort((a, b) => Number(b.id === "flutterwave") - Number(a.id === "flutterwave"));
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
