import { normalizeCountryCode, getCountryPaymentProfile } from "./country-routing";
import { isPaystackLocalCustomer } from "./provider-config";
import { getPaystackFundingOption, minimumPaystackAmountMinor, TOKEN_PACKS } from "./paystack.server";
import { getFlutterwaveFundingOption } from "./flutterwave.server";

/**
 * Provider-neutral wallet funding catalogue.
 * Provider adapters remain isolated: this module combines their availability
 * without making Flutterwave depend on Paystack checkout or its credentials.
 */
function publicOrigin(): string | null {
  const raw = process.env.BETTER_AUTH_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const production = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    if (parsed.protocol !== "https:" && production) return null;
    return parsed.origin;
  } catch { return null; }
}

export async function getFundingOptions(countryCode: string | null = null) {
  // The Paystack adapter is eligible only for the merchant's own country.
  // Flutterwave is independently resolved against the customer's Flutterwave
  // country profile, including all markets configured for that merchant.
  const paystackIsLocal = isPaystackLocalCustomer(countryCode, process.env);
  const [paystack, flutterwave] = await Promise.all([
    paystackIsLocal ? getPaystackFundingOption(countryCode) : Promise.resolve(null),
    getFlutterwaveFundingOption(countryCode),
  ]);

  const refundDisputeHandlingApproved =
    process.env.BILLING_REFUND_DISPUTE_HANDLING_APPROVED === "true";
  const launchChecksPassed =
    process.env.BILLING_LAUNCH_ENABLED === "true" &&
    process.env.BILLING_ENFORCEMENT_ENABLED === "true" &&
    refundDisputeHandlingApproved && Boolean(publicOrigin());

  const cryptomusMerchantId = process.env.CRYPTOMUS_MERCHANT_ID?.trim() ?? "";
  const cryptomusApiKey = process.env.CRYPTOMUS_PAYMENT_API_KEY?.trim() ?? "";
  const cryptoPricePerTokenMinor = 1;
  const cryptomusEnabled = launchChecksPassed &&
    process.env.CRYPTOMUS_PROVIDER_APPROVED === "true" &&
    /^[a-f0-9-]{36}$/i.test(cryptomusMerchantId) &&
    Boolean(cryptomusApiKey) &&
    cryptoPricePerTokenMinor !== null;

  const packsFor = (price: number, currency: string) => TOKEN_PACKS.map((tokens) => ({
    tokens,
    amountMinor: tokens * price,
    currency,
    enabled: cryptomusEnabled,
  }));

  const cryptomusMessage = cryptomusEnabled
    ? "Choose a token pack. enV verifies the final crypto invoice before crediting your wallet."
    : process.env.CRYPTOMUS_PROVIDER_APPROVED !== "true"
      ? "Crypto payments are unavailable until Cryptomus onboarding and compliance approval are complete."
      : !refundDisputeHandlingApproved
        ? "Crypto payments are disabled until refund and dispute reconciliation has been approved."
        : "Secure crypto checkout is not configured for this deployment.";

  const providers = [
    ...(paystack ? [paystack] : []),
    ...(flutterwave ? [flutterwave] : []),
    {
      id: "cryptomus" as const,
      label: "Pay with crypto",
      enabled: cryptomusEnabled,
      currency: "USD",
      pricePerTokenMinor: cryptoPricePerTokenMinor,
      packs: packsFor(cryptoPricePerTokenMinor, "USD"),
      message: cryptomusMessage,
    },
  ];
  const firstEnabled = providers.find((provider) => provider.enabled);
  const country = normalizeCountryCode(countryCode);

  return {
    countryCode: country,
    currency: firstEnabled?.currency ?? getCountryPaymentProfile(country)?.currency ?? null,
    enabled: Boolean(firstEnabled),
    provider: firstEnabled?.id ?? null,
    providers,
    anyEnabled: providers.some((provider) => provider.enabled),
    message: !country
      ? "Your country could not be detected. Retry from an online connection to show country-specific payment methods."
      : providers.some((provider) => provider.enabled)
        ? "Payment methods and checkout currency are selected for your detected country."
        : "No approved payment method is currently available for your detected country and currency. No payment was taken.",
  };
}
