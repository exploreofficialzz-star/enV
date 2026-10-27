#!/usr/bin/env node
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PROVIDERS, detectProvider, createProviderAdapter, createProviderRequestArgs } from "./media/provider-registry.mjs";
import { assertPublicHostname } from "./media/url-security.mjs";
import { parseYtDlpJson } from "./media/yt-dlp-output.mjs";
import { parseAudiomackAlbumPage } from "./media/audiomack-page-parser.mjs";
import { isAudiomackSongUrl, parseAudiomackSongPage } from "./media/audiomack-song-page.mjs";
import { classifyProviderFailure } from "./media/provider-errors.mjs";
import { shouldTryGenericExtractor, genericExtractorArgs } from "./media/extraction-strategy.mjs";
import { extractExplicitPublicAudioLinks, probeExplicitPublicAudioLink, isPublicMediaCollectionPage } from "./media/public-download-links.mjs";
import { archiveMetadataUrl, isArchiveItemPage, parseArchiveAudioItem } from "./media/archive-org.mjs";
import { shouldTryAria2Transfer, aria2YtdlpArgs } from "./media/transfer-alternatives.mjs";

const HOST = process.env.URL_MEDIA_HOST || "0.0.0.0";
const PORT = Number(process.env.URL_MEDIA_PORT || 8790);
const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";
const AUDIOMACK_YTDLP_BIN = process.env.AUDIOMACK_YTDLP_BIN || YTDLP_BIN;
const FFPROBE_BIN = process.env.FFPROBE_BIN || "ffprobe";
const ALLOWED_ORIGIN = process.env.URL_MEDIA_ALLOWED_ORIGIN || "*";
const MAX_OUTPUT_BYTES = Number(process.env.URL_MEDIA_MAX_OUTPUT_BYTES || 500 * 1024 * 1024);
const MAX_DURATION_SECONDS = Number(process.env.URL_MEDIA_MAX_DURATION_SECONDS || 2 * 60 * 60);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.URL_MEDIA_TIMEOUT_MS || 10 * 60 * 1000);
const MAX_YTDLP_STDOUT_CHARS = Number(process.env.URL_MEDIA_MAX_YTDLP_STDOUT_CHARS || 8 * 1024 * 1024);

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": ALLOWED_ORIGIN, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" });
  res.end(JSON.stringify(body));
}

function safeName(value, fallback = "download.bin") {
  const base = path.basename(String(value || fallback)).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || fallback;
}

function runYtdlp(args, cwd, signal, provider, includePlaylist = false) {
  return new Promise((resolve, reject) => {
    const playlistMode = includePlaylist ? "--yes-playlist" : "--no-playlist";
    const extractorBinary = provider === "audiomack" ? AUDIOMACK_YTDLP_BIN : YTDLP_BIN;
    const child = spawn(extractorBinary, ["--ignore-config", playlistMode, "--restrict-filenames", "--js-runtimes", "node", "--retries", "3", "--fragment-retries", "3", "--extractor-retries", "2", "--socket-timeout", "25", ...createProviderRequestArgs(provider), ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    let stdoutExceeded = false;
    const timer = setTimeout(() => child.kill("SIGTERM"), DOWNLOAD_TIMEOUT_MS);
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (c) => {
      const chunk = c.toString();
      if (stdout.length + chunk.length > MAX_YTDLP_STDOUT_CHARS) {
        stdoutExceeded = true;
        child.kill("SIGTERM");
        return;
      }
      stdout += chunk;
    });
    child.stderr.on("data", (c) => { stderr += c.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
    child.on("error", (error) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (signal?.aborted) return reject(new Error("Download cancelled."));
      if (stdoutExceeded) return reject(new Error("PROVIDER_ERROR: The media provider returned too much metadata."));
      if (code !== 0) {
        const detail = stderr.trim().slice(-1200);
        // Keep authentication, bot challenges, rate limits, and provider errors
        // in one classifier so "sign in to confirm you're not a bot" is not
        // incorrectly surfaced as a mandatory user login.
        return reject(classifyProviderFailure(provider, detail || `Media downloader exited with code ${code}.`));
      }
      resolve({ stdout, stderr });
    });
  });
}

async function runYtdlpWithGenericFallback(args, cwd, signal, provider, includePlaylist = false) {
  try {
    return await runYtdlp(args, cwd, signal, provider, includePlaylist);
  } catch (error) {
    if (!shouldTryGenericExtractor(error, includePlaylist) || signal?.aborted) throw error;
    console.warn(`[url-media] provider=${provider} extractor metadata failed; trying generic public HTML media extraction once`);
    try {
      return await runYtdlp(genericExtractorArgs(args), cwd, signal, provider, false);
    } catch {
      // Preserve the original provider-specific diagnostic instead of hiding
      // it under the less-specific generic HTML extractor's final error.
      throw error;
    }
  }
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
  const probe = await runFfprobe(file, signal);
  const duration = Number(probe?.format?.duration);
  if (Number.isFinite(duration) && duration > MAX_DURATION_SECONDS) throw new Error("DURATION_TOO_LONG: The downloaded media exceeds the configured duration limit.");
  return stat;
}

let downloaderReadinessPromise;

async function commandExists() {
  // Probe the binary once per running process. Re-spawning Python-backed yt-dlp
  // on every health request can make the gateway's readiness deadline expire.
  if (downloaderReadinessPromise) return downloaderReadinessPromise;

  const probe = new Promise((resolve) => {
    let child;
    let settled = false;
    let timer;
    const finish = (ready, reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!ready) {
        console.error(`[url-media] Downloader readiness probe failed: ${reason}. Check YTDLP_BIN and downloader dependencies.`);
      }
      resolve(ready);
    };

    timer = setTimeout(() => {
      child?.kill("SIGTERM");
      finish(false, "timed out after 5 seconds");
    }, 5000);

    try {
      child = spawn(YTDLP_BIN, ["--version"], { cwd: os.tmpdir(), stdio: "ignore" });
      child.once("error", (error) => finish(false, String(error?.code || error?.name || "spawn error")));
      child.once("close", (code, signal) => finish(
        code === 0,
        `exit=${code ?? "null"}, signal=${signal ?? "none"}`,
      ));
    } catch (error) {
      finish(false, String(error?.code || error?.name || "spawn error"));
    }
  });

  downloaderReadinessPromise = probe.then((ready) => {
    // A failed probe must be retryable after a transient resource/launch issue.
    if (!ready) downloaderReadinessPromise = null;
    return ready;
  });
  return downloaderReadinessPromise;
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
  const directAudio = /\.(?:mp3|m4a|aac|wav|flac|ogg|oga|opus|aiff|aif|wma|webm)$/i.test(url.pathname);
  return { url, provider: directAudio ? "generic" : detectProvider(url), directAudio };
}

const PUBLIC_ERROR_MESSAGES = {
  INVALID_URL: "Enter a valid public HTTP or HTTPS URL.",
  UNSUPPORTED_SOURCE: "This media source is not supported yet.",
  SOURCE_UNAVAILABLE: "We couldn’t reach this source. Check the URL and try again later.",
  PRIVATE_CONTENT: "This content is private. enV can process only content that is publicly accessible.",
  AUTH_REQUIRED: "This source requires sign-in. Use publicly accessible content or configure supported provider access.",
  SOURCE_CHALLENGE: "The source is challenging or blocking the processor request. This does not necessarily mean sign-in is required; retry later.",
  DOWNLOAD_NOT_PERMITTED: "This source does not permit downloading through enV.",
  NO_DOWNLOADABLE_FORMAT: "No downloadable format is available for this content.",
  FORMAT_UNAVAILABLE: "The selected media format is unavailable for this source.",
  MANIFEST_PARSE_FAILED: "We couldn’t read the media details from this source. Try again later.",
  SEGMENT_FAILED: "A media segment could not be downloaded. Please try again.",
  RANGE_UNSUPPORTED: "This source does not support resuming a partial download. Start the download again.",
  RESUME_INVALID: "The saved download state is no longer valid. Start the download again.",
  NETWORK_TIMEOUT: "The source took too long to respond. Please try again.",
  RATE_LIMITED: "The source is receiving too many requests. Try again later.",
  PROVIDER_ERROR: "The media source could not complete this request. Check the URL and try again.",
  FFMPEG_UNAVAILABLE: "Media conversion is temporarily unavailable. Please try again later.",
  FFMPEG_FAILED: "We couldn’t convert this media. Try another supported format.",
  DISK_FULL: "The processing service is temporarily out of space. Please try again later.",
  FILE_TOO_LARGE: "This media exceeds the supported file-size limit.",
  DURATION_TOO_LONG: "This media exceeds the supported duration limit.",
  JOB_TIMEOUT: "This media task took too long. Try a shorter file or try again later.",
  SERVER_CAPACITY: "The media service is busy. Please try again shortly.",
  OUTPUT_VERIFICATION_FAILED: "We couldn’t verify the downloaded file. Please try again.",
  REQUEST_TOO_LARGE: "This request is too large. Reduce the request size and try again.",
  INVALID_REQUEST_BODY: "The request could not be read. Check the submitted details and try again.",
};
function errorPayload(error) {
  const message = error instanceof Error ? error.message : String(error);
  const known = [
    "INVALID_URL", "UNSUPPORTED_SOURCE", "SOURCE_UNAVAILABLE", "PRIVATE_CONTENT",
    "AUTH_REQUIRED", "SOURCE_CHALLENGE", "DOWNLOAD_NOT_PERMITTED", "NO_DOWNLOADABLE_FORMAT",
    "FORMAT_UNAVAILABLE", "MANIFEST_PARSE_FAILED", "SEGMENT_FAILED",
    "RANGE_UNSUPPORTED", "RESUME_INVALID", "NETWORK_TIMEOUT", "RATE_LIMITED",
    "PROVIDER_ERROR", "FFMPEG_UNAVAILABLE", "FFMPEG_FAILED", "DISK_FULL",
    "FILE_TOO_LARGE", "DURATION_TOO_LONG", "JOB_TIMEOUT", "SERVER_CAPACITY",
    "OUTPUT_VERIFICATION_FAILED", "REQUEST_TOO_LARGE", "INVALID_REQUEST_BODY",
  ];
  const prefixedCode = known.find((item) => message.startsWith(`${item}:`));
  const code = prefixedCode ||
    (/request body is too large/i.test(message) ? "REQUEST_TOO_LARGE" :
      error instanceof SyntaxError ? "INVALID_REQUEST_BODY" : "PROVIDER_ERROR");
  const retryable = ["SOURCE_UNAVAILABLE", "SOURCE_CHALLENGE", "NETWORK_TIMEOUT", "RATE_LIMITED", "SERVER_CAPACITY", "SEGMENT_FAILED"].includes(code);
  const safeMessage = message.replace(/https?:\/\/\S+/g, "[source URL]").replace(/[\r\n\t]+/g, " ").slice(0, 900);
  const audiomackAlbumFailure = code === "SOURCE_UNAVAILABLE" && /^SOURCE_UNAVAILABLE: Audiomack's collection resolver could not enumerate its tracks/i.test(safeMessage);
  const explicitDetail = safeMessage.match(/^[A-Z_]+:\s*(.+)$/);
  const detailCodes = new Set(["INVALID_URL", "UNSUPPORTED_SOURCE", "SOURCE_UNAVAILABLE", "AUTH_REQUIRED", "SOURCE_CHALLENGE", "DOWNLOAD_NOT_PERMITTED", "NO_DOWNLOADABLE_FORMAT", "NETWORK_TIMEOUT", "RATE_LIMITED", "PROVIDER_ERROR"]);
  const publicMessage = audiomackAlbumFailure
    ? safeMessage.replace(/^SOURCE_UNAVAILABLE:\s*/i, "")
    : detailCodes.has(code) && explicitDetail
      ? explicitDetail[1]
      : PUBLIC_ERROR_MESSAGES[code] || PUBLIC_ERROR_MESSAGES.PROVIDER_ERROR;
  return { code, message: publicMessage, retryable };
}

function errorStatus(code) {
  if (code === "PRIVATE_CONTENT" || code === "AUTH_REQUIRED" || code === "DOWNLOAD_NOT_PERMITTED") return 403;
  if (code === "RATE_LIMITED") return 429;
  if (["FILE_TOO_LARGE", "DURATION_TOO_LONG", "REQUEST_TOO_LARGE"].includes(code)) return 413;
  if (code === "JOB_TIMEOUT") return 504;
  if (["SOURCE_UNAVAILABLE", "SOURCE_CHALLENGE", "SERVER_CAPACITY", "NETWORK_TIMEOUT"].includes(code)) return 503;
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
  const requestedMaxBytes = Number(body.maxBytes);
  const maxBytes = Number.isFinite(requestedMaxBytes) && requestedMaxBytes > 0
    ? Math.min(MAX_OUTPUT_BYTES, Math.floor(requestedMaxBytes))
    : MAX_OUTPUT_BYTES;
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
  if (contentLength && contentLength > maxBytes) throw new Error("FILE_TOO_LARGE: The remote media exceeds the configured size limit.");
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
      if (bytes > maxBytes) throw new Error("FILE_TOO_LARGE: The downloaded media exceeded the configured size limit.");
      if (!res.write(Buffer.from(value))) await new Promise((resolve) => res.once("drain", resolve));
    }
    res.end();
  } catch (error) {
    try { res.destroy(); } catch {}
    throw error;
  }
}

async function readBoundedText(response, maxBytes) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) throw new Error("SOURCE_UNAVAILABLE: Audiomack page metadata is too large.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("SOURCE_UNAVAILABLE: Audiomack page metadata exceeds the safe inspection limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function isAudiomackCollectionUrl(url) {
  const parts = url.pathname.toLowerCase().split("/").filter(Boolean);
  // Audiomack publicly exposes both artist/album/slug and artist/playlist/slug.
  return parts.length >= 3 && ["album", "playlist", "playlists"].some((kind) =>
    parts[0] === kind || parts[1] === kind);
}

/**
 * Fallback shared by all registered providers: only follow a page's explicit,
 * HTTPS audio-file download link. A streaming player URL is not enough.
 * fetchPublic enforces public-DNS checks on each redirect before requesting it.
 */
async function discoverExplicitAudioDownload(url, signal) {
  if (isPublicMediaCollectionPage(url.toString())) return null;
  const { response, url: pageUrl } = await fetchPublic(url.toString(), {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 (compatible; enV-Music-Downloader/1.0)" },
  }, signal);
  if (!response.ok) return null;
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    if (response.body) await response.body.cancel().catch(() => undefined);
    return null;
  }
  const html = await readBoundedText(response, 2 * 1024 * 1024);
  // Validate actual response type: URLs for signed files may have no extension,
  // while player/HTML URLs can misleadingly be labelled "Download".
  for (const candidate of extractExplicitPublicAudioLinks(html, pageUrl.toString())) {
    try {
      const verified = await probeExplicitPublicAudioLink(candidate, fetchPublic, signal);
      if (verified) return verified;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      // Continue to another explicitly offered file, if any.
    }
  }
  return null;
}

async function inspectArchiveItem(url, signal) {
  const metadataUrl = archiveMetadataUrl(url.toString());
  if (!metadataUrl) throw new Error("UNSUPPORTED_SOURCE: This is not a supported Internet Archive item URL.");
  const { response } = await fetchPublic(metadataUrl, {
    method: "GET", headers: { accept: "application/json" },
  }, signal);
  if (!response.ok) throw new Error("SOURCE_UNAVAILABLE: Internet Archive metadata returned HTTP " + response.status + ".");
  const raw = await readBoundedText(response, 2 * 1024 * 1024);
  let payload;
  try { payload = JSON.parse(raw); }
  catch { throw new Error("SOURCE_UNAVAILABLE: Internet Archive returned invalid item metadata."); }
  const info = parseArchiveAudioItem(payload, url.toString());
  if (!info) throw new Error("NO_DOWNLOADABLE_FORMAT: This Internet Archive item does not list accessible audio files within enV's 50 MB track limit.");
  return info;
}

async function inspectAudiomackSongPage(url, signal) {
  const { response, url: finalUrl } = await fetchPublic(url.toString(), {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 (compatible; enV-Music-Downloader/1.0)" },
  }, signal);
  if (!["audiomack.com", "www.audiomack.com"].includes(finalUrl.hostname.toLowerCase()) || !isAudiomackSongUrl(finalUrl.toString())) {
    throw new Error("SOURCE_UNAVAILABLE: This Audiomack song redirected to an unexpected page.");
  }
  if (!response.ok) throw new Error("SOURCE_UNAVAILABLE: Audiomack song page returned HTTP " + response.status + ".");
  const mime = (response.headers.get("content-type") || "").toLowerCase();
  if (mime && !mime.includes("text/html") && !mime.includes("application/xhtml+xml")) {
    if (response.body) await response.body.cancel().catch(() => undefined);
    throw new Error("SOURCE_UNAVAILABLE: Audiomack did not return an HTML song page.");
  }
  const html = await readBoundedText(response, 2 * 1024 * 1024);
  const metadata = parseAudiomackSongPage(html, finalUrl.toString());
  if (!metadata) throw new Error("SOURCE_UNAVAILABLE: This Audiomack song page did not contain readable public metadata.");
  return metadata;
}

async function inspectAudiomackAlbumPage(url, signal) {
  const { response, url: finalUrl } = await fetchPublic(url.toString(), {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
    },
  }, signal);
  const finalHost = finalUrl.hostname.toLowerCase();
  if (finalHost !== "audiomack.com" && finalHost !== "www.audiomack.com") {
    throw new Error("SOURCE_UNAVAILABLE: Audiomack redirected to an unexpected host.");
  }
  if (!response.ok) throw new Error("SOURCE_UNAVAILABLE: Audiomack returned HTTP " + response.status + " for its album page.");
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error("SOURCE_UNAVAILABLE: Audiomack did not return an HTML album page.");
  }
  const html = await readBoundedText(response, 8 * 1024 * 1024);
  const parsed = parseAudiomackAlbumPage(html, finalUrl.toString());
  if (!parsed.entries.length) return null;
  return {
    provider: "audiomack",
    title: parsed.title || "Audiomack collection",
    uploader: parsed.uploader,
    album: parsed.title || undefined,
    webpageUrl: finalUrl.toString(),
    isPlaylist: true,
    entries: parsed.entries,
    truncated: parsed.truncated,
    formats: [],
  };
}

async function handleInfo(req, res) {
  const body = await readJson(req);
  const { url: rawUrl, provider: requestedProvider, includePlaylist = false } = body;
  const { url, provider, directAudio } = providerForUrl(rawUrl);
  if (requestedProvider && requestedProvider !== provider && !directAudio) throw new Error("Provider does not match the supplied URL.");
  await assertPublicHostname(url.hostname);
  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
  if (provider === "archive" && isArchiveItemPage(url.toString())) {
    json(res, 200, await inspectArchiveItem(url, controller.signal));
    return;
  }
  // Individual Audiomack songs are never treated as playlists, including
  // requests sent by older clients with includePlaylist=true.
  if (provider === "audiomack" && isAudiomackSongUrl(url.toString())) {
    try {
      json(res, 200, await inspectAudiomackSongPage(url, controller.signal));
      return;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      console.warn("[url-media] Audiomack single-song public metadata unavailable; trying configured extractor");
    }
  }
  let audiomackPageFallbackFailure = "";
  if (provider === "audiomack" && includePlaylist && isAudiomackCollectionUrl(url)) {
    try {
      const albumInfo = await inspectAudiomackAlbumPage(url, controller.signal);
      if (albumInfo?.entries?.length) {
        json(res, 200, albumInfo);
        return;
      }
      audiomackPageFallbackFailure = "The public collection page did not expose usable song links.";
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      const failure = error instanceof Error ? error.message : String(error);
      audiomackPageFallbackFailure = failure.replace(/https?:\/\/\S+/g, "[source url]").replace(/[\r\n]+/g, " ").slice(0, 220);
      console.warn("[url-media] Audiomack page-link fallback unavailable: " + audiomackPageFallbackFailure);
    }
  }
  // yt-dlp's historical Audiomack album extractor loops over the obsolete
  // /api/music/url/album endpoint. Running it after public-page discovery fails
  // produces a misleading JSON error, not a usable album track list.
  if (provider === "audiomack" && includePlaylist && isAudiomackCollectionUrl(url)) {
    throw new Error("SOURCE_UNAVAILABLE: Audiomack's public collection page did not expose readable song links. " +
      (audiomackPageFallbackFailure || "Track enumeration was unavailable.") +
      " The legacy album API extractor cannot recover those links. No audio was downloaded.");
  }
  if (provider === "generic") {
    const info = await inspectDirectUrl(url, controller.signal);
    json(res, 200, info);
    return;
  }

  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-url-info-"));
  try {
    const inspectCollection = Boolean(includePlaylist) && isPublicMediaCollectionPage(url.toString());
    const args = [
      "--dump-single-json", "--skip-download", "--no-warnings",
      ...(inspectCollection ? ["--flat-playlist", "--playlist-end", "50"] : []),
      url.toString(),
    ];
    let stdout;
    try {
      ({ stdout } = await runYtdlpWithGenericFallback(args, jobDir, controller.signal, provider, inspectCollection));
    } catch (error) {
      // The provider extractor can be outdated even when an artist offers a
      // direct file on the public song page. Use this safe, opt-in HTML fallback
      // for all supported providers, never as an album/playlist shortcut.
      const code = String(error?.message || "");
      if (/^(?:SOURCE_UNAVAILABLE|UNSUPPORTED_SOURCE|PROVIDER_ERROR|NO_DOWNLOADABLE_FORMAT):/.test(code)) {
        try {
          const publicDownload = await discoverExplicitAudioDownload(url, controller.signal);
          if (publicDownload) {
            json(res, 200, {
              provider, title: publicDownload.pathname.split("/").pop()?.replace(/\\.[^.]+$/, "") || "Downloadable audio",
              webpageUrl: url.toString(), isPlaylist: false, entries: [],
              formats: [{ formatId: "direct-file", ext: path.extname(publicDownload.pathname).slice(1), note: "Artist-provided public file download" }],
            });
            return;
          }
        } catch (fallbackError) {
          if (fallbackError?.name === "AbortError") throw fallbackError;
          // Keep the original provider error when the optional fallback fails.
        }
      }
      const message = error instanceof Error ? error.message : String(error);
      throw error;
    }
    const metadata = parseYtDlpJson(stdout);
    if (metadata.duration != null && Number(metadata.duration) > MAX_DURATION_SECONDS) throw new Error("DURATION_TOO_LONG: Media exceeds the configured duration limit.");

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

    const entries = Array.isArray(metadata.entries)
      ? metadata.entries.slice(0, 50).map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const entryUrl = String(entry.webpage_url || entry.original_url || entry.url || "");
          const resolvedUrl = /^https?:\/\//i.test(entryUrl)
            ? entryUrl
            : provider === "youtube" && entry.id
              ? "https://www.youtube.com/watch?v=" + encodeURIComponent(String(entry.id))
              : entryUrl;
          return resolvedUrl ? {
            id: entry.id ? String(entry.id) : undefined,
            title: String(entry.title || entry.fulltitle || "Untitled track"),
            uploader: entry.uploader || entry.artist ? String(entry.uploader || entry.artist) : undefined,
            album: entry.album || entry.album_title ? String(entry.album || entry.album_title) : undefined,
            releaseYear: entry.release_year || entry.release_date || entry.upload_date ? String(entry.release_year || entry.release_date || entry.upload_date) : undefined,
            duration: typeof entry.duration === "number" ? entry.duration : undefined,
            thumbnail: entry.thumbnail ? String(entry.thumbnail) : undefined,
            webpageUrl: resolvedUrl,
          } : null;
        }).filter(Boolean)
      : [];
    json(res, 200, {
      provider,
      id: metadata.id ? String(metadata.id) : undefined,
      title: String(metadata.title || metadata.fulltitle || metadata.album || metadata.album_title || "Untitled media"),
      uploader: metadata.uploader || metadata.artist ? String(metadata.uploader || metadata.artist) : undefined,
      album: metadata.album || metadata.album_title ? String(metadata.album || metadata.album_title) : undefined,
      releaseYear: metadata.release_year || metadata.release_date || metadata.upload_date ? String(metadata.release_year || metadata.release_date || metadata.upload_date) : undefined,
      duration: typeof metadata.duration === "number" ? metadata.duration : undefined,
      thumbnail: metadata.thumbnail ? String(metadata.thumbnail) : undefined,
      webpageUrl: metadata.webpage_url ? String(metadata.webpage_url) : url.toString(),
      isPlaylist: metadata._type === "playlist" || metadata._type === "multi_video" || entries.length > 0,
      entries,
      truncated: Array.isArray(metadata.entries) && metadata.entries.length > entries.length,
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
  const requestedMaxBytes = Number(body.maxBytes);
  const maxBytes = Number.isFinite(requestedMaxBytes) && requestedMaxBytes > 0
    ? Math.min(MAX_OUTPUT_BYTES, Math.floor(requestedMaxBytes))
    : MAX_OUTPUT_BYTES;
  const { url, provider, directAudio } = providerForUrl(rawUrl);
  if (requestedProvider && requestedProvider !== provider && !directAudio) throw new Error("Provider does not match the supplied URL.");
  await assertPublicHostname(url.hostname);
  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
  if (provider === "generic") {
    await handleDirectDownload(req, res, url, body, controller.signal);
    return;
  }
  if (provider === "archive" && isArchiveItemPage(url.toString())) {
    throw new Error("INVALID_URL: Preview the Internet Archive audio collection and download its individual public audio files.");
  }

  // Prefer a creator-enabled public download link rather than an obsolete
  // Audiomack extractor. The link is only used after audio-response validation.
  if (provider === "audiomack" && isAudiomackSongUrl(url.toString()) && audioOnly) {
    const publicFile = await discoverExplicitAudioDownload(url, controller.signal).catch((error) => {
      if (error?.name === "AbortError") throw error;
      return null;
    });
    if (publicFile) {
      await handleDirectDownload(req, res, publicFile, body, controller.signal);
      return;
    }
  }

  const supportedFormats = new Set(["mp4", "webm", "mp3", "m4a", "best"]);
  if (!supportedFormats.has(String(format))) throw new Error("Unsupported output format.");
  if (audioOnly && !["mp3", "m4a", "best"].includes(String(format))) throw new Error("Audio-only mode requires an audio format.");

  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-url-media-"));
  try {
    const outputTemplate = path.join(jobDir, `${randomUUID()}-%(title).120s.%(ext)s`);
    const adapter = createProviderAdapter(provider, String(format), Boolean(audioOnly));
    const args = ["--max-filesize", `${maxBytes}`, "--match-filter", `duration <=? ${MAX_DURATION_SECONDS}`, "--format", adapter.formatArg, ...adapter.post, "--output", outputTemplate, "--print", "after_move:filepath", url.toString()];
    try {
      await runYtdlpWithGenericFallback(args, jobDir, controller.signal, provider);
    } catch (initialError) {
      let error = initialError;
      if (shouldTryAria2Transfer(error) && !controller.signal.aborted) {
        console.warn("[url-media] transient HTTP transfer failure; retrying once with aria2c");
        // Avoid mistaking a partial file from the first attempt for a valid result.
        const leftovers = await fs.readdir(jobDir);
        for (const name of leftovers) await fs.rm(path.join(jobDir, name), { recursive: true, force: true });
        try {
          await runYtdlp(aria2YtdlpArgs(args), jobDir, controller.signal, provider);
          error = null;
        } catch (retryError) { error = retryError; }
      }
      if (!error) {
        // The alternate transfer finished; continue to the same ffprobe checks.
      } else {
      const code = String(error?.message || "");
      if (!/^(?:SOURCE_UNAVAILABLE|UNSUPPORTED_SOURCE|PROVIDER_ERROR|NO_DOWNLOADABLE_FORMAT):/.test(code)) throw error;
      let publicDownload = null;
      try { publicDownload = await discoverExplicitAudioDownload(url, controller.signal); }
      catch (fallbackError) { if (fallbackError?.name === "AbortError") throw fallbackError; }
      if (!publicDownload && provider === "audiomack" && isAudiomackSongUrl(url.toString()) &&
          /^SOURCE_UNAVAILABLE: Audiomack returned an empty or invalid JSON response/.test(code)) {
        throw new Error("NO_DOWNLOADABLE_FORMAT: This Audiomack song may be publicly playable, but no artist-enabled standalone audio download was found and the existing extractor uses an obsolete metadata API. Owners can supply their original audio file or a direct permitted download URL.");
      }
      if (!publicDownload) throw error;
      await handleDirectDownload(req, res, publicDownload, body, controller.signal);
      return;
      }
    }
    const entries = await fs.readdir(jobDir, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isFile() || /\.(?:part|aria2|ytdl)$/i.test(entry.name)) continue;
      const file = path.join(jobDir, entry.name);
      const stat = await fs.stat(file);
      if (stat.size > maxBytes) continue;
      candidates.push({ file, stat });
    }
    if (!candidates.length) throw new Error("The provider returned no downloadable media within the configured limits.");
    candidates.sort((a,b) => b.stat.size - a.stat.size);
    const chosen = candidates[0];
    await verifyDownloadedMedia(chosen.file, maxBytes, controller.signal);
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
    try { await handleInfo(req, res); } catch (error) { const failure = errorPayload(error); const requestId = randomUUID(); console.error(`[url-media] ${failure.code} requestId=${requestId} route=/info causeType=${error instanceof Error ? error.name : "UnknownError"} diagnostic=${String(error instanceof Error ? error.message : error).replace(/https?:\/\/\S+/g, "[url]").replace(/[\r\n]+/g, " ").slice(0, 320)}`); if (!res.headersSent) json(res, errorStatus(failure.code), { ok: false, error: failure.message, ...failure, requestId }); }
    return;
  }
  if (req.method === "POST" && req.url === "/download") {
    try { await handleDownload(req, res); } catch (error) { const failure = errorPayload(error); const requestId = randomUUID(); console.error(`[url-media] ${failure.code} requestId=${requestId} route=/download causeType=${error instanceof Error ? error.name : "UnknownError"} diagnostic=${String(error instanceof Error ? error.message : error).replace(/https?:\/\/\S+/g, "[url]").replace(/[\r\n]+/g, " ").slice(0, 320)}`); if (!res.headersSent) json(res, errorStatus(failure.code), { ok: false, error: failure.message, ...failure, requestId }); }
    return;
  }
  json(res, 404, { error: "Not found." });
});

server.listen(PORT, HOST, () => console.log(`enV URL media processor listening on http://${HOST}:${PORT}`));
