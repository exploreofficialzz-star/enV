import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { getFundingOptions } from "../../../../src/lib/billing/paystack.server";
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
  return {
    countryCode: funding.countryCode,
    currency: funding.currency,
    message: funding.message,
    methods: {
      card: isCustomerPaymentMethodAvailable(providers, "card"),
      local: isCustomerPaymentMethodAvailable(providers, "local"),
      more: isCustomerPaymentMethodAvailable(providers, "more"),
    },
  };
}

export default defineHandler(async (event) => {
  const countryCode = getCustomerCountry(event.req);
  const funding = await getFundingOptions(countryCode);
  return jsonResponse({ ok: true, data: publicFundingOptions(funding) });
});
