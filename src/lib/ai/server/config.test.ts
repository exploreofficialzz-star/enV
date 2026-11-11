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
  assert.deepEqual(config.providerOrder, ["moss_music", "groq", "openrouter", "gemini", "cloudflare"]);
});

test("MOSS-Music is configured only with a valid HTTPS endpoint and server-only token", () => {
  const missing = loadAiConfig({ AI_PROVIDER_ORDER: "moss_music", MOSS_MUSIC_ENDPOINT: "https://example.modal.run/analyze" });
  assert.equal(isProviderConfigured(missing, "moss_music"), false);
  assert.ok(validateAiConfig(missing).warnings.some((warning) => warning.includes("MOSS_MUSIC_ENDPOINT and MOSS_MUSIC_TOKEN")));
  const ready = loadAiConfig({ AI_PROVIDER_ORDER: "moss_music", MOSS_MUSIC_ENDPOINT: "https://example.modal.run/analyze", MOSS_MUSIC_TOKEN: "private-token-123456789012345678901234567890" });
  assert.equal(isProviderConfigured(ready, "moss_music"), true);
  assert.equal(ready.keys.moss_music?.toString(), "[REDACTED]");
  assert.ok(validateAiConfig(loadAiConfig({ MOSS_MUSIC_ENDPOINT: "https://example.modal.run/analyze", MOSS_MUSIC_TOKEN: "private-token-123456789012345678901234567890", AI_PROVIDER_ORDER: "groq" })).warnings.some((warning) => warning.includes("not listed in AI_PROVIDER_ORDER")));
  assert.ok(validateAiConfig(ready).warnings.some((warning) => warning.includes("AI_MAX_COST_CLASS=STANDARD")));
  assert.equal(isProviderConfigured(loadAiConfig({ AI_PROVIDER_ORDER: "moss_music", MOSS_MUSIC_ENDPOINT: "https://example.modal.run/analyze", MOSS_MUSIC_TOKEN: "short" }), "moss_music"), false);
  assert.equal(loadAiConfig({ AI_PROVIDER_ORDER: "moss_music", MOSS_MUSIC_ENDPOINT: "http://bad.example/analyze", MOSS_MUSIC_TOKEN: "private-token-123456789012345678901234567890" }).mossMusicEndpoint, null);
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


test("provider connections support multiple keys while redacting credentials and enforcing shared quota scopes", () => {
  const config = loadAiConfig({
    NODE_ENV: "test",
    AI_PROVIDER_CONNECTIONS_JSON: JSON.stringify([
      { id: "groq-primary", provider: "groq", apiKeyEnv: "GROQ_API_KEY", quotaScope: "groq-org", requestQuota: { dailyRequests: 80, monthlyRequests: 2000 } },
      { id: "groq-secondary", provider: "groq", apiKeyEnv: "GROQ_API_KEY_SECONDARY", quotaScope: "groq-org", requestQuota: { dailyRequests: 80, monthlyRequests: 2000 } },
    ]),
    GROQ_API_KEY: "groq-secret-primary-token",
    GROQ_API_KEY_SECONDARY: "groq-secret-secondary-token",
  });
  assert.deepEqual(config.connections.map((connection) => connection.id), ["groq-primary", "groq-secondary"]);
  assert.deepEqual(config.connections.map((connection) => connection.quotaScope), ["groq-org", "groq-org"]);
  assert.equal(configuredProviders(config).includes("groq"), true);
  const safe = JSON.stringify({ config, diagnostics: describeConfig(config) });
  assert.ok(!safe.includes("groq-secret-primary-token"));
  assert.ok(!safe.includes("groq-secret-secondary-token"));
  assert.ok(safe.includes("groq-primary"));
  assert.ok(safe.includes("groq-org"));
});

test("a repeated credential cannot be assigned to a second quota scope", () => {
  const config = loadAiConfig({
    NODE_ENV: "test",
    AI_PROVIDER_CONNECTIONS_JSON: JSON.stringify([
      { id: "groq-one", provider: "groq", apiKeyEnv: "GROQ_API_KEY", quotaScope: "org-one" },
      { id: "groq-two", provider: "groq", apiKeyEnv: "GROQ_API_KEY", quotaScope: "org-two" },
    ]),
    GROQ_API_KEY: "one-shared-groq-token",
  });
  assert.deepEqual(config.connections.map((connection) => connection.id), ["groq-one"]);
  assert.ok(config.issues.some((issue) => issue.includes("prevent quota rotation")));
});

test("Cloudflare API connections for the same account cannot be split across quota scopes", () => {
  const config = loadAiConfig({
    NODE_ENV: "test",
    AI_PROVIDER_CONNECTIONS_JSON: JSON.stringify([
      { id: "cf-one", provider: "cloudflare", apiKeyEnv: "CLOUDFLARE_API_TOKEN", accountIdEnv: "CLOUDFLARE_ACCOUNT_ID", quotaScope: "cf-scope-a" },
      { id: "cf-two", provider: "cloudflare", apiKeyEnv: "CLOUDFLARE_API_TOKEN_SECONDARY", accountIdEnv: "CLOUDFLARE_ACCOUNT_ID", quotaScope: "cf-scope-b" },
    ]),
    CLOUDFLARE_API_TOKEN: "cf-secret-one",
    CLOUDFLARE_API_TOKEN_SECONDARY: "cf-secret-two",
    CLOUDFLARE_ACCOUNT_ID: "abcdef0123456789abcdef0123456789",
  });
  assert.deepEqual(config.connections.map((connection) => connection.id), ["cf-one"]);
  assert.ok(config.issues.some((issue) => issue.includes("same account must share one quotaScope")));
});
