import { defineHandler } from "nitro/h3";
import { verifyAndCreditPaystackReference } from "../../../../../src/lib/billing/paystack.server";

function walletRedirect(status: "success" | "pending" | "failed") {
  let origin = "https://envtools.store";
  try {
    const configured = process.env.BETTER_AUTH_URL;
    if (configured) {
      const url = new URL(configured);
      if (url.protocol === "https:" || process.env.NODE_ENV !== "production") origin = url.origin;
    }
  } catch { /* Fall back to the canonical public origin. */ }
  return Response.redirect(new URL(`/wallet?payment=${status}`, origin), 302);
}

export default defineHandler(async (event) => {
  const url = new URL(event.req.url);
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref") ?? "";
  try {
    await verifyAndCreditPaystackReference(reference);
    return walletRedirect("success");
  } catch (error) {
    const candidate = error as { code?: unknown };
    if (candidate.code === "PAYMENT_NOT_CONFIRMED") return walletRedirect("pending");
    return walletRedirect("failed");
  }
});
