import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseGeneratedCatalog } from "../../../scripts/catalog-reader.mjs";
import { AI_LIMITS, AI_TASK_IDS } from "./contracts.ts";
import { AI_FEATURES, buildFeatureInput, defaultValuesFor, getAiFeature, validateFeatureValues } from "./features.ts";
import type { FileValue } from "./features.ts";

const catalog = parseGeneratedCatalog(readFileSync(new URL("../../data/catalog.ts", import.meta.url), "utf8")) as { id: string; status: string; category: string; clientSide?: boolean }[];

test("every AI feature is bound to a real, active catalog tool and a real task", () => {
  const seen = new Set<string>();
  for (const feature of AI_FEATURES) {
    const tool = catalog.find((t) => t.id === feature.toolId);
    assert.ok(tool, `${feature.toolId} is not in the catalog`);
    assert.equal(tool.status, "active", `${feature.toolId} must be active (planned tools show Coming Soon, not AI)`);
    assert.ok((AI_TASK_IDS as readonly string[]).includes(feature.taskId), feature.taskId);
    assert.ok(!seen.has(feature.toolId), `duplicate binding for ${feature.toolId}`);
    seen.add(feature.toolId);
    assert.ok(feature.fields.length > 0 && feature.actionLabel.length > 0 && feature.description.length > 20);
    assert.equal(getAiFeature(feature.toolId), feature);
  }
  assert.equal(getAiFeature("not-a-tool"), undefined);
});

test("AI is the exception, not the rule: only a small share of the catalog gets an AI panel", () => {
  const active = catalog.filter((t) => t.status === "active").length;
  assert.ok(AI_FEATURES.length / active < 0.05, `${AI_FEATURES.length} of ${active} tools`);
});

test("privacy: every feature that sends files or free-form data requires explicit consent", () => {
  for (const feature of AI_FEATURES) {
    const sendsFile = feature.fields.some((f) => f.kind === "image" || f.kind === "audio");
    if (sendsFile || feature.taskId === "developer.json.explain") {
      assert.equal(feature.requiresConsent, true, feature.taskId);
      assert.ok(feature.consentLabel, feature.taskId);
    }
  }
});

test("form limits never exceed what the server accepts", () => {
  const limits: Record<string, number> = { topic: AI_LIMITS.topicMax, pattern: AI_LIMITS.regexMax, sampleText: AI_LIMITS.regexSampleMax, sql: AI_LIMITS.sqlMax, json: AI_LIMITS.jsonMax, context: AI_LIMITS.contextMax };
  for (const feature of AI_FEATURES) for (const field of feature.fields) if (field.maxLength !== undefined && limits[field.name] !== undefined) assert.ok(field.maxLength <= limits[field.name]!, `${feature.taskId}.${field.name}`);
});

test("form values are validated and turned into the server's input shape", () => {
  const feature = getAiFeature("instagram-caption-generator")!;
  const values = { ...defaultValuesFor(feature), topic: "  grand opening  " };
  assert.equal(validateFeatureValues(feature, values), null);
  assert.deepEqual(buildFeatureInput(feature, values), { platform: "instagram", topic: "grand opening", tone: "friendly", language: "en", variants: 3, includeHashtags: true });
  assert.match(validateFeatureValues(feature, { ...values, topic: "   " })!, /required/);
  assert.match(validateFeatureValues(feature, { ...values, topic: "x".repeat(AI_LIMITS.topicMax + 1) })!, /too long/);
  assert.match(validateFeatureValues(feature, { ...values, variants: 99 })!, /between/);
  assert.equal(buildFeatureInput(feature, { ...values, variants: "" }).variants, undefined);
});

test("regex input keeps whitespace exactly as typed", () => {
  const feature = getAiFeature("regex-tester")!;
  const input = buildFeatureInput(feature, { pattern: " a b ", flags: "", sampleText: "" });
  assert.equal(input.pattern, " a b ");
  assert.equal(input.flags, undefined);
  assert.equal(input.sampleText, undefined);
});

test("file fields map to the media task input and require a prepared file", () => {
  const image = getAiFeature("alt-text-generator")!;
  assert.match(validateFeatureValues(image, { style: "concise" })!, /Choose a file/);
  const file: FileValue = { base64: "QUJD", mimeType: "image/jpeg", bytes: 3, filename: "a.jpg" };
  assert.equal(validateFeatureValues(image, { image: file }), null);
  assert.deepEqual(buildFeatureInput(image, { image: file, context: "hero banner", style: "concise", language: "en" }), { imageBase64: "QUJD", mimeType: "image/jpeg", context: "hero banner", style: "concise", language: "en" });
  const audio = getAiFeature("video-audio-extractor")!;
  const clip: FileValue = { base64: "SUQz", mimeType: "audio/mpeg", bytes: 3, filename: "clip.mp3" };
  assert.deepEqual(buildFeatureInput(audio, { audio: clip, language: "fr" }), { audioBase64: "SUQz", mimeType: "audio/mpeg", filename: "clip.mp3", language: "fr" });
});
