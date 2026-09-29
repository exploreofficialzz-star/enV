import { defineHandler } from "nitro/h3";
import { backendConfig } from "../../../../backend/config";
import { optionsResponse, proxyRequest, responseAsBlob, unavailable } from "../../../../backend/http";

async function proxyBlobJob(request: Request, upstream: string) {
  const payload = await request.json() as {
    toolId?: string;
    operation?: string;
    outputName?: string;
    params?: Record<string, unknown>;
    files?: Array<{ url?: string; name?: string }>;
  };
  const files = Array.isArray(payload.files) ? payload.files : [];
  if (!files.length || files.some((file) => typeof file.url !== "string")) {
    return new Response(JSON.stringify({ error: "At least one valid uploaded media file is required." }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const form = new FormData();
  for (const [index, file] of files.entries()) {
    const response = await fetch(file.url as string);
    if (!response.ok || !response.body) throw new Error(`Could not read uploaded media file ${index + 1}.`);
    const blob = await response.blob();
    if (files.length === 1) form.append("file", blob, file.name || `input-${index + 1}`);
    else form.append("files", blob, file.name || `input-${index + 1}`);
  }
  form.append("toolId", String(payload.toolId || "media-tool"));
  form.append("operation", String(payload.operation || ""));
  form.append("outputName", String(payload.outputName || "output.bin"));
  form.append("params", JSON.stringify(payload.params || {}));
  return proxyRequest(new Request("http://enV.internal", { method: "POST", body: form }), upstream);
}

export default defineHandler(async (event) => {
  if (event.req.method === "OPTIONS") return optionsResponse();
  const upstream = backendConfig().media;
  if (!upstream) return unavailable("The FFmpeg media processor");
  if ((event.req.headers.get("content-type") || "").includes("application/json")) return responseAsBlob(await proxyBlobJob(event.req, upstream), "media-result");
  return proxyRequest(event.req, upstream);
});
