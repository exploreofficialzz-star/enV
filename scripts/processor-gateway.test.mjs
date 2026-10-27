import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();

async function freePort() {
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForOutput(child, pattern, timeoutMs = 15000) {
  let output = "";
  const collect = (chunk) => { output += chunk.toString(); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(output)) return output;
    if (child.exitCode !== null) throw new Error(`Child exited early (code ${child.exitCode}). Output: ${output}`);
    await delay(50);
  }
  child.kill("SIGTERM");
  throw new Error(`Timed out waiting for child output. Output: ${output}`);
}

test("production gateway refuses to start without its shared secret", async () => {
  const child = spawn(process.execPath, ["processor/server.mjs"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", PROCESSOR_SHARED_SECRET: "", PROCESSOR_ALLOWED_ORIGIN: "https://en-v.vercel.app", PORT: String(await freePort()) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const [code] = await Promise.race([
    once(child, "exit"),
    delay(5000).then(() => { child.kill("SIGTERM"); throw new Error("Gateway did not reject missing production secret"); }),
  ]);
  assert.notEqual(code, 0);
  assert.match(stderr, /PROCESSOR_SHARED_SECRET must be configured in production/);
});

test("song gateway forwards only allowed jobs with its server-side key", async () => {
  const backend = http.createServer(async (req, res) => {
    assert.equal(req.headers["x-song-processor-key"], "song-backend-test-key-123456789");
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers.cookie, undefined);
    let body = ""; for await (const chunk of req) body += chunk;
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "http://localhost:8080" });
    res.end(JSON.stringify({ path: req.url, body }));
  });
  backend.listen(0, "127.0.0.1"); await once(backend, "listening");
  const port = await freePort();
  const child = spawn(process.execPath, ["processor/server.mjs"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "test", PROCESSOR_HOST: "127.0.0.1", PORT: String(port), PROCESSOR_ALLOWED_ORIGIN: "https://envtools.store", SONG_PROCESSOR_URL: `http://127.0.0.1:${backend.address().port}`, SONG_PROCESSOR_KEY: "song-backend-test-key-123456789" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForOutput(child, /enV Render API listening on/);
    const response = await fetch(`http://127.0.0.1:${port}/api/song/v1/jobs`, { method: "POST", headers: { Origin: "https://envtools.store", Authorization: "Bearer user-token", Cookie: "session=user-cookie" }, body: "audio" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://envtools.store");
    assert.deepEqual(await response.json(), { path: "/v1/jobs", body: "audio" });
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/song/v1/train`, { method: "POST" })).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/song/v1/jobs`, { method: "POST", headers: { Origin: "https://other.test" } })).status, 403);
  } finally {
    child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(5000)]);
    await new Promise((resolve) => backend.close(resolve));
  }
});

test("gateway hides upstream network details behind a stable public error", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ["processor/server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PROCESSOR_SHARED_SECRET: "gateway-test-secret",
      PROCESSOR_ALLOWED_ORIGIN: "http://127.0.0.1",
      APPLICATION_API_ORIGIN: "http://127.0.0.1:1",
      YTDLP_BIN: "/tmp/envtools-test-missing-ytdlp",
      PORT: String(port),
      PROCESSOR_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForOutput(child, /enV Render API listening on/);
    const health = await fetch("http://127.0.0.1:" + port + "/health");
    const healthBody = await health.json();
    assert.equal(health.status, 503);
    assert.equal(healthBody.ok, false);
    assert.equal(healthBody.processors["url-media"], false);

    const response = await fetch(`http://127.0.0.1:${port}/api/health-probe?private=value`);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.code, "APPLICATION_API_UNAVAILABLE");
    assert.equal(body.error, "enV could not complete this request right now. Please try again shortly.");
    assert.equal(body.message, "enV could not complete this request right now. Please try again shortly.");
    assert.ok(body.requestId);
    assert.doesNotMatch(JSON.stringify(body), /ECONNREFUSED|127\.0\.0\.1:1|fetch failed|private=value/i);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), delay(5000)]);
  }
});

test("media processor exposes a helpful safe message rather than process internals", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, ["scripts/media-processor.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      MEDIA_HOST: "127.0.0.1",
      MEDIA_PORT: String(port),
      FFMPEG_BIN: "/tmp/envtools-test-missing-ffmpeg",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForOutput(child, /enV FFmpeg media processor listening on/);
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("not a real video")], { type: "video/mp4" }), "fixture.mp4");
    form.append("operation", "video-to-mp4");
    form.append("outputName", "result.mp4");
    form.append("params", "{}");
    const response = await fetch(`http://127.0.0.1:${port}/media`, { method: "POST", body: form });
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.ok, false);
    assert.equal(body.code, "MEDIA_PROCESSING_FAILED");
    assert.equal(body.error, "We couldn’t complete this media operation. Check the file format and try again.");
    assert.equal(body.message, "We couldn’t complete this media operation. Check the file format and try again.");
    assert.ok(body.requestId);
    assert.doesNotMatch(JSON.stringify(body), /ENOENT|envtools-test-missing-ffmpeg|spawn/i);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), delay(5000)]);
  }
});
