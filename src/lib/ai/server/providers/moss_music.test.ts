import assert from "node:assert/strict";
import test from "node:test";
import type { AdapterRequest } from "../../types.ts";
import { createMossMusicAdapter, MOSS_MUSIC_MODEL_ID } from "./moss_music.ts";

function request(patch: Partial<AdapterRequest> = {}): AdapterRequest {
  return {
    capability: "AUDIO_UNDERSTANDING",
    model: MOSS_MUSIC_MODEL_ID,
    system: "Return supported musical tags only. Never provide lyrics.",
    user: [
      { type: "text", text: "Tag genre, mood, instrumentation and production style." },
      { type: "audio", mimeType: "audio/wav", dataBase64: Buffer.from("wav-sample").toString("base64"), filename: "music-samples.wav" },
    ],
    jsonSchema: { type: "object", additionalProperties: false, properties: { genre: { type: ["string", "null"] } } },
    structuredSupport: "json-schema",
    maxOutputTokens: 1200,
    temperature: 0.1,
    privacy: "sensitive",
    schemaName: "music-analysis",
    signal: new AbortController().signal,
    ...patch,
  };
}

test("MOSS-Music adapter requires both a private HTTPS endpoint and server token", () => {
  assert.equal(createMossMusicAdapter({ endpoint: () => null, token: () => "secret" }).isConfigured(), false);
  assert.equal(createMossMusicAdapter({ endpoint: () => "https://service.modal.run/analyze", token: () => null }).isConfigured(), false);
  assert.equal(createMossMusicAdapter({ endpoint: () => "https://service.modal.run/analyze", token: () => "secret" }).isConfigured(), true);
});

test("adapter posts sampled audio and the structured sound-tagging task, then maps usage", async () => {
  let seenUrl = "";
  let seenAuthorization = "";
  let seenBody: Record<string, unknown> = {};
  const adapter = createMossMusicAdapter({
    endpoint: () => "https://service.modal.run/analyze",
    token: () => "test-long-private-token",
    fetchImpl: async (url, init) => {
      seenUrl = url;
      seenAuthorization = new Headers(init.headers).get("authorization") ?? "";
      seenBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        text: "{\"genre\":\"Afrobeats\",\"lyric_evidence\":\"\",\"warnings\":[]}",
        model: "OpenMOSS-Team/MOSS-Music-8B-Instruct",
        finish_reason: "stop",
        compute_seconds: 6.25,
        usage: { input_tokens: 150, output_tokens: 40, total_tokens: 190 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const response = await adapter.execute(request());
  assert.equal(seenUrl, "https://service.modal.run/analyze");
  assert.equal(seenAuthorization, "Bearer test-long-private-token");
  assert.equal(seenBody.mime_type, "audio/wav");
  assert.equal(seenBody.prompt, "Tag genre, mood, instrumentation and production style.");
  assert.equal(seenBody.json_schema !== null, true);
  assert.equal(seenBody.audio_base64, request().user.find((part) => part.type === "audio")?.type === "audio" ? (request().user.find((part) => part.type === "audio") as { dataBase64: string }).dataBase64 : "");
  assert.equal(response.usage.inputTokens, 150);
  assert.equal(response.usage.outputTokens, 40);
  assert.equal(response.usage.computeSeconds, 6.25);
  assert.equal(response.finishReason, "stop");
});

test("adapter rejects unrelated capabilities and does not send text-only inputs", async () => {
  const adapter = createMossMusicAdapter({
    endpoint: () => "https://service.modal.run/analyze",
    token: () => "secret",
    fetchImpl: async () => new Response("{}", { status: 200 }),
  });
  await assert.rejects(
    adapter.execute(request({ capability: "TEXT_GENERATION" })),
    (error: unknown) => error instanceof Error && error.message.length > 0,
  );
  await assert.rejects(
    adapter.execute(request({ user: [{ type: "text", text: "not an audio request" }] })),
    (error: unknown) => error instanceof Error && error.message.length > 0,
  );
});
