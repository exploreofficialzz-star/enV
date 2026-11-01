import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse } from "../../../../src/lib/billing/http.server";
import { FeedbackError, listFeedbackTickets } from "../../../../src/lib/feedback/feedback.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  try { return jsonResponse({ ok: true, data: await listFeedbackTickets(request) }); }
  catch (error) {
    if (error instanceof FeedbackError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "FEEDBACK_INBOX_UNAVAILABLE", message: "The developer feedback inbox is temporarily unavailable." }, 503);
  }
});
