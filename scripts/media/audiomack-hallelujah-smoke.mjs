/**
 * Live, non-mocked acceptance probe for a single authorized Audiomack upload.
 * Does not print/commit audio bytes. Metadata success alone is NOT pass.
 * Run via the isolated "Audiomack Hallelujah live acceptance test" workflow.
 */
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { spawnSync } from "node:child_process";

const api = (process.env.MUSIC_ACCEPTANCE_API || "").replace(/\/+$/, "");
const song = process.env.MUSIC_ACCEPTANCE_SONG || "";
if (!api.startsWith("https://") || !song.startsWith("https://audiomack.com/chas-d/song/hallelujah")) {
  throw new Error("Explicit HTTPS processor endpoint and the approved acceptance track are required.");
}

async function call(action, data, milliseconds) {
  const response = await fetch(api + "/" + action, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(milliseconds),
  });
  const mime = response.headers.get("content-type") || "";
  if (!response.ok || mime.includes("json")) {
    const json = await response.json().catch(() => null);
    const detail = json?.code ? json.code + ": " + String(json?.message || json?.error || "").slice(0, 270) : "Unexpected response";
    throw new Error(action + " returned HTTP " + response.status + " — " + detail);
  }
  return response;
}

let previewOK = false;
try {
  const response = await fetch(api + "/info", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: song, includePlaylist: false }),
    signal: AbortSignal.timeout(50000),
  });
  const info = await response.json();
  if (!response.ok) throw new Error("HTTP " + response.status + " — " + String(info?.code || "UNKNOWN") + ": " + String(info?.message || "").slice(0, 270));
  if (info.isPlaylist === true || (info.entries?.length || 0) > 0) throw new Error("A single song was misclassified as a playlist");
  if (!/hallelujah/i.test(String(info.title || ""))) throw new Error("Public song metadata has the wrong track title");
  previewOK = true;
  console.log("METADATA PASS: Single track, title=" + JSON.stringify(info.title) + ", provider=" + info.provider);
} catch (error) {
  console.error("METADATA FAIL:", String(error.message || error).slice(0, 450));
}

let audioOK = false;
const directory = await mkdtemp(path.join(tmpdir(), "env-audiomack-acceptance-"));
try {
  const response = await call("download", { url: song, audioOnly: true, format: "mp3", maxBytes: 20 * 1024 * 1024 }, 150000);
  const mime = response.headers.get("content-type") || "";
  if (/text\/html|application\/json/i.test(mime)) throw new Error("Download returned markup/JSON, not audio");
  if (!response.body) throw new Error("No audio response body");
  const filename = path.join(directory, "sample-audio");
  let size = 0;
  const guard = new Transform({
    transform(chunk, encoding, done) {
      size += chunk.length;
      done(size > 20 * 1024 * 1024 ? new Error("Audio exceeded 20 MB acceptance limit") : null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), guard, createWriteStream(filename));
  if ((await stat(filename)).size < 2048) throw new Error("Audio response is too small to be valid");
  const ff = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration,size:stream=codec_type",
    "-of", "json", filename,
  ], { encoding: "utf8", timeout: 25000 });
  if (ff.error) throw new Error("FFprobe could not start: " + String(ff.error.message || ff.error).slice(0, 180));
  if (ff.status !== 0) throw new Error("FFprobe rejected downloaded audio: " + String(ff.stderr || "").slice(0, 160));
  const probe = JSON.parse(ff.stdout);
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration < 30 || !probe.streams?.some((stream) => stream.codec_type === "audio")) {
    throw new Error("FFprobe returned no plausible playable audio stream");
  }
  audioOK = true;
  console.log("AUDIO PASS: verified bytes=" + size + ", duration_seconds=" + Math.round(duration) + ", mime=" + mime);
} catch (error) {
  console.error("AUDIO FAIL:", String(error.message || error).slice(0, 500));
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log("ACCEPTANCE SUMMARY:", JSON.stringify({ metadata: previewOK, playableAudio: audioOK }));
if (!previewOK || !audioOK) process.exitCode = 1;
