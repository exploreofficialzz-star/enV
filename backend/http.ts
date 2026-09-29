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

export async function proxyRequest(request: Request, upstream: string) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  const response = await fetch(upstream, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    // Node's fetch requires this when forwarding a streaming request body.
    ...(request.method === "GET" || request.method === "HEAD" ? {} : { duplex: "half" as const }),
  });
  const outputHeaders = corsHeaders(response.headers.get("content-type") || undefined);
  for (const name of ["content-disposition", "content-length", "cache-control"]) {
    const value = response.headers.get(name);
    if (value) outputHeaders.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers: outputHeaders });
}

export function unavailable(service: string) {
  return jsonResponse({
    error: `${service} is not configured on this Vercel deployment. Configure its external processor URL in Vercel project environment variables.`,
  }, 503);
}
