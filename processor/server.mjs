import http from "node:http";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";

const HOST = process.env.PROCESSOR_HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || process.env.PROCESSOR_PORT || 10000);
const SHARED_SECRET = String(process.env.PROCESSOR_SHARED_SECRET || "").trim();
const ALLOWED_ORIGIN = String(process.env.PROCESSOR_ALLOWED_ORIGIN || "*").trim();
const APPLICATION_API_ORIGIN = String(process.env.APPLICATION_API_ORIGIN || "https://en-v.vercel.app").trim().replace(/\/+$/, "");
const services = new Map();

function corsOrigin(req) { const requested = String(req.headers.origin || "").trim(); return ALLOWED_ORIGIN === "*" ? (requested || "*") : ALLOWED_ORIGIN; }
function responseHeaders(req, extra = {}) { return { "access-control-allow-origin": corsOrigin(req), "access-control-allow-credentials": "true", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-allow-headers": "accept,authorization,content-type,cookie,x-requested-with", "access-control-expose-headers": "content-disposition,content-length,content-type,set-cookie", "vary": "Origin", ...extra }; }
function json(req, res, status, body) { res.writeHead(status, { ...responseHeaders(req), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(body)); }
function authorized(req) { return !SHARED_SECRET || req.headers["x-processor-key"] === SHARED_SECRET; }
function spawnService(name, script, port, extraEnv = {}) { const child = spawn(process.execPath, [script], { cwd: process.cwd(), env: { ...process.env, ...extraEnv, PORT: String(port), MEDIA_PORT: String(port), URL_MEDIA_PORT: String(port), TRANSCRIBE_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] }); child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`)); child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`)); child.on("exit", (code, signal) => console.error(`[${name}] exited code=${code ?? "null"} signal=${signal ?? "none"}`)); services.set(name, { child, port }); }
function proxyProcessor(req, res, port, pathname) { const headers = { ...req.headers, host: `127.0.0.1:${port}`, "x-processor-key": "" }; delete headers.connection; const upstream = http.request({ hostname: "127.0.0.1", port, method: req.method, path: pathname, headers }, (upstreamResponse) => { res.writeHead(upstreamResponse.statusCode || 502, responseHeaders(req, { ...upstreamResponse.headers, "cache-control": "no-store" })); upstreamResponse.pipe(res); }); upstream.on("error", (error) => { if (!res.headersSent) json(req, res, 503, { error: `Processor service unavailable: ${error.message}` }); else res.destroy(error); }); req.pipe(upstream); }

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
  } catch (error) { json(req, res, 502, { error: `Application API unavailable: ${error instanceof Error ? error.message : String(error)}` }); }
}

spawnService("media", "scripts/media-processor.mjs", 8787, { MEDIA_HOST: "127.0.0.1", MEDIA_PORT: "8787", MEDIA_ALLOWED_ORIGIN: ALLOWED_ORIGIN, MEDIA_MAX_BYTES: process.env.MEDIA_MAX_BYTES || String(100 * 1024 * 1024) });
spawnService("url-media", "scripts/url-media-processor.mjs", 8790, { URL_MEDIA_HOST: "127.0.0.1", URL_MEDIA_PORT: "8790", URL_MEDIA_ALLOWED_ORIGIN: ALLOWED_ORIGIN });
if (process.env.TRANSCRIBE_ENABLED === "true") spawnService("transcription", "scripts/transcription-processor.mjs", 8788, { TRANSCRIBE_HOST: "127.0.0.1", TRANSCRIBE_PORT: "8788", TRANSCRIBE_ALLOWED_ORIGIN: ALLOWED_ORIGIN });

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`); const { pathname, search } = url;
  if (req.method === "OPTIONS") return json(req, res, 204, {});
  if (pathname === "/health" && req.method === "GET") { const servicesReady = [...services.values()].every(({ child }) => child.exitCode === null); return json(req, res, 200, { ok: servicesReady, service: "enV Render API", applicationApiOrigin: APPLICATION_API_ORIGIN, authentication: Boolean(SHARED_SECRET), ready: servicesReady, routes: ["/api/*", "/media", "/info", "/download", ...(services.has("transcription") ? ["/transcribe"] : [])], limits: { maxMediaBytes: Number(process.env.MEDIA_MAX_BYTES || 100 * 1024 * 1024) } }); }
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
