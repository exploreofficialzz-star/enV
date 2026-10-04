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
  log?: AiLogger;
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
        // Only `task` and `input` are ever read. A client cannot choose providers, models or limits.
        const task = core.getTask(taskId);
        if (!task) throw new AiError("AI_TASK_UNKNOWN");

        let userId: string | null = null;
        if (config.authConfigured && deps.getUserId) userId = await deps.getUserId(request).catch(() => null);
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

        const result = await core.run({ taskId, input: envelope.input, signal: request.signal, requestId, dedupeScope: identity });
        return jsonResponse(200, { ok: true, data: { taskId, result: result.result, meta: publicMeta(result, config) } }, { "x-request-id": requestId, ...headers });
      } catch (error) {
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
