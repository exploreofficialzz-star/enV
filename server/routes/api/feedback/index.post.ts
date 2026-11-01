import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse, readJsonObject } from "../../../../src/lib/billing/http.server";
import { createFeedbackTicket, FeedbackError } from "../../../../src/lib/feedback/feedback.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  const body = await readJsonObject(request, 24_000);
  if (!body) return jsonResponse({ ok: false, error: "INVALID_JSON", message: "The feedback report is invalid or too large." }, 400);
  try {
    const data = await createFeedbackTicket(request, body);
    return jsonResponse({ ok: true, data }, data.duplicate ? 200 : 201);
  } catch (error) {
    if (error instanceof FeedbackError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "FEEDBACK_SUBMISSION_UNAVAILABLE", message: "The report was not accepted. You can safely retry using the same idempotency key." }, 503);
  }
});
