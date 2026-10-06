import { defineHandler } from "nitro/h3";
import { backendConfig } from "../../../../backend/config";
import { optionsResponse, proxyRequest, unavailable } from "../../../../backend/http";

export default defineHandler(async (event) => {
  if (event.req.method === "OPTIONS") return optionsResponse();
  const upstream = backendConfig().media;
  if (!upstream) return unavailable("The FFmpeg media processor", "MEDIA_PROCESSOR_URL");
  return proxyRequest(event.req, upstream);
});
