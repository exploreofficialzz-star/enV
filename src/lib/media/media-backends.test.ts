import assert from "node:assert/strict";
import test from "node:test";
import { createFfmpegAdapter, isFfmpegConfigured, configureFfmpegRunner, createServerMediaAdapter } from "./media-backends.ts";

test("FFmpeg adapter stays unavailable until a real runner is configured", async () => {
  configureFfmpegRunner(null);
  assert.equal(isFfmpegConfigured(), false);
  const adapter = createFfmpegAdapter();
  assert.equal(await adapter.canHandle({ id: "x", toolId: "test", operation: "ffmpeg:mp4" }), false);
});

test("FFmpeg adapter delegates to the configured runner", async () => {
  configureFfmpegRunner({
    run: async (_request, _signal, onProgress) => {
      onProgress(100);
      return new Blob(["ok"], { type: "video/webm" });
    },
  });
  const adapter = createFfmpegAdapter();
  assert.equal(await adapter.canHandle({ id: "x", toolId: "test", operation: "ffmpeg:webm" }), true);
  const result = await adapter.execute({ id: "x", toolId: "test", operation: "ffmpeg:webm", params: { input: new Blob(["input"]) } }, new AbortController().signal, () => {});
  assert.equal(result.type, "video/webm");
  configureFfmpegRunner(null);
});

test("server media adapter strips binary fields before serializing params", async () => {
  const previous = process.env.VITE_MEDIA_PROCESSOR_URL;
  process.env.VITE_MEDIA_PROCESSOR_URL = "http://127.0.0.1:9999/media";
  const previousFetch = globalThis.fetch;
  let received = "";
  globalThis.fetch = async (_input, init) => {
    received = String((init?.body as FormData).get("params"));
    return new Response(new Blob(["done"], { type: "video/mp4" }), { status: 200 });
  };
  try {
    const adapter = createServerMediaAdapter();
    assert.equal(await adapter.canHandle({ id: "x", toolId: "test", operation: "server-media:video-to-mp4" }), true);
    const result = await adapter.execute({ id: "x", toolId: "test", operation: "server-media:video-to-mp4", params: { input: new Blob(["input"]), file: new Blob(["input"]), fileName: "a.mp4", crf: 28 } }, new AbortController().signal, () => {});
    assert.equal(result.type, "video/mp4");
    const params = JSON.parse(received);
    assert.deepEqual(params, { crf: 28 });
  } finally {
    globalThis.fetch = previousFetch;
    if (previous === undefined) delete process.env.VITE_MEDIA_PROCESSOR_URL;
    else process.env.VITE_MEDIA_PROCESSOR_URL = previous;
  }
});
