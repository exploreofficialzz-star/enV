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
import { COST_CLASSES, PROVIDER_IDS } from "../types.ts";
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

export interface AiConfig {
  enabled: boolean;
  production: boolean;
  keys: Record<RealProviderId, SecretString | null>;
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
] as const;

const DEFAULT_ORDER = "groq,openrouter,gemini";

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

function secret(value: string | undefined): SecretString | null {
  return value ? new SecretString(value) : null;
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

  return {
    enabled: readBool(env, "AI_ENABLED", true, issues),
    production,
    keys: {
      openrouter: secret(read(env, "OPENROUTER_API_KEY")),
      groq: secret(read(env, "GROQ_API_KEY")),
      gemini: secret(read(env, "GEMINI_API_KEY") ?? read(env, "GOOGLE_AI_API_KEY")),
    },
    providerOrder,
    disabledModels: new Set(readList(env, "AI_DISABLED_MODELS", false)),
    disabledFeatures: readList(env, "AI_DISABLED_FEATURES", true),
    maxCostClass,
    geminiTier,
    allowFreeTierForSensitive: readBool(env, "AI_SENSITIVE_ALLOW_FREE_TIER", false, issues),
    requireAuth: readBool(env, "AI_REQUIRE_AUTH", false, issues),
    authConfigured: read(env, "VITE_AUTH_ENABLED") === "true",
    authBaseUrl: readOrigin(env, "BETTER_AUTH_URL", issues),
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
  return config.keys[provider] !== null;
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
  for (const provider of ["openrouter", "groq", "gemini"] as const) {
    if (config.keys[provider] && !config.providerOrder.includes(provider)) {
      warnings.push(`${provider} has a key but is not listed in AI_PROVIDER_ORDER, so it will not be used.`);
    }
  }
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
