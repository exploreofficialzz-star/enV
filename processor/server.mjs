import http from "node:http";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { urlMediaProcessorPath } from "./url-media-route.mjs";

const HOST = process.env.PROCESSOR_HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || process.env.PROCESSOR_PORT || 10000);
const SHARED_SECRET = String(process.env.PROCESSOR_SHARED_SECRET || "").trim();
const ALLOWED_ORIGIN = String(process.env.PROCESSOR_ALLOWED_ORIGIN || "*").trim();
const APPLICATION_API_ORIGIN = String(process.env.APPLICATION_API_ORIGIN || "https://envtools.store").trim().replace(/\/+$/, "");
const services = new Map();

if (process.env.NODE_ENV === "production" && !SHARED_SECRET) {
  console.error("[startup] Missing required security configuration: PROCESSOR_SHARED_SECRET must be configured in production.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" && ALLOWED_ORIGIN === "*") {
  console.error("[startup] Missing required security configuration: PROCESSOR_ALLOWED_ORIGIN must be an explicit production origin.");
  process.exit(1);
}

function corsOrigin(req) { const requested = String(req.headers.origin || "").trim(); return ALLOWED_ORIGIN === "*" ? (requested || "*") : ALLOWED_ORIGIN; }
function responseHeaders(req, extra = {}) { return { "access-control-allow-origin": corsOrigin(req), "access-control-allow-credentials": "true", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-allow-headers": "accept,authorization,content-type,cookie,x-requested-with", "access-control-expose-headers": "content-disposition,content-length,content-type,set-cookie", "vary": "Origin", ...extra }; }
function json(req, res, status, body) { res.writeHead(status, { ...responseHeaders(req), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); }
function failSafely(req, res, status, code, message, cause) {
  const requestId = randomUUID();
  const route = String(req.url || "/").split("?")[0].slice(0, 180);
  const causeType = cause instanceof Error ? cause.name : "UnknownError";
  console.error(`[gateway] ${code} requestId=${requestId} route=${route} causeType=${causeType}`);
  json(req, res, status, { ok: false, error: message, code, message, requestId });
}
function authorized(req) { return SHARED_SECRET ? req.headers["x-processor-key"] === SHARED_SECRET : process.env.NODE_ENV !== "production"; }
async function childServiceReadiness() {
  const checks = await Promise.all([...services.entries()].map(async ([name, { child, port }]) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      console.error(`[health] processor=${name} is not running exitCode=${child.exitCode ?? "null"} signalCode=${child.signalCode ?? "null"}`);
      return [name, false];
    }
    try {
      // The URL media health check may run yt-dlp's first Python startup. Give
      // the child enough time to finish its cached readiness probe on cold starts.
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(8000) });
      const body = await response.json().catch(() => ({}));
      const ready = response.ok && body?.ok === true && body?.ready !== false;
      if (!ready) {
        console.error(`[health] processor=${name} reported not-ready status=${response.status} bodyOk=${String(body?.ok)} bodyReady=${String(body?.ready)}`);
      }
      return [name, ready];
    } catch (error) {
      const causeType = error instanceof Error ? error.name : "UnknownError";
      console.error(`[health] processor=${name} check failed causeType=${causeType}`);
      return [name, false];
    }
  }));
  return Object.fromEntries(checks);
}
function spawnService(name, script, port, extraEnv = {}) { const child = spawn(process.execPath, [script], { cwd: process.cwd(), env: { ...process.env, ...extraEnv, PORT: String(port), MEDIA_PORT: String(port), URL_MEDIA_PORT: String(port), TRANSCRIBE_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] }); child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`)); child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`)); child.on("exit", (code, signal) => console.error(`[${name}] exited code=${code ?? "null"} signal=${signal ?? "none"}`)); services.set(name, { child, port }); }
function proxyProcessor(req, res, port, pathname) { const headers = { ...req.headers, host: `127.0.0.1:${port}`, "x-processor-key": "" }; delete headers.connection; const upstream = http.request({ hostname: "127.0.0.1", port, method: req.method, path: pathname, headers }, (upstreamResponse) => { res.writeHead(upstreamResponse.statusCode || 502, responseHeaders(req, { ...upstreamResponse.headers, "cache-control": "no-store" })); upstreamResponse.pipe(res); }); upstream.on("error", (error) => { if (!res.headersSent) failSafely(req, res, 503, "PROCESSOR_UNAVAILABLE", "This processing service is temporarily unavailable. Please try again shortly.", error); else res.destroy(error); }); req.pipe(upstream); }

async function proxyApplication(req, res, pathname, search) {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) { if (["host", "connection", "content-length"].includes(name) || value === undefined) continue; headers.set(name, Array.isArray(value) ? value.join(", ") : value); }
    headers.set("origin", APPLICATION_API_ORIGIN); headers.set("referer", `${APPLICATION_API_ORIGIN}/`);
    const hasBody = !["GET", "HEAD"].includes(req.method || "GET");
    const upstream = await fetch(`${APPLICATION_API_ORIGIN}${pathname}${search}`, { method: req.method, headers, body: hasBody ? req : undefined, duplex: hasBody ? "half" : undefined, redirect: "manual" });
    const output = {};
    upstream.headers.forEach((value, name) => { if (!["connection", "keep-alive", "transfer-encoding", "content-encoding"].includes(name)) output[name] = value; });
    const setCookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
    if (setCookies.length) output["set-cookie"] = setCookies.map((value) => value.replace(/SameSite=Lax/gi, "SameSite=None"));
    Object.assign(output, responseHeaders(req)); res.writeHead(upstream.status, output);
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res); else res.end();
  } catch (error) { failSafely(req, res, 502, "APPLICATION_API_UNAVAILABLE", "enV could not complete this request right now. Please try again shortly.", error); }
}

spawnService("media", "scripts/media-processor.mjs", 8787, { MEDIA_HOST: "127.0.0.1", MEDIA_PORT: "8787", MEDIA_ALLOWED_ORIGIN: ALLOWED_ORIGIN, MEDIA_MAX_BYTES: process.env.MEDIA_MAX_BYTES || String(100 * 1024 * 1024) });
spawnService("url-media", "scripts/url-media-processor.mjs", 8790, { URL_MEDIA_HOST: "127.0.0.1", URL_MEDIA_PORT: "8790", URL_MEDIA_ALLOWED_ORIGIN: ALLOWED_ORIGIN });
if (process.env.TRANSCRIBE_ENABLED === "true") spawnService("transcription", "scripts/transcription-processor.mjs", 8788, { TRANSCRIBE_HOST: "127.0.0.1", TRANSCRIBE_PORT: "8788", TRANSCRIBE_ALLOWED_ORIGIN: ALLOWED_ORIGIN });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`); const { pathname, search } = url;
  if (req.method === "OPTIONS") return json(req, res, 204, {});
  if (pathname === "/health" && req.method === "GET") {
    const processors = await childServiceReadiness();
    const servicesReady = Object.keys(processors).length > 0 && Object.values(processors).every(Boolean);
    return json(req, res, servicesReady ? 200 : 503, {
      ok: servicesReady,
      ready: servicesReady,
      service: "enV Render API",
      applicationApiOrigin: APPLICATION_API_ORIGIN,
      authentication: Boolean(SHARED_SECRET),
      processors,
      routes: ["/api/*", "/media", "/info", "/download", ...(services.has("transcription") ? ["/transcribe"] : [])],
      limits: { maxMediaBytes: Number(process.env.MEDIA_MAX_BYTES || 100 * 1024 * 1024) }
    });
  }
  const urlMediaPath = urlMediaProcessorPath(req.method || "GET", pathname);
  if (urlMediaPath && services.has("url-media")) return proxyProcessor(req, res, services.get("url-media").port, urlMediaPath);
  if (pathname.startsWith("/api/")) return proxyApplication(req, res, pathname, search);
  if (!authorized(req)) return json(req, res, 401, { error: "Invalid processor credentials." });
  if (pathname === "/media" && services.has("media")) return proxyProcessor(req, res, services.get("media").port, "/media");
  if ((pathname === "/info" || pathname === "/download") && services.has("url-media")) return proxyProcessor(req, res, services.get("url-media").port, pathname);
  if (pathname === "/transcribe" && services.has("transcription")) return proxyProcessor(req, res, services.get("transcription").port, pathname);
  return json(req, res, 404, { error: "Not found." });
});
function shutdown() { for (const { child } of services.values()) child.kill("SIGTERM"); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); }
process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown);
server.listen(PORT, HOST, () => console.log(`enV Render API listening on http://${HOST}; application proxy=${APPLICATION_API_ORIGIN}`));
