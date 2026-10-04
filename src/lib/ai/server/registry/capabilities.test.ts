import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITIES } from "../../types.ts";
import { createMockAdapter } from "../providers/mock.ts";
import { testConfig } from "../test-utils.ts";
import { capabilityMatrix } from "./capabilities.ts";
import { MODEL_REGISTRY } from "./models.ts";

const adapters = () => ({ groq: createMockAdapter({ id: "groq" }), openrouter: createMockAdapter({ id: "openrouter" }), gemini: createMockAdapter({ id: "gemini" }) });
const row = (rows: ReturnType<typeof capabilityMatrix>, c: string) => rows.find((r) => r.capability === c)!;

test("the matrix has one row per capability and never lists the mock provider as a real model", () => {
  const rows = capabilityMatrix(MODEL_REGISTRY, testConfig(), adapters());
  assert.deepEqual(rows.map((r) => r.capability), [...CAPABILITIES]);
  for (const r of rows) assert.ok(r.models.every((m) => !m.startsWith("mock:")), r.capability);
  assert.deepEqual(row(rows, "VISION_ANALYSIS").providers, ["gemini"]);
  assert.deepEqual(row(rows, "SPEECH_TO_TEXT").providers, ["groq"]);
  assert.deepEqual(row(rows, "STRUCTURED_TEXT").providers.sort(), ["gemini", "groq", "openrouter"]);
});

test("usableNow follows configuration: keys, provider order, disabled models", () => {
  const all = capabilityMatrix(MODEL_REGISTRY, testConfig(), adapters());
  assert.deepEqual(row(all, "SPEECH_TO_TEXT").usableNow.sort(), ["groq:whisper-large-v3", "groq:whisper-large-v3-turbo"]);
  const none = capabilityMatrix(MODEL_REGISTRY, testConfig({ GROQ_API_KEY: "", OPENROUTER_API_KEY: "", GEMINI_API_KEY: "" }), adapters());
  for (const r of none) assert.deepEqual(r.usableNow, [], r.capability);
  const noGroq = capabilityMatrix(MODEL_REGISTRY, testConfig({ AI_PROVIDER_ORDER: "openrouter,gemini" }), adapters());
  assert.deepEqual(row(noGroq, "SPEECH_TO_TEXT").usableNow, []);
  const disabled = capabilityMatrix(MODEL_REGISTRY, testConfig({ AI_DISABLED_MODELS: "gemini:gemini-3.8-flash" }), adapters());
  assert.deepEqual(row(disabled, "VISION_ANALYSIS").usableNow, []);
});

test("an adapter that does not support a capability removes it from usableNow", () => {
  const picky = { ...adapters(), groq: createMockAdapter({ id: "groq", supports: (c) => c !== "SPEECH_TO_TEXT" }) };
  assert.deepEqual(row(capabilityMatrix(MODEL_REGISTRY, testConfig(), picky), "SPEECH_TO_TEXT").usableNow, []);
});
