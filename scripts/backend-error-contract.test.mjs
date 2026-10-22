import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readJsonObject, RequestBodyError } from "../backend/request-body.mjs";

function request(body, headers = { "content-type": "application/json" }) {
  return new Request("https://envtools.example.test/api/backend/tool", {
    method: "POST",
    headers,
    body,
  });
}

test("bounded JSON reader accepts an ordinary tool request", async () => {
  const result = await readJsonObject(request(JSON.stringify({ toolId: "example", category: "social", options: {} })));
  assert.deepEqual(result, { toolId: "example", category: "social", options: {} });
});

test("bounded JSON reader rejects invalid content types with a useful 415", async () => {
  await assert.rejects(
    readJsonObject(request("{}", { "content-type": "text/plain" })),
    (error) => error instanceof RequestBodyError && error.status === 415 && error.code === "UNSUPPORTED_MEDIA_TYPE",
  );
});

test("bounded JSON reader rejects oversized declared bodies before parsing", async () => {
  await assert.rejects(
    readJsonObject(request("{}", { "content-type": "application/json", "content-length": "999" }), 64),
    (error) => error instanceof RequestBodyError && error.status === 413 && error.code === "REQUEST_TOO_LARGE",
  );
});

test("bounded JSON reader caps streaming bodies without a content-length header", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"input":"this payload exceeds the cap"}'));
      controller.close();
    },
  });
  const req = new Request("https://envtools.example.test/api/backend/tool", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  });
  await assert.rejects(
    readJsonObject(req, 12),
    (error) => error instanceof RequestBodyError && error.status === 413,
  );
});

test("bounded JSON reader rejects invalid JSON and non-object JSON", async () => {
  await assert.rejects(readJsonObject(request("{")), (error) => error.code === "INVALID_JSON" && error.status === 400);
  await assert.rejects(readJsonObject(request("[]")), (error) => error.code === "JSON_OBJECT_REQUIRED" && error.status === 400);
});

test("backend tool route uses bounded request parsing and sanitized internal failures", async () => {
  const source = await readFile(new URL("../server/routes/api/backend/tool.post.ts", import.meta.url), "utf8");
  assert.match(source, /readJsonObject\(e\.req, 128 \* 1024\)/);
  assert.match(source, /TOOL_EXECUTION_FAILED/);
  assert.match(source, /reference ID:/);
  assert.match(source, /causeType/);
  assert.doesNotMatch(source, /err instanceof Error\s*\?\s*err\.message/);
});

test("gateway and media processor fail safely and report actual readiness", async () => {
  const gateway = await readFile(new URL("../processor/server.mjs", import.meta.url), "utf8");
  const media = await readFile(new URL("./media-processor.mjs", import.meta.url), "utf8");
  assert.match(gateway, /PROCESSOR_SHARED_SECRET must be configured in production/);
  assert.match(gateway, /PROCESSOR_ALLOWED_ORIGIN must be an explicit production origin/);
  assert.match(gateway, /servicesReady \? 200 : 503/);
  assert.match(gateway, /await childServiceReadiness\(\)/);
  assert.match(gateway, /APPLICATION_API_UNAVAILABLE/);
  assert.equal(gateway.includes("Application API unavailable:"), false);
  assert.match(media, /MEDIA_PROCESSING_FAILED/);
  assert.doesNotMatch(media, /json\(res, 500, \{ error: error instanceof Error \? error\.message/);
});
