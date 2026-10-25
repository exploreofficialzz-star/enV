import assert from "node:assert/strict";
import test from "node:test";
import { buildGeminiBody, createGeminiAdapter } from "./gemini.ts";
import type { AdapterRequest } from "../../types.ts";

function request(): AdapterRequest {
  return {
    capability: "AUDIO_ANALYSIS",
    model: "gemini-3.8-flash",
    system: "Analyze the supplied audio and answer in JSON.",
    user: [
      { type: "text", text: "Analyze this music excerpt." },
      { type: "audio", mimeType: "audio/wav", dataBase64: "UklGRg==", filename: "excerpt.wav" },
    ],
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["genre"],
      properties: { genre: { type: ["string", "null"] } },
    },
    structuredSupport: "json-schema",
    schemaName: "music_analysis",
    maxOutputTokens: 100,
    temperature: 0,
    privacy: "sensitive",
    signal: new AbortController().signal,
  };
}

test("Gemini adapter registers and sends audio for AUDIO_ANALYSIS tasks", () => {
  const adapter = createGeminiAdapter({ apiKey: () => "test-secret" });
  assert.equal(adapter.supports("AUDIO_ANALYSIS", "gemini-3.8-flash"), true);
  const body = buildGeminiBody(request()) as {
    contents: Array<{ parts: Array<Record<string, unknown>> }>;
    generationConfig: Record<string, unknown>;
  };
  assert.deepEqual(body.contents[0]?.parts[0], { text: "Analyze this music excerpt." });
  assert.deepEqual(body.contents[0]?.parts[1], { inlineData: { mimeType: "audio/wav", data: "UklGRg==" } });
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.ok(body.generationConfig.responseJsonSchema);
});
