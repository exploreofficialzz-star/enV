import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedBytes, readBoundedJsonObject } from "./bounded-json.server.ts";

function jsonRequest(body: BodyInit, headers: HeadersInit = { "content-type": "application/json" }): Request {
  return new Request("https://env.invalid/api/test", { method: "POST", headers, body });
}

test("reads a small JSON object when Content-Length is absent", async () => {
  const request = jsonRequest(JSON.stringify({ action: "sync", count: 2 }));
  assert.equal(request.headers.has("content-length"), false);
  assert.deepEqual(await readBoundedJsonObject(request, 100), { action: "sync", count: 2 });
});

test("rejects a declared oversized body before consuming it", async () => {
  const request = jsonRequest("{}", { "content-type": "application/json", "content-length": "4097" });
  assert.equal(await readBoundedJsonObject(request, 4096), null);
});

test("cancels a streamed body that exceeds the limit even without Content-Length", async () => {
  let cancelled = false;
  let pushed = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pushed += 1;
      controller.enqueue(new Uint8Array(4_096).fill(65));
      if (pushed > 4) controller.close();
    },
    cancel() { cancelled = true; },
  });
  const requestInit = {
    method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half",
  };
  const request = new Request("https://env.invalid/api/test", requestInit as RequestInit);
  assert.equal(request.headers.has("content-length"), false);
  assert.equal(await readBoundedJsonObject(request, 8_192), null);
  assert.equal(cancelled, true);
  assert.ok(pushed <= 3, "Reader should stop pulling after the first over-limit chunk.");
});

test("byte reader enforces the limit against multibyte UTF-8 without Content-Length", async () => {
  const request = jsonRequest("€€");
  assert.equal(request.headers.has("content-length"), false);
  assert.equal(await readBoundedBytes(request, 5), null, "two euro signs occupy six UTF-8 bytes");
});

test("byte reader accepts the exact byte limit and preserves original payload bytes", async () => {
  const body = JSON.stringify({ ok: "yes" });
  const bytes = new TextEncoder().encode(body);
  const request = jsonRequest(body);
  const result = await readBoundedBytes(request, bytes.byteLength);
  assert.ok(result);
  assert.deepEqual(result, bytes);
});

test("rejects arrays, malformed JSON, invalid UTF-8, and other content types", async () => {
  assert.equal(await readBoundedJsonObject(jsonRequest("[1,2,3]")), null);
  assert.equal(await readBoundedJsonObject(jsonRequest("{")), null);
  const invalidUtf8 = new Uint8Array([0xff, 0xfe]);
  assert.equal(await readBoundedJsonObject(jsonRequest(invalidUtf8)), null);
  assert.equal(await readBoundedJsonObject(jsonRequest("{}", { "content-type": "text/plain" })), null);
});
