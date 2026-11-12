import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { getFundingOptions } from "../../../../src/lib/billing/paystack.server";
import { getCustomerCountry } from "../../../../src/lib/billing/country-routing";

/**
 * Public funding options intentionally exclude converted payment amounts and
 * raw exchange-rate observations. The browser renders enV's USD reference
 * price; the purchase endpoint recalculates and consumes the FX quote server-side.
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
      // Preserve a stable, client-safe field during the API contract migration.
      pricePerTokenMinor: null,
      packs: provider.packs.map((pack) => ({
        tokens: pack.tokens,
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
