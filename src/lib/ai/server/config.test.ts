import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";
import { configuredProviders, describeConfig, isProviderConfigured, isTaskDisabledByFlag, loadAiConfig, SecretString, validateAiConfig } from "./config.ts";

test("defaults are safe: enabled, no providers, LOW cost ceiling, no auth requirement", () => {
  const config = loadAiConfig({ NODE_ENV: "test" });
  assert.equal(config.enabled, true);
  assert.deepEqual(configuredProviders(config), []);
  assert.equal(config.maxCostClass, "LOW");
  assert.equal(config.requireAuth, false);
  assert.equal(config.limits.maxBodyBytes, 4_000_000);
  assert.deepEqual(config.providerOrder, ["groq", "openrouter", "gemini"]);
});

test("keys are wrapped and never leak through JSON, inspect or string conversion", () => {
  const config = loadAiConfig({ NODE_ENV: "test", GROQ_API_KEY: "gsk_supersecretvalue1234567890", AI_ADMIN_TOKEN: "x".repeat(32) });
  const secret = config.keys.groq;
  assert.ok(secret instanceof SecretString);
  assert.equal(secret.reveal(), "gsk_supersecretvalue1234567890");
  for (const text of [JSON.stringify(config), inspect(config, { depth: 5 }), `${secret}`, JSON.stringify(describeConfig(config))]) {
    assert.ok(!text.includes("supersecretvalue"), "key leaked");
    assert.ok(!text.includes("xxxxxxxx"), "admin token leaked");
  }
});

test("GOOGLE_AI_API_KEY is accepted as an alias; VITE_ prefixed names are never read", () => {
  assert.ok(loadAiConfig({ GOOGLE_AI_API_KEY: "g-key-1234567890" }).keys.gemini);
  assert.equal(loadAiConfig({ VITE_GROQ_API_KEY: "nope-1234567890" }).keys.groq, null);
});

test("invalid values fall back to defaults and are reported, never thrown", () => {
  const config = loadAiConfig({ AI_ENABLED: "maybe", AI_MAX_COST_CLASS: "GOLD", AI_RATE_LIMIT_PER_MINUTE: "-4", AI_PROVIDER_ORDER: "groq,nope", AI_GEMINI_TIER: "gold" });
  assert.equal(config.enabled, true);
  assert.equal(config.maxCostClass, "LOW");
  assert.equal(config.limits.perSessionPerMinute, 12);
  assert.deepEqual(config.providerOrder, ["groq"]);
  assert.equal(config.geminiTier, "unknown");
  assert.equal(config.issues.length, 5);
});

test("provider order controls which providers may be used", () => {
  const config = loadAiConfig({ GROQ_API_KEY: "k-1234567890", OPENROUTER_API_KEY: "k-1234567890", AI_PROVIDER_ORDER: "openrouter" });
  assert.equal(isProviderConfigured(config, "openrouter"), true);
  assert.equal(isProviderConfigured(config, "groq"), false);
  assert.ok(validateAiConfig(config).warnings.some((w) => w.includes("groq has a key but is not listed")));
});

test("the mock provider is impossible in production", () => {
  const config = loadAiConfig({ NODE_ENV: "production", AI_PROVIDER_ORDER: "mock,groq", GROQ_API_KEY: "k-1234567890" });
  assert.ok(!config.providerOrder.includes("mock"));
  assert.equal(isProviderConfigured(config, "mock"), false);
  assert.equal(isProviderConfigured(loadAiConfig({ NODE_ENV: "test", AI_PROVIDER_ORDER: "mock" }), "mock"), true);
  assert.equal(loadAiConfig({ VERCEL: "1" }).production, true);
});

test("validation reports contradictory settings", () => {
  const bad = validateAiConfig(loadAiConfig({ AI_REQUIRE_AUTH: "true", AI_ADMIN_TOKEN: "short" }));
  assert.ok(bad.errors.some((e) => e.includes("AI_REQUIRE_AUTH")));
  assert.ok(bad.errors.some((e) => e.includes("AI_ADMIN_TOKEN")));
  const ok = validateAiConfig(loadAiConfig({ AI_REQUIRE_AUTH: "true", VITE_AUTH_ENABLED: "true", GROQ_API_KEY: "k-1234567890" }));
  assert.deepEqual(ok.errors, []);
  assert.ok(validateAiConfig(loadAiConfig({})).warnings.some((w) => w.includes("no provider is configured")));
});

test("feature flags match exact ids and dotted prefixes", () => {
  const config = loadAiConfig({ AI_DISABLED_FEATURES: "Developer., creator.title.generate" });
  assert.equal(isTaskDisabledByFlag(config, "developer.regex.explain"), true);
  assert.equal(isTaskDisabledByFlag(config, "creator.title.generate"), true);
  assert.equal(isTaskDisabledByFlag(config, "creator.caption.generate"), false);
});

test("the per-IP limit defaults to five times the session limit and can be set on its own for shared mobile networks", () => {
  assert.equal(loadAiConfig({ AI_RATE_LIMIT_PER_MINUTE: "10" }).limits.perIpPerMinute, 50);
  assert.equal(loadAiConfig({ AI_RATE_LIMIT_PER_MINUTE: "10", AI_RATE_LIMIT_PER_IP_PER_MINUTE: "400" }).limits.perIpPerMinute, 400);
  const bad = loadAiConfig({ AI_RATE_LIMIT_PER_MINUTE: "10", AI_RATE_LIMIT_PER_IP_PER_MINUTE: "0" });
  assert.equal(bad.limits.perIpPerMinute, 50);
  assert.ok(bad.issues.some((i) => i.includes("AI_RATE_LIMIT_PER_IP_PER_MINUTE")));
});
