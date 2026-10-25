/**
 * SERVER ONLY. Framework-free HTTP handlers for the AI API, built on the web Request/Response types
 * so they can be tested without Nitro and mounted by thin route files.
 *
 * Defence in depth (none of these alone is "the" abuse strategy):
 * same-origin + JSON content type, body-size cap, optional sign-in, per-session / per-IP / daily
 * rate limits weighted by task cost, a deployment-wide request and spend failsafe, in-flight
 * de-duplication, and validated inputs. No CORS headers are ever sent: browsers on other origins
 * cannot call these endpoints.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { AiError, httpStatusFor, normalizeError, toPublicError } from "../errors.ts";
import type { AiResult } from "../types.ts";
import type { AiConfig } from "./config.ts";
import type { AiCore } from "./core/execute.ts";
import { newRequestId, randomHex, sha256Hex } from "./core/ids.ts";
import { createRateLimiter } from "./core/rate-limit.ts";
import type { RateDecision, RateLimiter } from "./core/rate-limit.ts";
import { noopLogger } from "./observability.ts";
import type { AiLogger } from "./observability.ts";

export interface HandlerDeps {
  core: AiCore;
  limiter?: RateLimiter;
  /** Resolve the signed-in user's id, or null. Only consulted when authentication is configured. */
  getUserId?: (request: Request) => Promise<string | null>;
  /**
   * Optional server-side usage capture. Receives metrics only (never prompt or output content).
   * Capture failures must not turn a successful AI result into a failed user request; the caller
   * is expected to log a safe error and keep billing inactive unless settlement is fully wired.
   */
  recordUsage?: (event: AiUsageCaptureEvent) => Promise<void>;
  log?: AiLogger;
}

export interface AiUsageCaptureEvent {
  requestId: string;
  taskId: string;
  userId: string | null;
  provider: string | null;
  model: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; audioSeconds: number | null; computeSeconds?: number | null };
  estimatedCostUsd: number | null;
  costBasis: "estimated" | "unknown";
  latencyMs: number | null;
  attempts: number | null;
  cached: boolean;
  fallbackUsed: boolean;
  promptVersion: string;
  finishReason: string;
  executionStatus: "succeeded" | "failed";
}

export interface AiHandlers {
  run(request: Request): Promise<Response>;
  status(request: Request): Promise<Response>;
  diagnostics(request: Request): Promise<Response>;
}

const SESSION_COOKIE = "env_ai_sid";
const INSTANCE_SECRET = randomHex(32);

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

/** Same-origin only: a cross-site browser request is refused before anything else happens. */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host).split(",")[0]!.trim();
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function readLimitedBody(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new AiError("AI_CONTENT_TOO_LARGE");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AiError("AI_CONTENT_TOO_LARGE");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sign(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("base64url").slice(0, 22);
}

function readSession(request: Request, secret: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== SESSION_COOKIE) continue;
    const value = rest.join("=");
    const dot = value.lastIndexOf(".");
    if (dot <= 0) return null;
    const id = value.slice(0, dot);
    const given = Buffer.from(value.slice(dot + 1));
    const expected = Buffer.from(sign(id, secret));
    return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
  }
  return null;
}

function clientIpHash(request: Request): string {
  const raw = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  return sha256Hex(raw.split(",")[0]!.trim()).slice(0, 16);
}

function ipKey(request: Request): string {
  return `ip:${clientIpHash(request)}`;
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(sha256Hex(a)), Buffer.from(sha256Hex(b)));
}

function publicMeta(result: AiResult<unknown>, config: AiConfig) {
  const meta: Record<string, unknown> = { requestId: result.requestId, cached: result.cached, warnings: result.warnings };
  // Provider and model details are development diagnostics only; production responses omit them.
  if (config.debug && !config.production) {
    Object.assign(meta, {
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
      fallbackUsed: result.fallbackUsed,
      usage: result.usage,
      cost: result.cost,
    });
  }
  return meta;
}

export function createAiHandlers(deps: HandlerDeps): AiHandlers {
  const { core } = deps;
  const config = core.config;
  const limiter = deps.limiter ?? createRateLimiter();
  const log = deps.log ?? noopLogger;

  function failure(error: unknown, requestId: string, headers: Record<string, string> = {}): Response {
    const normalized = normalizeError(error);
    const pub = toPublicError(normalized);
    const extra: Record<string, string> = { "x-request-id": requestId, ...headers };
    if (pub.retryAfterSeconds !== undefined) extra["retry-after"] = String(pub.retryAfterSeconds);
    log({ event: "ai.handler", requestId, status: "error", errorCode: normalized.code });
    return jsonResponse(httpStatusFor(normalized.code), { ok: false, error: pub, requestId }, extra);
  }

  function limited(decision: RateDecision): AiError {
    return new AiError("AI_RATE_LIMITED", { retryAfterSeconds: decision.retryAfterSeconds });
  }

  return {
    async run(request) {
      const requestId = newRequestId();
      const headers: Record<string, string> = {};
      let observedTaskId: string | null = null;
      let observedUserId: string | null = null;
      let executionStartedAt: number | null = null;
      try {
        if (request.method !== "POST") throw new AiError("AI_INVALID_INPUT", { detail: "Use POST." });
        if (!config.enabled) throw new AiError("AI_DISABLED");
        if (!isSameOrigin(request)) throw new AiError("AI_FORBIDDEN");
        if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
          throw new AiError("AI_INVALID_INPUT", { detail: "Send the request as application/json." });
        }
        // Cheap flood guard BEFORE the body is read or parsed, so oversized or garbage requests
        // cannot burn CPU and bandwidth for free. Every request counts, valid or not.
        const flood = limiter.consume(`${ipKey(request)}:raw`, 1, config.limits.perIpPerMinute * 2, 60_000);
        if (!flood.allowed) throw limited(flood);

        const raw = await readLimitedBody(request, config.limits.maxBodyBytes);
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new AiError("AI_INVALID_INPUT", { detail: "The request body is not valid JSON." });
        }
        const envelope = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
        const taskId = typeof envelope.task === "string" ? envelope.task : "";
        if (!taskId || taskId.length > 80) throw new AiError("AI_INVALID_INPUT", { detail: "A task id is required." });
        observedTaskId = taskId;
        // Only `task` and `input` are ever read. A client cannot choose providers, models or limits.
        const task = core.getTask(taskId);
        if (!task) throw new AiError("AI_TASK_UNKNOWN");

        let userId: string | null = null;
        if (config.authConfigured && deps.getUserId) userId = await deps.getUserId(request).catch(() => null);
        observedUserId = userId;
        if (config.requireAuth && !userId) throw new AiError("AI_AUTH_REQUIRED");

        const secret = config.sessionSecret?.reveal() ?? INSTANCE_SECRET;
        let sessionId = readSession(request, secret);
        if (!sessionId) {
          sessionId = randomHex(12);
          headers["set-cookie"] = `${SESSION_COOKIE}=${sessionId}.${sign(sessionId, secret)}; Path=/api/ai; HttpOnly; SameSite=Lax; Max-Age=2592000${config.production ? "; Secure" : ""}`;
        }
        const identity = userId ? `user:${userId}` : `anon:${sessionId}`;
        const { limits } = config;
        const boost = userId ? 2 : 1;
        const checks: RateDecision[] = [
          limiter.consume(ipKey(request), task.rateUnits, limits.perIpPerMinute, 60_000),
          limiter.consume(`${identity}:minute`, task.rateUnits, limits.perSessionPerMinute * boost, 60_000),
          limiter.consume(`${identity}:day`, task.rateUnits, limits.perSessionPerDay * boost, 86_400_000),
        ];
        const blocked = checks.find((c) => !c.allowed);
        if (blocked) throw limited(blocked);

        executionStartedAt = Date.now();
        const result = await core.run({ taskId, input: envelope.input, signal: request.signal, requestId, dedupeScope: identity });
        // Serialize the outgoing result before writing the success event. If serialization itself
        // fails, the catch path records the run as unknown-cost instead of conflicting with a
        // previously persisted success event under the same request id.
        const successResponse = jsonResponse(200, { ok: true, data: { taskId, result: result.result, meta: publicMeta(result, config) } }, { "x-request-id": requestId, ...headers });
        if (deps.recordUsage) {
          // Never store prompts, model output, uploaded content or history in the billing ledger.
          // A cache hit is recorded as zero provider spend because no new provider call was made.
          const capture: AiUsageCaptureEvent = {
            requestId,
            taskId,
            userId,
            provider: result.cached ? null : result.provider,
            model: result.cached ? null : result.model,
            usage: result.cached
              ? { inputTokens: 0, outputTokens: 0, totalTokens: 0, audioSeconds: 0, computeSeconds: 0 }
              : result.usage,
            estimatedCostUsd: result.cached ? 0 : result.cost.usd,
            costBasis: result.cached ? "estimated" : result.cost.basis,
            latencyMs: result.latencyMs,
            attempts: result.cached ? 0 : result.attempts,
            cached: result.cached,
            fallbackUsed: result.cached ? false : result.fallbackUsed,
            promptVersion: result.promptVersion,
            finishReason: result.finishReason,
            executionStatus: "succeeded",
          };
          try {
            await deps.recordUsage(capture);
          } catch {
            // Billing capture is observability-only in this phase. Keep the user's AI result usable;
            // the runtime's callback emits a redacted operational warning for reconciliation.
            log({ event: "ai.billing_usage_capture", requestId, taskId, status: "error", errorCode: "BILLING_USAGE_CAPTURE_FAILED" });
          }
        }
        return successResponse;
      } catch (error) {
        // Provider failures can still incur upstream cost. Record an explicit unknown-cost event
        // after a valid execution was attempted rather than falsely recording $0 or charging blind.
        if (deps.recordUsage && observedTaskId && executionStartedAt !== null) {
          try {
            await deps.recordUsage({
              requestId,
              taskId: observedTaskId,
              userId: observedUserId,
              provider: null,
              model: null,
              usage: { inputTokens: null, outputTokens: null, totalTokens: null, audioSeconds: null },
              estimatedCostUsd: null,
              costBasis: "unknown",
              latencyMs: Math.max(0, Date.now() - executionStartedAt),
              attempts: null,
              cached: false,
              fallbackUsed: false,
              promptVersion: "unknown",
              finishReason: "unknown",
              executionStatus: "failed",
            });
          } catch {
            log({ event: "ai.billing_usage_capture", requestId, taskId: observedTaskId, status: "error", errorCode: "BILLING_USAGE_CAPTURE_FAILED" });
          }
        }
        return failure(error, requestId, headers);
      }
    },

    async status(request) {
      const requestId = newRequestId();
      try {
        if (request.method !== "GET") throw new AiError("AI_INVALID_INPUT", { detail: "Use GET." });
        if (!isSameOrigin(request)) throw new AiError("AI_FORBIDDEN");
        const decision = limiter.consume(`${ipKey(request)}:status`, 1, config.limits.perIpPerMinute * 5, 60_000);
        if (!decision.allowed) throw limited(decision);
        // Availability is global (not per person) and non-sensitive, so the platform CDN may cache it briefly.
        // That keeps page loads from turning into one function invocation each.
        return jsonResponse(200, { ok: true, enabled: config.enabled, tasks: core.availability() }, { "x-request-id": requestId, "cache-control": "public, s-maxage=30, stale-while-revalidate=60" });
      } catch (error) {
        return failure(error, requestId);
      }
    },

    async diagnostics(request) {
      const requestId = newRequestId();
      const admin = config.adminToken;
      // Without AI_ADMIN_TOKEN the endpoint does not exist.
      if (!admin) return jsonResponse(404, { ok: false, error: { code: "AI_TASK_UNKNOWN", message: "Not found.", retryable: false }, requestId });
      const attempt = limiter.consume(`${ipKey(request)}:admin`, 1, 30, 60_000);
      if (!attempt.allowed) return failure(limited(attempt), requestId);
      const header = request.headers.get("authorization") ?? "";
      const given = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!given || !safeEqual(given, admin.reveal())) return failure(new AiError("AI_AUTH_REQUIRED"), requestId);
      return jsonResponse(200, { ok: true, diagnostics: core.diagnostics() }, { "x-request-id": requestId });
    },
  };
}
