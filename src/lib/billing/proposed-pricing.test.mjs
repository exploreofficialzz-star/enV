import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveLocalToolPriceProfile,
  proposedProviderPriceUsdMicros,
  proposedSubunitsFromProviderCostUsdMicros,
  TOOL_PRICE_PROPOSAL_VERSION,
} from "./proposed-pricing.mjs";

const tool = (overrides = {}) => ({
  id: "ordinary-calculator",
  name: "Ordinary Calculator",
  description: "Calculate a straightforward numeric result.",
  category: "calculators",
  engine: { type: "calculator" },
  tags: [],
  keywords: [],
  ...overrides,
});

test("the pricing proposal has an explicit version", () => {
  assert.equal(TOOL_PRICE_PROPOSAL_VERSION, "env-per-tool-rate-proposal-2026-11-25-v1");
});

test("simple calculations use the lightweight calculation unit", () => {
  const price = deriveLocalToolPriceProfile(tool(), "local.calculator", "local-device");
  assert.equal(price?.unitLabel, "calculation");
  assert.equal(price?.subunitsPerUnit, 100);
  assert.equal(price?.usdMicrosPerUnit, 1_000);
});

test("business and engineering calculators are priced by their operation complexity", () => {
  const business = deriveLocalToolPriceProfile(tool({ id: "compound-interest-calculator", name: "Compound Interest Calculator" }), "local.calculator", "local-device");
  const engineering = deriveLocalToolPriceProfile(tool({ id: "matrix-calculator", name: "Matrix Calculator" }), "local.calculator", "local-device");
  assert.equal(business?.subunitsPerUnit, 175);
  assert.equal(engineering?.subunitsPerUnit, 250);
  assert.ok(engineering.subunitsPerUnit > business.subunitsPerUnit);
});

test("image prices scale by image workload and intensive operations", () => {
  const basic = deriveLocalToolPriceProfile(tool({ id: "image-resizer", name: "Image Resizer", category: "image" }), "local.image_basic", "local-device");
  const heavy = deriveLocalToolPriceProfile(tool({ id: "image-upscaler", name: "Image Upscaler", category: "image" }), "local.image_intensive", "local-device");
  assert.equal(basic?.unitLabel, "megapixel-operation");
  assert.equal(basic?.subunitsPerUnit, 250);
  assert.equal(heavy?.subunitsPerUnit, 800);
});

test("audio and video processing use duration-sensitive units", () => {
  const audio = deriveLocalToolPriceProfile(tool({ id: "audio-denoiser", name: "Audio Noise Removal", category: "audio", engine: { type: "audio" } }), "local.audio_processing", "local-device");
  const video = deriveLocalToolPriceProfile(tool({ id: "video-transcoder", name: "Video Transcoder", category: "video", engine: { type: "video" } }), "local.video_processing", "local-device");
  assert.equal(audio?.unitLabel, "audio-minute");
  assert.equal(audio?.subunitsPerUnit, 1_000);
  assert.equal(video?.unitLabel, "video-minute-720p");
  assert.equal(video?.subunitsPerUnit, 2_500);
});

test("PDF and archive tools use pages and byte-size units", () => {
  const pdf = deriveLocalToolPriceProfile(tool({ id: "pdf-merger", name: "PDF Merger", category: "pdf" }), "local.general", "local-device");
  const zip = deriveLocalToolPriceProfile(tool({ id: "zip-any-file", name: "ZIP Any File", category: "files" }), "local.general", "local-device");
  assert.equal(pdf?.unitLabel, "10-pages");
  assert.equal(pdf?.subunitsPerUnit, 200);
  assert.equal(zip?.unitLabel, "100-MiB-archive-input");
  assert.equal(zip?.subunitsPerUnit, 450);
});

test("Scene Studio is priced by rendered time, not as a generic operation", () => {
  const studio = deriveLocalToolPriceProfile(tool({ id: "scene-studio", name: "Scene Studio", category: "video" }), "local.general", "web-local");
  assert.equal(studio?.unitLabel, "render-minute");
  assert.equal(studio?.subunitsPerUnit, 1_500);
  assert.equal(studio?.workloadTier, "studio");
});

test("remote work does not receive a guessed local flat tariff", () => {
  assert.equal(deriveLocalToolPriceProfile(tool(), "ai.standard", "cloud-or-remote"), null);
});

test("provider cost uses an explicit gross-margin formula and rounds upward", () => {
  // $0.001050 provider estimate / (1 - 60% margin) = $0.002625 sell estimate.
  assert.equal(proposedProviderPriceUsdMicros(1_050, 6_000), 2_625);
  assert.equal(proposedSubunitsFromProviderCostUsdMicros(1_050, 6_000), 263);
  assert.equal(proposedSubunitsFromProviderCostUsdMicros(0, 6_000), 0);
});

test("provider cost and margin inputs fail closed when invalid", () => {
  assert.throws(() => proposedProviderPriceUsdMicros(-1, 6_000), RangeError);
  assert.throws(() => proposedProviderPriceUsdMicros(1_000, 10_000), RangeError);
  assert.throws(() => proposedProviderPriceUsdMicros(1.5, 6_000), RangeError);
});
