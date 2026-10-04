#!/usr/bin/env node
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PROVIDERS, detectProvider, createProviderAdapter } from "./media/provider-registry.mjs";
import { assertPublicHostname } from "./media/url-security.mjs";

const HOST = process.env.URL_MEDIA_HOST || "0.0.0.0";
const PORT = Number(process.env.URL_MEDIA_PORT || 8790);
const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";
const FFPROBE_BIN = process.env.FFPROBE_BIN || "ffprobe";
const ALLOWED_ORIGIN = process.env.URL_MEDIA_ALLOWED_ORIGIN || "*";
const MAX_OUTPUT_BYTES = Number(process.env.URL_MEDIA_MAX_OUTPUT_BYTES || 500 * 1024 * 1024);
const MAX_DURATION_SECONDS = Number(process.env.URL_MEDIA_MAX_DURATION_SECONDS || 2 * 60 * 60);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.URL_MEDIA_TIMEOUT_MS || 10 * 60 * 1000);

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": ALLOWED_ORIGIN, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" });
  res.end(JSON.stringify(body));
}

function safeName(value, fallback = "download.bin") {
  const base = path.basename(String(value || fallback)).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || fallback;
}

function runYtdlp(args, cwd, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, ["--no-playlist", "--restrict-filenames", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), DOWNLOAD_TIMEOUT_MS);
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (c) => { stdout += c.toString(); if (stdout.length > 12000) stdout = stdout.slice(-12000); });
    child.stderr.on("data", (c) => { stderr += c.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
    child.on("error", (error) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (signal?.aborted) return reject(new Error("Download cancelled."));
      if (code !== 0) return reject(new Error(`Media downloader failed (code ${code}). ${stderr.trim().slice(-1200)}`));
      resolve({ stdout, stderr });
    });
  });
}

function runFfprobe(file, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFPROBE_BIN, ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type", "-of", "json", file], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), DOWNLOAD_TIMEOUT_MS);
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); if (stdout.length > 20000) stdout = stdout.slice(-20000); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); if (stderr.length > 4000) stderr = stderr.slice(-4000); });
    child.on("error", (error) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (signal?.aborted) return reject(new Error("Download cancelled."));
      if (code !== 0) return reject(new Error(`OUTPUT_VERIFICATION_FAILED: ffprobe rejected the downloaded media. ${stderr.trim().slice(-800)}`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error("OUTPUT_VERIFICATION_FAILED: ffprobe returned invalid verification data.")); }
    });
  });
}

async function verifyDownloadedMedia(file, expectedMaxBytes, signal) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size <= 0) throw new Error("OUTPUT_VERIFICATION_FAILED: The downloaded result is empty.");
  if (stat.size > expectedMaxBytes) throw new Error("FILE_TOO_LARGE: The downloaded result exceeds the configured limit.");
  await runFfprobe(file, signal);
  return stat;
}

async function commandExists() {
  try { await runYtdlp(["--version"], os.tmpdir(), undefined); return true; } catch { return false; }
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > 128 * 1024) throw new Error("Request body is too large."); }
  return JSON.parse(body || "{}");
}

function providerForUrl(raw) {
  let url;
  try { url = new URL(String(raw || "").trim()); } catch { throw new Error("INVALID_URL: Enter a valid http(s) URL."); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("INVALID_URL: Only http and https URLs are supported.");
  return { url, provider: detectProvider(url) };
}

function errorPayload(error) {
  const message = error instanceof Error ? error.message : String(error);
  const known = [
    "INVALID_URL", "UNSUPPORTED_SOURCE", "SOURCE_UNAVAILABLE", "PRIVATE_CONTENT",
    "AUTH_REQUIRED", "DOWNLOAD_NOT_PERMITTED", "NO_DOWNLOADABLE_FORMAT",
    "FORMAT_UNAVAILABLE", "MANIFEST_PARSE_FAILED", "SEGMENT_FAILED",
    "RANGE_UNSUPPORTED", "RESUME_INVALID", "NETWORK_TIMEOUT", "RATE_LIMITED",
    "PROVIDER_ERROR", "FFMPEG_UNAVAILABLE", "FFMPEG_FAILED", "DISK_FULL",
    "FILE_TOO_LARGE", "DURATION_TOO_LONG", "JOB_TIMEOUT", "SERVER_CAPACITY",
    "OUTPUT_VERIFICATION_FAILED",
  ];
  const code = known.find((item) => message.startsWith(`${item}:`)) || "PROVIDER_ERROR";
  const clean = message.startsWith(`${code}:`) ? message.slice(code.length + 1).trim() : message;
  const retryable = ["SOURCE_UNAVAILABLE", "NETWORK_TIMEOUT", "RATE_LIMITED", "SERVER_CAPACITY", "SEGMENT_FAILED"].includes(code);
  return { code, message: clean, retryable };
}

function errorStatus(code) {
  if (code === "PRIVATE_CONTENT" || code === "AUTH_REQUIRED" || code === "DOWNLOAD_NOT_PERMITTED") return 403;
  if (code === "RATE_LIMITED") return 429;
  if (["FILE_TOO_LARGE", "DURATION_TOO_LONG", "JOB_TIMEOUT"].includes(code)) return 413;
  if (["SOURCE_UNAVAILABLE", "SERVER_CAPACITY", "NETWORK_TIMEOUT"].includes(code)) return 503;
  return 400;
}

function contentDispositionFilename(headers, fallbackUrl) {
  const disposition = headers.get("content-disposition") || "";
  const match = disposition.match(/filename\\*?=(?:UTF-8''|")?([^";]+)/i);
  if (match?.[1]) {
    try { return safeName(decodeURIComponent(match[1].replace(/^"|"$/g, "")), "download.bin"); } catch {}
  }
  const fromUrl = path.basename(new URL(fallbackUrl).pathname);
  return safeName(fromUrl || "download.bin", "download.bin");
}

function mediaMimeAllowed(contentType) {
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase();
  return mime.startsWith("video/") || mime.startsWith("audio/") || mime === "application/octet-stream";
}

async function fetchPublic(url, options = {}, signal) {
  let current = new URL(url);
  for (let hop = 0; hop < 6; hop += 1) {
    await assertPublicHostname(current.hostname);
    const response = await fetch(current, { ...options, redirect: "manual", signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("SOURCE_UNAVAILABLE: The media server returned an invalid redirect.");
      current = new URL(location, current);
      continue;
    }
    return { response, url: current };
  }
  throw new Error("SOURCE_UNAVAILABLE: Too many redirects.");
}

async function inspectDirectUrl(url, signal) {
  let response;
  try {
    ({ response } = await fetchPublic(url.toString(), { method: "HEAD", headers: { accept: "video/*,audio/*,application/octet-stream,*/*;q=0.5" } }, signal));
    if (response.status === 405 || response.status === 501) {
      ({ response } = await fetchPublic(url.toString(), { method: "GET", headers: { range: "bytes=0-0", accept: "video/*,audio/*,application/octet-stream,*/*;q=0.5" } }, signal));
    }
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error(`SOURCE_UNAVAILABLE: ${error instanceof Error ? error.message : "The source could not be reached."}`);
  }
  if (!response.ok && response.status !== 206) throw new Error(`SOURCE_UNAVAILABLE: The source returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!mediaMimeAllowed(contentType)) throw new Error("UNSUPPORTED_SOURCE: The URL does not identify a supported audio/video resource.");
  const length = Number(response.headers.get("content-length") || 0) || undefined;
  if (length && length > MAX_OUTPUT_BYTES) throw new Error("FILE_TOO_LARGE: The remote media exceeds the configured size limit.");
  const filename = contentDispositionFilename(response.headers, url.toString());
  if (response.body) await response.body.cancel().catch(() => undefined);
  return {
    provider: "generic",
    title: filename.replace(/\\.[^.]+$/, "") || "Direct media",
    webpageUrl: url.toString(),
    formats: [{
      formatId: "direct",
      ext: path.extname(filename).replace(".", "") || "bin",
      filesize: length,
      note: response.headers.get("accept-ranges") === "bytes" ? "HTTP range requests supported" : "Streaming download",
    }],
  };
}

async function handleDirectDownload(req, res, url, body, signal) {
  const requestedRange = Number.isInteger(body.resumeFrom) && body.resumeFrom > 0 ? body.resumeFrom : 0;
  const headers = { accept: "video/*,audio/*,application/octet-stream,*/*;q=0.5" };
  if (requestedRange) {
    headers.range = `bytes=${requestedRange}-`;
    if (body.resumeValidator) headers["if-range"] = String(body.resumeValidator);
  }
  const { response, url: finalUrl } = await fetchPublic(url.toString(), { method: "GET", headers }, signal);
  if (!response.ok && response.status !== 206) throw new Error(`SOURCE_UNAVAILABLE: The source returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!mediaMimeAllowed(contentType)) throw new Error("UNSUPPORTED_SOURCE: The URL does not identify a supported audio/video resource.");
  const contentLength = Number(response.headers.get("content-length") || 0) || undefined;
  if (contentLength && contentLength > MAX_OUTPUT_BYTES) throw new Error("FILE_TOO_LARGE: The remote media exceeds the configured size limit.");
  if (requestedRange && response.status !== 206) throw new Error("RESUME_INVALID: The server did not honor the requested byte range.");
  if (!response.body) throw new Error("SOURCE_UNAVAILABLE: The media response did not contain a body.");
  const outHeaders = {
    "content-type": contentType.split(";")[0],
    "content-disposition": `attachment; filename="${contentDispositionFilename(response.headers, finalUrl.toString())}"`,
    "cache-control": "no-store",
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "accept-ranges": response.headers.get("accept-ranges") || "none",
  };
  const etag = response.headers.get("etag");
  const modified = response.headers.get("last-modified");
  if (etag) outHeaders.etag = etag;
  if (modified) outHeaders["last-modified"] = modified;
  if (contentLength) outHeaders["content-length"] = String(contentLength);
  const contentRange = response.headers.get("content-range");
  if (contentRange) outHeaders["content-range"] = contentRange;
  res.writeHead(response.status, outHeaders);
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      if (bytes > MAX_OUTPUT_BYTES) throw new Error("FILE_TOO_LARGE: The downloaded media exceeded the configured size limit.");
      if (!res.write(Buffer.from(value))) await new Promise((resolve) => res.once("drain", resolve));
    }
    res.end();
  } catch (error) {
    try { res.destroy(); } catch {}
    throw error;
  }
}

async function handleInfo(req, res) {
  const body = await readJson(req);
  const { url: rawUrl, provider: requestedProvider } = body;
  const { url, provider } = providerForUrl(rawUrl);
  if (requestedProvider && requestedProvider !== provider) throw new Error("Provider does not match the supplied URL.");
  await assertPublicHostname(url.hostname);
  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
  if (provider === "generic") {
    const info = await inspectDirectUrl(url, controller.signal);
    json(res, 200, info);
    return;
  }

  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-url-info-"));
  try {
    const args = ["--dump-single-json", "--skip-download", "--no-warnings", url.toString()];
    const { stdout } = await runYtdlp(args, jobDir, controller.signal);
    let metadata;
    try { metadata = JSON.parse(stdout.trim().split(/\n(?=\{)/).pop() || stdout); }
    catch { throw new Error("The media provider returned invalid metadata."); }
    if (metadata.duration != null && Number(metadata.duration) > MAX_DURATION_SECONDS) throw new Error("Media exceeds the configured duration limit.");

    const rawFormats = Array.isArray(metadata.formats) ? metadata.formats : [];
    const formats = rawFormats.map((format) => ({
      formatId: String(format.format_id || ""),
      ext: String(format.ext || ""),
      resolution: format.resolution || (format.width && format.height ? `${format.width}x${format.height}` : undefined),
      fps: typeof format.fps === "number" ? format.fps : undefined,
      videoCodec: format.vcodec && format.vcodec !== "none" ? String(format.vcodec) : undefined,
      audioCodec: format.acodec && format.acodec !== "none" ? String(format.acodec) : undefined,
      filesize: Number(format.filesize || format.filesize_approx || 0) || undefined,
      note: format.format_note ? String(format.format_note) : undefined,
    })).filter((format) => format.formatId || format.ext);

    json(res, 200, {
      provider,
      id: metadata.id ? String(metadata.id) : undefined,
      title: String(metadata.title || metadata.fulltitle || "Untitled media"),
      uploader: metadata.uploader ? String(metadata.uploader) : undefined,
      duration: typeof metadata.duration === "number" ? metadata.duration : undefined,
      thumbnail: metadata.thumbnail ? String(metadata.thumbnail) : undefined,
      webpageUrl: metadata.webpage_url ? String(metadata.webpage_url) : url.toString(),
      live: Boolean(metadata.is_live),
      width: typeof metadata.width === "number" ? metadata.width : undefined,
      height: typeof metadata.height === "number" ? metadata.height : undefined,
      fps: typeof metadata.fps === "number" ? metadata.fps : undefined,
      videoCodec: metadata.vcodec && metadata.vcodec !== "none" ? String(metadata.vcodec) : undefined,
      audioCodec: metadata.acodec && metadata.acodec !== "none" ? String(metadata.acodec) : undefined,
      formats: formats.slice(0, 100),
    });
  } finally {
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function handleDownload(req, res) {
  const body = await readJson(req);
  const { url: rawUrl, provider: requestedProvider, format = "mp4", audioOnly = false } = body;
  const { url, provider } = providerForUrl(rawUrl);
  if (requestedProvider && requestedProvider !== provider) throw new Error("Provider does not match the supplied URL.");
  await assertPublicHostname(url.hostname);
  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
  if (provider === "generic") {
    await handleDirectDownload(req, res, url, body, controller.signal);
    return;
  }

  const supportedFormats = new Set(["mp4", "webm", "mp3", "m4a", "best"]);
  if (!supportedFormats.has(String(format))) throw new Error("Unsupported output format.");
  if (audioOnly && !["mp3", "m4a", "best"].includes(String(format))) throw new Error("Audio-only mode requires an audio format.");

  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-url-media-"));
  try {
    const outputTemplate = path.join(jobDir, `${randomUUID()}-%(title).120s.%(ext)s`);
    const adapter = createProviderAdapter(provider, String(format), Boolean(audioOnly));
    const args = ["--max-filesize", `${MAX_OUTPUT_BYTES}`, "--match-filter", `duration <= ${MAX_DURATION_SECONDS}`, "--format", adapter.formatArg, ...adapter.post, "--output", outputTemplate, "--print", "after_move:filepath", url.toString()];
    await runYtdlp(args, jobDir, controller.signal);
    const entries = await fs.readdir(jobDir, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const file = path.join(jobDir, entry.name);
      const stat = await fs.stat(file);
      if (stat.size > MAX_OUTPUT_BYTES) continue;
      candidates.push({ file, stat });
    }
    if (!candidates.length) throw new Error("The provider returned no downloadable media within the configured limits.");
    candidates.sort((a,b) => b.stat.size - a.stat.size);
    const chosen = candidates[0];
    await verifyDownloadedMedia(chosen.file, MAX_OUTPUT_BYTES, controller.signal);
    const data = await fs.readFile(chosen.file);
    const ext = path.extname(chosen.file).toLowerCase().replace(".", "") || "bin";
    const mime = ext === "mp4" ? "video/mp4" : ext === "webm" ? "video/webm" : ext === "mp3" ? "audio/mpeg" : ext === "m4a" ? "audio/mp4" : "application/octet-stream";
    res.writeHead(200, { "content-type": mime, "content-disposition": `attachment; filename="${safeName(path.basename(chosen.file))}"`, "content-length": String(data.length), "access-control-allow-origin": ALLOWED_ORIGIN, "cache-control": "no-store" });
    res.end(data);
  } finally {
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": ALLOWED_ORIGIN, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" }); return res.end(); }
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true, service: "enV URL media processor", downloader: YTDLP_BIN, providers: Object.keys(PROVIDERS), ready: await commandExists() });
  if (req.method === "POST" && req.url === "/info") {
    try { await handleInfo(req, res); } catch (error) { console.error(error); if (!res.headersSent) { const failure = errorPayload(error); json(res, errorStatus(failure.code), { error: failure.message, ...failure }); } }
    return;
  }
  if (req.method === "POST" && req.url === "/download") {
    try { await handleDownload(req, res); } catch (error) { console.error(error); if (!res.headersSent) { const failure = errorPayload(error); json(res, errorStatus(failure.code), { error: failure.message, ...failure }); } }
    return;
  }
  json(res, 404, { error: "Not found." });
});

server.listen(PORT, HOST, () => console.log(`enV URL media processor listening on http://${HOST}:${PORT}`));

