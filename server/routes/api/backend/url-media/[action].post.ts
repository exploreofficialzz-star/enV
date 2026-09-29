import { defineHandler } from "nitro/h3";
import { backendConfig, joinUrl } from "../../../../../backend/config";
import { optionsResponse, proxyRequest, unavailable, jsonResponse } from "../../../../../backend/http";

export default defineHandler(async (event) => {
  if (event.req.method === "OPTIONS") return optionsResponse();
  const action = String(event.context.params?.action || "");
  if (action !== "info" && action !== "download") return jsonResponse({ error: "URL media action must be info or download." }, 404);
  const upstream = backendConfig().urlMedia;
  if (!upstream) return unavailable("The URL media processor");
  return proxyRequest(event.req, joinUrl(upstream, action));
});
