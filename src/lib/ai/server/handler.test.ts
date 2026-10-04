import assert from "node:assert/strict";
import test from "node:test";
import { AiError } from "../errors.ts";
import type { MockStep } from "./providers/mock.ts";
import { createAiHandlers } from "./handler.ts";
import type { HandlerDeps } from "./handler.ts";
import { FAKE_KEYS, testCore } from "./test-utils.ts";
import type { TestCoreOptions } from "./test-utils.ts";

const ORIGIN = "https://env.test";
const CAPTION = { task: "creator.caption.generate", input: { topic: "launch day for our bakery" } };

function post(body: unknown, headers: Record<string, string> = {}, raw?: string): Request {
  return new Request(`${ORIGIN}/api/ai/run`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, host: "env.test", "x-forwarded-for": "203.0.113.7", ...headers },
    body: raw ?? JSON.stringify(body),
  });
}
function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, { method: "GET", headers: { host: "env.test", ...headers } });
}
function setup(options: TestCoreOptions & { getUserId?: HandlerDeps["getUserId"] } = {}) {
  const made = testCore(options);
  const handlers = createAiHandlers({ core: made.core, getUserId: options.getUserId });
  return { ...made, handlers };
}
const readJson = async (res: Response) => (await res.json()) as any;
const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";
const fail = (code: ConstructorParameters<typeof AiError>[0]): MockStep => ({ kind: "error", error: new AiError(code) });

test("success: JSON contract, security headers, no CORS, no provider details, HttpOnly session cookie", async () => {
  const { handlers } = setup();
  const res = await handlers.run(post(CAPTION));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  assert.match(res.headers.get("x-request-id")!, /^req_/);
  const cookie = res.headers.get("set-cookie")!;
  assert.match(cookie, /^env_ai_sid=[0-9a-f]{24}\.[A-Za-z0-9_-]{22};/);
  for (const flag of ["HttpOnly", "Path=/api/ai", "SameSite=Lax", "Max-Age=2592000"]) assert.ok(cookie.includes(flag), flag);
  assert.ok(!cookie.includes("Secure"), "Secure only in production");
  const json = await readJson(res);
  assert.equal(json.ok, true);
  assert.equal(json.data.taskId, "creator.caption.generate");
  assert.ok(Array.isArray(json.data.result.variants));
  assert.deepEqual(Object.keys(json.data.meta).sort(), ["cached", "requestId", "warnings"]);
  const dump = JSON.stringify(json);
  for (const leak of ["groq", "openrouter", "gemini", "gpt-oss", "promptVersion", ...Object.values(FAKE_KEYS)]) assert.ok(!dump.includes(leak), leak);
});

test("sessions: a valid cookie is reused, a tampered one is replaced", async () => {
  const { handlers } = setup();
  const first = cookieOf(await handlers.run(post(CAPTION)));
  const reused = await handlers.run(post(CAPTION, { cookie: first }));
  assert.equal(reused.headers.get("set-cookie"), null);
  const tampered = await handlers.run(post(CAPTION, { cookie: first.slice(0, -2) + "xx" }));
  assert.notEqual(cookieOf(tampered), "");
  assert.notEqual(cookieOf(tampered), first);
  const production = setup({ env: { NODE_ENV: "production" } });
  assert.ok((await production.handlers.run(post(CAPTION))).headers.get("set-cookie")!.endsWith("; Secure"));
});

test("only same-origin browser requests are accepted", async () => {
  const { handlers, adapters } = setup();
  const foreign = await handlers.run(post(CAPTION, { origin: "https://evil.example" }));
  assert.equal(foreign.status, 403);
  assert.equal((await readJson(foreign)).error.code, "AI_FORBIDDEN");
  assert.equal((await handlers.run(post(CAPTION, { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await handlers.run(post(CAPTION, { "sec-fetch-site": "same-site" }))).status, 403);
  assert.equal((await handlers.run(post(CAPTION, { "sec-fetch-site": "same-origin" }))).status, 200);
  const noOrigin = new Request(`${ORIGIN}/api/ai/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(CAPTION) });
  assert.equal((await handlers.run(noOrigin)).status, 200); // curl / server-to-server, still rate limited
  assert.equal(adapters.openrouter.calls.length, 2);
  assert.equal((await handlers.status(get("/api/ai/status", { origin: "https://evil.example" }))).status, 403);
});

test("request validation: method, content type, JSON, task id and unknown tasks", async () => {
  const { handlers } = setup();
  const cases: [Request, number, string][] = [
    [new Request(`${ORIGIN}/api/ai/run`, { method: "GET" }), 400, "AI_INVALID_INPUT"],
    [post(CAPTION, { "content-type": "text/plain" }), 400, "AI_INVALID_INPUT"],
    [post(null, {}, "{not json"), 400, "AI_INVALID_INPUT"],
    [post({ input: {} }), 400, "AI_INVALID_INPUT"],
    [post({ task: "x".repeat(200), input: {} }), 400, "AI_INVALID_INPUT"],
    [post([1, 2, 3]), 400, "AI_INVALID_INPUT"],
    [post({ task: "does.not.exist", input: {} }), 404, "AI_TASK_UNKNOWN"],
    [post({ task: "creator.caption.generate", input: { topic: "x" } }), 400, "AI_INVALID_INPUT"],
  ];
  for (const [request, status, code] of cases) {
    const res = await handlers.run(request);
    assert.equal(res.status, status);
    assert.equal((await readJson(res)).error.code, code);
  }
  const detail = await readJson(await handlers.run(post({ task: "creator.caption.generate", input: { topic: "x" } })));
  assert.ok(detail.error.message.includes("topic"));
});

test("size caps apply to the declared length and to the actual bytes", async () => {
  const { handlers, adapters } = setup();
  const declared = await handlers.run(post(CAPTION, { "content-length": "5000000" }));
  assert.equal(declared.status, 413);
  assert.equal((await readJson(declared)).error.code, "AI_CONTENT_TOO_LARGE");
  const streamed = await handlers.run(post(null, {}, JSON.stringify({ task: CAPTION.task, input: { topic: "y".repeat(4_100_000) } })));
  assert.equal(streamed.status, 413);
  assert.equal(adapters.openrouter.calls.length, 0);
});

test("clients cannot choose providers, models or limits", async () => {
  const { handlers, adapters } = setup();
  const res = await handlers.run(post({ ...CAPTION, provider: "gemini", model: "gemini-3.8-flash", maxCostClass: "PREMIUM", input: { ...CAPTION.input, provider: "gemini", model: "x" } }));
  assert.equal(res.status, 200);
  assert.equal(adapters.gemini.calls.length, 0);
  assert.equal(adapters.openrouter.calls[0]!.model, "openai/gpt-oss-20b:free");
});

test("rate limits: per-session, weighted by task cost, with Retry-After; other sessions unaffected", async () => {
  const { handlers } = setup({ env: { AI_RATE_LIMIT_PER_MINUTE: "3" } });
  const cookie = cookieOf(await handlers.run(post(CAPTION)));
  assert.equal((await handlers.run(post(CAPTION, { cookie }))).status, 200);
  assert.equal((await handlers.run(post(CAPTION, { cookie }))).status, 200);
  const limited = await handlers.run(post(CAPTION, { cookie }));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  const body = await readJson(limited);
  assert.equal(body.error.code, "AI_RATE_LIMITED");
  assert.equal(typeof body.error.retryAfterSeconds, "number");
  assert.equal((await handlers.run(post(CAPTION, { "x-forwarded-for": "198.51.100.9" }))).status, 200);

  const weighted = setup({ env: { AI_RATE_LIMIT_PER_MINUTE: "3" } });
  const json = { task: "developer.json.explain", input: { json: '{"a":1}' } };
  const c = cookieOf(await weighted.handlers.run(post(json)));
  assert.equal((await weighted.handlers.run(post(json, { cookie: c }))).status, 429); // 2 + 2 units > 3
});

test("an IP backstop still applies when clients keep discarding their session cookie", async () => {
  const { handlers } = setup({ env: { AI_RATE_LIMIT_PER_MINUTE: "3" } }); // IP limit = 15 units per minute
  let last = 0;
  for (let i = 0; i < 16; i += 1) last = (await handlers.run(post({ ...CAPTION, input: { topic: `launch day number ${i}` } }))).status;
  assert.equal(last, 429);
});

test("authentication: required when configured; failures and absent sessions are rejected; signed-in users get more room", async () => {
  const env = { AI_REQUIRE_AUTH: "true", VITE_AUTH_ENABLED: "true" };
  const anon = setup({ env, getUserId: async () => null });
  const denied = await anon.handlers.run(post(CAPTION));
  assert.equal(denied.status, 401);
  assert.equal((await readJson(denied)).error.code, "AI_AUTH_REQUIRED");
  assert.equal(anon.adapters.openrouter.calls.length, 0);
  const broken = setup({ env, getUserId: async () => { throw new Error("db down"); } });
  assert.equal((await broken.handlers.run(post(CAPTION))).status, 401);
  const signedIn = setup({ env: { ...env, AI_RATE_LIMIT_PER_MINUTE: "2" }, getUserId: async () => "user-1" });
  for (let i = 0; i < 4; i += 1) assert.equal((await signedIn.handlers.run(post(CAPTION))).status, 200, `request ${i + 1}`);
  assert.equal((await signedIn.handlers.run(post(CAPTION))).status, 429);
  const misconfigured = setup({ env: { AI_REQUIRE_AUTH: "true" }, getUserId: async () => "user-1" });
  assert.equal((await misconfigured.handlers.run(post(CAPTION))).status, 401); // auth disabled, so nobody qualifies
});

test("failures reach the browser as generic typed errors, never as provider or internal details", async () => {
  const down = setup({ scripts: { openrouter: [fail("AI_PROVIDER_UNAVAILABLE"), fail("AI_PROVIDER_UNAVAILABLE")], groq: [fail("AI_PROVIDER_TIMEOUT"), fail("AI_AUTH_ERROR")] } });
  const res = await down.handlers.run(post(CAPTION));
  assert.equal(res.status, 503);
  const body = await readJson(res);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "AI_ALL_PROVIDERS_FAILED");
  assert.equal(body.error.retryable, true);
  const dump = JSON.stringify(body);
  for (const leak of ["groq", "openrouter", "gpt-oss", "AUTH", "timeout", ...Object.values(FAKE_KEYS)]) assert.ok(!dump.includes(leak), leak);

  const explosive = setup({ scripts: { openrouter: [{ kind: "error", error: new Error("connect ECONNREFUSED 10.0.0.5 password=hunter2") as unknown as AiError }] } });
  const internal = await explosive.handlers.run(post(CAPTION));
  assert.equal(internal.status, 500);
  const text = JSON.stringify(await readJson(internal));
  assert.ok(!text.includes("hunter2") && !text.includes("ECONNREFUSED") && !text.includes("10.0.0.5"));

  const unauthorized = setup({ scripts: { openrouter: [fail("AI_AUTH_ERROR"), fail("AI_AUTH_ERROR")], groq: [fail("AI_AUTH_ERROR"), fail("AI_AUTH_ERROR")] } });
  assert.equal((await readJson(await unauthorized.handlers.run(post(CAPTION)))).error.code, "AI_ALL_PROVIDERS_FAILED"); // upstream 401 never surfaces as a client 401
});

test("disabled AI answers immediately with a typed error", async () => {
  const { handlers, adapters } = setup({ env: { AI_ENABLED: "false" } });
  const res = await handlers.run(post(CAPTION));
  assert.equal(res.status, 503);
  assert.equal((await readJson(res)).error.code, "AI_DISABLED");
  assert.equal(adapters.openrouter.calls.length, 0);
});

test("status endpoint lists task availability as booleans only", async () => {
  const { handlers } = setup();
  const res = await handlers.status(get("/api/ai/status"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  const body = await readJson(res);
  assert.equal(body.enabled, true);
  assert.equal(body.tasks["creator.caption.generate"].available, true);
  assert.equal(body.tasks["image.alt.generate"].available, false);
  const dump = JSON.stringify(body);
  for (const leak of ["groq", "openrouter", "gemini", "gpt-oss", "whisper", ...Object.values(FAKE_KEYS)]) assert.ok(!dump.includes(leak), leak);
  assert.equal((await handlers.status(new Request(`${ORIGIN}/api/ai/status`, { method: "POST" }))).status, 400);
});

test("diagnostics: absent without an admin token, constant-time token check, no secrets in the payload", async () => {
  const off = setup();
  assert.equal((await off.handlers.diagnostics(get("/api/ai/diagnostics"))).status, 404);
  const adminToken = "a".repeat(16) + "b".repeat(16);
  const { handlers } = setup({ env: { AI_ADMIN_TOKEN: adminToken } });
  assert.equal((await handlers.diagnostics(get("/api/ai/diagnostics"))).status, 401);
  assert.equal((await handlers.diagnostics(get("/api/ai/diagnostics", { authorization: "Bearer wrong" }))).status, 401);
  assert.equal((await handlers.diagnostics(get("/api/ai/diagnostics", { authorization: `Basic ${adminToken}` }))).status, 401);
  const ok = await handlers.diagnostics(get("/api/ai/diagnostics", { authorization: `Bearer ${adminToken}` }));
  assert.equal(ok.status, 200);
  const dump = JSON.stringify(await readJson(ok));
  for (const secret of [adminToken, ...Object.values(FAKE_KEYS)]) assert.ok(!dump.includes(secret), "secret leaked");
  assert.ok(dump.includes("creator.caption.generate") && dump.includes("providers"));
});

test("provider and model details appear only in non-production debug mode", async () => {
  const dev = setup({ env: { AI_DEBUG: "true" } });
  const meta = (await readJson(await dev.handlers.run(post(CAPTION)))).data.meta;
  assert.equal(meta.provider, "openrouter");
  assert.equal(meta.model, "openai/gpt-oss-20b:free");
  assert.ok(meta.latencyMs >= 0 && meta.attempts === 1);
  const prod = setup({ env: { AI_DEBUG: "true", NODE_ENV: "production" } });
  const prodMeta = (await readJson(await prod.handlers.run(post(CAPTION)))).data.meta;
  assert.equal(prodMeta.provider, undefined);
  assert.equal(prodMeta.model, undefined);
});

test("flood guard: garbage and oversized requests are throttled before the body is parsed", async () => {
  const { handlers, adapters } = setup({ env: { AI_RATE_LIMIT_PER_MINUTE: "3" } }); // per-IP 15, so 30 raw requests per minute
  let blockedAt = 0;
  for (let i = 1; i <= 40; i += 1) {
    const res = await handlers.run(post(null, {}, "{not json"));
    if (res.status === 429) {
      blockedAt = i;
      break;
    }
    assert.equal(res.status, 400);
  }
  assert.equal(blockedAt, 31);
  assert.equal((await handlers.run(post(CAPTION))).status, 429, "the throttled address is blocked even for valid requests");
  assert.equal((await handlers.run(post(CAPTION, { "x-forwarded-for": "198.51.100.77" }))).status, 200, "other addresses are unaffected");
  assert.equal(adapters.openrouter.calls.length, 1);
});

test("status is CDN-cacheable for a short time, errors are not, and status polling is rate limited", async () => {
  const { handlers } = setup({ env: { AI_RATE_LIMIT_PER_MINUTE: "1" } }); // per-IP 5, so 25 status calls per minute
  const ok = await handlers.status(get("/api/ai/status"));
  assert.match(ok.headers.get("cache-control")!, /s-maxage=30/);
  assert.equal((await handlers.status(get("/api/ai/status", { origin: "https://evil.example" }))).headers.get("cache-control"), "no-store");
  let last = 0;
  for (let i = 0; i < 30; i += 1) last = (await handlers.status(get("/api/ai/status"))).status;
  assert.equal(last, 429);
});

test("diagnostics attempts are throttled, so the admin token cannot be guessed by brute force", async () => {
  const { handlers } = setup({ env: { AI_ADMIN_TOKEN: "t".repeat(32) } });
  let last = 0;
  for (let i = 0; i < 35; i += 1) last = (await handlers.diagnostics(get("/api/ai/diagnostics", { authorization: `Bearer guess-${i}` }))).status;
  assert.equal(last, 429);
});
