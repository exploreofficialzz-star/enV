import http from "node:http";
import { spawn } from "node:child_process";

const HOST = process.env.PROCESSOR_HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || process.env.PROCESSOR_PORT || 10000);
const SHARED_SECRET = String(process.env.PROCESSOR_SHARED_SECRET || "").trim();
const ALLOWED_ORIGIN = process.env.PROCESSOR_ALLOWED_ORIGIN || "*";
const services = new Map();

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-processor-key",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  return !SHARED_SECRET || req.headers["x-processor-key"] === SHARED_SECRET;
}

function spawnService(name, script, port, extraEnv = {}) {
  const child = spawn(process.execPath, [script], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv, PORT: String(port), MEDIA_PORT: String(port), URL_MEDIA_PORT: String(port), TRANSCRIBE_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code, signal) => {
    console.error(`[${name}] exited code=${code ?? "null"} signal=${signal ?? "none"}`);
    if (!process.listenerCount("SIGTERM")) process.exitCode = 1;
  });
  services.set(name, { child, port });
}

function proxy(req, res, port, pathname) {
  const headers = { ...req.headers, host: `127.0.0.1:${port}`, "x-processor-key": "" };
  delete headers.connection;
  const upstream = http.request({ hostname: "127.0.0.1", port, method: req.method, path: pathname, headers }, (upstreamResponse) => {
    const outputHeaders = { ...upstreamResponse.headers, "access-control-allow-origin": ALLOWED_ORIGIN, "cache-control": "no-store" };
    res.writeHead(upstreamResponse.statusCode || 502, outputHeaders);
    upstreamResponse.pipe(res);
  });
  upstream.on("error", (error) => {
    if (!res.headersSent) json(res, 503, { error: `Processor service unavailable: ${error.message}` });
    else res.destroy(error);
  });
  req.pipe(upstream);
}

spawnService("media", "scripts/media-processor.mjs", 8787, { MEDIA_HOST: "127.0.0.1", MEDIA_PORT: "8787", MEDIA_ALLOWED_ORIGIN: ALLOWED_ORIGIN, MEDIA_MAX_BYTES: process.env.MEDIA_MAX_BYTES || String(100 * 1024 * 1024) });
spawnService("url-media", "scripts/url-media-processor.mjs", 8790, { URL_MEDIA_HOST: "127.0.0.1", URL_MEDIA_PORT: "8790", URL_MEDIA_ALLOWED_ORIGIN: ALLOWED_ORIGIN });

if (process.env.TRANSCRIBE_ENABLED === "true") {
  spawnService("transcription", "scripts/transcription-processor.mjs", 8788, { TRANSCRIBE_HOST: "127.0.0.1", TRANSCRIBE_PORT: "8788", TRANSCRIBE_ALLOWED_ORIGIN: ALLOWED_ORIGIN });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  if (pathname === "/health" && req.method === "GET") {
    const servicesReady = [...services.values()].every(({ child }) => child.exitCode === null);
    return json(res, 200, {
      ok: servicesReady,
      service: "enV Render media processor",
      authentication: Boolean(SHARED_SECRET),
      ready: servicesReady,
      routes: ["/media", "/info", "/download", ...(services.has("transcription") ? ["/transcribe"] : [])],
      limits: { maxMediaBytes: Number(process.env.MEDIA_MAX_BYTES || 100 * 1024 * 1024) },
    });
  }
  if (!authorized(req)) return json(res, 401, { error: "Invalid processor credentials." });
  if (pathname === "/media" && services.has("media")) return proxy(req, res, services.get("media").port, "/media");
  if ((pathname === "/info" || pathname === "/download") && services.has("url-media")) return proxy(req, res, services.get("url-media").port, pathname);
  if (pathname === "/transcribe" && services.has("transcription")) return proxy(req, res, services.get("transcription").port, pathname);
  return json(res, 404, { error: "Not found." });
});

function shutdown() {
  for (const { child } of services.values()) child.kill("SIGTERM");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
server.listen(PORT, HOST, () => console.log(`enV Render processor listening on http://${HOST}:${PORT}`));
