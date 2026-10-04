import assert from "node:assert/strict";
import test from "node:test";
import { AiError } from "../../errors.ts";
import type { ModelRecord, ProviderId } from "../../types.ts";
import { createHealthTracker } from "../core/health.ts";
import { createUsageLedger } from "../core/usage.ts";
import { createMockAdapter } from "../providers/mock.ts";
import { MODEL_REGISTRY } from "../registry/models.ts";
import { ALL_TASKS } from "../tasks/index.ts";
import type { TaskMeta } from "../tasks/define.ts";
import { testConfig } from "../test-utils.ts";
import { routeTask } from "./router.ts";
import type { RouteContext } from "./router.ts";

const task = (id: string): TaskMeta => ALL_TASKS.find((t) => t.id === id)!;

function context(env: Record<string, string> = {}, models: readonly ModelRecord[] = MODEL_REGISTRY): RouteContext {
  const adapters: RouteContext["adapters"] = {};
  for (const id of ["groq", "openrouter", "gemini"] as ProviderId[]) adapters[id] = createMockAdapter({ id });
  return { config: testConfig(env), models, adapters, health: createHealthTracker(), usage: createUsageLedger() };
}
const keys = (ctx: RouteContext, id: string, opts?: { inputBytes?: number }) => routeTask(task(id), ctx, opts).candidates.map((m) => `${m.provider}:${m.modelId}`);
const reasons = (ctx: RouteContext, id: string) => Object.fromEntries(routeTask(task(id), ctx).rejected.map((r) => [r.model, r.reason]));

test("standard structured text: free first, then low cost by provider order; STANDARD models excluded by default", () => {
  const ctx = context();
  assert.deepEqual(keys(ctx, "creator.caption.generate"), [
    "openrouter:openai/gpt-oss-20b:free",
    "groq:openai/gpt-oss-20b",
    "groq:openai/gpt-oss-120b",
    "openrouter:openai/gpt-oss-20b",
  ]);
  const why = reasons(ctx, "creator.caption.generate");
  assert.equal(why["gemini:gemini-3.8-flash"], "cost-class-exceeds-limit");
  assert.equal(why["groq:whisper-large-v3-turbo"], "capability-mismatch");
});

test("AI_PROVIDER_ORDER breaks ties between models of the same cost class", () => {
  const ctx = context({ AI_PROVIDER_ORDER: "openrouter,groq,gemini" });
  assert.deepEqual(keys(ctx, "creator.caption.generate").slice(1), ["openrouter:openai/gpt-oss-20b", "groq:openai/gpt-oss-20b", "groq:openai/gpt-oss-120b"]);
});

test("a task that prefers quality orders equal-cost models by quality", () => {
  const ctx = context({ GROQ_API_KEY: "k-1234567890", OPENROUTER_API_KEY: "" });
  const quality: TaskMeta = { ...task("creator.caption.generate"), prefer: "quality" };
  assert.deepEqual(routeTask(quality, ctx).candidates.map((m) => m.modelId), ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
});

test("sensitive tasks never route to free-tier or unverified-privacy models by default", () => {
  const ctx = context();
  const order = keys(ctx, "developer.json.explain");
  assert.ok(!order.includes("openrouter:openai/gpt-oss-20b:free"));
  assert.deepEqual(order, ["groq:openai/gpt-oss-20b", "groq:openai/gpt-oss-120b", "openrouter:openai/gpt-oss-20b"]);
  assert.equal(reasons(ctx, "developer.json.explain")["openrouter:openai/gpt-oss-20b:free"], "privacy-not-allowed");
});

test("vision needs an explicit cost ceiling AND a paid-tier or free-tier acknowledgement", () => {
  assert.deepEqual(keys(context(), "image.alt.generate"), []);
  assert.equal(reasons(context(), "image.alt.generate")["gemini:gemini-3.8-flash"], "cost-class-exceeds-limit");
  const standard = context({ AI_MAX_COST_CLASS: "STANDARD" });
  assert.deepEqual(keys(standard, "image.alt.generate"), []);
  assert.equal(reasons(standard, "image.alt.generate")["gemini:gemini-3.8-flash"], "privacy-not-allowed");
  assert.deepEqual(keys(context({ AI_MAX_COST_CLASS: "STANDARD", AI_GEMINI_TIER: "paid" }), "image.alt.generate"), ["gemini:gemini-3.8-flash"]);
  assert.deepEqual(keys(context({ AI_MAX_COST_CLASS: "STANDARD", AI_SENSITIVE_ALLOW_FREE_TIER: "true" }), "image.alt.generate"), ["gemini:gemini-3.8-flash"]);
});

test("speech routing prefers the cheaper model and respects upload limits", () => {
  const ctx = context();
  assert.deepEqual(keys(ctx, "video.transcript.generate"), ["groq:whisper-large-v3-turbo", "groq:whisper-large-v3"]);
  assert.deepEqual(keys(ctx, "video.transcript.generate", { inputBytes: 26 * 1024 * 1024 }), []);
  assert.equal(reasons(context(), "video.transcript.generate")["groq:whisper-large-v3"], undefined);
});

test("budget: exhausted or zero budget leaves only free models", () => {
  const zero = context({ AI_DAILY_BUDGET_USD: "0" });
  assert.deepEqual(keys(zero, "creator.caption.generate"), ["openrouter:openai/gpt-oss-20b:free"]);
  assert.equal(reasons(zero, "creator.caption.generate")["groq:openai/gpt-oss-20b"], "budget-paid-models-blocked");
  const spent = context({ AI_DAILY_BUDGET_USD: "1" });
  spent.usage.recordSuccess({ taskId: "t", modelKey: "groq:m", cost: { usd: 1.5, basis: "estimated" }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, audioSeconds: null } });
  assert.deepEqual(keys(spent, "creator.caption.generate"), ["openrouter:openai/gpt-oss-20b:free"]);
});

test("health: open circuits are skipped and degraded models sort last", () => {
  const ctx = context({ OPENROUTER_API_KEY: "" });
  ctx.health.recordFailure("groq:openai/gpt-oss-20b", new AiError("AI_PROVIDER_UNAVAILABLE"));
  assert.deepEqual(keys(ctx, "creator.caption.generate"), ["groq:openai/gpt-oss-120b", "groq:openai/gpt-oss-20b"]);
  ctx.health.recordFailure("groq:openai/gpt-oss-120b", new AiError("AI_AUTH_ERROR"));
  assert.deepEqual(keys(ctx, "creator.caption.generate"), ["groq:openai/gpt-oss-20b"]);
  assert.equal(reasons(ctx, "creator.caption.generate")["groq:openai/gpt-oss-120b"], "circuit-open");
});

test("configuration gates: disabled models, missing adapters, unconfigured providers, per-model quotas", () => {
  const ctx = context({ AI_DISABLED_MODELS: "groq:openai/gpt-oss-20b" });
  assert.equal(reasons(ctx, "creator.caption.generate")["groq:openai/gpt-oss-20b"], "model-disabled-by-config");
  const noKey = context({ GROQ_API_KEY: "" });
  assert.equal(reasons(noKey, "creator.caption.generate")["groq:openai/gpt-oss-20b"], "provider-not-configured");
  const noAdapter = context();
  delete noAdapter.adapters.groq;
  assert.equal(reasons(noAdapter, "creator.caption.generate")["groq:openai/gpt-oss-20b"], "no-adapter");
  const limited = context({}, MODEL_REGISTRY.map((m) => (m.modelId === "openai/gpt-oss-20b:free" ? { ...m, quota: { dailyRequests: 1 } } : m)));
  limited.usage.recordAttempt("openrouter:openai/gpt-oss-20b:free");
  assert.equal(reasons(limited, "creator.caption.generate")["openrouter:openai/gpt-oss-20b:free"], "model-quota-exhausted");
  assert.equal(reasons(context({ AI_PROVIDER_ORDER: "groq" }), "creator.caption.generate")["openrouter:openai/gpt-oss-20b"], "provider-not-in-order");
});

test("the mock provider is only reachable when explicitly ordered in non-production", () => {
  const ctx = context({ AI_PROVIDER_ORDER: "mock", GROQ_API_KEY: "", OPENROUTER_API_KEY: "", GEMINI_API_KEY: "" });
  ctx.adapters.mock = createMockAdapter();
  assert.deepEqual(keys(ctx, "creator.caption.generate"), ["mock:mock-text"]);
  const prod = context({ NODE_ENV: "production", AI_PROVIDER_ORDER: "mock", GROQ_API_KEY: "", OPENROUTER_API_KEY: "", GEMINI_API_KEY: "" });
  prod.adapters.mock = createMockAdapter();
  assert.deepEqual(keys(prod, "creator.caption.generate"), []);
});
