/**
 * SERVER ONLY. The model registry: one row per model the platform may route to.
 *
 * Rules for editing this file:
 * - Models, prices and limits change. Treat every row as configuration, re-verify it against the
 *   provider documentation before relying on it, and record what was checked in `notes`.
 * - Do not add a model you have not verified. A row here is a promise that the adapter can use it.
 * - Category/tool code never reads this file; only the router does.
 */
import type { CostClass, ModelPricing, ModelRecord, ProviderId } from "../../types.ts";
import { CAPABILITIES, COST_CLASSES, PROVIDER_IDS } from "../../types.ts";

const CHECKED = "Checked against provider docs on 2026-09-30.";

export const MODEL_REGISTRY: readonly ModelRecord[] = [
  {
    provider: "groq",
    modelId: "openai/gpt-oss-20b",
    displayName: "GPT-OSS 20B on Groq",
    capabilities: ["TEXT_GENERATION", "STRUCTURED_TEXT"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindow: 131_072,
    maxOutputTokens: 65_536,
    structuredOutput: "strict",
    toolCalling: true,
    streaming: true,
    costClass: "LOW",
    free: false,
    pricing: { inputPerMTok: 0.075, outputPerMTok: 0.3 },
    quality: "balanced",
    latency: "fast",
    priority: 10,
    enabled: true,
    reasoning: true,
    outputHeadroomTokens: 1500,
    sensitiveOk: true,
    notes: `${CHECKED} Price, context and max completion from console.groq.com/docs/models. Strict JSON schema mode is documented for the gpt-oss models. Hidden reasoning tokens count toward the completion budget.`,
  },
  {
    provider: "groq",
    modelId: "openai/gpt-oss-120b",
    displayName: "GPT-OSS 120B on Groq",
    capabilities: ["TEXT_GENERATION", "STRUCTURED_TEXT"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindow: 131_072,
    maxOutputTokens: 65_536,
    structuredOutput: "strict",
    toolCalling: true,
    streaming: true,
    costClass: "LOW",
    free: false,
    pricing: { inputPerMTok: 0.15, outputPerMTok: 0.6 },
    quality: "best",
    latency: "fast",
    priority: 20,
    enabled: true,
    reasoning: true,
    outputHeadroomTokens: 1500,
    sensitiveOk: true,
    notes: `${CHECKED} Price, context and max completion from console.groq.com/docs/models.`,
  },
  {
    provider: "groq",
    modelId: "whisper-large-v3-turbo",
    displayName: "Whisper Large v3 Turbo on Groq",
    capabilities: ["SPEECH_TO_TEXT"],
    inputModalities: ["audio"],
    outputModalities: ["text"],
    contextWindow: 0,
    maxOutputTokens: 0,
    structuredOutput: "none",
    toolCalling: false,
    streaming: false,
    costClass: "LOW",
    free: false,
    pricing: { perAudioHour: 0.04 },
    quality: "balanced",
    latency: "fast",
    priority: 10,
    enabled: true,
    reasoning: false,
    outputHeadroomTokens: 0,
    sensitiveOk: true,
    maxAudioBytes: 25 * 1024 * 1024,
    notes: `${CHECKED} Price from console.groq.com/docs/models. The 25 MB figure is the documented free-tier upload limit; enV's own request cap is lower.`,
  },
  {
    provider: "groq",
    modelId: "whisper-large-v3",
    displayName: "Whisper Large v3 on Groq",
    capabilities: ["SPEECH_TO_TEXT"],
    inputModalities: ["audio"],
    outputModalities: ["text"],
    contextWindow: 0,
    maxOutputTokens: 0,
    structuredOutput: "none",
    toolCalling: false,
    streaming: false,
    costClass: "LOW",
    free: false,
    pricing: { perAudioHour: 0.111 },
    quality: "best",
    latency: "normal",
    priority: 20,
    enabled: true,
    reasoning: false,
    outputHeadroomTokens: 0,
    sensitiveOk: true,
    maxAudioBytes: 25 * 1024 * 1024,
    notes: `${CHECKED} Price from console.groq.com/docs/models.`,
  },
  {
    provider: "openrouter",
    modelId: "openai/gpt-oss-20b:free",
    displayName: "GPT-OSS 20B (free) on OpenRouter",
    capabilities: ["TEXT_GENERATION", "STRUCTURED_TEXT"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    structuredOutput: "json-schema",
    toolCalling: true,
    streaming: true,
    costClass: "FREE",
    free: true,
    pricing: { inputPerMTok: 0, outputPerMTok: 0 },
    quality: "balanced",
    latency: "normal",
    priority: 30,
    enabled: true,
    reasoning: true,
    outputHeadroomTokens: 1500,
    sensitiveOk: false,
    notes: `${CHECKED} The free variant exists on OpenRouter's model page with 131K context and structured-output support. Free routes can be rate limited and providers may log prompts, so privacy-sensitive tasks never use it by default. The 16384 output cap is enV's own conservative cap.`,
  },
  {
    provider: "openrouter",
    modelId: "openai/gpt-oss-20b",
    displayName: "GPT-OSS 20B on OpenRouter",
    capabilities: ["TEXT_GENERATION", "STRUCTURED_TEXT"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextWindow: 131_072,
    maxOutputTokens: 16_384,
    structuredOutput: "json-schema",
    toolCalling: true,
    streaming: true,
    costClass: "LOW",
    free: false,
    pricing: { inputPerMTok: 0.02, outputPerMTok: 0.1 },
    quality: "balanced",
    latency: "normal",
    priority: 40,
    enabled: true,
    reasoning: true,
    outputHeadroomTokens: 1500,
    sensitiveOk: true,
    notes: `${CHECKED} Listed at $0.02/M input and $0.10/M output on OpenRouter's model page; routed providers can differ in price, so this is an estimate. The 16384 output cap is enV's own conservative cap.`,
  },
  {
    provider: "gemini",
    modelId: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    capabilities: ["TEXT_GENERATION", "STRUCTURED_TEXT", "VISION_ANALYSIS"],
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 1_000_000,
    maxOutputTokens: 16_384,
    structuredOutput: "json-schema",
    toolCalling: true,
    streaming: true,
    costClass: "STANDARD",
    free: false,
    pricing: { inputPerMTok: 0.75, outputPerMTok: 3.75 },
    pricingUntil: "2027-01-01",
    pricingAfter: { inputPerMTok: 1.5, outputPerMTok: 7.5 },
    quality: "best",
    latency: "normal",
    priority: 50,
    enabled: true,
    reasoning: true,
    outputHeadroomTokens: 2500,
    sensitiveOk: false,
    notes: `${CHECKED} Model id and the two-stage pricing ($0.75/$3.75 per 1M tokens through 2026-12-31, $1.50/$7.50 from 2027-01-01) are from ai.google.dev/gemini-api/docs/latest-model. The 1M context window comes from third-party listings and was not confirmed on the official page; the 16384 output cap is enV's own. A free tier exists and Google may use free-tier content to improve its products, so sensitive tasks only use this model when AI_GEMINI_TIER=paid.`,
  },
  {
    provider: "mock",
    modelId: "mock-text",
    displayName: "Mock text model (tests and local development only)",
    capabilities: ["TEXT_GENERATION", "STRUCTURED_TEXT", "VISION_ANALYSIS"],
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    structuredOutput: "strict",
    toolCalling: false,
    streaming: false,
    costClass: "FREE",
    free: true,
    pricing: { inputPerMTok: 0, outputPerMTok: 0 },
    quality: "fast",
    latency: "fast",
    priority: 1,
    enabled: true,
    reasoning: false,
    outputHeadroomTokens: 0,
    sensitiveOk: true,
    notes: "Deterministic fake. Never routed in production.",
  },
  {
    provider: "mock",
    modelId: "mock-stt",
    displayName: "Mock speech model (tests and local development only)",
    capabilities: ["SPEECH_TO_TEXT"],
    inputModalities: ["audio"],
    outputModalities: ["text"],
    contextWindow: 0,
    maxOutputTokens: 0,
    structuredOutput: "none",
    toolCalling: false,
    streaming: false,
    costClass: "FREE",
    free: true,
    pricing: { perAudioHour: 0 },
    quality: "fast",
    latency: "fast",
    priority: 1,
    enabled: true,
    reasoning: false,
    outputHeadroomTokens: 0,
    sensitiveOk: true,
    maxAudioBytes: 25 * 1024 * 1024,
    notes: "Deterministic fake. Never routed in production.",
  },
];

export function modelKey(model: Pick<ModelRecord, "provider" | "modelId">): string {
  return `${model.provider}:${model.modelId}`;
}

export function findModel(provider: ProviderId, modelId: string, models: readonly ModelRecord[] = MODEL_REGISTRY): ModelRecord | undefined {
  return models.find((m) => m.provider === provider && m.modelId === modelId);
}

/** Active price for a model at a point in time (handles dated price changes). */
export function resolvePricing(model: ModelRecord, at: number): ModelPricing | null {
  if (model.pricingUntil && at >= Date.parse(model.pricingUntil)) return model.pricingAfter ?? null;
  return model.pricing;
}

/** Cost class implied by a price list: FREE, then blended $/1M tokens (or $/audio hour) bands. */
export function deriveCostClass(pricing: ModelPricing | null): CostClass | null {
  if (!pricing) return null;
  const tokens = (pricing.inputPerMTok ?? 0) + (pricing.outputPerMTok ?? 0);
  const audio = pricing.perAudioHour ?? 0;
  if (tokens === 0 && audio === 0) return "FREE";
  if (audio > 0) return audio <= 0.25 ? "LOW" : audio <= 1 ? "STANDARD" : "PREMIUM";
  if (tokens <= 1) return "LOW";
  if (tokens <= 10) return "STANDARD";
  return "PREMIUM";
}

/** Returns a list of problems; empty means the registry is internally consistent. */
export function validateModelRegistry(models: readonly ModelRecord[] = MODEL_REGISTRY): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const m of models) {
    const id = modelKey(m);
    const fail = (message: string) => problems.push(`${id}: ${message}`);
    if (seen.has(id)) fail("duplicate provider/model id");
    seen.add(id);
    if (!(PROVIDER_IDS as readonly string[]).includes(m.provider)) fail("unknown provider");
    if (!m.modelId.trim() || !m.displayName.trim()) fail("missing modelId or displayName");
    if (m.capabilities.length === 0) fail("no capabilities");
    for (const c of m.capabilities) if (!(CAPABILITIES as readonly string[]).includes(c)) fail(`unknown capability ${c}`);
    if (!(COST_CLASSES as readonly string[]).includes(m.costClass)) fail("unknown cost class");

    const has = (c: (typeof CAPABILITIES)[number]) => m.capabilities.includes(c);
    if (has("STRUCTURED_TEXT") !== (m.structuredOutput !== "none")) fail("STRUCTURED_TEXT capability and structuredOutput disagree");
    if (has("VISION_ANALYSIS") && !m.inputModalities.includes("image")) fail("vision model without image input");
    if (has("SPEECH_TO_TEXT")) {
      if (!m.inputModalities.includes("audio")) fail("speech model without audio input");
      if (!m.maxAudioBytes || m.maxAudioBytes <= 0) fail("speech model without maxAudioBytes");
    }
    if ((has("TEXT_GENERATION") || has("STRUCTURED_TEXT") || has("VISION_ANALYSIS")) && !m.outputModalities.includes("text")) fail("text capability without text output");
    if (!has("SPEECH_TO_TEXT") && (m.contextWindow <= 0 || m.maxOutputTokens <= 0)) fail("text model needs contextWindow and maxOutputTokens");
    if (m.outputHeadroomTokens < 0 || (!m.reasoning && m.outputHeadroomTokens !== 0)) fail("outputHeadroomTokens only applies to reasoning models");
    if (!Number.isFinite(m.priority)) fail("priority must be finite");

    if (m.free) {
      if (m.costClass !== "FREE") fail("free model must have costClass FREE");
      if (m.pricing && deriveCostClass(m.pricing) !== "FREE") fail("free model has non-zero pricing");
    } else if (m.costClass === "FREE") {
      fail("costClass FREE requires free=true");
    }
    if (m.provider !== "mock" && !m.free && !m.pricing) fail("paid model needs pricing so cost can be estimated");
    const derived = deriveCostClass(m.pricing);
    if (derived && derived !== m.costClass) fail(`costClass ${m.costClass} does not match pricing (${derived})`);
    if (m.pricingUntil) {
      if (Number.isNaN(Date.parse(m.pricingUntil))) fail("pricingUntil is not a valid date");
      if (m.pricingAfter === undefined) fail("pricingUntil requires pricingAfter");
    }
    if (m.provider !== "mock" && !m.notes?.trim()) fail("real providers need notes recording what was verified");
  }
  return problems;
}
