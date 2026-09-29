import { defineHandler } from "nitro/h3";
import { backendConfig, joinUrl } from "../../../../backend/config";
import { optionsResponse, proxyRequest, unavailable } from "../../../../backend/http";

export default defineHandler(async (event) => {
  if (event.req.method === "OPTIONS") return optionsResponse();
  const upstream = backendConfig().transcription;
  if (!upstream) return unavailable("The transcription processor");
  return proxyRequest(event.req, joinUrl(upstream, "transcribe"));
});
