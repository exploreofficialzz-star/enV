import assert from "node:assert/strict";
import test from "node:test";
import { loadAiConfig } from "./config.ts";
import { createSessionLookup } from "./session.ts";

const request = (headers: Record<string, string> = {}) => new Request("https://env.test/api/ai/run", { method: "POST", headers });
const session = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("asks the app's own auth endpoint with only the cookie and returns the user id", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const lookup = createSessionLookup({ baseUrl: () => "https://env.test", fetchImpl: async (url, init) => { seen = { url, init }; return session({ session: {}, user: { id: "u-42", email: "a@b.c" } }); } });
  assert.equal(await lookup(request({ cookie: "better-auth.session_token=abc", authorization: "Bearer should-not-forward", "x-forwarded-for": "1.2.3.4" })), "u-42");
  assert.equal(seen!.url, "https://env.test/api/auth/get-session");
  assert.deepEqual(seen!.init.headers, { cookie: "better-auth.session_token=abc", accept: "application/json" });
  assert.equal(seen!.init.method, "GET");
});

test("every failure means signed out and nothing throws", async () => {
  const cases: [string, () => Promise<Response>][] = [
    ["no session", async () => session(null)],
    ["server error", async () => session({ error: "x" }, 500)],
    ["unauthorized", async () => session({}, 401)],
    ["not JSON", async () => new Response("<html>", { status: 200 })],
    ["wrong shape", async () => session({ user: "nope" })],
    ["empty id", async () => session({ user: { id: "" } })],
    ["numeric id", async () => session({ user: { id: 7 } })],
    ["network error", async () => { throw new TypeError("fetch failed"); }],
  ];
  for (const [label, respond] of cases) {
    const lookup = createSessionLookup({ baseUrl: () => "https://env.test", fetchImpl: respond });
    assert.equal(await lookup(request({ cookie: "a=b" })), null, label);
  }
});

test("no cookie or no trusted base URL means no lookup at all", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return session({ user: { id: "u" } }); };
  assert.equal(await createSessionLookup({ baseUrl: () => "https://env.test", fetchImpl })(request()), null);
  assert.equal(await createSessionLookup({ baseUrl: () => null, fetchImpl })(request({ cookie: "a=b" })), null);
  assert.equal(calls, 0);
});

test("a slow auth endpoint is abandoned at the timeout", async () => {
  const hang = (_url: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal!.addEventListener("abort", () => rej(init.signal!.reason)));
  const keepAlive = setTimeout(() => {}, 3000);
  try {
    const lookup = createSessionLookup({ baseUrl: () => "https://env.test", fetchImpl: hang, timeoutMs: 20 });
    assert.equal(await lookup(request({ cookie: "a=b" })), null);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("config: BETTER_AUTH_URL becomes a normalized origin; junk is ignored with a report", () => {
  assert.equal(loadAiConfig({ BETTER_AUTH_URL: "https://env.example.com/some/path/" }).authBaseUrl, "https://env.example.com");
  assert.equal(loadAiConfig({}).authBaseUrl, null);
  const bad = loadAiConfig({ BETTER_AUTH_URL: "javascript:alert(1)" });
  assert.equal(bad.authBaseUrl, null);
  assert.ok(bad.issues.some((i) => i.includes("BETTER_AUTH_URL")));
  assert.equal(loadAiConfig({ BETTER_AUTH_URL: "not a url" }).authBaseUrl, null);
});
