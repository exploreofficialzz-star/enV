import assert from "node:assert/strict";
import test from "node:test";
import { buildGeminiInteractionBody, createGeminiAdapter } from "./gemini.ts";
import type { AdapterRequest } from "../../types.ts";

function request(): AdapterRequest {
  return {
    capability: "AUDIO_UNDERSTANDING",
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

test("Gemini audio-understanding route preserves audio input and disables provider storage", () => {
  const adapter = createGeminiAdapter({ apiKey: () => "test-secret" });
  assert.equal(adapter.supports("AUDIO_UNDERSTANDING", "gemini-3.8-flash"), true);
  const body = buildGeminiInteractionBody(request()) as {
    input: Array<Record<string, unknown>>;
    store: boolean;
  };
  assert.deepEqual(body.input[0], { type: "text", text: "Analyze this music excerpt." });
  assert.deepEqual(body.input[1], { type: "audio", data: "UklGRg==", mime_type: "audio/wav" });
  assert.equal(body.store, false);
});
