#!/usr/bin/env node
/**
 * Opt-in live smoke check for a public Audiomack track supplied by the owner.
 * Never commits, uploads, caches, or saves downloaded audio. The file exists
 * only in the ephemeral CI process for response validation.
 */
const TRACK_URL = "https://audiomack.com/chas-d/song/hallelujah?share-user-id=118614535";
const API = String(process.env.ENV_MUSIC_SMOKE_API || "https://env-q3mq.onrender.com").replace(/\/+$/, "");
const ROOT = API + "/api/backend/url-media";
const MAX_BYTES = 50 * 1024 * 1024;
async function request(route, payload, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(ROOT + route, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload), signal: controller.signal,
    });
    const mime = String(response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok) {
      const message = (await response.text()).slice(0, 1800);
      throw new Error(route + " returned HTTP " + response.status + " " + message);
    }
    return { response, mime };
  } finally { clearTimeout(timeout); }
}
function audioMagic(buffer) {
  if (buffer.length < 16) return false;
  if (buffer.subarray(0, 3).toString() === "ID3") return true;
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;
  if (buffer.subarray(4, 8).toString() === "ftyp") return true;
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WAVE") return true;
  if (buffer.subarray(0, 4).toString() === "OggS") return true;
  if (buffer.subarray(0, 4).toString("hex") === "1a45dfa3") return true;
  if (buffer.subarray(0, 4).toString() === "fLaC") return true;
  return false;
}
async function main() {
  console.log("Audiomack single-song live acceptance test");
  const meta = await request("/info", { url: TRACK_URL, includePlaylist: false }, 60000);
  const info = await meta.response.json();
  if (info.provider !== "audiomack" || info.isPlaylist !== false || !/hallelujah/i.test(info.title || "")) {
    throw new Error("Single-song metadata contract failed: " + JSON.stringify({
      provider: info.provider, isPlaylist: info.isPlaylist, title: info.title,
    }));
  }
  console.log("Metadata PASS: " + JSON.stringify({ title: info.title, provider: info.provider, isPlaylist: info.isPlaylist }));
  const download = await request("/download", {
    url: TRACK_URL, audioOnly: true, format: "mp3", maxBytes: MAX_BYTES,
  }, 120000);
  if (!/^(?:audio\/|application\/octet-stream)/.test(download.mime)) {
    throw new Error("Download returned non-audio MIME: " + download.mime);
  }
  const chunks = [];
  let count = 0;
  const reader = download.response.body?.getReader();
  if (!reader) throw new Error("Download had no response body");
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    if (!part.value) continue;
    count += part.value.length;
    if (count > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Download exceeded 50 MB cap");
    }
    chunks.push(Buffer.from(part.value));
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length < 4096 || !audioMagic(bytes)) {
    throw new Error("Response was not a recognizable nonempty audio file");
  }
  console.log("Download PASS: verified audio magic, " + bytes.length + " bytes, MIME " + download.mime);
}
main().catch(error => {
  console.error("Live acceptance FAILED: " + String(error?.message || error));
  process.exitCode = 1;
});
