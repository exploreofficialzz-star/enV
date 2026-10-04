import assert from "node:assert/strict";
import test from "node:test";
import { AiError } from "../../errors.ts";
import type { AdapterRequest } from "../../types.ts";
import { toGeminiSchema, buildGeminiBody, createGeminiAdapter, parseGeminiResponse } from "./gemini.ts";
import { audioFilename, createGroqAdapter } from "./groq.ts";
import { parseRetryAfter } from "./http.ts";
import type { FetchLike } from "./http.ts";
import { createOpenRouterAdapter } from "./openrouter.ts";

const KEY = "sk-test-SECRETKEY-0123456789";
const schema = { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string", minLength: 1, maxLength: 10 } } };

function request(overrides: Partial<AdapterRequest> = {}): AdapterRequest {
  return {
    capability: "STRUCTURED_TEXT",
    model: "some/model",
    system: "system prompt",
    user: [{ type: "text", text: "hello" }],
    jsonSchema: schema,
    structuredSupport: "json-schema",
    schemaName: "test_schema",
    maxOutputTokens: 100,
    temperature: 0.3,
    privacy: "standard",
    signal: new AbortController().signal,
    ...overrides,
  };
}

function recorder(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("no response queued");
    return next;
  };
  return { calls, fetchImpl };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const chatOk = (content: unknown = '{"a":"x"}', extra: Record<string, unknown> = {}) => json({ model: "served/model", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }, ...extra });
const body = (call: { init: RequestInit }) => JSON.parse(call.init.body as string) as Record<string, any>;
const headerOf = (call: { init: RequestInit }, name: string) => (call.init.headers as Record<string, string>)[name];

test("openrouter: request shape, privacy routing flags and response normalization", async () => {
  const { calls, fetchImpl } = recorder([chatOk(), chatOk()]);
  const adapter = createOpenRouterAdapter({ apiKey: () => KEY, fetchImpl });
  const result = await adapter.execute(request({ model: "openai/gpt-oss-20b" }));
  assert.equal(calls[0]!.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(headerOf(calls[0]!, "authorization"), `Bearer ${KEY}`);
  const sent = body(calls[0]!);
  assert.equal(sent.model, "openai/gpt-oss-20b");
  assert.equal(sent.max_tokens, 100);
  assert.equal(sent.max_completion_tokens, undefined);
  assert.deepEqual(sent.messages, [{ role: "system", content: "system prompt" }, { role: "user", content: "hello" }]);
  assert.equal(sent.response_format.type, "json_schema");
  assert.equal(sent.response_format.json_schema.strict, false);
  assert.equal(sent.response_format.json_schema.name, "test_schema");
  assert.deepEqual(sent.provider, { require_parameters: true });
  assert.equal(result.text, '{"a":"x"}');
  assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 7, totalTokens: 18, audioSeconds: null });
  assert.equal(result.finishReason, "stop");

  await adapter.execute(request({ privacy: "sensitive" }));
  assert.deepEqual(body(calls[1]!).provider, { require_parameters: true, data_collection: "deny" });
  const plain = recorder([chatOk()]);
  await createOpenRouterAdapter({ apiKey: () => KEY, fetchImpl: plain.fetchImpl }).execute(request({ jsonSchema: undefined, capability: "TEXT_GENERATION" }));
  assert.equal(body(plain.calls[0]!).provider, undefined);
  assert.equal(body(plain.calls[0]!).response_format, undefined);
});

test("upstream HTTP errors map to normalized codes and never expose keys or bodies", async () => {
  const table: [number, string][] = [[401, "AI_AUTH_ERROR"], [403, "AI_AUTH_ERROR"], [402, "AI_QUOTA_EXCEEDED"], [404, "AI_UNSUPPORTED_CAPABILITY"], [422, "AI_UNSUPPORTED_CAPABILITY"], [429, "AI_RATE_LIMITED"], [500, "AI_PROVIDER_UNAVAILABLE"], [503, "AI_PROVIDER_UNAVAILABLE"], [504, "AI_PROVIDER_TIMEOUT"]];
  for (const [status, code] of table) {
    const { fetchImpl } = recorder([new Response(`upstream said: echo of your prompt and ${KEY}`, { status, headers: { "retry-after": "7" } })]);
    const adapter = createOpenRouterAdapter({ apiKey: () => KEY, fetchImpl });
    await assert.rejects(adapter.execute(request()), (error: unknown) => {
      assert.ok(error instanceof AiError);
      assert.equal(error.code, code, String(status));
      assert.equal(error.upstreamStatus, status);
      if (status === 429) assert.equal(error.retryAfterSeconds, 7);
      const dump = `${error.message} ${error.stack} ${JSON.stringify(error)} ${String(error)}`;
      assert.ok(!dump.includes("SECRETKEY"), "key leaked");
      assert.ok(!dump.includes("echo of your prompt"), "body leaked");
      return true;
    });
  }
});

test("transport failures: network error, timeout and cancellation are distinguished", async () => {
  const net = createOpenRouterAdapter({ apiKey: () => KEY, fetchImpl: recorder([new TypeError("fetch failed")]).fetchImpl });
  await assert.rejects(net.execute(request()), { code: "AI_PROVIDER_UNAVAILABLE" });

  const hanging: FetchLike = (_url, init) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)));
  const adapter = createOpenRouterAdapter({ apiKey: () => KEY, fetchImpl: hanging });
  // AbortSignal.timeout() timers are unref'd, so hold the event loop open like a real socket would.
  const keepAlive = setTimeout(() => {}, 5_000);
  try {
    await assert.rejects(adapter.execute(request({ signal: AbortSignal.timeout(15) })), { code: "AI_PROVIDER_TIMEOUT" });
    const controller = new AbortController();
    const pending = adapter.execute(request({ signal: controller.signal }));
    controller.abort();
    await assert.rejects(pending, { code: "AI_REQUEST_CANCELLED" });
  } finally {
    clearTimeout(keepAlive);
  }
});

test("malformed or empty provider responses are bad responses; inline errors are mapped", async () => {
  const run = (response: Response) => createOpenRouterAdapter({ apiKey: () => KEY, fetchImpl: recorder([response]).fetchImpl }).execute(request());
  await assert.rejects(run(new Response("<html>oops</html>", { status: 200 })), { code: "AI_PROVIDER_BAD_RESPONSE" });
  await assert.rejects(run(json({ choices: [] })), { code: "AI_PROVIDER_BAD_RESPONSE" });
  await assert.rejects(run(chatOk("   ")), { code: "AI_PROVIDER_BAD_RESPONSE" });
  await assert.rejects(run(json({ error: { code: 429, message: "slow down" } })), { code: "AI_RATE_LIMITED" });
  const parts = await run(chatOk([{ type: "text", text: '{"a":' }, { type: "text", text: '"y"}' }]));
  assert.equal(parts.text, '{"a":"y"}');
  const truncated = await run(json({ choices: [{ message: { content: "x" }, finish_reason: "length" }] }));
  assert.equal(truncated.finishReason, "length");
  assert.equal(truncated.usage.inputTokens, null);
});

test("adapters refuse to run without a key or with content they cannot carry", async () => {
  const noKey = createOpenRouterAdapter({ apiKey: () => null, fetchImpl: recorder([]).fetchImpl });
  assert.equal(noKey.isConfigured(), false);
  await assert.rejects(noKey.execute(request()), { code: "AI_CONFIGURATION_ERROR" });
  const withKey = createOpenRouterAdapter({ apiKey: () => KEY, fetchImpl: recorder([]).fetchImpl });
  await assert.rejects(withKey.execute(request({ user: [{ type: "image", mimeType: "image/png", dataBase64: "AAAA" }] })), { code: "AI_UNSUPPORTED_CAPABILITY" });
  assert.equal(withKey.supports("VISION_ANALYSIS", "x"), false);
  assert.equal(withKey.supports("STRUCTURED_TEXT", "x"), true);
});

test("groq chat: max_completion_tokens and strict schemas only when the model supports strict mode", async () => {
  const { calls, fetchImpl } = recorder([chatOk(), chatOk()]);
  const adapter = createGroqAdapter({ apiKey: () => KEY, fetchImpl });
  await adapter.execute(request({ model: "openai/gpt-oss-20b", structuredSupport: "strict" }));
  assert.equal(calls[0]!.url, "https://api.groq.com/openai/v1/chat/completions");
  const sent = body(calls[0]!);
  assert.equal(sent.max_completion_tokens, 100);
  assert.equal(sent.max_tokens, undefined);
  assert.equal(sent.response_format.json_schema.strict, true);
  assert.equal(sent.provider, undefined);
  await adapter.execute(request({ structuredSupport: "json-schema" }));
  assert.equal(body(calls[1]!).response_format.json_schema.strict, false);
});

test("groq speech-to-text: multipart upload, verbose_json parsing, no manual content-type", async () => {
  const transcription = json({ text: " Hello world ", language: "english", duration: 12.5, segments: [{ start: 0, end: 2, text: " Hello" }, { start: 2, end: 4.5, text: " world " }, { start: "x", end: 1, text: "bad" }] });
  const { calls, fetchImpl } = recorder([transcription]);
  const adapter = createGroqAdapter({ apiKey: () => KEY, fetchImpl });
  const audio = Buffer.from("ID3-fake-audio-bytes").toString("base64");
  const result = await adapter.execute(request({ capability: "SPEECH_TO_TEXT", model: "whisper-large-v3-turbo", jsonSchema: undefined, language: "en", user: [{ type: "audio", mimeType: "audio/mpeg", dataBase64: audio, filename: "../../etc/meeting notes.wav" }] }));
  assert.equal(calls[0]!.url, "https://api.groq.com/openai/v1/audio/transcriptions");
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers.authorization, `Bearer ${KEY}`);
  assert.equal(headers["content-type"], undefined);
  const form = calls[0]!.init.body as FormData;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("model"), "whisper-large-v3-turbo");
  assert.equal(form.get("response_format"), "verbose_json");
  assert.equal(form.get("temperature"), "0");
  assert.equal(form.get("language"), "en");
  const file = form.get("file") as File;
  assert.match(file.name, /^[A-Za-z0-9_-]+\.mp3$/);
  assert.equal(file.size, Buffer.from(audio, "base64").length);
  assert.deepEqual(result.transcript?.segments, [{ start: 0, end: 2, text: "Hello" }, { start: 2, end: 4.5, text: "world" }]);
  assert.equal(result.transcript?.language, "english");
  assert.equal(result.usage.audioSeconds, 12.5);
  assert.equal(adapter.supports("SPEECH_TO_TEXT", "whisper-large-v3"), true);
  assert.equal(adapter.supports("SPEECH_TO_TEXT", "openai/gpt-oss-20b"), false);
  assert.equal(audioFilename("audio/x-m4a"), "audio.m4a");
  await assert.rejects(adapter.execute(request({ capability: "SPEECH_TO_TEXT", model: "whisper-large-v3", user: [{ type: "text", text: "no audio" }] })), { code: "AI_INVALID_INPUT" });
});

test("gemini: key travels in a header, schema is reduced, image and thinking tokens are handled", async () => {
  const geminiOk = json({ candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: '{"a":"ok"}' }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 10, thoughtsTokenCount: 40, totalTokenCount: 80 }, modelVersion: "gemini-3.8-flash-001" });
  const { calls, fetchImpl } = recorder([geminiOk]);
  const adapter = createGeminiAdapter({ apiKey: () => KEY, fetchImpl });
  const result = await adapter.execute(request({ capability: "VISION_ANALYSIS", model: "gemini-3.8-flash", user: [{ type: "text", text: "describe" }, { type: "image", mimeType: "image/png", dataBase64: "iVBORw0KGgo=" }] }));
  assert.equal(calls[0]!.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  assert.ok(!calls[0]!.url.includes("SECRETKEY") && !calls[0]!.url.includes("key="), "key must not be in the URL");
  assert.equal(headerOf(calls[0]!, "x-goog-api-key"), KEY);
  const sent = body(calls[0]!);
  assert.deepEqual(sent.systemInstruction, { parts: [{ text: "system prompt" }] });
  assert.deepEqual(sent.contents[0].parts[1], { inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } });
  assert.equal(sent.generationConfig.responseMimeType, "application/json");
  assert.equal(sent.generationConfig.maxOutputTokens, 100);
  assert.deepEqual(sent.generationConfig.responseJsonSchema, { type: "object", required: ["a"], properties: { a: { type: "string" } } });
  assert.equal(result.text, '{"a":"ok"}');
  assert.deepEqual(result.usage, { inputTokens: 30, outputTokens: 50, totalTokens: 80, audioSeconds: null });
  assert.equal(result.reportedModel, "gemini-3.8-flash-001");
});

test("gemini: blocked, empty and truncated responses; unsupported audio input", async () => {
  assert.throws(() => parseGeminiResponse({ candidates: [], promptFeedback: { blockReason: "SAFETY" } }, { model: "m" }), { code: "AI_PROVIDER_BAD_RESPONSE" });
  assert.throws(() => parseGeminiResponse({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }] }, { model: "m" }), { code: "AI_PROVIDER_BAD_RESPONSE" });
  assert.equal(parseGeminiResponse({ candidates: [{ content: { parts: [{ text: "cut" }] }, finishReason: "MAX_TOKENS" }] }, { model: "m" }).finishReason, "length");
  assert.equal(parseGeminiResponse({ candidates: [{ content: { parts: [{ text: "x" }] }, finishReason: "SAFETY" }] }, { model: "m" }).finishReason, "content-filter");
  assert.throws(() => buildGeminiBody(request({ user: [{ type: "audio", mimeType: "audio/mpeg", dataBase64: "AAAA" }] })), { code: "AI_UNSUPPORTED_CAPABILITY" });
  const reduced = toGeminiSchema({ type: "object", additionalProperties: false, required: ["x"], properties: { x: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", maxLength: 5, pattern: "^a" } } } });
  assert.deepEqual(reduced, { type: "object", required: ["x"], properties: { x: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } } } });
});

test("retry-after parsing accepts seconds and HTTP dates and clamps", () => {
  assert.equal(parseRetryAfter("7"), 7);
  assert.equal(parseRetryAfter("99999"), 3600);
  assert.equal(parseRetryAfter(null), undefined);
  assert.equal(parseRetryAfter("garbage"), undefined);
  const future = new Date(Date.now() + 30_000).toUTCString();
  const parsed = parseRetryAfter(future)!;
  assert.ok(parsed >= 28 && parsed <= 31, String(parsed));
});
