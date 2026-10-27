#!/usr/bin/env node
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFormDataBounded, RequestBodyError } from "../backend/request-body.mjs";
import { createMediaJobAdmission } from "./media/processor-admission.mjs";

const HOST = process.env.MEDIA_HOST || "0.0.0.0";
const PORT = Number(process.env.MEDIA_PORT || 8787);
const MAX_BYTES = Number(process.env.MEDIA_MAX_BYTES || 250 * 1024 * 1024);
const FFMPEG_BIN = process.env.FFMPEG_BIN || "ffmpeg";
const ALLOWED_ORIGIN = process.env.MEDIA_ALLOWED_ORIGIN || "*";
const MEDIA_ADMISSION = createMediaJobAdmission(process.env.MEDIA_MAX_CONCURRENT_JOBS ?? 1);
const MAX_LOUDNESS_REPORT_DURATION_SECONDS = 15 * 60;

const OPERATIONS = {
  "video-to-mp4": { ext: "mp4", mime: "video/mp4", args: (i, o) => ["-i", i, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", o] },
  "video-to-mp3": { ext: "mp3", mime: "audio/mpeg", args: (i, o) => ["-i", i, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", o] },
  "video-to-gif": { ext: "gif", mime: "image/gif", args: (i, o) => ["-i", i, "-vf", "fps=12,scale=720:-1:flags=lanczos", "-loop", "0", o] },
  "video-to-webm": { ext: "webm", mime: "video/webm", args: (i, o) => ["-i", i, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-c:a", "libopus", "-b:a", "128k", o] },
  "video-to-mov": { ext: "mov", mime: "video/quicktime", args: (i, o) => ["-i", i, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", o] },
  "video-to-avi": { ext: "avi", mime: "video/x-msvideo", args: (i, o) => ["-i", i, "-map", "0:v:0", "-map", "0:a?", "-c:v", "mpeg4", "-q:v", "5", "-c:a", "mp3", "-b:a", "128k", o] },
  "video-resize": { ext: "mp4", mime: "video/mp4", args: (i, o, p) => { const w=Math.max(2,Math.min(7680,Math.round(Number(p.width||1280)/2)*2)); const h=Math.max(2,Math.min(4320,Math.round(Number(p.height||720)/2)*2)); return ["-i", i, "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", o]; } },
  "video-crop": { ext: "mp4", mime: "video/mp4", args: (i, o, p) => { const w=Math.max(2,Math.round(Number(p.width||1280)/2)*2); const h=Math.max(2,Math.round(Number(p.height||720)/2)*2); const x=Math.max(0,Math.round(Number(p.x||0))); const y=Math.max(0,Math.round(Number(p.y||0))); return ["-i", i, "-vf", `crop=${w}:${h}:${x}:${y}`, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", o]; } },
  "video-rotate": { ext: "mp4", mime: "video/mp4", args: (i, o, p) => { const angle=String(p.angle||90); const vf=angle==="90"?"transpose=1":angle==="270"?"transpose=2":angle==="180"?"hflip,vflip":"null"; return ["-i", i, "-vf", vf, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", o]; } },
  "video-mute": { ext: "mp4", mime: "video/mp4", args: (i, o) => ["-i", i, "-map", "0:v:0", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", o] },
  "video-fps": { ext: "mp4", mime: "video/mp4", args: (i, o, p) => ["-i", i, "-vf", `fps=${Math.max(1,Math.min(120,Number(p.fps||30)))}`, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", o] },
  "video-bitrate": { ext: "mp4", mime: "video/mp4", args: (i, o, p) => ["-i", i, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-b:v", `${Math.max(100,Math.min(50000,Number(p.bitrate||2500)))}k`, "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", o] },
  "video-compress": { ext: "mp4", mime: "video/mp4", args: (i, o, p) => ["-i", i, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", String(clamp(Number(p.crf ?? 28), 18, 40)), "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", o] },
  "video-trim": { ext: "mp4", mime: "video/mp4", args: (i, o, p) => ["-ss", String(Math.max(0, Number(p.start ?? 0))), "-i", i, "-t", String(Math.max(0.05, Number(p.duration ?? 1))), "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", o] },
  "audio-to-mp3": { ext: "mp3", mime: "audio/mpeg", args: (i, o) => ["-i", i, "-c:a", "libmp3lame", "-b:a", "192k", o] },
  "audio-loudness-report": { ext: "json", mime: "application/json", analysis: "ebu-r128" },
  "audio-to-wav": { ext: "wav", mime: "audio/wav", args: (i, o) => ["-i", i, "-c:a", "pcm_s16le", o] },
  "audio-to-ogg": { ext: "ogg", mime: "audio/ogg", args: (i, o) => ["-i", i, "-c:a", "libopus", "-b:a", "128k", o] },
  "audio-to-flac": { ext: "flac", mime: "audio/flac", args: (i, o) => ["-i", i, "-c:a", "flac", "-compression_level", "5", o] },
  "video-resolution": { ext: "mp4", mime: "video/mp4", args: (i, o, p) => { const presets={"360p":[640,360],"480p":[854,480],"720p":[1280,720],"1080p":[1920,1080],"1440p":[2560,1440],"2160p":[3840,2160]}; const [w,h]=presets[String(p.preset||"720p")]||presets["720p"]; return ["-i",i,"-vf",`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,"-map","0:v:0","-map","0:a?","-c:v","libx264","-preset","veryfast","-crf","23","-c:a","aac","-b:a","128k","-movflags","+faststart",o]; } },
  "video-audio-volume": { ext: "mp4", mime: "video/mp4", args: (i, o, p) => { const gain=clamp(Number(p.volume ?? 100),0,500)/100; return ["-i",i,"-map","0:v:0","-map","0:a?","-c:v","copy","-af",`volume=${gain}`,"-c:a","aac","-b:a","128k","-movflags","+faststart",o]; } },
  "audio-volume": { ext: "mp3", mime: "audio/mpeg", args: (i, o, p) => { const gain=clamp(Number(p.volume ?? 100),0,500)/100; return ["-i",i,"-af",`volume=${gain}`,"-c:a","libmp3lame","-b:a","192k",o]; } },
  "audio-bitrate": { ext: "mp3", mime: "audio/mpeg", args: (i, o, p) => { const kbps=clamp(Number(p.bitrate ?? 192),32,512); return ["-i",i,"-c:a","libmp3lame","-b:a",`${kbps}k`,o]; } },
  "audio-sample-rate": { ext: "wav", mime: "audio/wav", args: (i, o, p) => { const rate=Math.round(clamp(Number(p.sampleRate ?? 44100),8000,192000)); return ["-i",i,"-ar",String(rate),"-c:a","pcm_s16le",o]; } },
  "audio-channels": { ext: "wav", mime: "audio/wav", args: (i, o, p) => { const channels=Number(p.channels)===1?"mono":"stereo"; return ["-i",i,"-ac",channels==="mono"?"1":"2","-c:a","pcm_s16le",o]; } },
  "audio-merge": { ext: "wav", mime: "audio/wav", multi: true, args: (inputs, o) => { const filters = inputs.map((_, i) => `[${i}:a]aresample=48000,aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo[a${i}]`).join(";"); const joined = inputs.map((_, i) => `[a${i}]`).join(""); return [ ...inputs.flatMap((input) => ["-i", input]), "-filter_complex", `${filters};${joined}concat=n=${inputs.length}:v=0:a=1[out]`, "-map", "[out]", "-c:a", "pcm_s16le", o ]; } },
  "video-replace-audio": { ext: "mp4", mime: "video/mp4", multi: true, args: (inputs, o) => ["-i", inputs[0], "-i", inputs[1], "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", o] },
  "video-merge": { ext: "mp4", mime: "video/mp4", multi: true, args: (inputs, o, p, meta = []) => { const width=1280,height=720; const args=[]; const filter=[]; let inputIndex=0; inputs.forEach((input,i)=>{ const hasAudio=Boolean(meta[i]?.hasAudio); const videoIndex=inputIndex; args.push("-i",input); inputIndex += 1; let audioIndex=videoIndex; if (!hasAudio) { args.push("-f","lavfi","-t",String(Math.max(0.05,Number(meta[i]?.duration||1))),"-i","anullsrc=r=48000:cl=stereo"); audioIndex=inputIndex; inputIndex += 1; } filter.push(`[${videoIndex}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`); filter.push(`[${audioIndex}:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${i}]`); }); const concatInputs=inputs.map((_,i)=>`[v${i}][a${i}]`).join(""); filter.push(`${concatInputs}concat=n=${inputs.length}:v=1:a=1[v][a]`); return [...args,"-filter_complex",filter.join(";"),"-map","[v]","-map","[a]","-c:v","libx264","-preset","veryfast","-crf","23","-c:a","aac","-b:a","128k","-movflags","+faststart",o]; } },
};

function clamp(value, min, max) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function safeName(value, fallback) {
  const base = path.basename(String(value || fallback)).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || fallback;
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": ALLOWED_ORIGIN, "access-control-allow-methods": "POST,GET,OPTIONS", "access-control-allow-headers": "content-type" });
  res.end(JSON.stringify(body));
}

function contentHeaders(mime, disposition) {
  return { "content-type": mime, "content-disposition": disposition, "access-control-allow-origin": ALLOWED_ORIGIN, "cache-control": "no-store" };
}

async function readForm(req) {
  const request = new Request(`http://${req.headers.host || "localhost"}${req.url || "/"}`, { method: req.method, headers: req.headers, body: req, duplex: "half" });
  return readFormDataBounded(request, MAX_BYTES);
}

function runFfmpeg(args, duration, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, ["-hide_banner", "-y", "-progress", "pipe:2", "-nostats", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let lastProgress = 0;
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString(); stderr += text.slice(-4000);
      const match = text.match(/out_time_ms=(\d+)/);
      if (match && duration > 0) lastProgress = Math.min(99, Number(match[1]) / 1000 / duration * 100);
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code, sig) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) return reject(new Error("Media processing cancelled."));
      if (code === 0) return resolve({ progress: 100 });
      reject(new Error(`FFmpeg failed (code ${code ?? "null"}${sig ? `, signal ${sig}` : ""}). ${stderr.trim().slice(-1000)}`));
    });
    const timer = setInterval(() => {}, 1000);
    child.on("close", () => clearInterval(timer));
  });
}

let ebur128SupportPromise;

function hasEbur128Filter() {
  if (ebur128SupportPromise) return ebur128SupportPromise;
  ebur128SupportPromise = new Promise((resolve) => {
    const child = spawn(FFMPEG_BIN, ["-hide_banner", "-filters"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, 5_000);
    timeout.unref?.();
    const append = (chunk) => {
      output = (output + chunk.toString()).slice(-512 * 1024);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0 && /\\bebur128\\b/i.test(output));
    });
  }).catch(() => false);
  return ebur128SupportPromise;
}

function runFfmpegLoudnessMeter(inputPath, duration, signal) {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner", "-nostats", "-i", inputPath,
      "-filter_complex", "[0:a:0]ebur128=peak=sample+true[measure]",
      "-map", "[measure]", "-f", "null", "-",
    ];
    const child = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const timeoutMs = Math.max(30_000, Math.min(15 * 60_000, Math.ceil(Math.max(1, duration) * 2_500) + 20_000));
    let hardKillTimer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => {
      child.kill("SIGTERM");
      hardKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
      hardKillTimer.unref?.();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      hardKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
      hardKillTimer.unref?.();
    }, timeoutMs);
    timeout.unref?.();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();

    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-128 * 1024);
    });
    child.once("error", () => finish(new Error("The configured FFmpeg processor could not start the loudness meter.")));
    child.once("close", (code) => {
      if (signal?.aborted) return finish(new Error("Loudness measurement was canceled."));
      if (timedOut) return finish(new Error("Loudness measurement exceeded the processor time budget."));
      if (code !== 0) return finish(new Error("The configured FFmpeg build could not measure this audio. The filter may be unavailable or the file may be unsupported."));
      finish(null, stderr);
    });
  });
}

function parseEbur128Number(log, section, label, unit) {
  const start = log.lastIndexOf(section);
  if (start < 0) return { sectionFound: false, value: null };
  const excerpt = log.slice(start, start + 1_600);
  const pattern = new RegExp("\\b" + label + ":\\s*([+-]?(?:\\d+(?:\\.\\d+)?|inf|nan))\\s*" + unit, "i");
  const match = excerpt.match(pattern);
  if (!match) return { sectionFound: true, value: null };
  const value = Number(match[1]);
  return { sectionFound: true, value: Number.isFinite(value) ? Number(value.toFixed(2)) : null };
}

function parseEbur128Summary(log) {
  const integrated = parseEbur128Number(log, "Integrated loudness:", "I", "LUFS");
  const range = parseEbur128Number(log, "Loudness range:", "LRA", "LU");
  const samplePeak = parseEbur128Number(log, "Sample peak:", "Peak", "dBFS");
  const truePeak = parseEbur128Number(log, "True peak:", "Peak", "dBFS");
  if (!integrated.sectionFound || !samplePeak.sectionFound || !truePeak.sectionFound) {
    throw new Error("The FFmpeg ebur128 report did not contain the required integrated loudness and peak sections.");
  }
  return {
    status: integrated.value === null ? "unavailable" : "measured",
    integrated_loudness_lufs: integrated.value,
    loudness_range_lu: range.value,
    sample_peak_dbfs: samplePeak.value,
    true_peak_dbtp: truePeak.value,
    unavailable_reason: integrated.value === null
      ? "Integrated loudness was below the meter's measurable/gated range or the input was silent."
      : range.value === null ? "The meter did not return a loudness-range value for this input." : null,
  };
}

function probeAudioStreamInfo(file) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error", "-select_streams", "a:0",
      "-show_entries", "stream=codec_name,sample_rate,channels,channel_layout,sample_fmt:format=format_name,duration",
      "-of", "json", file,
    ];
    const child = spawn(process.env.FFPROBE_BIN || "ffprobe", args, { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Audio stream inspection timed out."));
    }, 5_000);
    timeout.unref?.();
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.length > 32 * 1024) {
        child.kill("SIGKILL");
        finish(new Error("Audio stream inspection returned too much metadata."));
      }
    });
    child.once("error", () => finish(new Error("The configured ffprobe tool could not inspect the audio.")));
    child.once("close", (code) => {
      if (code !== 0) return finish(new Error("The uploaded file did not contain a supported audio stream."));
      try {
        const parsed = JSON.parse(output);
        const stream = parsed.streams?.[0];
        const format = parsed.format ?? {};
        if (!stream || !Number.isFinite(Number(stream.sample_rate)) || !Number.isFinite(Number(stream.channels)) || Number(stream.channels) < 1) {
          return finish(new Error("The uploaded file did not contain valid audio-stream metadata."));
        }
        finish(null, {
          codec_name: typeof stream.codec_name === "string" ? stream.codec_name : null,
          sample_rate_hz: Number(stream.sample_rate),
          channels: Number(stream.channels),
          channel_layout: typeof stream.channel_layout === "string" ? stream.channel_layout : null,
          sample_format: typeof stream.sample_fmt === "string" ? stream.sample_fmt : null,
          container_format: typeof format.format_name === "string" ? format.format_name : null,
          duration_seconds: Number.isFinite(Number(format.duration)) ? Number(format.duration) : null,
        });
      } catch {
        finish(new Error("The uploaded audio metadata could not be validated."));
      }
    });
  });
}

function getFfmpegVersion() {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, ["-hide_banner", "-version"], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Could not establish the FFmpeg version."));
    }, 3_000);
    timeout.unref?.();
    child.stdout.on("data", (chunk) => { output = (output + chunk.toString()).slice(0, 8_000); });
    child.once("error", () => { clearTimeout(timeout); reject(new Error("Could not establish the FFmpeg version.")); });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error("Could not establish the FFmpeg version."));
      resolve(output.split(/\\r?\\n/).find((line) => line.startsWith("ffmpeg version")) || "FFmpeg version unknown");
    });
  });
}

async function probeDuration(file) {
  return new Promise((resolve) => {
    const child = spawn(process.env.FFPROBE_BIN || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = ""; child.stdout.on("data", (c) => { out += c.toString(); });
    child.on("close", () => { const n = Number(out.trim()); resolve(Number.isFinite(n) ? n : 0); });
    child.on("error", () => resolve(0));
  });
}

async function probeHasAudio(file) {
  return new Promise((resolve) => {
    const child = spawn(process.env.FFPROBE_BIN || "ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = ""; child.stdout.on("data", (c) => { out += c.toString(); });
    child.on("close", () => resolve(out.trim() === "audio"));
    child.on("error", () => resolve(false));
  });
}

async function handleMedia(req, res) {
  const form = await readForm(req);
  const file = form.get("file");
  const files = form.getAll("files").filter((value) => value instanceof File);
  const operation = String(form.get("operation") || "");
  const rawParams = String(form.get("params") || "{}");
  const spec = OPERATIONS[operation];
  if (!spec) return json(res, 400, { error: `Unsupported media operation: ${operation}` });
  const mediaFiles = spec.multi ? files : (file instanceof File ? [file] : []);
  if (mediaFiles.length === 0) return json(res, 400, { error: spec.multi ? "At least two media files are required." : "A media file is required." });
  if (spec.multi && mediaFiles.length < 2) return json(res, 400, { error: "At least two media files are required." });
  const totalBytes = mediaFiles.reduce((sum, item) => sum + item.size, 0);
  if (mediaFiles.some((item) => item.size <= 0)) return json(res, 400, { error: "One of the uploaded media files is empty." });
  if (totalBytes > MAX_BYTES) return json(res, 413, { error: `Combined upload exceeds the ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit.` });
  let params; try { params = JSON.parse(rawParams); } catch { return json(res, 400, { error: "Invalid media parameters." }); }

  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), "env-media-"));
  const inputPaths = [];
  const sourceHashes = [];
  const names = form.getAll("fileNames").map(String);
  const controller = new AbortController();
  req.on("aborted", () => controller.abort());
  try {
    for (let index = 0; index < mediaFiles.length; index++) {
      const media = mediaFiles[index];
      const fallback = `input-${index + 1}.bin`;
      const inputPath = path.join(jobDir, safeName(media.name || names[index], fallback));
      const uploadedBytes = Buffer.from(await media.arrayBuffer());
      await fs.writeFile(inputPath, uploadedBytes);
      sourceHashes.push(spec.analysis === "ebu-r128" ? createHash("sha256").update(uploadedBytes).digest("hex") : null);
      inputPaths.push(inputPath);
    }
    const durations = spec.multi ? await Promise.all(inputPaths.map(probeDuration)) : [await probeDuration(inputPaths[0])];
    const duration = durations.reduce((a, b) => a + b, 0);
    if (spec.analysis === "ebu-r128") {
      if (!(await hasEbur128Filter())) return json(res, 503, { ok: false, error: "EBUR128_UNAVAILABLE", message: "The configured FFmpeg build does not expose the ebur128 standards meter." });
      if (mediaFiles.length !== 1) return json(res, 400, { ok: false, error: "LOUDNESS_REPORT_SINGLE_FILE_ONLY", message: "Submit one audio file per standards-based loudness measurement." });
      if (!Number.isFinite(duration) || duration <= 0) return json(res, 422, { ok: false, error: "AUDIO_DURATION_UNAVAILABLE", message: "The processor could not safely determine the audio duration." });
      if (duration > MAX_LOUDNESS_REPORT_DURATION_SECONDS) return json(res, 413, { ok: false, error: "AUDIO_DURATION_LIMIT", message: "Standards-based loudness measurement is limited to 15 minutes per request." });
      const audioInfo = await probeAudioStreamInfo(inputPaths[0]);
      const measurementLog = await runFfmpegLoudnessMeter(inputPaths[0], duration, controller.signal);
      const measurement = parseEbur128Summary(measurementLog);
      const version = await getFfmpegVersion();
      const report = {
        schema_version: "env.music-loudness-report.v1",
        generated_at: new Date().toISOString(),
        execution: { provider: "enV-configured-ffmpeg-processor", upload_consent_required_by_client: true },
        source: {
          file_name: safeName(mediaFiles[0].name || names[0], "audio"),
          file_size_bytes: mediaFiles[0].size,
          file_sha256: sourceHashes[0],
          file_sha256_verified: true,
          verification_method: "sha-256-computed-over-uploaded-original-file-bytes",
          duration_seconds: Number(duration.toFixed(3)),
          codec_name: audioInfo.codec_name,
          container_format: audioInfo.container_format,
          sample_rate_hz: audioInfo.sample_rate_hz,
          channels: audioInfo.channels,
          channel_layout: audioInfo.channel_layout,
          sample_format: audioInfo.sample_format,
        },
        measurement: {
          ...measurement,
          method: "FFmpeg ebur128 with sample+true peak modes; K-weighted and gated programme loudness measurement",
          method_id: "ffmpeg-ebur128-peak-sample-plus-true",
          standards_reference: "ITU-R BS.1770 / EBU R 128 implementation in the recorded FFmpeg build; broadcast compliance still requires reference-sequence validation of this build.",
          scope_seconds: Number(duration.toFixed(3)),
          units: { integrated_loudness: "LUFS", loudness_range: "LU", sample_peak: "dBFS", true_peak: "dBTP" },
        },
        engine: { binary_version: version, filter: "ebur128", binary_path: FFMPEG_BIN },
      };
      report.result_checksum = createHash("sha256").update(JSON.stringify(report)).digest("hex");
      res.writeHead(200, { ...contentHeaders("application/json; charset=utf-8", "inline; filename=music-loudness-report.json"), "x-content-type-options": "nosniff" });
      res.end(JSON.stringify(report));
      return;
    }
    const metadata = spec.multi ? await Promise.all(inputPaths.map(async (file, index) => ({ duration: durations[index] || 0, hasAudio: await probeHasAudio(file) }))) : [];
    const output = path.join(jobDir, `output-${randomUUID()}.${spec.ext}`);
    const args = spec.multi ? spec.args(inputPaths, output, params, metadata) : spec.args(inputPaths[0], output, params);
    await runFfmpeg(args, duration, controller.signal);
    const stat = await fs.stat(output);
    res.writeHead(200, { ...contentHeaders(spec.mime, `attachment; filename="${safeName(form.get("outputName"), `output.${spec.ext}`)}"`), "content-length": String(stat.size) });
    const data = await fs.readFile(output);
    res.end(data);
  } finally {
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": ALLOWED_ORIGIN, "access-control-allow-methods": "POST,GET,OPTIONS", "access-control-allow-headers": "content-type" }); return res.end(); }
  if (req.method === "GET" && req.url === "/health") {
    const ebur128Available = await hasEbur128Filter();
    return json(res, 200, {
      ok: true,
      service: "enV FFmpeg media processor",
      ffmpeg: FFMPEG_BIN,
      operations: Object.keys(OPERATIONS),
      capabilities: { ebur128_loudness_meter: ebur128Available },
      capacity: { activeJobs: MEDIA_ADMISSION.activeJobs, maxConcurrentJobs: MEDIA_ADMISSION.maxConcurrentJobs, scope: "per-process; use a shared queue for distributed capacity control" },
    });
  }
  if (req.method === "POST" && req.url === "/media") {
    const release = MEDIA_ADMISSION.tryEnter();
    if (!release) {
      // Refuse before parsing/buffering another large multipart body. The caller can retry.
      req.resume();
      res.setHeader("retry-after", "3");
      return json(res, 429, { error: "The media processor is at its configured concurrency limit. Retry shortly.", retryable: true, maxConcurrentJobs: MEDIA_ADMISSION.maxConcurrentJobs });
    }
    // Hold capacity until the response has flushed so another large output is not admitted
    // while this response still retains its result buffer. Release is idempotent for all exits.
    res.once("finish", release);
    res.once("close", release);
    try { await handleMedia(req, res); } catch (error) { const requestId = randomUUID(); console.error(`[media] MEDIA_PROCESSING_FAILED requestId=${requestId} causeType=${error instanceof Error ? error.name : "UnknownError"}`); if (!res.headersSent) { if (error instanceof RequestBodyError) { json(res, error.status, { ok: false, error: error.message, code: error.code, message: error.message, requestId }); } else { json(res, 500, { ok: false, error: "We couldn’t complete this media operation. Check the file format and try again.", code: "MEDIA_PROCESSING_FAILED", message: "We couldn’t complete this media operation. Check the file format and try again.", requestId }); } } }
    finally {
      if (res.writableFinished || res.destroyed || !res.headersSent) release();
      else { res.once("finish", release); res.once("close", release); }
    }
    return;
  }
  json(res, 404, { error: "Not found." });
});

server.listen(PORT, HOST, () => console.log(`enV FFmpeg media processor listening on http://${HOST}:${PORT}`));
