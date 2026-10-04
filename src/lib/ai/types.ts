/**
 * Shared, framework-free types for the enV AI platform.
 *
 * Nothing in this file touches secrets, providers or the network, so it is safe
 * to import from both browser and server code. Only erasable TypeScript syntax
 * is used (no enums / parameter properties) so `node --experimental-strip-types`
 * can run the test-suite directly.
 */

/** Capabilities the current implementation can actually execute. */
export const CAPABILITIES = [
  "TEXT_GENERATION",
  "STRUCTURED_TEXT",
  "VISION_ANALYSIS",
  "SPEECH_TO_TEXT",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const PROVIDER_IDS = ["openrouter", "groq", "gemini", "mock"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const COST_CLASSES = ["FREE", "LOW", "STANDARD", "PREMIUM"] as const;
export type CostClass = (typeof COST_CLASSES)[number];
export const COST_RANK: Record<CostClass, number> = { FREE: 0, LOW: 1, STANDARD: 2, PREMIUM: 3 };

export const QUALITY_TIERS = ["fast", "balanced", "best"] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];
export const QUALITY_RANK: Record<QualityTier, number> = { fast: 0, balanced: 1, best: 2 };

export type LatencyClass = "fast" | "normal" | "slow";
export type Modality = "text" | "image" | "audio";
export type PrivacyLevel = "standard" | "sensitive";
/** strict = provider enforces the schema, json-schema = best-effort schema, none = prompt only. */
export type StructuredSupport = "strict" | "json-schema" | "none";
export type FinishReason = "stop" | "length" | "content-filter" | "error" | "unknown";
export type JsonSchema = { [key: string]: unknown };

export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; dataBase64: string }
  | { type: "audio"; mimeType: string; dataBase64: string; filename?: string };

export interface Usage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  audioSeconds: number | null;
}

export interface CostEstimate {
  /** null means the price is not configured/known - never a fabricated number. */
  usd: number | null;
  basis: "estimated" | "unknown";
}

/** What a provider adapter receives. Provider-specific payloads stay inside adapters. */
export interface AdapterRequest {
  capability: Capability;
  model: string;
  system: string;
  user: AiContentPart[];
  /** Present for STRUCTURED_TEXT. */
  jsonSchema?: JsonSchema;
  /** How hard the provider should enforce jsonSchema (from the model record). */
  structuredSupport: StructuredSupport;
  maxOutputTokens: number;
  temperature: number;
  /** Lets providers apply stricter data handling (e.g. no provider-side logging) when sensitive. */
  privacy: PrivacyLevel;
  /** Stable identifier for the JSON schema (some providers require a schema name). */
  schemaName: string;
  language?: string;
  signal: AbortSignal;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface AdapterResult {
  /** Raw text (TEXT_GENERATION / STRUCTURED_TEXT / VISION_ANALYSIS). */
  text: string;
  /** Present for SPEECH_TO_TEXT. */
  transcript?: { text: string; language?: string; segments: TranscriptSegment[] };
  usage: Usage;
  finishReason: FinishReason;
  /** Model identifier as reported by the provider (informational only). */
  reportedModel?: string;
}

/**
 * Every provider adapter implements this contract. Adapters throw AiError for every
 * failure so the core never sees provider-specific errors.
 */
export interface ProviderAdapter {
  readonly id: ProviderId;
  /** True when credentials/config are present. Never throws. */
  isConfigured(): boolean;
  /** The adapter must report what it can really do; never pretend. */
  supports(capability: Capability, modelId: string): boolean;
  execute(request: AdapterRequest): Promise<AdapterResult>;
}

export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPerMTok?: number;
  /** USD per 1M output tokens (includes reasoning tokens where the provider bills them). */
  outputPerMTok?: number;
  /** USD per hour of audio. */
  perAudioHour?: number;
}

export interface ModelQuota {
  /** Requests per UTC day this deployment allows itself on this model. */
  dailyRequests?: number;
  monthlyRequests?: number;
}

/** One row of the model registry. Contains no secrets. */
export interface ModelRecord {
  provider: ProviderId;
  modelId: string;
  displayName: string;
  capabilities: Capability[];
  inputModalities: Modality[];
  outputModalities: Modality[];
  contextWindow: number;
  maxOutputTokens: number;
  structuredOutput: StructuredSupport;
  toolCalling: boolean;
  streaming: boolean;
  costClass: CostClass;
  free: boolean;
  /** null = unknown; pricing is configuration, never assumed permanent. */
  pricing: ModelPricing | null;
  /** Optional dated price change: `pricing` applies until this ISO date (exclusive), then `pricingAfter`. */
  pricingUntil?: string;
  pricingAfter?: ModelPricing | null;
  quality: QualityTier;
  latency: LatencyClass;
  /** Lower wins ties. */
  priority: number;
  enabled: boolean;
  /** Reasoning models consume hidden output tokens, so the core adds headroom to the output budget. */
  reasoning: boolean;
  outputHeadroomTokens: number;
  /**
   * False when this route may keep or train on prompts (free tiers). Privacy-sensitive tasks are
   * only routed to models with sensitiveOk=true unless the deployer explicitly overrides it.
   */
  sensitiveOk: boolean;
  quota?: ModelQuota;
  /** Largest audio upload (bytes) for SPEECH_TO_TEXT models. */
  maxAudioBytes?: number;
  /** Free-form audit trail, e.g. when the record was checked against provider docs. */
  notes?: string;
}

export interface AiResult<T = unknown> {
  requestId: string;
  taskId: string;
  promptVersion: string;
  provider: ProviderId;
  model: string;
  capability: Capability;
  status: "ok";
  result: T;
  usage: Usage;
  cost: CostEstimate;
  latencyMs: number;
  finishReason: FinishReason;
  fallbackUsed: boolean;
  attempts: number;
  cached: boolean;
  warnings: string[];
}

export interface PublicAiError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
}
