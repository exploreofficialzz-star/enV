import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { auth, authInfrastructureError } from "@/lib/auth/server";

/** Stable, non-cacheable auth failure without leaking provider/database details. */
const unavailable = (code: string, requestId: string) => Response.json(
  {
    error: code,
    message: "The account service could not verify this request. Please try again shortly.",
    requestId,
  },
  {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Retry-After": "15",
      "X-Content-Type-Options": "nosniff",
    },
  },
);

/** Better Auth HTTP API for sessions, sign-in, sign-up and OAuth callbacks. */
const handleAuthRequest = async ({ request }: { request: Request }): Promise<Response> => {
  if (authInfrastructureError) {
    const requestId = randomUUID();
    console.error("[enV auth] Request blocked by infrastructure configuration:", {
      requestId, method: request.method, path: new URL(request.url).pathname,
    });
    return unavailable("AUTH_INFRASTRUCTURE_UNAVAILABLE", requestId);
  }

  try {
    const response = await auth.handler(request);
    if (response.status < 500) return response;
    const requestId = randomUUID();
    console.error("[enV auth] Auth handler returned a server error:", {
      requestId, method: request.method, path: new URL(request.url).pathname, status: response.status,
    });
    return unavailable("AUTH_REQUEST_FAILED", requestId);
  } catch (error) {
    const requestId = randomUUID();
    const failure = error && typeof error === "object" ? error as { name?: unknown; code?: unknown } : null;
    console.error("[enV auth] Auth handler threw:", {
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
      errorName: typeof failure?.name === "string" ? failure.name : "UnknownError",
      errorCode: typeof failure?.code === "string" ? failure.code : undefined,
    });
    return unavailable("AUTH_REQUEST_FAILED", requestId);
  }
};

export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: handleAuthRequest, POST: handleAuthRequest } },
});
