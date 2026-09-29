#!/usr/bin/env node
import http from "node:http";
import dns from "node:dns/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const HOST = process.env.URL_MEDIA_HOST || "0.0.0.0";
const PORT = Number(process.env.URL_MEDIA_PORT || 8790);
const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";
const ALLOWED_ORIGIN = process.env.URL_MEDIA_ALLOWED_ORIGIN || "*";
const MAX_OUTPUT_BYTES = Number(process.env.URL_MEDIA_MAX_OUTPUT_BYTES || 500 * 1024 * 1024);
const MAX_DURATION_SECONDS = Number(process.env.URL_MEDIA_MAX_DURATION_SECONDS || 2 * 60 * 60);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.URL_MEDIA_TIMEOUT_MS || 10 * 60 * 1000);

const PROVIDERS = {
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com"],
  tiktok: ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com"],
  facebook: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"],
  instagram: ["instagram.com", "www.instagram.com"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
};

const PROVIDER_BY_HOST = new Map(Object.entries(PROVIDERS).flatMap(([provider, hosts]) => hosts.map((host) => [host, provider])));

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": ALLOWED_ORIGIN, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" });
  res.end(JSON.stringify(body));
}

function safeName(value, fallback = "download.bin") {
  const base = path.basename(String(value || fallback)).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || fallback;
}

function isPrivateIp(address) {
  const normalized = String(address).toLowerCase();
  if (net.isIPv4(normalized)) {
    const [a,b] = normalized.split(".").map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
  }
  if (net.isIPv6(normalized)) {
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  return true;
}

function providerForUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Enter a valid http(s) URL."); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http and https URLs are supported.");
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "www.");
  const provider = PROVIDER_BY_HOST.get(hostname);
  if (!provider) throw new Error("This URL provider is not supported by enV yet.");
  return { url, provider };
}

async function assertPublicHostname(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Private or local network addresses are not allowed.");
    return;
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) throw new Error("The target host resolves to a private or local network address.");
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

async function commandExists() {
  try { await runYtdlp(["--version"], os.tmpdir(), undefined); return true; } catch { return false; }
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > 128 * 1024) throw new Error("Request body is too large."); }
  return JSON.parse(body || "{}");
}

function youtubeAdapter(format, audioOnly) {
  if (audioOnly) {
    if (format === "mp3") return { formatArg: "bestaudio/best", post: ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K"] };
    if (format === "m4a") return { formatArg: "bestaudio[ext=m4a]/bestaudio", post: [] };
    return { formatArg: "bestaudio/best", post: [] };
  }
  if (format === "mp4") return { formatArg: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", post: [] };
  if (format === "webm") return { formatArg: "bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best", post: [] };
  return { formatArg: "best", post: [] };
}

function tiktokAdapter(format, audioOnly) {
  if (audioOnly) {
    if (format === "mp3") return { formatArg: "bestaudio/best", post: ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K"] };
    if (format === "m4a") return { formatArg: "bestaudio[ext=m4a]/bestaudio", post: [] };
    return { formatArg: "bestaudio/best", post: [] };
  }
  if (format === "mp4") return { formatArg: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", post: [] };
  if (format === "webm") return { formatArg: "bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best", post: [] };
  return { formatArg: "best", post: [] };
}

function facebookAdapter(format, audioOnly) {
  if (audioOnly) {
    if (format === "mp3") return { formatArg: "bestaudio/best", post: ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K"] };
    if (format === "m4a") return { formatArg: "bestaudio[ext=m4a]/bestaudio", post: [] };
    return { formatArg: "bestaudio/best", post: [] };
  }
  if (format === "mp4") return { formatArg: "best[ext=mp4]/best", post: [] };
  if (format === "webm") return { formatArg: "best[ext=webm]/best", post: [] };
  return { formatArg: "best", post: [] };
}

function instagramAdapter(format, audioOnly) {
  if (audioOnly) {
    if (format === "mp3") return { formatArg: "bestaudio/best", post: ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K"] };
    if (format === "m4a") return { formatArg: "bestaudio[ext=m4a]/bestaudio", post: [] };
    return { formatArg: "bestaudio/best", post: [] };
  }
  if (format === "mp4") return { formatArg: "best[ext=mp4]/best", post: [] };
  if (format === "webm") return { formatArg: "best[ext=webm]/best", post: [] };
  return { formatArg: "best", post: [] };
}

function xAdapter(format, audioOnly) {
  if (audioOnly) {
    if (format === "mp3") return { formatArg: "bestaudio/best", post: ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K"] };
    if (format === "m4a") return { formatArg: "bestaudio[ext=m4a]/bestaudio", post: [] };
    return { formatArg: "bestaudio/best", post: [] };
  }
  if (format === "mp4") return { formatArg: "best[ext=mp4]/best", post: [] };
  if (format === "webm") return { formatArg: "best[ext=webm]/best", post: [] };
  return { formatArg: "best", post: [] };
}

function adapterFor(provider, format, audioOnly) {
  if (provider === "youtube") return youtubeAdapter(format, audioOnly);
  if (provider === "tiktok") return tiktokAdapter(format, audioOnly);
  if (provider === "facebook") return facebookAdapter(format, audioOnly);
  if (provider === "instagram") return instagramAdapter(format, audioOnly);
  if (provider === "x") return xAdapter(format, audioOnly);
  if (audioOnly) return { formatArg: format === "m4a" ? "bestaudio[ext=m4a]/bestaudio" : "bestaudio/best", post: format === "mp3" ? ["--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K"] : [] };
  if (format === "mp4") return { formatArg: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", post: [] };
  if (format === "webm") return { formatArg: "bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best", post: [] };
  return { formatArg: "best", post: [] };
}

async function handleInfo(req, res) {
  const body = await readJson(req);
  const { url: rawUrl, provider: requestedProvider } = body;
  const { url, provider } = providerForUrl(rawUrl);
  if (requestedProvider && requestedProvider !== provider) throw new Error("Provider does not match the supplied URL.");
  await assertPublicHostname(url.hostname);

  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-url-info-"));
  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
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

  const supportedFormats = new Set(["mp4", "webm", "mp3", "m4a", "best"]);
  if (!supportedFormats.has(String(format))) throw new Error("Unsupported output format.");
  if (audioOnly && !["mp3", "m4a", "best"].includes(String(format))) throw new Error("Audio-only mode requires an audio format.");

  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-url-media-"));
  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
  try {
    const outputTemplate = path.join(jobDir, `${randomUUID()}-%(title).120s.%(ext)s`);
    const adapter = adapterFor(provider, String(format), Boolean(audioOnly));
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
    try { await handleInfo(req, res); } catch (error) { console.error(error); if (!res.headersSent) json(res, 400, { error: error instanceof Error ? error.message : "URL media inspection failed." }); }
    return;
  }
  if (req.method === "POST" && req.url === "/download") {
    try { await handleDownload(req, res); } catch (error) { console.error(error); if (!res.headersSent) json(res, 400, { error: error instanceof Error ? error.message : "URL media download failed." }); }
    return;
  }
  json(res, 404, { error: "Not found." });
});

server.listen(PORT, HOST, () => console.log(`enV URL media processor listening on http://${HOST}:${PORT}`));
