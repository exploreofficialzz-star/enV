#!/usr/bin/env node
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const HOST = process.env.TRANSCRIBE_HOST || "0.0.0.0";
const PORT = Number(process.env.TRANSCRIBE_PORT || 8788);
const MAX_BYTES = Number(process.env.TRANSCRIBE_MAX_BYTES || 250 * 1024 * 1024);
const TRANSCRIBE_ENGINE = process.env.TRANSCRIBE_ENGINE || "whisper-cli";
const WHISPER_BIN = process.env.WHISPER_BIN || "whisper-cli";
const WHISPER_MODEL = process.env.WHISPER_MODEL || "";
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const FASTER_WHISPER_MODEL = process.env.FASTER_WHISPER_MODEL || "small";
const FASTER_WHISPER_RUNNER = process.env.FASTER_WHISPER_RUNNER || path.resolve(process.cwd(), "scripts/faster-whisper-runner.py");
const ALLOWED_ORIGIN = process.env.TRANSCRIBE_ALLOWED_ORIGIN || "*";

function safeName(value, fallback) {
  const base = path.basename(String(value || fallback)).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || fallback;
}
function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": ALLOWED_ORIGIN, "access-control-allow-methods": "POST,GET,OPTIONS", "access-control-allow-headers": "content-type" });
  res.end(JSON.stringify(body));
}
function headers(mime, disposition) {
  return { "content-type": mime, "content-disposition": disposition, "access-control-allow-origin": ALLOWED_ORIGIN, "cache-control": "no-store" };
}
async function readForm(req) {
  const request = new Request(`http://${req.headers.host || "localhost"}${req.url || "/"}`, { method: req.method, headers: req.headers, body: req, duplex: "half" });
  return request.formData();
}
async function commandAvailable() {
  if (TRANSCRIBE_ENGINE === "faster-whisper") return pythonAvailable();
  return new Promise((resolve) => {
    const child = spawn(WHISPER_BIN, ["--help"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0 || code === 1));
  });
}

function pythonAvailable() {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, ["-c", "import faster_whisper"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function runWhisper(args, signal, executable = WHISPER_BIN) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => { stdout += chunk.toString().slice(-4000); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString().slice(-8000); });
    child.on("error", (error) => reject(error));
    child.on("close", (code, sig) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) return reject(new Error("Transcription cancelled."));
      if (code !== 0) return reject(new Error(`Whisper failed (code ${code ?? "null"}${sig ? `, signal ${sig}` : ""}). ${stderr.trim().slice(-1600)}`));
      resolve({ stdout, stderr });
    });
  });
}
function srtToVtt(srt) {
  return `WEBVTT\n\n${srt.replace(/^\s*\d+\s*$/gm, "").replace(/,/g, ".").trim()}\n`;
}
async function handleTranscription(req, res) {
  if (TRANSCRIBE_ENGINE !== "faster-whisper" && !WHISPER_MODEL) return json(res, 503, { error: "Transcription model is not configured. Set WHISPER_MODEL on the transcription service." });
  if (!(await commandAvailable())) return json(res, 503, { error: `Whisper executable '${WHISPER_BIN}' is not available.` });
  const form = await readForm(req);
  const file = form.get("file");
  if (!(file instanceof File)) return json(res, 400, { error: "An audio or video file is required." });
  if (file.size <= 0) return json(res, 400, { error: "The uploaded media file is empty." });
  if (file.size > MAX_BYTES) return json(res, 413, { error: `Upload exceeds the ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit.` });

  const format = String(form.get("format") || "txt").toLowerCase();
  if (!["txt", "srt", "vtt"].includes(format)) return json(res, 400, { error: "format must be txt, srt, or vtt." });
  const language = String(form.get("language") || "auto").trim() || "auto";
  const translate = String(form.get("translate") || "false") === "true";
  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-transcribe-"));
  const inputPath = path.join(jobDir, safeName(file.name, `input-${randomUUID()}.bin`));
  const outputBase = path.join(jobDir, "transcript");
  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
  try {
    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    if (TRANSCRIBE_ENGINE === "faster-whisper") {
      const args = [FASTER_WHISPER_RUNNER, "--model", FASTER_WHISPER_MODEL, "--input", inputPath, "--output", outputBase, "--language", language];
      if (translate) args.push("--translate");
      await runWhisper(["-u", ...args], controller.signal, PYTHON_BIN);
    } else {
      const args = ["-m", WHISPER_MODEL, "-f", inputPath, "-l", language, "-otxt", "-osrt", "-of", outputBase, "-nt"];
      if (translate) args.push("-tr");
      await runWhisper(args, controller.signal);
    }
    const txt = await fs.readFile(`${outputBase}.txt`, "utf8");
    const srt = await fs.readFile(`${outputBase}.srt`, "utf8");
    let body; let mime; let ext;
    if (format === "srt") { body = srt; mime = "application/x-subrip"; ext = "srt"; }
    else if (format === "vtt") { body = srtToVtt(srt); mime = "text/vtt; charset=utf-8"; ext = "vtt"; }
    else { body = txt; mime = "text/plain; charset=utf-8"; ext = "txt"; }
    const outputName = safeName(form.get("outputName"), `transcript.${ext}`);
    const buffer = Buffer.from(body, "utf8");
    res.writeHead(200, { ...headers(mime, `attachment; filename="${outputName}"`), "content-length": String(buffer.length) });
    res.end(buffer);
  } finally {
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": ALLOWED_ORIGIN, "access-control-allow-methods": "POST,GET,OPTIONS", "access-control-allow-headers": "content-type" }); return res.end(); }
  if (req.method === "GET" && req.url === "/health") {
    const available = await commandAvailable();
    return json(res, 200, { ok: available && (TRANSCRIBE_ENGINE === "faster-whisper" || Boolean(WHISPER_MODEL)), service: "enV transcription processor", engine: TRANSCRIBE_ENGINE, whisper: WHISPER_BIN, executableAvailable: available, modelConfigured: TRANSCRIBE_ENGINE === "faster-whisper" ? Boolean(FASTER_WHISPER_MODEL) : Boolean(WHISPER_MODEL), formats: ["txt", "srt", "vtt"] });
  }
  if (req.method === "POST" && req.url === "/transcribe") {
    try { await handleTranscription(req, res); } catch (error) { console.error(error); if (!res.headersSent) json(res, 500, { error: error instanceof Error ? error.message : "Transcription failed." }); }
    return;
  }
  json(res, 404, { error: "Not found." });
});
server.listen(PORT, HOST, () => console.log(`enV transcription processor listening on http://${HOST}:${PORT}`));
