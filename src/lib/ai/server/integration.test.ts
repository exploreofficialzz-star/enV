/**
 * End-to-end through the HTTP handler, the core, the router, the REAL provider adapters and a fake
 * network. No mock adapters here: this proves request building, response parsing, routing and
 * fallback work together, and that keys only ever go to their own provider's host.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createAiCore } from "./core/execute.ts";
import { createAiHandlers } from "./handler.ts";
import type { FetchLike } from "./providers/http.ts";
import { createAdapters } from "./providers/index.ts";
import { FAKE_KEYS, testConfig } from "./test-utils.ts";

const ORIGIN = "https://env.test";
const HOSTS = { openrouter: "openrouter.ai", groq: "api.groq.com", gemini: "generativelanguage.googleapis.com" } as const;
const KEY_FOR_HOST: Record<string, string> = { [HOSTS.openrouter]: FAKE_KEYS.OPENROUTER_API_KEY, [HOSTS.groq]: FAKE_KEYS.GROQ_API_KEY, [HOSTS.gemini]: FAKE_KEYS.GEMINI_API_KEY };

interface Recorded { host: string; path: string; headers: Record<string, string>; body: any; form?: FormData }

function network() {
  const queues = new Map<string, (Response | Error)[]>();
  const calls: Recorded[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const u = new URL(url);
    const raw = init.body;
    calls.push({ host: u.host, path: u.pathname, headers: { ...(init.headers as Record<string, string>) }, body: typeof raw === "string" ? JSON.parse(raw) : undefined, form: raw instanceof FormData ? raw : undefined });
    const next = queues.get(u.host)?.shift();
    if (!next) throw new Error(`unexpected request to ${u.host}${u.pathname}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls, on: (host: string, ...responses: (Response | Error)[]) => void queues.set(host, [...(queues.get(host) ?? []), ...responses]) };
}

function harness(env: Record<string, string> = {}) {
  const net = network();
  const config = testConfig(env);
  const core = createAiCore({ config, adapters: createAdapters(config, net.fetchImpl), sleep: async () => {}, random: () => 0, newBoundaryId: () => "bINTEGRATION" });
  return { net, core, handlers: createAiHandlers({ core }) };
}

const post = (task: string, input: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/ai/run`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, host: "env.test", "x-forwarded-for": "203.0.113.9", ...headers }, body: JSON.stringify({ task, input }) });
const chat = (content: unknown) => new Response(JSON.stringify({ model: "served", choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 } }), { status: 200, headers: { "content-type": "application/json" } });
const gemini = (content: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(content) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 60, totalTokenCount: 960 } }), { status: 200 });
const down = () => new Response("boom", { status: 500 });

/** Every call goes to a known provider host and carries only that provider's key. */
function assertNetworkHygiene(calls: Recorded[]) {
  for (const call of calls) {
    assert.ok(Object.values(HOSTS).includes(call.host as never), `unexpected host ${call.host}`);
    const dump = JSON.stringify({ headers: call.headers, body: call.body ?? null });
    for (const [host, key] of Object.entries(KEY_FOR_HOST)) if (host !== call.host) assert.ok(!dump.includes(key), `${host} key sent to ${call.host}`);
    const own = call.headers.authorization ?? call.headers["x-goog-api-key"];
    assert.ok(own?.includes(KEY_FOR_HOST[call.host]!), `${call.host} call is missing its own key`);
    const ownKey = KEY_FOR_HOST[call.host]!;
    assert.equal(dump.split(ownKey).length - 1, 1, `${call.host}: the key must appear exactly once, in the auth header`);
    assert.ok(!call.path.includes("key=") && !call.path.includes(ownKey), "keys must never be in the URL");
  }
}

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(120, 7)]).toString("base64");
const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(300, 1)]).toString("base64");

test("caption: OpenRouter rate-limits, Groq answers; strict schema, framing and key isolation all hold", async () => {
  const h = harness({ AI_DEBUG: "true" });
  h.net.on(HOSTS.openrouter, new Response("slow down", { status: 429, headers: { "retry-after": "2" } }));
  h.net.on(HOSTS.groq, chat({ variants: [{ caption: "Fresh bread daily", hashtags: ["#bakery", "fresh"] }] }));
  const res = await h.handlers.run(post("creator.caption.generate", { topic: "grand opening of our bakery", platform: "instagram" }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.deepEqual(body.data.result, { variants: [{ caption: "Fresh bread daily", hashtags: ["bakery", "fresh"] }] });
  assert.equal(body.data.meta.provider, "groq");
  assert.equal(body.data.meta.fallbackUsed, true);
  assert.deepEqual(h.net.calls.map((c) => `${c.host}${c.path}`), ["openrouter.ai/api/v1/chat/completions", "api.groq.com/openai/v1/chat/completions"]);
  const [first, second] = h.net.calls;
  assert.equal(first!.body.model, "openai/gpt-oss-20b:free");
  assert.deepEqual(first!.body.provider, { require_parameters: true });
  assert.equal(second!.body.model, "openai/gpt-oss-20b");
  assert.equal(second!.body.response_format.json_schema.strict, true);
  assert.equal(second!.body.max_completion_tokens, 900 + 1500);
  assert.equal(second!.body.messages[0].role, "system");
  assert.ok(!second!.body.messages[0].content.includes("grand opening"), "user text must not be in the system prompt");
  assert.ok(second!.body.messages[1].content.includes("<<<TOPIC id=bINTEGRATION>>>"));
  assertNetworkHygiene(h.net.calls);
});

test("regex explanation is cached: the second identical request never reaches the network", async () => {
  const h = harness();
  h.net.on(HOSTS.openrouter, chat({ summary: "Matches one or more a.", parts: [{ token: "a+", meaning: "one or more a" }], pitfalls: [], suggestedTests: [{ input: "aaa", shouldMatch: true }] }));
  const run = async () => ((await (await h.handlers.run(post("developer.regex.explain", { pattern: "^a+$", flags: "" }))).json()) as any);
  const first = await run();
  const second = await run();
  assert.equal(first.data.meta.cached, false);
  assert.equal(second.data.meta.cached, true);
  assert.equal(h.net.calls.length, 1);
});

test("sensitive JSON never reaches a free route; OpenRouter is told not to collect data; secrets are masked first", async () => {
  const h = harness({ AI_PROVIDER_ORDER: "openrouter" });
  h.net.on(HOSTS.openrouter, chat({ summary: "A user record.", structure: [{ path: "$.name", type: "string", note: "" }], issues: [] }));
  const res = await h.handlers.run(post("developer.json.explain", { json: '{"name":"ada","token":"abcdef1234567890zz"}' }));
  assert.equal(res.status, 200);
  const call = h.net.calls[0]!;
  assert.equal(call.body.model, "openai/gpt-oss-20b");
  assert.ok(!String(call.body.model).endsWith(":free"));
  assert.deepEqual(call.body.provider, { require_parameters: true, data_collection: "deny" });
  const sent = JSON.stringify(call.body);
  assert.ok(!sent.includes("abcdef1234567890zz") && sent.includes("[REDACTED]") && sent.includes("ada"));

  const open = harness();
  open.net.on(HOSTS.groq, chat({ summary: "s", structure: [{ path: "$", type: "object", note: "" }], issues: [] }));
  await open.handlers.run(post("developer.json.explain", { json: "{}" }));
  assert.ok(open.net.calls.every((c) => !String(c.body.model).endsWith(":free")));
  assert.equal(open.net.calls[0]!.host, HOSTS.groq);
});

test("alt text: Gemini receives the image and a reduced schema, with the key in a header", async () => {
  const h = harness({ AI_MAX_COST_CLASS: "STANDARD", AI_GEMINI_TIER: "paid" });
  h.net.on(HOSTS.gemini, gemini({ altText: "A red bicycle", longDescription: "A red bicycle leaning on a wall.", containsText: false, textInImage: "" }));
  const res = await h.handlers.run(post("image.alt.generate", { imageBase64: png, mimeType: "image/png", context: "homepage hero" }));
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as any).data.result.altText, "A red bicycle");
  const call = h.net.calls[0]!;
  assert.equal(call.path, "/v1beta/models/gemini-3.8-flash:generateContent");
  assert.equal(call.headers["x-goog-api-key"], FAKE_KEYS.GEMINI_API_KEY);
  assert.deepEqual(call.body.contents[0].parts[1], { inlineData: { mimeType: "image/png", data: png } });
  assert.equal(call.body.generationConfig.responseMimeType, "application/json");
  assert.ok(!JSON.stringify(call.body.generationConfig.responseJsonSchema).includes("additionalProperties"));
  assert.equal(call.body.generationConfig.maxOutputTokens, 700 + 2500);
  assertNetworkHygiene(h.net.calls);

  const blocked = harness(); // default config: vision stays off until the deployer opts in
  const refused = await blocked.handlers.run(post("image.alt.generate", { imageBase64: png, mimeType: "image/png" }));
  assert.equal(refused.status, 503);
  assert.equal(blocked.net.calls.length, 0);
});

test("transcription: audio goes to Groq Whisper as multipart and comes back with segments", async () => {
  const h = harness();
  h.net.on(HOSTS.groq, new Response(JSON.stringify({ text: "Hello there", language: "english", duration: 4.5, segments: [{ start: 0, end: 2, text: " Hello" }, { start: 2, end: 4.5, text: " there" }] }), { status: 200 }));
  const res = await h.handlers.run(post("video.transcript.generate", { audioBase64: mp3, mimeType: "audio/mpeg", filename: "call.mp3", language: "en" }));
  assert.equal(res.status, 200);
  const result = ((await res.json()) as any).data.result;
  assert.deepEqual(result, { text: "Hello there", language: "english", durationSeconds: 4.5, segments: [{ start: 0, end: 2, text: "Hello" }, { start: 2, end: 4.5, text: "there" }] });
  const call = h.net.calls[0]!;
  assert.equal(call.path, "/openai/v1/audio/transcriptions");
  assert.equal(call.form!.get("model"), "whisper-large-v3-turbo");
  assert.equal(call.form!.get("language"), "en");
  assert.equal((call.form!.get("file") as File).size, Buffer.from(mp3, "base64").length);
  assert.equal(call.headers["content-type"], undefined);
  assertNetworkHygiene(h.net.calls);
});

test("everything down: bounded attempts, a generic 503, and no secrets or provider names in the response", async () => {
  const h = harness();
  h.net.on(HOSTS.openrouter, down(), down());
  h.net.on(HOSTS.groq, down(), down());
  const res = await h.handlers.run(post("creator.title.generate", { topic: "how to learn guitar fast" }));
  assert.equal(res.status, 503);
  const text = await res.text();
  assert.equal(JSON.parse(text).error.code, "AI_ALL_PROVIDERS_FAILED");
  assert.equal(h.net.calls.length, 4);
  for (const leak of ["groq", "openrouter", "gpt-oss", "boom", ...Object.values(FAKE_KEYS)]) assert.ok(!text.includes(leak), leak);
});

test("a provider that returns prose instead of JSON is repaired once, then the next provider is used", async () => {
  const h = harness();
  h.net.on(HOSTS.openrouter, chat("Sure, here you go!").clone(), new Response(JSON.stringify({ choices: [{ message: { content: "still not json" }, finish_reason: "stop" }] }), { status: 200 }));
  h.net.on(HOSTS.groq, chat({ titles: ["Learn Guitar Fast"] }));
  const res = await h.handlers.run(post("creator.title.generate", { topic: "how to learn guitar fast" }));
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as any).data.result, { titles: ["Learn Guitar Fast"] });
  assert.deepEqual(h.net.calls.map((c) => c.host), [HOSTS.openrouter, HOSTS.openrouter, HOSTS.groq]);
  assert.ok(String(h.net.calls[1]!.body.messages[1].content).includes("rejected"));
});
