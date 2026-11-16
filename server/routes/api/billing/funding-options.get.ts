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
  // The browser receives customer-facing method availability only. Provider
  // identities and routing remain server-side.
  const providers = funding.providers;
  const flutterwave = providers.find((provider) => provider.id === "flutterwave") as
    | {
        enabled?: boolean;
        currency?: string;
        paymentMethods?: string[];
        mobileNetworks?: Array<{ network: string; name: string }>;
        message?: string;
      }
    | undefined;
  return {
    countryCode: funding.countryCode,
    currency: funding.currency,
    message: funding.message,
    methods: {
      card: isCustomerPaymentMethodAvailable(providers, "card"),
      local: isCustomerPaymentMethodAvailable(providers, "local"),
      more: isCustomerPaymentMethodAvailable(providers, "more"),
    },
    flutterwave: {
      enabled: flutterwave?.enabled === true,
      currency: flutterwave?.currency ?? null,
      paymentMethods: flutterwave?.paymentMethods ?? [],
      mobileNetworks: flutterwave?.mobileNetworks ?? [],
    },
  };
}

export default defineHandler(async (event) => {
  const countryCode = getCustomerCountry(event.req);
  const funding = await getFundingOptions(countryCode);
  return jsonResponse({ ok: true, data: publicFundingOptions(funding) });
});
