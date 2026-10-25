import assert from "node:assert/strict";
import test from "node:test";
import type { ModelRecord } from "../../types.ts";
import { estimateCost } from "../core/usage.ts";
import { deriveCostClass, findModel, MODEL_REGISTRY, modelKey, resolvePricing, validateModelRegistry } from "./models.ts";

test("the shipped registry is internally consistent", () => {
  assert.deepEqual(validateModelRegistry(), []);
});

test("every real provider has at least one model and every capability has a real model", () => {
  for (const provider of ["moss_music", "groq", "openrouter", "gemini"] as const) assert.ok(MODEL_REGISTRY.some((m) => m.provider === provider), provider);
  for (const capability of ["STRUCTURED_TEXT", "VISION_ANALYSIS", "SPEECH_TO_TEXT", "AUDIO_UNDERSTANDING"] as const) {
    assert.ok(MODEL_REGISTRY.some((m) => m.provider !== "mock" && m.capabilities.includes(capability)), capability);
  }
});

test("cost classes follow the published price bands", () => {
  assert.equal(deriveCostClass({ inputPerMTok: 0, outputPerMTok: 0 }), "FREE");
  assert.equal(deriveCostClass({ inputPerMTok: 0.075, outputPerMTok: 0.3 }), "LOW");
  assert.equal(deriveCostClass({ inputPerMTok: 0.75, outputPerMTok: 3.75 }), "STANDARD");
  assert.equal(deriveCostClass({ inputPerMTok: 5, outputPerMTok: 25 }), "PREMIUM");
  assert.equal(deriveCostClass({ perAudioHour: 0.04 }), "LOW");
  assert.equal(deriveCostClass({ perComputeHour: 2.0988 }), "STANDARD");
  assert.equal(deriveCostClass(null), null);
});

test("dated price changes switch on the effective date", () => {
  const gemini = findModel("gemini", "gemini-3.8-flash")!;
  assert.equal(resolvePricing(gemini, Date.parse("2026-12-31T23:59:59Z"))?.inputPerMTok, 0.75);
  assert.equal(resolvePricing(gemini, Date.parse("2027-01-01T00:00:00Z"))?.inputPerMTok, 1.5);
  assert.equal(deriveCostClass(gemini.pricingAfter ?? null), "STANDARD");
});

test("MOSS-Music compute price is registered as STANDARD and its estimate is explicitly based on measured inference time", () => {
  const moss = findModel("moss_music", "MOSS-Music-8B-Instruct")!;
  assert.equal(moss.costClass, "STANDARD");
  assert.equal(moss.pricing?.perComputeHour, 2.0988);
  assert.equal(moss.sensitiveOk, true);
  assert.equal(moss.maxAudioBytes, 2_800_000);
  assert.ok(!moss.capabilities.includes("STRUCTURED_TEXT"), "the audio model must not advertise text generation");
  assert.equal(moss.structuredOutput, "json-schema");
  const cost = estimateCost(moss, { inputTokens: null, outputTokens: null, totalTokens: null, audioSeconds: null, computeSeconds: 6.25 }, Date.parse("2026-10-25T12:00:00Z"));
  assert.equal(cost.usd, 0.003644);
  assert.equal(cost.basis, "estimated");
});

test("free-tier and unverified-privacy routes are not allowed for sensitive tasks by default", () => {
  assert.equal(findModel("openrouter", "openai/gpt-oss-20b:free")!.sensitiveOk, false);
  assert.equal(findModel("gemini", "gemini-3.8-flash")!.sensitiveOk, false);
  assert.equal(findModel("groq", "openai/gpt-oss-20b")!.sensitiveOk, true);
});

test("the validator catches inconsistent rows", () => {
  const base = MODEL_REGISTRY.find((m) => m.modelId === "openai/gpt-oss-20b" && m.provider === "groq")!;
  const broken = (patch: Partial<ModelRecord>) => validateModelRegistry([{ ...base, ...patch }]);
  assert.ok(broken({ free: true }).some((p) => p.includes("free model must have costClass FREE")));
  assert.ok(broken({ costClass: "PREMIUM" }).some((p) => p.includes("does not match pricing")));
  assert.ok(broken({ pricing: null }).some((p) => p.includes("needs pricing")));
  assert.ok(broken({ structuredOutput: "none" }).some((p) => p.includes("requires a structured-output mode")));
  assert.ok(broken({ capabilities: ["SPEECH_TO_TEXT"] }).some((p) => p.includes("audio")));
  assert.ok(broken({ notes: "" }).some((p) => p.includes("notes")));
  assert.ok(broken({ pricingUntil: "2027-01-01" }).some((p) => p.includes("pricingAfter")));
  assert.ok(validateModelRegistry([base, base]).some((p) => p.includes("duplicate")));
  assert.equal(modelKey(base), "groq:openai/gpt-oss-20b");
});
