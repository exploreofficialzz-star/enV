import { apiUrl } from "../../api/base.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { AiClientError, bytesToBase64, fetchAiAvailability, fitWithin, normalizeAudioMime, resetAiAvailabilityCache, runAiTask } from "./ai-client.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const OK = { ok: true, data: { taskId: "creator.title.generate", result: { titles: ["A"] }, meta: { requestId: "req_1", cached: false, warnings: ["w"] } } };

test("runAiTask posts only the task and input, Render credentials, and returns result plus meta", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const out = await runAiTask("creator.title.generate", { topic: "x" }, { fetchImpl: async (url, init) => { seen = { url, init: init! }; return json(OK); } });
  assert.deepEqual(out.result, { titles: ["A"] });
  assert.deepEqual(out.meta, { requestId: "req_1", cached: false, warnings: ["w"] });
  assert.equal(seen!.url, apiUrl("/api/ai/run"));
  assert.equal(seen!.init.method, "POST");
  assert.equal(seen!.init.credentials, "include");
  assert.deepEqual(JSON.parse(seen!.init.body as string), { task: "creator.title.generate", input: { topic: "x" } });
});

test("server errors become AiClientError with safe messages and retry hints", async () => {
  const limited = { ok: false, requestId: "req_2", error: { code: "AI_RATE_LIMITED", message: "Slow down.", retryable: false, retryAfterSeconds: 12 } };
  const error = await runAiTask("creator.title.generate", {}, { fetchImpl: async () => json(limited, 429) }).catch((e: unknown) => e);
  assert.ok(error instanceof AiClientError);
  assert.equal(error.code, "AI_RATE_LIMITED");
  assert.equal(error.message, "Slow down.");
  assert.equal(error.retryAfterSeconds, 12);
  assert.equal(error.requestId, "req_2");
  const gateway = await runAiTask("creator.title.generate", {}, { fetchImpl: async () => new Response("<html>Bad gateway</html>", { status: 502 }) }).catch((e: unknown) => e);
  assert.ok(gateway instanceof AiClientError);
  assert.equal(gateway.code, "AI_UNAVAILABLE");
  assert.equal(gateway.retryable, true);
  assert.ok(!gateway.message.includes("html"));
});

test("network failure, timeout and cancellation are told apart", async () => {
  const network = await runAiTask("creator.title.generate", {}, { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }).catch((e: unknown) => e);
  assert.equal((network as AiClientError).code, "AI_NETWORK_ERROR");

  const hang = (_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => init!.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
  const keepAlive = setTimeout(() => {}, 3000);
  try {
    const slow = await runAiTask("creator.title.generate", {}, { fetchImpl: hang, timeoutMs: 20 }).catch((e: unknown) => e);
    assert.equal((slow as AiClientError).code, "AI_CLIENT_TIMEOUT");
    const controller = new AbortController();
    const pending = runAiTask("creator.title.generate", {}, { fetchImpl: hang, signal: controller.signal });
    controller.abort();
    assert.equal(((await pending.catch((e: unknown) => e)) as AiClientError).code, "AI_REQUEST_CANCELLED");
  } finally {
    clearTimeout(keepAlive);
  }
});

test("availability: boolean map, cached briefly, never throws", async () => {
  resetAiAvailabilityCache();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return json({ ok: true, enabled: true, tasks: { "creator.caption.generate": { available: true }, "image.alt.generate": { available: false, reason: "unavailable" } } }); };
  let now = 1_000;
  const first = await fetchAiAvailability({ fetchImpl, now: () => now });
  assert.deepEqual(first, { "creator.caption.generate": true, "image.alt.generate": false });
  await fetchAiAvailability({ fetchImpl, now: () => now + 5_000 });
  assert.equal(calls, 1);
  await fetchAiAvailability({ fetchImpl, now: () => now + 61_000 });
  assert.equal(calls, 2);
  now = 500_000;
  const failing = await fetchAiAvailability({ fetchImpl: async () => { throw new Error("offline"); }, now: () => now, force: true });
  assert.deepEqual(failing, {});
  const notOk = await fetchAiAvailability({ fetchImpl: async () => json({ ok: false }, 500), now: () => now, force: true });
  assert.deepEqual(notOk, {});
});

test("file helpers: resize maths, base64 of large buffers, and audio type normalization", () => {
  assert.deepEqual(fitWithin(4000, 2000, 1000), { width: 1000, height: 500 });
  assert.deepEqual(fitWithin(500, 300, 1000), { width: 500, height: 300 });
  assert.deepEqual(fitWithin(0, 10, 100), { width: 1, height: 1 });
  assert.deepEqual(fitWithin(10, 4000, 100), { width: 1, height: 100 });
  const big = new Uint8Array(100_000).map((_, i) => i % 251);
  assert.equal(bytesToBase64(big), Buffer.from(big).toString("base64"));
  assert.equal(normalizeAudioMime("audio/mpeg", "x.mp3"), "audio/mpeg");
  assert.equal(normalizeAudioMime("audio/mp3", "x"), "audio/mpeg");
  assert.equal(normalizeAudioMime("audio/webm;codecs=opus", "rec.webm"), "audio/webm");
  assert.equal(normalizeAudioMime("", "voice.M4A"), "audio/x-m4a");
  assert.equal(normalizeAudioMime("video/mp4", "clip.mp4"), "audio/mp4");
  assert.equal(normalizeAudioMime("application/pdf", "doc.pdf"), null);
});
