import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canSpendTokensOffline, classifyOfflineToolRecord, OFFLINE_CAPABILITY_POLICY_VERSION } from "../../src/lib/offline/policy.mjs";

function tool(overrides = {}) {
  return {
    id: "test-tool",
    category: "developer",
    clientSide: true,
    requiresBackend: false,
    requiresAuth: false,
    status: "active",
    engine: { type: "text", op: "format" },
    ...overrides,
  };
}

test("all audited local engine families are eligible, not only calculators", () => {
  for (const type of [
    "calculator", "converter", "datetime", "text", "codec", "color", "qr", "barcode",
    "generator", "image", "cssgen", "mockup", "post", "device", "seo", "file-converter",
    "developer", "pdf", "mime", "security", "creator", "business", "audio", "network",
    "ai", "video", "document",
  ]) {
    const result = classifyOfflineToolRecord(tool({ engine: { type, op: "local-operation" } }));
    assert.equal(result.execution, "device-local", type);
    assert.equal(result.mayRunWithoutNetwork, true, type);
    assert.equal(result.tokenPolicy, "monetization-pending", type);
  }
});


test("remote music downloading remains online-only", () => {
  const result = classifyOfflineToolRecord(tool({
    id: "music-downloader",
    category: "audio",
    engine: { type: "custom", id: "music-downloader" },
  }));
  assert.notEqual(result.execution, "device-local");
  assert.equal(result.mayRunWithoutNetwork, false);
});

test("local custom tool categories are eligible while unknown custom engines fail closed", () => {
  for (const category of ["accessibility", "business", "communication", "ecommerce", "events", "marketing", "personal", "productivity", "social", "travel", "webdesign"]) {
    const result = classifyOfflineToolRecord(tool({ category, engine: { type: "custom", id: "local-workflow" } }));
    assert.equal(result.execution, "device-local", category);
  }
  const unknown = classifyOfflineToolRecord(tool({ category: "unknown", engine: { type: "custom", id: "unknown" } }));
  assert.equal(unknown.execution, "not-verified");
  assert.equal(unknown.mayRunWithoutNetwork, false);
});

test("hybrid document engine allows its implemented local operations only", () => {
  const local = classifyOfflineToolRecord(tool({
    id: "pdf-merger", category: "pdf", clientSide: false, requiresBackend: true,
    engine: { type: "document-backend", op: "pdf-merger" },
  }));
  assert.equal(local.execution, "device-local");
  const remote = classifyOfflineToolRecord(tool({
    id: "docx-comparison-tool", category: "pdf", clientSide: false, requiresBackend: true,
    engine: { type: "document-backend", op: "docx-comparison-tool" },
  }));
  assert.equal(remote.execution, "online-required");
});

test("server-backed operations stay online even when the shared engine supports local operations", () => {
  for (const [id, engine, op] of [
    ["audio-to-mp3-server", "audio", "server-mp3"],
    ["audio-merger", "audio", "server-merge"],
    ["video-merger", "video", "video-merge"],
    ["video-to-mp4", "video", "video-to-mp4"],
    ["audio-to-text", "custom", "transcription"],
  ]) {
    const result = classifyOfflineToolRecord(tool({ id, engine: { type: engine, op } }));
    assert.equal(result.execution, "online-required", id);
    assert.equal(result.mayRunWithoutNetwork, false, id);
  }
});

test("backend, auth, remote URL and planned tools are never classified as local", () => {
  for (const overrides of [
    { requiresBackend: true },
    { requiresAuth: true },
    { clientSide: false },
    { engine: { type: "url-media", provider: "youtube" } },
    { engine: { type: "url-media-info", provider: "youtube" } },
    { status: "planned" },
  ]) {
    const result = classifyOfflineToolRecord(tool(overrides));
    assert.notEqual(result.execution, "device-local");
    assert.equal(result.mayRunWithoutNetwork, false);
  }
});

test("local tools are available before billing is wired, but offline token spending stays disabled", () => {
  assert.equal(canSpendTokensOffline(), false);
  assert.equal(OFFLINE_CAPABILITY_POLICY_VERSION, "2026-11-04.v3");
});

test("local capability catalog includes runtime-only tools without billing profiles", () => {
  const capabilities = JSON.parse(readFileSync(new URL("../../src/data/offline-local-capabilities.json", import.meta.url), "utf8"));
  assert.equal(capabilities.toolCount, capabilities.profiles.length);
  const zip = capabilities.profiles.find((profile) => profile.toolId === "zip-any-file");
  assert.ok(zip, "Zip any file must be included even without a billing profile");
  assert.equal(zip.billingKey, null);
  assert.equal(zip.subunitsPerUnit, null);
  assert.deepEqual(new Set(zip.platforms), new Set(["web", "android", "ios"]));
  assert.equal(capabilities.platformCounts.android, capabilities.profiles.filter((profile) => profile.platforms.includes("android")).length);
  assert.equal(capabilities.platformCounts.ios, capabilities.profiles.filter((profile) => profile.platforms.includes("ios")).length);
  assert.equal(capabilities.platformCounts.web, capabilities.profiles.filter((profile) => profile.platforms.includes("web")).length);
});

test("remote media downloads are not advertised as device-local capabilities", () => {
  const capabilities = JSON.parse(readFileSync(new URL("../../src/data/offline-local-capabilities.json", import.meta.url), "utf8"));
  assert.equal(capabilities.profiles.some((profile) => profile.toolId === "music-downloader"), false);
});
