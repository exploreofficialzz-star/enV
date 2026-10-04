import assert from "node:assert/strict";
import test from "node:test";
import type { ModelRecord } from "../../types.ts";
import { deriveCostClass, findModel, MODEL_REGISTRY, modelKey, resolvePricing, validateModelRegistry } from "./models.ts";

test("the shipped registry is internally consistent", () => {
  assert.deepEqual(validateModelRegistry(), []);
});

test("every real provider has at least one model and every capability has a real model", () => {
  for (const provider of ["groq", "openrouter", "gemini"] as const) assert.ok(MODEL_REGISTRY.some((m) => m.provider === provider), provider);
  for (const capability of ["STRUCTURED_TEXT", "VISION_ANALYSIS", "SPEECH_TO_TEXT"] as const) {
    assert.ok(MODEL_REGISTRY.some((m) => m.provider !== "mock" && m.capabilities.includes(capability)), capability);
  }
});

test("cost classes follow the published price bands", () => {
  assert.equal(deriveCostClass({ inputPerMTok: 0, outputPerMTok: 0 }), "FREE");
  assert.equal(deriveCostClass({ inputPerMTok: 0.075, outputPerMTok: 0.3 }), "LOW");
  assert.equal(deriveCostClass({ inputPerMTok: 0.75, outputPerMTok: 3.75 }), "STANDARD");
  assert.equal(deriveCostClass({ inputPerMTok: 5, outputPerMTok: 25 }), "PREMIUM");
  assert.equal(deriveCostClass({ perAudioHour: 0.04 }), "LOW");
  assert.equal(deriveCostClass(null), null);
});

test("dated price changes switch on the effective date", () => {
  const gemini = findModel("gemini", "gemini-3.8-flash")!;
  assert.equal(resolvePricing(gemini, Date.parse("2026-12-31T23:59:59Z"))?.inputPerMTok, 0.75);
  assert.equal(resolvePricing(gemini, Date.parse("2027-01-01T00:00:00Z"))?.inputPerMTok, 1.5);
  assert.equal(deriveCostClass(gemini.pricingAfter ?? null), "STANDARD");
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
  assert.ok(broken({ structuredOutput: "none" }).some((p) => p.includes("disagree")));
  assert.ok(broken({ capabilities: ["SPEECH_TO_TEXT"] }).some((p) => p.includes("audio")));
  assert.ok(broken({ notes: "" }).some((p) => p.includes("notes")));
  assert.ok(broken({ pricingUntil: "2027-01-01" }).some((p) => p.includes("pricingAfter")));
  assert.ok(validateModelRegistry([base, base]).some((p) => p.includes("duplicate")));
  assert.equal(modelKey(base), "groq:openai/gpt-oss-20b");
});
