/**
 * SERVER ONLY. Central AI configuration.
 *
 * - Secrets are read here (and only here) from process.env and wrapped in SecretString so a
 *   stray JSON.stringify / console.log / error message cannot leak them.
 * - Invalid values never crash the app: they fall back to safe defaults and are recorded in
 *   `issues`, which validateAiConfig() and the deployment check report.
 * - Optional providers may be absent; the app and the deterministic tools keep working.
 */
import { inspect } from "node:util";
import { COST_CLASSES, COST_RANK, PROVIDER_IDS } from "../types.ts";
import type { CostClass, ProviderId } from "../types.ts";

export class SecretString {
  readonly #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  reveal(): string {
    return this.#value;
  }
  toString(): string {
    return "[REDACTED]";
  }
  toJSON(): string {
    return "[REDACTED]";
  }
  [inspect.custom](): string {
    return "[REDACTED]";
  }
}

export type RealProviderId = Exclude<ProviderId, "mock">;
export type GeminiTier = "free" | "paid" | "unknown";

export interface AiLimitsConfig {
  maxBodyBytes: number;
  /** Rate units (a text task costs 1, vision 3, speech 5). */
  perSessionPerMinute: number;
  perSessionPerDay: number;
  perIpPerMinute: number;
  dailyRequests: number;
  dailyBudgetUsd: number;
}

export interface ProviderConnectionConfig {
  id: string;
  provider: RealProviderId;
  apiKey: SecretString;
  quotaScope: string;
  accountId?: string;
  requestQuota?: { dailyRequests?: number; monthlyRequests?: number };
}

export interface AiConfig {
  enabled: boolean;
  production: boolean;
  keys: Record<RealProviderId, SecretString | null>;
  /** Multiple API credentials may be configured for each provider family. */
  connections: ProviderConnectionConfig[];
  /** Providers in this list (and only these) may be routed to, in priority order. */
  providerOrder: ProviderId[];
  disabledModels: ReadonlySet<string>;
  disabledFeatures: readonly string[];
  maxCostClass: CostClass;
  geminiTier: GeminiTier;
  /** Deployer explicitly accepts routing privacy-sensitive tasks to free-tier/may-train models. */
  allowFreeTierForSensitive: boolean;
  requireAuth: boolean;
  authConfigured: boolean;
  /** Origin of the app's own auth API (from BETTER_AUTH_URL), used to look up the signed-in user. */
  authBaseUrl: string | null;
  /** Optional private MOSS-Music inference service on Modal. */
  mossMusicEndpoint: string | null;
  cacheEnabled: boolean;
  debug: boolean;
  adminToken: SecretString | null;
  sessionSecret: SecretString | null;
  limits: AiLimitsConfig;
  /** Problems found while parsing the environment (invalid values fell back to defaults). */
  issues: string[];
}

type Env = Record<string, string | undefined>;

/** Secret env var names. None of these may ever carry a public-client prefix. */
export const SECRET_ENV_NAMES = [
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "HF_TOKEN",
  "AI_ADMIN_TOKEN",
  "AI_SESSION_SECRET",
  "MOSS_MUSIC_TOKEN",
  "CLOUDFLARE_API_TOKEN",
] as const;

const DEFAULT_ORDER = "moss_music,groq,openrouter,gemini,cloudflare";

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readBool(env: Env, name: string, fallback: boolean, issues: string[]): boolean {
  const value = read(env, name)?.toLowerCase();
  if (value === undefined) return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  issues.push(`${name} must be true or false; using ${fallback}.`);
  return fallback;
}

function readNumber(env: Env, name: string, fallback: number, min: number, max: number, issues: string[]): number {
  const raw = read(env, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    issues.push(`${name} must be a number between ${min} and ${max}; using ${fallback}.`);
    return fallback;
  }
  return value;
}

function readList(env: Env, name: string, lower: boolean): string[] {
  const raw = read(env, name);
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => (lower ? part.trim().toLowerCase() : part.trim()))
    .filter(Boolean);
}

function readOrigin(env: Env, name: string, issues: string[]): string | null {
  const raw = read(env, name);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
    return url.origin;
  } catch {
    issues.push(`${name} must be an http(s) URL; ignoring it for AI sign-in checks.`);
    return null;
  }
}

function readMusicEndpoint(env: Env, issues: string[]): string | null {
  const raw = read(env, "MOSS_MUSIC_ENDPOINT");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const localHttp = env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:";
    if (url.protocol !== "https:" && !localHttp) throw new Error("scheme");
    return url.toString().replace(/\/+$/, "");
  } catch {
    issues.push("MOSS_MUSIC_ENDPOINT must be an HTTPS URL (HTTP is allowed only for localhost in development); MOSS-Music will remain unavailable.");
    return null;
  }
}

function secret(value: string | undefined): SecretString | null {
  return value ? new SecretString(value) : null;
}

const PROVIDER_KEY_ENV: Record<RealProviderId, RegExp> = {
  openrouter: /^OPENROUTER_API_KEY(?:_[A-Z0-9_]+)?$/,
  groq: /^GROQ_API_KEY(?:_[A-Z0-9_]+)?$/,
  gemini: /^(?:GEMINI_API_KEY|GOOGLE_AI_API_KEY)(?:_[A-Z0-9_]+)?$/,
  moss_music: /^MOSS_MUSIC_TOKEN(?:_[A-Z0-9_]+)?$/,
  cloudflare: /^CLOUDFLARE_API_TOKEN(?:_[A-Z0-9_]+)?$/,
};

function parseConnectionQuota(value: unknown, issues: string[], id: string): ProviderConnectionConfig["requestQuota"] {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    issues.push('Connection "' + id + '" has an invalid requestQuota object; skipped.');
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const quota: { dailyRequests?: number; monthlyRequests?: number } = {};
  for (const field of ["dailyRequests", "monthlyRequests"] as const) {
    const candidate = source[field];
    if (candidate === undefined) continue;
    if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < 1 || candidate > 1_000_000_000) {
      issues.push('Connection "' + id + '" has invalid ' + field + '; skipped.');
      return undefined;
    }
    quota[field] = candidate;
  }
  return Object.keys(quota).length ? quota : undefined;
}

function loadConnections(env: Env, mossMusicEndpoint: string | null, issues: string[]): ProviderConnectionConfig[] {
  const raw = read(env, "AI_PROVIDER_CONNECTIONS_JSON");
  let declared: unknown[] = [];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length > 32) throw new Error("shape");
      declared = parsed;
    } catch {
      issues.push("AI_PROVIDER_CONNECTIONS_JSON must be an array of at most 32 connection objects; invalid entries were ignored.");
    }
  }

  const connections: ProviderConnectionConfig[] = [];
  const ids = new Set<string>();
  const usedKeyEnvs = new Set<string>();
  const secretScopes = new Map<string, string>();
  const accountScopes = new Map<string, string>();
  const quotaDefinitions = new Map<string, string>();

  const add = (spec: { id: unknown; provider: unknown; apiKeyEnv: unknown; quotaScope: unknown; accountIdEnv?: unknown; requestQuota?: unknown }) => {
    const id = typeof spec.id === "string" ? spec.id.trim() : "";
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id) || ids.has(id)) {
      issues.push("AI provider connection has an invalid or duplicate id; skipped.");
      return;
    }
    if (typeof spec.provider !== "string" || !Object.prototype.hasOwnProperty.call(PROVIDER_KEY_ENV, spec.provider)) {
      issues.push('Connection "' + id + '" names an unsupported provider; skipped.');
      return;
    }
    const provider = spec.provider as RealProviderId;
    const apiKeyEnv = typeof spec.apiKeyEnv === "string" ? spec.apiKeyEnv.trim() : "";
    const scope = typeof spec.quotaScope === "string" ? spec.quotaScope.trim() : "";
    if (!PROVIDER_KEY_ENV[provider].test(apiKeyEnv)) {
      issues.push('Connection "' + id + '" has an apiKeyEnv that does not match its provider; skipped.');
      return;
    }
    if (!/^[a-z0-9][a-z0-9._:-]{0,95}$/.test(scope)) {
      issues.push('Connection "' + id + '" has an invalid quotaScope; skipped.');
      return;
    }
    const secretValue = read(env, apiKeyEnv);
    if (!secretValue) {
      issues.push('Connection "' + id + '" references a missing server environment variable; skipped.');
      return;
    }

    const accountIdEnv = typeof spec.accountIdEnv === "string" ? spec.accountIdEnv.trim() : "";
    let accountId: string | undefined;
    if (provider === "cloudflare") {
      if (!/^CLOUDFLARE_ACCOUNT_ID(?:_[A-Z0-9_]+)?$/.test(accountIdEnv)) {
        issues.push('Cloudflare connection "' + id + '" must reference CLOUDFLARE_ACCOUNT_ID through accountIdEnv; skipped.');
        return;
      }
      accountId = read(env, accountIdEnv);
      if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId)) {
        issues.push('Cloudflare connection "' + id + '" has a missing or invalid account id; skipped.');
        return;
      }
    } else if (accountIdEnv) {
      issues.push('Non-Cloudflare connection "' + id + '" cannot specify accountIdEnv; skipped.');
      return;
    }
    if (provider === "moss_music" && (!mossMusicEndpoint || secretValue.length < 32)) {
      issues.push('MOSS-Music connection "' + id + '" needs a valid endpoint and a token of at least 32 characters; skipped.');
      return;
    }

    const requestQuota = parseConnectionQuota(spec.requestQuota, issues, id);
    if (spec.requestQuota !== undefined && spec.requestQuota !== null && requestQuota === undefined) return;
    const providerScope = provider + ":" + scope;
    const limitKey = JSON.stringify(requestQuota ?? {});
    const priorLimits = quotaDefinitions.get(providerScope);
    if (priorLimits !== undefined && priorLimits !== limitKey) {
      issues.push('Connection "' + id + '" has different request limits from the other keys in quotaScope "' + scope + '"; skipped.');
      return;
    }
    const tokenScopeKey = provider + ":" + secretValue;
    const priorScope = secretScopes.get(tokenScopeKey);
    if (priorScope !== undefined && priorScope !== scope) {
      issues.push('Connection "' + id + '" reuses a credential across different quota scopes; skipped to prevent quota rotation.');
      return;
    }
    if (priorScope === scope) {
      issues.push('Connection "' + id + '" duplicates an existing credential in the same quota scope; skipped.');
      return;
    }
    if (provider === "cloudflare") {
      const priorAccountScope = accountScopes.get(accountId!);
      if (priorAccountScope !== undefined && priorAccountScope !== scope) {
        issues.push('Cloudflare connections for the same account must share one quotaScope; connection "' + id + '" was skipped.');
        return;
      }
      accountScopes.set(accountId!, scope);
    }

    ids.add(id);
    usedKeyEnvs.add(apiKeyEnv);
    secretScopes.set(tokenScopeKey, scope);
    quotaDefinitions.set(providerScope, limitKey);
    connections.push({
      id, provider, apiKey: new SecretString(secretValue), quotaScope: scope,
      ...(accountId ? { accountId } : {}),
      ...(requestQuota ? { requestQuota } : {}),
    });
  };

  for (const entry of declared) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push("AI_PROVIDER_CONNECTIONS_JSON contains a non-object entry; skipped.");
      continue;
    }
    const item = entry as Record<string, unknown>;
    add({ id: item.id, provider: item.provider, apiKeyEnv: item.apiKeyEnv, quotaScope: item.quotaScope, accountIdEnv: item.accountIdEnv, requestQuota: item.requestQuota });
  }

  const defaults: Array<{ provider: RealProviderId; id: string; env: string; scope: string; accountIdEnv?: string }> = [
    { provider: "moss_music", id: "moss-music-default", env: "MOSS_MUSIC_TOKEN", scope: "default" },
    { provider: "groq", id: "groq-default", env: "GROQ_API_KEY", scope: "default" },
    { provider: "openrouter", id: "openrouter-default", env: "OPENROUTER_API_KEY", scope: "default" },
    { provider: "gemini", id: "gemini-default", env: read(env, "GEMINI_API_KEY") ? "GEMINI_API_KEY" : "GOOGLE_AI_API_KEY", scope: "default" },
    { provider: "cloudflare", id: "cloudflare-default", env: "CLOUDFLARE_API_TOKEN", scope: "account-" + (read(env, "CLOUDFLARE_ACCOUNT_ID") ?? "unconfigured").toLowerCase(), accountIdEnv: "CLOUDFLARE_ACCOUNT_ID" },
  ];
  // Once an explicit registry is supplied, every credential must be declared so quota scopes
  // cannot accidentally split implicit default keys from explicitly grouped keys.
  for (const item of raw ? [] : defaults) {
    if (usedKeyEnvs.has(item.env) || !read(env, item.env)) continue;
    if (item.provider === "cloudflare" && !read(env, item.accountIdEnv!)) {
      issues.push("CLOUDFLARE_API_TOKEN is present but CLOUDFLARE_ACCOUNT_ID is missing; Cloudflare remains unavailable.");
      continue;
    }
    add({ id: item.id, provider: item.provider, apiKeyEnv: item.env, quotaScope: item.scope, ...(item.accountIdEnv ? { accountIdEnv: item.accountIdEnv } : {}) });
  }
  return connections;
}

export function loadAiConfig(env: Env = process.env): AiConfig {
  const issues: string[] = [];
  const production = env.NODE_ENV === "production" || env.VERCEL === "1";

  const requestedOrder = readList(env, "AI_PROVIDER_ORDER", true);
  const providerOrder: ProviderId[] = [];
  for (const name of requestedOrder.length ? requestedOrder : DEFAULT_ORDER.split(",")) {
    if (!(PROVIDER_IDS as readonly string[]).includes(name)) {
      issues.push(`AI_PROVIDER_ORDER contains unknown provider "${name}"; ignored.`);
      continue;
    }
    if (name === "mock" && production) {
      issues.push("The mock provider is never allowed in production; ignored.");
      continue;
    }
    if (!providerOrder.includes(name as ProviderId)) providerOrder.push(name as ProviderId);
  }

  let maxCostClass: CostClass = "LOW";
  const rawClass = read(env, "AI_MAX_COST_CLASS")?.toUpperCase();
  if (rawClass) {
    if ((COST_CLASSES as readonly string[]).includes(rawClass)) maxCostClass = rawClass as CostClass;
    else issues.push(`AI_MAX_COST_CLASS must be one of ${COST_CLASSES.join(", ")}; using LOW.`);
  }

  let geminiTier: GeminiTier = "unknown";
  const rawTier = read(env, "AI_GEMINI_TIER")?.toLowerCase();
  if (rawTier) {
    if (rawTier === "free" || rawTier === "paid") geminiTier = rawTier;
    else issues.push('AI_GEMINI_TIER must be "free" or "paid"; treating the tier as unknown.');
  }

  const perSessionPerMinute = readNumber(env, "AI_RATE_LIMIT_PER_MINUTE", 12, 1, 600, issues);
  const mossMusicEndpoint = readMusicEndpoint(env, issues);
  const keys: AiConfig["keys"] = {
    openrouter: secret(read(env, "OPENROUTER_API_KEY")),
    groq: secret(read(env, "GROQ_API_KEY")),
    gemini: secret(read(env, "GEMINI_API_KEY") ?? read(env, "GOOGLE_AI_API_KEY")),
    moss_music: secret(read(env, "MOSS_MUSIC_TOKEN")),
    cloudflare: secret(read(env, "CLOUDFLARE_API_TOKEN")),
  };
  const connections = loadConnections(env, mossMusicEndpoint, issues);

  return {
    enabled: readBool(env, "AI_ENABLED", true, issues),
    production,
    keys,
    connections,
    providerOrder,
    disabledModels: new Set(readList(env, "AI_DISABLED_MODELS", false)),
    disabledFeatures: readList(env, "AI_DISABLED_FEATURES", true),
    maxCostClass,
    geminiTier,
    allowFreeTierForSensitive: readBool(env, "AI_SENSITIVE_ALLOW_FREE_TIER", false, issues),
    requireAuth: readBool(env, "AI_REQUIRE_AUTH", false, issues),
    authConfigured: read(env, "VITE_AUTH_ENABLED") === "true",
    authBaseUrl: readOrigin(env, "BETTER_AUTH_URL", issues),
    mossMusicEndpoint,
    cacheEnabled: readBool(env, "AI_CACHE_ENABLED", true, issues),
    debug: readBool(env, "AI_DEBUG", false, issues),
    adminToken: secret(read(env, "AI_ADMIN_TOKEN")),
    sessionSecret: secret(read(env, "AI_SESSION_SECRET")),
    limits: {
      maxBodyBytes: 4_000_000, // stays under Vercel's 4.5 MB function request-body limit
      perSessionPerMinute,
      perSessionPerDay: readNumber(env, "AI_RATE_LIMIT_PER_DAY", 150, 1, 100_000, issues),
      perIpPerMinute: readNumber(env, "AI_RATE_LIMIT_PER_IP_PER_MINUTE", perSessionPerMinute * 5, 1, 1_000_000, issues),
      dailyRequests: readNumber(env, "AI_DAILY_REQUEST_LIMIT", 2000, 1, 10_000_000, issues),
      dailyBudgetUsd: readNumber(env, "AI_DAILY_BUDGET_USD", 2, 0, 100_000, issues),
    },
    issues,
  };
}

export function isProviderConfigured(config: AiConfig, provider: ProviderId): boolean {
  if (!config.providerOrder.includes(provider)) return false;
  if (provider === "mock") return !config.production;
  return config.connections.some((connection) => connection.provider === provider);
}

export function configuredProviders(config: AiConfig): ProviderId[] {
  return config.providerOrder.filter((id) => isProviderConfigured(config, id));
}

/** True when a feature flag disables this task (exact id or a `prefix.` match). */
export function isTaskDisabledByFlag(config: AiConfig, taskId: string): boolean {
  const id = taskId.toLowerCase();
  return config.disabledFeatures.some((flag) => id === flag || (flag.endsWith(".") && id.startsWith(flag)));
}

export interface ConfigValidation {
  errors: string[];
  warnings: string[];
}

export function validateAiConfig(config: AiConfig): ConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  warnings.push(...config.issues);

  if (config.production && config.providerOrder.includes("mock")) errors.push("The mock provider is enabled in production.");
  if (config.requireAuth && !config.authConfigured) {
    errors.push("AI_REQUIRE_AUTH=true but authentication is disabled (VITE_AUTH_ENABLED is not true); every AI request would be rejected.");
  }
  if (config.enabled && configuredProviders(config).length === 0) {
    warnings.push("AI is enabled but no provider is configured; AI controls stay hidden and the deterministic tools are unaffected.");
  }
  for (const provider of Object.keys(config.keys) as RealProviderId[]) {
    if (config.keys[provider] && !config.providerOrder.includes(provider)) {
      warnings.push(`${provider} has a key but is not listed in AI_PROVIDER_ORDER, so it will not be used.`);
    }
  }
  if ((config.mossMusicEndpoint === null) !== (config.keys.moss_music === null)) warnings.push("MOSS_MUSIC_ENDPOINT and MOSS_MUSIC_TOKEN must both be configured before the self-hosted MOSS-Music provider can run.");
  if (config.mossMusicEndpoint && config.keys.moss_music && config.keys.moss_music.reveal().length >= 32 && !config.providerOrder.includes("moss_music")) warnings.push("MOSS-Music is configured but not listed in AI_PROVIDER_ORDER, so audio tagging will not use it.");
  if (config.mossMusicEndpoint && config.keys.moss_music && config.keys.moss_music.reveal().length >= 32 && COST_RANK[config.maxCostClass] < COST_RANK.STANDARD) warnings.push("MOSS-Music is a STANDARD-cost GPU model and is excluded by AI_MAX_COST_CLASS; set AI_MAX_COST_CLASS=STANDARD after reviewing the Modal budget.");
  if (config.keys.moss_music && config.keys.moss_music.reveal().length < 32) warnings.push("MOSS_MUSIC_TOKEN must be at least 32 characters; MOSS-Music remains unavailable until a longer random token is configured.");
  if (config.keys.cloudflare && !config.connections.some((connection) => connection.provider === "cloudflare")) warnings.push("Cloudflare is not configured: check CLOUDFLARE_ACCOUNT_ID and the connection settings.");
  if (config.keys.gemini && config.geminiTier === "unknown") {
    warnings.push("AI_GEMINI_TIER is not set: Gemini is treated as a free tier that may use content to improve Google products, so privacy-sensitive tasks (images, audio, JSON) will not use it. Set AI_GEMINI_TIER=paid if billing is enabled.");
  }
  if (config.adminToken && config.adminToken.reveal().length < 24) {
    errors.push("AI_ADMIN_TOKEN is shorter than 24 characters.");
  }
  if (config.production && !config.sessionSecret) {
    warnings.push("AI_SESSION_SECRET is not set: anonymous session cookies will not survive cold starts, weakening per-session rate limits.");
  }
  return { errors, warnings };
}

/** Secret-free view of the configuration for diagnostics. */
export function describeConfig(config: AiConfig) {
  return {
    enabled: config.enabled,
    production: config.production,
    providerOrder: config.providerOrder,
    providers: Object.fromEntries(
      PROVIDER_IDS.map((id) => [id, { inOrder: config.providerOrder.includes(id), configured: isProviderConfigured(config, id) }]),
    ),
    connections: config.connections.map(({ id, provider, quotaScope, requestQuota }) => ({ id, provider, quotaScope: provider + ":" + quotaScope, requestQuota: requestQuota ?? null })),
    maxCostClass: config.maxCostClass,
    geminiTier: config.geminiTier,
    allowFreeTierForSensitive: config.allowFreeTierForSensitive,
    requireAuth: config.requireAuth,
    cacheEnabled: config.cacheEnabled,
    disabledFeatures: config.disabledFeatures,
    disabledModels: [...config.disabledModels],
    limits: config.limits,
  };
}
