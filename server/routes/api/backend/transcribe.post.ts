import { defineHandler } from "nitro/h3";
import { backendConfig, joinUrl } from "../../../../backend/config";
import { optionsResponse, proxyRequest, responseAsBlob, unavailable } from "../../../../backend/http";

async function proxyBlobTranscription(request: Request, upstream: string) {
  const payload = await request.json() as { fileUrl?: string; fileName?: string; format?: string; language?: string; translate?: boolean; outputName?: string };
  if (!payload.fileUrl) return new Response(JSON.stringify({ error: "A valid uploaded media file is required." }), { status: 400, headers: { "content-type": "application/json" } });
  const source = await fetch(payload.fileUrl);
  if (!source.ok || !source.body) throw new Error("Could not read uploaded media file.");
  const form = new FormData();
  form.append("file", await source.blob(), payload.fileName || "input.bin");
  form.append("format", String(payload.format || "txt"));
  form.append("language", String(payload.language || "auto"));
  form.append("translate", String(Boolean(payload.translate)));
  form.append("outputName", String(payload.outputName || "transcript.txt"));
  return proxyRequest(new Request("http://enV.internal", { method: "POST", body: form }), joinUrl(upstream, "transcribe"));
}

export default defineHandler(async (event) => {
  if (event.req.method === "OPTIONS") return optionsResponse();
  const upstream = backendConfig().transcription;
  if (!upstream) return unavailable("The transcription processor", "TRANSCRIBE_URL");
  if ((event.req.headers.get("content-type") || "").includes("application/json")) return responseAsBlob(await proxyBlobTranscription(event.req, upstream), "transcription-result");
  return proxyRequest(event.req, joinUrl(upstream, "transcribe"));
});
