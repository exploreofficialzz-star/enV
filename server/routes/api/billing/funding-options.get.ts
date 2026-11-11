import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { getFundingOptions } from "../../../../src/lib/billing/paystack.server";
import { getCustomerCountry } from "../../../../src/lib/billing/country-routing";

export default defineHandler((event) => {
  const countryCode = getCustomerCountry(event.req);
  return jsonResponse({ ok: true, data: getFundingOptions(countryCode) });
});
