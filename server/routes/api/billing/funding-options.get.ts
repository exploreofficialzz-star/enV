import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { getFundingOptions } from "../../../../src/lib/billing/paystack.server";

export default defineHandler(() => jsonResponse({ ok: true, data: getFundingOptions() }));
