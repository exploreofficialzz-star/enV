/**
 * Typed AI errors. Client-safe: contains no secrets and no provider details.
 *
 * Adapters and the core throw AiError for every failure; nothing provider-specific
 * (URLs, response bodies, headers, keys) is ever placed in a message.
 */
import type { PublicAiError } from "./types.ts";

export const AI_ERROR_CODES = [
  "AI_CONFIGURATION_ERROR",
  "AI_AUTH_ERROR",
  "AI_AUTH_REQUIRED",
  "AI_FORBIDDEN",
  "AI_DISABLED",
  "AI_TASK_UNKNOWN",
  "AI_RATE_LIMITED",
  "AI_QUOTA_EXCEEDED",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_PROVIDER_TIMEOUT",
  "AI_PROVIDER_BAD_RESPONSE",
  "AI_UNSUPPORTED_CAPABILITY",
  "AI_INVALID_INPUT",
  "AI_OUTPUT_VALIDATION_FAILED",
  "AI_CONTENT_TOO_LARGE",
  "AI_REQUEST_CANCELLED",
  "AI_ALL_PROVIDERS_FAILED",
  "AI_INTERNAL_ERROR",
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

interface Traits {
  /** HTTP status the enV API answers with. */
  http: number;
  /** Safe to retry the same model (transient). */
  retryable: boolean;
  /** Safe to try another compatible model/provider. */
  fallbackable: boolean;
  /** Safe, user-facing text. */
  message: string;
  /** Code exposed to the browser when it differs from the internal one. */
  publicCode?: AiErrorCode;
}

const UNAVAILABLE = "This AI request is temporarily unavailable. Please try again.";

const TRAITS: Record<AiErrorCode, Traits> = {
  AI_CONFIGURATION_ERROR: { http: 503, retryable: false, fallbackable: false, message: "AI is not set up on this deployment. The local tool still works." },
  AI_AUTH_ERROR: { http: 503, retryable: false, fallbackable: true, message: UNAVAILABLE, publicCode: "AI_PROVIDER_UNAVAILABLE" },
  AI_AUTH_REQUIRED: { http: 401, retryable: false, fallbackable: false, message: "Sign in to use AI features." },
  AI_FORBIDDEN: { http: 403, retryable: false, fallbackable: false, message: "This request is not allowed." },
  AI_DISABLED: { http: 503, retryable: false, fallbackable: false, message: "AI features are turned off. The local tool still works." },
  AI_TASK_UNKNOWN: { http: 404, retryable: false, fallbackable: false, message: "That AI action does not exist." },
  AI_RATE_LIMITED: { http: 429, retryable: false, fallbackable: true, message: "You are sending AI requests too quickly. Please wait a moment and try again." },
  AI_QUOTA_EXCEEDED: { http: 429, retryable: false, fallbackable: true, message: "The AI usage limit has been reached. Please try again later." },
  AI_PROVIDER_UNAVAILABLE: { http: 503, retryable: true, fallbackable: true, message: UNAVAILABLE },
  AI_PROVIDER_TIMEOUT: { http: 504, retryable: true, fallbackable: true, message: UNAVAILABLE },
  AI_PROVIDER_BAD_RESPONSE: { http: 502, retryable: false, fallbackable: true, message: UNAVAILABLE, publicCode: "AI_PROVIDER_UNAVAILABLE" },
  AI_UNSUPPORTED_CAPABILITY: { http: 503, retryable: false, fallbackable: true, message: "This AI feature is unavailable right now, but the local tool is still available." },
  AI_INVALID_INPUT: { http: 400, retryable: false, fallbackable: false, message: "That input cannot be processed." },
  AI_OUTPUT_VALIDATION_FAILED: { http: 502, retryable: false, fallbackable: true, message: "The AI response was not usable. Please try again." },
  AI_CONTENT_TOO_LARGE: { http: 413, retryable: false, fallbackable: false, message: "That input is too large for AI. Try a smaller selection." },
  AI_REQUEST_CANCELLED: { http: 408, retryable: false, fallbackable: false, message: "Request cancelled." },
  AI_ALL_PROVIDERS_FAILED: { http: 503, retryable: true, fallbackable: false, message: UNAVAILABLE },
  AI_INTERNAL_ERROR: { http: 500, retryable: true, fallbackable: false, message: "Something went wrong with the AI request. Please try again." },
};

export interface AiErrorOptions {
  /** Short, safe detail. Only surfaced to users for INVALID_INPUT / CONTENT_TOO_LARGE. */
  detail?: string;
  retryAfterSeconds?: number;
  provider?: string;
  model?: string;
  /** HTTP status the provider answered with (diagnostics only; never the body). */
  upstreamStatus?: number;
  retryable?: boolean;
  fallbackable?: boolean;
}

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly fallbackable: boolean;
  readonly retryAfterSeconds: number | undefined;
  readonly detail: string | undefined;
  readonly provider: string | undefined;
  readonly model: string | undefined;
  readonly upstreamStatus: number | undefined;

  constructor(code: AiErrorCode, options: AiErrorOptions = {}) {
    super(options.detail ?? TRAITS[code].message);
    this.name = "AiError";
    this.code = code;
    this.retryable = options.retryable ?? TRAITS[code].retryable;
    this.fallbackable = options.fallbackable ?? TRAITS[code].fallbackable;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.detail = options.detail;
    this.provider = options.provider;
    this.model = options.model;
    this.upstreamStatus = options.upstreamStatus;
  }
}

/** Coerce anything thrown into an AiError. Unknown errors never leak their message. */
export function normalizeError(value: unknown): AiError {
  if (value instanceof AiError) return value;
  return new AiError("AI_INTERNAL_ERROR");
}

export function httpStatusFor(code: AiErrorCode): number {
  return TRAITS[code].http;
}

/** Map an upstream HTTP status to a normalized error. Never includes the response body. */
export function errorFromHttpStatus(
  status: number,
  context: { provider?: string; model?: string; retryAfterSeconds?: number } = {},
): AiError {
  const base = { provider: context.provider, model: context.model, upstreamStatus: status };
  if (status === 401 || status === 403) return new AiError("AI_AUTH_ERROR", base);
  if (status === 402) return new AiError("AI_QUOTA_EXCEEDED", base);
  if (status === 413) return new AiError("AI_CONTENT_TOO_LARGE", { ...base, fallbackable: true });
  if (status === 408 || status === 504) return new AiError("AI_PROVIDER_TIMEOUT", base);
  if (status === 429) return new AiError("AI_RATE_LIMITED", { ...base, retryAfterSeconds: context.retryAfterSeconds });
  if (status >= 500) return new AiError("AI_PROVIDER_UNAVAILABLE", base);
  // 400 / 404 / 422 and other 4xx: this provider or model cannot serve the request as sent.
  return new AiError("AI_UNSUPPORTED_CAPABILITY", { ...base, retryable: false, fallbackable: true });
}

/** The only error shape the browser ever receives. */
export function toPublicError(value: unknown): PublicAiError {
  const error = normalizeError(value);
  const traits = TRAITS[error.code];
  const exposeDetail = error.code === "AI_INVALID_INPUT" || error.code === "AI_CONTENT_TOO_LARGE";
  const out: PublicAiError = {
    code: traits.publicCode ?? error.code,
    message: exposeDetail && error.detail ? error.detail : traits.message,
    retryable: error.retryable || traits.publicCode === "AI_PROVIDER_UNAVAILABLE",
  };
  if (error.retryAfterSeconds !== undefined) out.retryAfterSeconds = error.retryAfterSeconds;
  return out;
}
