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
  return {
    countryCode: funding.countryCode,
    currency: funding.currency,
    enabled: funding.enabled,
    provider: funding.provider,
    anyEnabled: funding.anyEnabled,
    message: funding.message,
    providers: funding.providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      enabled: provider.enabled,
      currency: provider.currency,
      localPayments: "localPayments" in provider && provider.localPayments === true,
      paymentOptions: "paymentOptions" in provider && Array.isArray(provider.paymentOptions)
        ? [...provider.paymentOptions]
        : [],
      // Preserve a stable, client-safe field during the API contract migration.
      pricePerTokenMinor: null,
      packs: provider.packs.map((pack) => ({
        tokens: pack.tokens,
        amountMinor: Number.isSafeInteger(pack.amountMinor) && pack.amountMinor > 0 ? pack.amountMinor : null,
        currency: "currency" in pack && typeof pack.currency === "string" ? pack.currency : provider.currency,
        enabled: "enabled" in pack ? pack.enabled === true : provider.enabled,
        ...("message" in pack && typeof pack.message === "string" ? { message: pack.message } : {}),
      })),
      message: provider.message,
    })),
  };
}

export default defineHandler(async (event) => {
  const countryCode = getCustomerCountry(event.req);
  const funding = await getFundingOptions(countryCode);
  return jsonResponse({ ok: true, data: publicFundingOptions(funding) });
});
