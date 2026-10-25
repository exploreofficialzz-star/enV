import { defineHandler } from "nitro/h3";
import { backendConfig, joinUrl } from "../../../../../backend/config";
import { optionsResponse, proxyRequest, jsonResponse } from "../../../../../backend/http";

export default defineHandler(async (event) => {
  if (event.req.method === "OPTIONS") return optionsResponse();
  const action = String(event.context.params?.action || "");
  if (action !== "info" && action !== "download") return jsonResponse({ error: "URL media action must be info or download." }, 404);
  // Preview deployments may not inherit production-only Render env variables.
  // The public Render gateway exposes only this dedicated media route here; no
  // cross-origin browser request or client-side processor secret is required.
  const configured = backendConfig().urlMedia;
  const gateway = "https://env-q3mq.onrender.com/api/backend/url-media";
  // Some older previews were configured with the Render gateway root. Using
  // /info at that root requires privileged processor credentials; use the
  // public, dedicated /api/backend/url-media endpoint instead.
  const upstream = !configured || /^https:\/\/env-q3mq\.onrender\.com\/?$/i.test(configured)
    ? gateway
    : configured;
  return proxyRequest(event.req, joinUrl(upstream, action), "cloud.generic_processing");
});
