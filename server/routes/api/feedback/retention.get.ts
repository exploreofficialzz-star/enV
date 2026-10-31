import { defineHandler } from "nitro/h3";
import { jsonResponse } from "../../../../src/lib/billing/http.server";
import { FeedbackError, runFeedbackRetention } from "../../../../src/lib/feedback/feedback.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try { return jsonResponse({ ok: true, data: await runFeedbackRetention(request) }); }
  catch (error) {
    if (error instanceof FeedbackError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    return jsonResponse({ ok: false, error: "FEEDBACK_RETENTION_UNAVAILABLE", message: "Feedback retention could not complete." }, 503);
  }
});
