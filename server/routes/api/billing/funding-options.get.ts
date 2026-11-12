import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { getFundingOptions } from "../../../../src/lib/billing/paystack.server";
import { getCustomerCountry } from "../../../../src/lib/billing/country-routing";

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
      card: providers.some((provider) =>
        provider.enabled && (provider.id === "paystack" || provider.id === "flutterwave"),
      ),
      local: providers.some((provider) =>
        provider.enabled && (
          (provider.id === "paystack" && "localPayments" in provider && provider.localPayments === true) ||
          (provider.id === "flutterwave" && "paymentOptions" in provider &&
            provider.paymentOptions?.some((option) => option !== "card") === true)
        ),
      ),
      more: providers.some((provider) => provider.id === "cryptomus" && provider.enabled),
    },
  };
}

export default defineHandler(async (event) => {
  const countryCode = getCustomerCountry(event.req);
  const funding = await getFundingOptions(countryCode);
  return jsonResponse({ ok: true, data: publicFundingOptions(funding) });
});
