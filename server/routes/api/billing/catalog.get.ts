import { defineHandler } from "nitro/h3";
import { publicBillingCatalog } from "../../../../src/lib/billing/catalog";
import { jsonResponse } from "../../../../src/lib/billing/http.server";

export default defineHandler(() => jsonResponse({ ok: true, data: publicBillingCatalog() }));
