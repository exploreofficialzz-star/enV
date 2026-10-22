import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readJsonObject, readFormDataBounded, RequestBodyError } from "../backend/request-body.mjs";

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

 
test("backend health endpoint reports missing required processors as unavailable", async () => {
  const source = await readFile(new URL("../server/routes/api/backend/health.get.ts", import.meta.url), "utf8");
  assert.match(source, /const ready = processors\.media && processors\.urlMedia/);
  assert.match(source, /ok: ready/);
  assert.match(source, /ready \? 200 : 503/);
});

test("production configuration consistently uses envtools.store as the canonical origin", async () => {
  const render = await readFile(new URL("../render.yaml", import.meta.url), "utf8");
  const gateway = await readFile(new URL("../processor/server.mjs", import.meta.url), "utf8");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.ok(render.includes('value: "https://envtools.store"'));
  assert.equal(render.split('value: "https://envtools.store"').length - 1, 2);
  assert.ok(gateway.includes('process.env.APPLICATION_API_ORIGIN || "https://envtools.store"'));
  assert.ok(readme.includes("BETTER_AUTH_URL"));
  assert.equal(/https:\/\/en-v\.vercel\.app/.test(render + gateway + readme), false);
});


test("bounded multipart parser accepts valid small file forms", async () => {
  const form = new FormData();
  form.set("operation", "metadata");
  form.set("file", new Blob(["fixture"], { type: "application/pdf" }), "fixture.pdf");
  const request = new Request("https://envtools.example.test/api/backend/pdf", { method: "POST", body: form });
  const parsed = await readFormDataBounded(request, 1024);
  assert.equal(parsed.get("operation"), "metadata");
  assert.equal(parsed.get("file")?.name, "fixture.pdf");
});

test("bounded multipart parser rejects oversized declared uploads", async () => {
  const req = new Request("https://envtools.example.test/api/backend/pdf", {
    method: "POST",
    headers: {
      "content-type": "multipart/form-data; boundary=enV-test",
      "content-length": "999",
    },
    body: "--enV-test--\r\n",
  });
  await assert.rejects(
    readFormDataBounded(req, 64),
    (error) => error instanceof RequestBodyError && error.status === 413 && error.code === "REQUEST_TOO_LARGE",
  );
});

test("bounded multipart parser rejects oversized streamed uploads without Content-Length", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("0123456789ABCDEFGHIJKLMNO"));
      controller.close();
    },
  });
  const req = new Request("https://envtools.example.test/api/backend/pdf", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=enV-test" },
    body: stream,
    duplex: "half",
  });
  await assert.rejects(
    readFormDataBounded(req, 12),
    (error) => error instanceof RequestBodyError && error.status === 413,
  );
});

test("file-processing routes enforce the shared multipart byte cap", async () => {
  const paths = [
    "../server/routes/api/backend/documents.post.ts",
    "../server/routes/api/backend/images.post.ts",
    "../server/routes/api/backend/screenshots.post.ts",
    "../server/routes/api/backend/ocr.post.ts",
    "../server/routes/api/backend/pdf.post.ts",
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /readFormDataBounded\([^,]+, 100 \* 1024 \* 1024\)/, path);
    assert.match(source, /RequestBodyError/, path);
  }
});
