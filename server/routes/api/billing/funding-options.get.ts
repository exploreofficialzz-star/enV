import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { getFundingOptions } from "../../../../src/lib/billing/paystack.server";
import { getCustomerCountry } from "../../../../src/lib/billing/country-routing";
import { isCustomerPaymentMethodAvailable } from "../../../../src/lib/billing/payment-methods";

/**
 * Public funding options include server-calculated local pack amounts so the
 * wallet can show the real country price. Raw exchange-rate observations and
 * purchase quote metadata remain server-side; checkout independently re-quotes.
 */
function publicFundingOptions(funding: Awaited<ReturnType<typeof getFundingOptions>>) {
  // The browser receives customer-facing methods only. Gateway identity and
  // provider fallback order stay entirely on the server.
  const providers = funding.providers;
  return {
    countryCode: funding.countryCode,
    currency: funding.currency,
    enabled: funding.enabled,
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
