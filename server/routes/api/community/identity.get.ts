import { defineHandler } from "nitro/h3";
import { isSameOriginRequest, jsonResponse } from "../../../../src/lib/billing/http.server";
import { CommunityError, getCommunityIdentity } from "../../../../src/lib/community/community.server";

export default defineHandler(async (event) => {
  const request = event.req;
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REQUEST_BLOCKED" }, 403);
  try {
    return jsonResponse({ ok: true, data: await getCommunityIdentity(request) });
  } catch (error) {
    if (error instanceof CommunityError) {
      return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
    }
    return jsonResponse({ ok: false, error: "COMMUNITY_IDENTITY_UNAVAILABLE", message: "Your account identity could not be checked." }, 503);
  }
});
