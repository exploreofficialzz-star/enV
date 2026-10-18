import { defineHandler } from "nitro/h3";
import { offlineWalletAvailability } from "../../../../../src/lib/billing/offline.server";
import { jsonResponse } from "../../../../../src/lib/billing/http.server";

/** Public, non-sensitive feature status; never discloses signing secrets or provider configuration. */
export default defineHandler(() => jsonResponse({ ok: true, data: offlineWalletAvailability() }));
