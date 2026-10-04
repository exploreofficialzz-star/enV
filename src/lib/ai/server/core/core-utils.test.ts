import assert from "node:assert/strict";
import test from "node:test";
import { AiError } from "../../errors.ts";
import type { ModelRecord } from "../../types.ts";
import { findModel } from "../registry/models.ts";
import { createInflight, createTtlCache } from "./cache.ts";
import { createHealthTracker } from "./health.ts";
import { parseModelJson } from "./json.ts";
import { createRateLimiter } from "./rate-limit.ts";
import { exampleFromSchema, strictSchemaProblems, validateJsonSchema } from "./schema-utils.ts";
import { createUsageLedger, estimateCost } from "./usage.ts";

test("health: opens after repeated availability failures, recovers after cooldown and success", () => {
  let now = 1_000;
  const health = createHealthTracker({ now: () => now, failureThreshold: 3, cooldownMs: 10_000 });
  const key = "groq:m";
  assert.equal(health.canAttempt(key), true);
  health.recordFailure(key, new AiError("AI_PROVIDER_UNAVAILABLE"));
  health.recordFailure(key, new AiError("AI_PROVIDER_TIMEOUT"));
  assert.equal(health.canAttempt(key), true);
  assert.equal(health.isDegraded(key), true);
  health.recordFailure(key, new AiError("AI_PROVIDER_BAD_RESPONSE"));
  assert.equal(health.canAttempt(key), false);
  now += 10_001;
  assert.equal(health.canAttempt(key), true); // half-open probe
  health.recordFailure(key, new AiError("AI_PROVIDER_UNAVAILABLE"));
  assert.equal(health.canAttempt(key), false); // probe failed, re-opened
  now += 10_001;
  health.recordSuccess(key);
  assert.equal(health.isDegraded(key), false);
  assert.equal(health.snapshot()[0]!.successes, 1);
});

test("health: bad input, validation failures and cancellations never open a circuit", () => {
  const health = createHealthTracker({ failureThreshold: 1 });
  for (const code of ["AI_INVALID_INPUT", "AI_OUTPUT_VALIDATION_FAILED", "AI_REQUEST_CANCELLED", "AI_CONTENT_TOO_LARGE"] as const) {
    health.recordFailure("k", new AiError(code));
  }
  assert.equal(health.canAttempt("k"), true);
  assert.equal(health.snapshot()[0]!.failures, 0);
});

test("health: auth errors open immediately and rate limits honour retry-after (capped)", () => {
  let now = 0;
  const health = createHealthTracker({ now: () => now, authCooldownMs: 600_000, maxRateLimitCooldownMs: 120_000 });
  health.recordFailure("a", new AiError("AI_AUTH_ERROR", { upstreamStatus: 401 }));
  assert.equal(health.canAttempt("a"), false);
  assert.equal(health.snapshot()[0]!.lastUpstreamStatus, 401);
  health.recordFailure("r", new AiError("AI_RATE_LIMITED", { retryAfterSeconds: 5 }));
  assert.equal(health.canAttempt("r"), false);
  now = 5_001;
  assert.equal(health.canAttempt("r"), true);
  health.recordFailure("big", new AiError("AI_RATE_LIMITED", { retryAfterSeconds: 99_999 }));
  now += 120_001;
  assert.equal(health.canAttempt("big"), true);
});

test("usage: cost estimation for tokens, audio, free and unknown prices", () => {
  const groq = findModel("groq", "openai/gpt-oss-20b")!;
  const cost = estimateCost(groq, { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: null, audioSeconds: null }, Date.now());
  assert.equal(cost.usd, 0.375);
  assert.equal(estimateCost(groq, { inputTokens: null, outputTokens: 5, totalTokens: null, audioSeconds: null }, 0).basis, "unknown");
  const whisper = findModel("groq", "whisper-large-v3-turbo")!;
  assert.equal(estimateCost(whisper, { inputTokens: null, outputTokens: null, totalTokens: null, audioSeconds: 3600 }, 0).usd, 0.04);
  const free = findModel("openrouter", "openai/gpt-oss-20b:free")!;
  assert.equal(estimateCost(free, { inputTokens: 9, outputTokens: 9, totalTokens: 18, audioSeconds: null }, 0).usd, 0);
  const noPrice: ModelRecord = { ...groq, pricing: null };
  assert.equal(estimateCost(noPrice, { inputTokens: 1, outputTokens: 1, totalTokens: 2, audioSeconds: null }, 0).usd, null);
});

test("usage ledger counts per day and rolls over at UTC midnight", () => {
  let now = Date.parse("2026-09-30T23:59:00Z");
  const ledger = createUsageLedger(() => now);
  ledger.startRequest();
  ledger.recordAttempt("groq:m");
  ledger.recordSuccess({ taskId: "t", modelKey: "groq:m", cost: { usd: 0.25, basis: "estimated" }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, audioSeconds: null } });
  ledger.recordSuccess({ taskId: "t", modelKey: "groq:m", cost: { usd: null, basis: "unknown" }, usage: { inputTokens: null, outputTokens: null, totalTokens: null, audioSeconds: null } });
  assert.equal(ledger.requestsToday(), 1);
  assert.equal(ledger.spendTodayUsd(), 0.25);
  assert.equal(ledger.modelRequestsToday("groq:m"), 1);
  assert.equal(ledger.snapshot().unknownCostRequests, 1);
  now = Date.parse("2026-10-01T00:00:01Z");
  assert.equal(ledger.requestsToday(), 0);
  assert.equal(ledger.spendTodayUsd(), 0);
});

test("rate limiter: weighted windows, retry-after, reset, and rejected calls consume nothing", () => {
  let now = 0;
  const limiter = createRateLimiter(() => now);
  assert.equal(limiter.consume("k", 1, 3, 60_000).allowed, true);
  assert.equal(limiter.consume("k", 2, 3, 60_000).remaining, 0);
  const blocked = limiter.consume("k", 1, 3, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
  now = 30_000;
  assert.equal(limiter.consume("k", 1, 3, 60_000).retryAfterSeconds, 30);
  now = 60_001;
  assert.equal(limiter.consume("k", 3, 3, 60_000).allowed, true);
  assert.equal(limiter.consume("other", 5, 3, 60_000).allowed, false); // cost above the limit can never pass
});

test("ttl cache expires and evicts least recently used; inflight shares one promise", async () => {
  let now = 0;
  const cache = createTtlCache<number>({ now: () => now, maxEntries: 2 });
  cache.set("a", 1, 100);
  cache.set("b", 2, 100);
  assert.equal(cache.get("a"), 1); // refresh a
  cache.set("c", 3, 100); // evicts b
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  now = 101;
  assert.equal(cache.get("a"), undefined);

  const inflight = createInflight<number>();
  let calls = 0;
  const factory = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return 7;
  };
  const [x, y] = await Promise.all([inflight.run("k", factory), inflight.run("k", factory)]);
  assert.deepEqual([x, y, calls], [7, 7, 1]);
  assert.equal(inflight.size(), 0);
  await assert.rejects(inflight.run("e", async () => { throw new Error("boom"); }), /boom/);
  assert.equal(inflight.size(), 0);
});

test("parseModelJson handles fences, surrounding prose and garbage", () => {
  assert.deepEqual(parseModelJson('{"a":1}'), { ok: true, value: { a: 1 } });
  assert.deepEqual(parseModelJson('```json\n{"a":[1,2]}\n```'), { ok: true, value: { a: [1, 2] } });
  assert.deepEqual(parseModelJson('Sure! Here you go: {"a":"}"} hope it helps'), { ok: true, value: { a: "}" } });
  assert.equal(parseModelJson("no json here").ok, false);
  assert.equal(parseModelJson("").ok, false);
  assert.equal(parseModelJson('{"a": ').ok, false);
  assert.equal(parseModelJson("x".repeat(500_000)).ok, false);
});

test("schema utils: strict-mode checker, validator and example generator agree", () => {
  const good = { type: "object", additionalProperties: false, required: ["a", "b"], properties: { a: { type: "string", minLength: 1 }, b: { type: "array", minItems: 1, items: { type: "integer", minimum: 2 } } } };
  assert.deepEqual(strictSchemaProblems(good), []);
  const example = exampleFromSchema(good);
  assert.deepEqual(validateJsonSchema(example, good), []);
  assert.ok(validateJsonSchema({ a: "", b: [1] }, good).length >= 2);
  assert.ok(validateJsonSchema({ a: "x", b: [2], extra: 1 }, good).some((p) => p.includes("unexpected")));
  const loose = { type: "object", properties: { a: { type: "string" } } };
  const problems = strictSchemaProblems(loose);
  assert.ok(problems.some((p) => p.includes("additionalProperties")));
  assert.ok(problems.some((p) => p.includes("required")));
  assert.ok(strictSchemaProblems({ $ref: "#/x" }).some((p) => p.includes("$ref")));
});
