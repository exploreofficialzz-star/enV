import { randomUUID } from "node:crypto";
import { backendConfig } from "./config";

export function corsHeaders(contentType?: string) {
  const headers = new Headers({
    "access-control-allow-origin": backendConfig().allowedOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "cache-control": "no-store",
  });
  if (contentType) headers.set("content-type", contentType);
  return headers;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders("application/json; charset=utf-8"),
  });
}

export function optionsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/** Return a stable public error while keeping exception details out of client responses. */
export function safeFailureResponse(
  request: Request,
  cause: unknown,
  code: string,
  message: string,
  status = 500,
) {
  const requestId = randomUUID();
  let route = "/api/unknown";
  try { route = new URL(request.url).pathname.slice(0, 180); } catch { /* retain safe fallback */ }
  const causeType = cause instanceof Error ? cause.name : "UnknownError";
  console.error(`[enV-api] ${code} requestId=${requestId} route=${route} causeType=${causeType}`);
  return jsonResponse({ ok: false, error: message, code, requestId }, status);
}

async function captureProxyUsage(input: {
  request: Request;
  upstream: string;
  billingKey: string;
  responseStatus: number | null;
  outputBytes: number | null;
  elapsedMs: number;
  executionStatus?: "failed" | "succeeded";
}) {
  try {
    // Lazy-load the server-only ledger so ordinary local routes do not bootstrap a database merely
    // because they import this shared HTTP helper. Usage capture is telemetry only in this phase.
    const { recordUsageEvent } = await import("../src/lib/billing/ledger.server");
    const url = new URL(input.request.url);
    const inputLengthHeader = input.request.headers.get("content-length");
    const rawInputLength = inputLengthHeader === null ? NaN : Number(inputLengthHeader);
    const inputBytes = Number.isSafeInteger(rawInputLength) && rawInputLength >= 0 ? rawInputLength : null;
    const upstreamHostname = (() => {
      try { return new URL(input.upstream).hostname.toLowerCase().slice(0, 120); }
      catch { return "configured-processor"; }
    })();
    const failed = input.executionStatus === "failed" || input.responseStatus === null || (input.responseStatus ?? 0) >= 400;
    await recordUsageEvent({
      executionId: `gateway-${randomUUID()}`,
      toolId: `api:${url.pathname}`.slice(0, 160),
      billingKey: input.billingKey,
      provider: "enV-processor",
      // Hostnames and measured bytes/duration are operational context only. No dollar cost can be
      // derived defensibly from these fields without infrastructure invoice data.
      estimatedCostUsdMicros: null,
      actualCostUsdMicros: null,
      billedSubunits: 0,
      idempotencyKey: `gateway-usage:${randomUUID()}`,
      status: "unknown_cost",
      usage: {
        source: "backend-gateway-proxy",
        routePath: url.pathname,
        operationClass: input.billingKey,
        upstreamHostname,
        inputBytes,
        outputBytes: input.outputBytes,
        responseStatus: input.responseStatus,
        executionStatus: failed ? "failed" : "succeeded",
        elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
        costMeasurement: "not-connected-to-infrastructure-invoice",
      },
    });
  } catch {
    // Telemetry failures never replace a processor response or surface internal error details.
    console.warn("[billing] backend proxy usage capture failed");
  }
}


async function captureServerUsage(input: {
  request: Request;
  billingKey: string;
  responseStatus: number | null;
  outputBytes: number | null;
  elapsedMs: number;
  executionStatus?: "failed" | "succeeded";
}) {
  try {
    const { recordUsageEvent } = await import("../src/lib/billing/ledger.server");
    const url = new URL(input.request.url);
    const inputLengthHeader = input.request.headers.get("content-length");
    const rawInputLength = inputLengthHeader === null ? NaN : Number(inputLengthHeader);
    const inputBytes = Number.isSafeInteger(rawInputLength) && rawInputLength >= 0 ? rawInputLength : null;
    const failed = input.executionStatus === "failed" || input.responseStatus === null || (input.responseStatus ?? 0) >= 400;
    await recordUsageEvent({
      executionId: `server-${randomUUID()}`,
      toolId: `api:${url.pathname}`.slice(0, 160),
      billingKey: input.billingKey,
      provider: "enV-server",
      estimatedCostUsdMicros: null,
      actualCostUsdMicros: null,
      billedSubunits: 0,
      idempotencyKey: `server-usage:${randomUUID()}`,
      status: "unknown_cost",
      usage: {
        source: "backend-server-operation",
        routePath: url.pathname,
        operationClass: input.billingKey,
        inputBytes,
        outputBytes: input.outputBytes,
        responseStatus: input.responseStatus,
        executionStatus: failed ? "failed" : "succeeded",
        elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
        costMeasurement: "not-connected-to-infrastructure-invoice",
      },
    });
  } catch {
    console.warn("[billing] backend server usage capture failed");
  }
}

/** Measure server-side work without inspecting request bodies, response content, file names, or user input. */
export async function measureServerOperation(
  request: Request,
  billingKey: string,
  operation: () => Promise<Response>,
): Promise<Response> {
  if (request.method === "OPTIONS") return operation();
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await operation();
  } catch (error) {
    await captureServerUsage({
      request, billingKey, responseStatus: null, outputBytes: null,
      elapsedMs: Date.now() - startedAt, executionStatus: "failed",
    });
    throw error;
  }

  const headers = new Headers(response.headers);
  if (!response.body) {
    await captureServerUsage({
      request, billingKey, responseStatus: response.status,
      outputBytes: parseContentLength(response.headers) ?? 0,
      elapsedMs: Date.now() - startedAt,
    });
    return new Response(null, { status: response.status, statusText: response.statusText, headers });
  }

  const reader = response.body.getReader();
  let outputBytes = 0;
  let captured = false;
  const captureOnce = async (executionStatus?: "failed" | "succeeded") => {
    if (captured) return;
    captured = true;
    await captureServerUsage({
      request, billingKey, responseStatus: response.status, outputBytes,
      elapsedMs: Date.now() - startedAt, executionStatus,
    });
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          await captureOnce();
          controller.close();
          return;
        }
        outputBytes += chunk.value.byteLength;
        controller.enqueue(chunk.value);
      } catch (error) {
        await captureOnce("failed");
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } finally { await captureOnce("failed"); }
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function parseContentLength(headers: Headers): number | null {
  const value = headers.get("content-length");
  if (value === null) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

export async function proxyRequest(request: Request, upstream: string, billingKey = "cloud.generic_processing") {
  const startedAt = Date.now();
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  const processorSecret = backendConfig().processorSecret;
  if (processorSecret) headers.set("x-processor-key", processorSecret);
  let response: Response;
  try {
    response = await fetch(upstream, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      signal: request.signal,
      // Node's fetch requires this when forwarding a streaming request body.
      ...(request.method === "GET" || request.method === "HEAD" ? {} : { duplex: "half" as const }),
    });
  } catch (error) {
    await captureProxyUsage({ request, upstream, billingKey, responseStatus: null, outputBytes: null, elapsedMs: Date.now() - startedAt, executionStatus: "failed" });
    return safeFailureResponse(
      request, error, "PROCESSOR_UPSTREAM_UNAVAILABLE",
      "The processing service is temporarily unavailable. Please try again shortly.", 502,
    );
  }

  const outputHeaders = corsHeaders(response.headers.get("content-type") || undefined);
  for (const name of ["content-disposition", "content-length", "cache-control"]) {
    const value = response.headers.get(name);
    if (value) outputHeaders.set(name, value);
  }

  // Record after the upstream stream finishes so we measure full transfer size and duration rather
  // than only time-to-headers. Backpressure and cancellation are forwarded to the upstream reader.
  if (!response.body) {
    await captureProxyUsage({
      request, upstream, billingKey, responseStatus: response.status,
      outputBytes: parseContentLength(response.headers) ?? 0,
      elapsedMs: Date.now() - startedAt,
    });
    return new Response(null, { status: response.status, headers: outputHeaders });
  }

  const reader = response.body.getReader();
  let outputBytes = 0;
  let captured = false;
  const captureOnce = async (executionStatus?: "failed" | "succeeded") => {
    if (captured) return;
    captured = true;
    await captureProxyUsage({
      request, upstream, billingKey, responseStatus: response.status, outputBytes,
      elapsedMs: Date.now() - startedAt, executionStatus,
    });
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          await captureOnce();
          controller.close();
          return;
        }
        outputBytes += chunk.value.byteLength;
        controller.enqueue(chunk.value);
      } catch (error) {
        await captureOnce("failed");
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } finally { await captureOnce("failed"); }
    },
  });
  return new Response(body, { status: response.status, headers: outputHeaders });
}

export function unavailable(service: string, envVar: string) {
  return jsonResponse({
    error: `${service} is not connected to the Vercel gateway yet. Add ${envVar} in the Vercel project environment variables, then redeploy. Vercel hosts the gateway; the processor performs the heavy media work.`,
  }, 503);
}
