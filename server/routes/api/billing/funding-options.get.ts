import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { getFundingOptions } from "../../../../src/lib/billing/funding.server";
import { getCustomerCountry } from "../../../../src/lib/billing/country-routing";
import { isCustomerPaymentMethodAvailable } from "../../../../src/lib/billing/payment-methods";

/**
 * Return only customer-visible payment methods and the detected country/currency.
 * Provider identities, credentials and provider-specific messages never leave the server.
 * Checkout independently re-resolves and re-quotes before initializing a payment.
 */
function publicFundingOptions(funding: Awaited<ReturnType<typeof getFundingOptions>>) {
  // The browser receives customer-facing methods only. Gateway identity and
  // provider fallback order stay entirely on the server.
  const providers = funding.providers;
  const customerVisibleProviders = providers.filter((provider) => provider.id !== "flutterwave");
  const flutterwave = providers.find((provider) => provider.id === "flutterwave") as
    | { enabled?: boolean; currency?: string; paymentMethods?: string[]; message?: string }
    | undefined;
  return {
    countryCode: funding.countryCode,
    currency: funding.currency,
    message: funding.message,
    methods: {
      card: isCustomerPaymentMethodAvailable(customerVisibleProviders, "card"),
      local: isCustomerPaymentMethodAvailable(customerVisibleProviders, "local"),
      more: isCustomerPaymentMethodAvailable(customerVisibleProviders, "more"),
      flutterwave: flutterwave?.enabled === true,
    },
    flutterwave: {
      enabled: flutterwave?.enabled === true,
      currency: flutterwave?.currency ?? null,
      paymentMethods: flutterwave?.paymentMethods ?? [],
    },
  };
}

export default defineHandler(async (event) => {
  const countryCode = getCustomerCountry(event.req);
  const funding = await getFundingOptions(countryCode);
  return jsonResponse({ ok: true, data: publicFundingOptions(funding) });
});
