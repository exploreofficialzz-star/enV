#!/usr/bin/env node
/** Generate a per-tool draft billing profile from authoritative tool metadata. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isOfflineLocalToolRecord, OFFLINE_LOCAL_DOCUMENT_TOOL_IDS } from "../src/lib/offline/local-operation-policy.mjs";
import { deriveLocalToolPriceProfile, TOOL_PRICE_PROPOSAL_VERSION } from "../src/lib/billing/proposed-pricing.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { tools: catalogTools } = await import("../src/data/catalog.ts");
const { getAllTools } = await import("../src/lib/registry.ts");
const nativeInventory = JSON.parse(await readFile(join(root, "apps/shared/native-engine-inventory.json"), "utf8"));
const { DATETIME_TOOL_EXTENSIONS } = await import("../src/lib/datetime/catalog-tools.ts");

// Native-only tools can live in the runtime registry without belonging to the
// generated base catalogue. Keep the base profile artifacts deterministic and store
// those explicit runtime extensions in a small, separately generated profile index.
const baseToolIds = new Set(catalogTools.map((tool) => tool.id));
const registryTools = getAllTools();
const runtimeExtensionTools = DATETIME_TOOL_EXTENSIONS.filter((tool) => !baseToolIds.has(tool.id));
for (const id of new Set(nativeInventory.runtimeExtensionIds ?? [])) {
  if (baseToolIds.has(id) || runtimeExtensionTools.some((tool) => tool.id === id)) continue;
  const runtimeTool = registryTools.find((tool) => tool.id === id);
  if (!runtimeTool) throw new Error(`Native runtime extension "${id}" has no registered tool metadata.`);
  runtimeExtensionTools.push(runtimeTool);
}
const tools = catalogTools;
const { METERED_OPERATION_RULES, PRICING_VERSION } = await import("../src/lib/billing/catalog.ts");
const ruleById = new Map(METERED_OPERATION_RULES.map((rule) => [rule.id, rule]));

const words = (tool) => `${tool.id} ${tool.name} ${tool.description}`.toLowerCase();
const isHeavyLocalMedia = (tool) => /\b(batch|upscal|separat|stems|denois|noise removal|transcod|merge|merger|compress|compression|extract|extractor|splitter|splitter|crop|resize|resample|spectrogram|waveform|audio joiner|video joiner|video merger|watermark|background remover|cutout|cut out|frame export|frame extraction)\b/.test(words(tool));
const isCalculatorLike = (tool) => /\bcalculator\b|\bcalculator$|\bcalculate\b|\bformula\b|\bestimator\b|\bbreak.?even\b|\bconverter$/.test(words(tool));
const isTranscription = (tool) => /transcrib|speech.?to.?text|audio.?to.?text|audio.?to.?subtitle|subtitle generator/.test(words(tool));
const isDocument = (tool) => tool.engine?.type === "document-backend" || tool.category === "pdf" || /\b(document|pdf|docx|spreadsheet|presentation)\b/.test(words(tool));
const isImageLike = (tool) => ["image", "photography", "screenshots"].includes(tool.category) || tool.engine?.type === "image";
const isAudioLike = (tool) => tool.category === "audio" || tool.engine?.type === "audio";
const isVideoLike = (tool) => tool.category === "video" || tool.engine?.type === "video";

function profile(tool) {
  const local = isOfflineLocalToolRecord(tool);
  let billingKey;
  let classificationReason;
  let meteringDimensions = ["operation-count"];
  let executionMode;
  let premiumRequired = false;

  // Scene Studio is implemented as a browser-local Web editor, but its editing,
  // GPU rendering and export are not implemented in native Kotlin/Swift. Keep this
  // distinct from device-local/offline operations so it cannot enter the offline
  // wallet cohort simply because the Web renderer runs on the client.
  if (tool.id === "scene-studio") {
    executionMode = "web-local";
    billingKey = "local.general";
    classificationReason = "Browser-local editor; native editing/rendering/export are Web-only, so this profile remains separate from the cross-platform offline token cohort pending verified native implementation.";
  } else if (tool.engine?.type === "ai") {
    // Direct AI execution is provider-metered even when legacy catalogue flags resemble a local tool.
    executionMode = "cloud-or-remote";
    const frontier = /\b(frontier|premium|high[- ]?end)\b/.test(words(tool));
    billingKey = frontier ? "ai.frontier" : "ai.standard";
    premiumRequired = frontier;
    classificationReason = frontier
      ? "Direct frontier AI execution; metering follows the selected model rate card, actual usage and verified entitlement."
      : "Direct AI execution; metering follows the selected model rate card, actual usage, attempts and fallbacks.";
    meteringDimensions = ["provider", "model", "input-tokens", "output-tokens", "audio-seconds", "compute-seconds", "attempt-count", "fallback-count"];
  } else if (!local) {
    executionMode = "cloud-or-remote";
    if (isTranscription(tool)) {
      billingKey = "cloud.transcription";
      classificationReason = "Backend execution metadata and transcription-related tool name/description.";
      meteringDimensions = ["audio-duration", "provider-cost", "input-size", "retry-count"];
    } else if (isDocument(tool)) {
      billingKey = "cloud.document_processing";
      classificationReason = "Backend execution metadata and document/PDF engine or category.";
      meteringDimensions = ["file-size", "page-count", "processing-time", "provider-cost"];
    } else if (isAudioLike(tool)) {
      billingKey = "cloud.audio_processing";
      classificationReason = "Backend execution metadata and audio category/engine.";
      meteringDimensions = ["duration", "sample-rate", "channels", "codec", "processing-time", "provider-cost"];
    } else if (isVideoLike(tool)) {
      billingKey = "cloud.video_processing";
      classificationReason = "Backend execution metadata and video category/engine.";
      meteringDimensions = ["duration", "resolution", "frame-count", "codec", "processing-time", "provider-cost"];
    } else if (isImageLike(tool)) {
      billingKey = "cloud.image_processing";
      classificationReason = "Backend execution metadata and image/photo/screenshot category or engine.";
      meteringDimensions = ["pixel-count", "image-count", "model-cost", "processing-time", "provider-cost"];
    } else {
      billingKey = "cloud.generic_processing";
      classificationReason = "Backend execution metadata; a per-tool processor-cost mapping is still required.";
      meteringDimensions = ["input-size", "processing-time", "provider-cost", "retries"];
    }
  } else {
    executionMode = "local-device";
    if (tool.engine?.type === "calculator" || tool.category === "calculators" || (tool.category === "business" && isCalculatorLike(tool)) || (tool.category === "video" && isCalculatorLike(tool))) {
      billingKey = "local.calculator";
      classificationReason = "Local execution metadata plus calculator/formula intent.";
    } else if (tool.category === "converters" || tool.engine?.type === "converter" || tool.engine?.type === "file-converter") {
      billingKey = "local.converter";
      classificationReason = "Local execution metadata plus converter category/engine.";
      meteringDimensions = ["operation-count", "input-size-if-relevant"];
    } else if (tool.category === "text" || tool.engine?.type === "text") {
      billingKey = "local.text";
      classificationReason = "Local execution metadata plus text tool category/engine.";
    } else if (tool.category === "audio" || tool.engine?.type === "audio") {
      billingKey = "local.audio_processing";
      classificationReason = "Local execution metadata plus audio category/engine; duration-sensitive billing needs tool instrumentation.";
      meteringDimensions = ["operation-count", "duration", "sample-rate", "channels"];
    } else if (tool.category === "video" || tool.engine?.type === "video") {
      billingKey = isHeavyLocalMedia(tool) ? "local.video_processing" : "local.general";
      classificationReason = "Local execution metadata plus video category/engine; media operations receive an intensity-based draft profile.";
      meteringDimensions = ["operation-count", "duration-if-relevant", "resolution-if-relevant"];
    } else if (isImageLike(tool)) {
      billingKey = isHeavyLocalMedia(tool) ? "local.image_intensive" : "local.image_basic";
      classificationReason = "Local execution metadata plus image/photo/screenshot category or engine.";
      meteringDimensions = ["operation-count", "pixel-count", "image-count"];
    } else if (["mockups", "design", "photography", "streaming"].includes(tool.category) && isHeavyLocalMedia(tool)) {
      billingKey = "local.image_intensive";
      classificationReason = "Local execution metadata and image/media-intensive name or description signals.";
      meteringDimensions = ["operation-count", "pixel-count-if-relevant", "input-size-if-relevant"];
    } else if (["media", "media-tools"].includes(tool.category)) {
      billingKey = "local.media_processing";
      classificationReason = "Explicit local media-tool category; operation-specific resource dimensions require review.";
      meteringDimensions = ["operation-count", "input-size-if-relevant", "duration-if-relevant"];
    } else {
      billingKey = "local.general";
      classificationReason = OFFLINE_LOCAL_DOCUMENT_TOOL_IDS.has(tool.id)
        ? "Explicitly implemented local document operation in DocumentToolsEngine; the legacy tool-level backend flag is retained for hybrid routing."
        : "Local execution metadata; an individual workload-based rate is generated from this tool identifier, its category, operation description and measured cost-driver dimensions; benchmark and manual review remain required.";
    }
  }

  const rule = ruleById.get(billingKey);
  if (!rule) throw new Error("No metering rule: " + billingKey + " for tool " + tool.id);
  const localPrice = deriveLocalToolPriceProfile(tool, billingKey, executionMode);
  const isDirectAi = tool.engine?.type === "ai";
  const priceStatus = localPrice ? "provisional" : "requires-cost-measurement";
  const pricingBasis = localPrice
    ? localPrice.pricingBasis
    : isDirectAi ? "provider-model-rate-card" : "provider-invoice-and-infrastructure-cost";
  const pricingFormula = localPrice
    ? localPrice.pricingFormula
    : isDirectAi
      ? "Measured input/output tokens, audio seconds or compute seconds multiplied by the selected model rate; include retries and fallbacks. The draft sell price uses the provisional margin."
      : "Measured processor invoice plus allocated CPU, memory, processing time, storage and bandwidth; no fixed fee before cost capture.";
  const profileDimensions = localPrice?.meteringDimensions ?? meteringDimensions;
  const proposedSubunitsPerUnit = localPrice?.subunitsPerUnit ?? null;
  return {
    toolId: tool.id,
    toolName: tool.name,
    category: tool.category,
    toolStatus: tool.status,
    engineType: tool.engine?.type ?? "unknown",
    clientSide: Boolean(tool.clientSide),
    requiresBackend: Boolean(tool.requiresBackend),
    executionMode,
    billingKey,
    pricingMode: rule.pricingMode,
    provisionalSubunitsPerUnit: proposedSubunitsPerUnit,
    proposedSubunitsPerUnit,
    proposedTokensPerUnit: localPrice?.tokensPerUnit ?? null,
    proposedUsdMicrosPerUnit: localPrice?.usdMicrosPerUnit ?? null,
    unitLabel: localPrice?.unitLabel ?? rule.unitLabel,
    meteringDimensions: profileDimensions,
    workloadTier: localPrice?.workloadTier ?? (isDirectAi ? "provider-metered" : "infrastructure-metered"),
    pricingBasis,
    pricingFormula,
    pricingFactors: localPrice?.pricingFactors ?? (isDirectAi
      ? ["provider/model input-output rates", "audio/compute usage when applicable", "attempts, retries and fallbacks"]
      : ["provider/infrastructure invoice", "measured CPU and memory allocation", "input/output bytes, elapsed time, storage and egress"]),
    optionalAiAssistProfile: null,
    premiumRequired: premiumRequired || rule.premiumRequired === true,
    priceStatus,
    manualAuditRequired: true,
    classificationReason,
    pricingVersion: PRICING_VERSION,
    toolPriceVersion: TOOL_PRICE_PROPOSAL_VERSION,
  };
}

const sortedTools = [...tools].sort((a, b) => a.id.localeCompare(b.id));
const profiles = sortedTools.map(profile);
const runtimeExtensionProfiles = [...runtimeExtensionTools]
  .sort((a, b) => a.id.localeCompare(b.id))
  .map(profile);
const allGeneratedProfiles = [...profiles, ...runtimeExtensionProfiles];
const duplicateIds = allGeneratedProfiles.filter((p, i) => allGeneratedProfiles.findIndex((other) => other.toolId === p.toolId) !== i).map((p) => p.toolId);
if (duplicateIds.length) throw new Error(`Duplicate tool profile IDs: ${duplicateIds.slice(0, 10).join(", ")}`);
const profileIds = new Set(allGeneratedProfiles.map((p) => p.toolId));
const nativeToolCoverage = {};
for (const [platform, key] of [["Android", "androidToolIds"], ["iOS", "iosToolIds"]]) {
  const ids = nativeInventory[key];
  if (!Array.isArray(ids)) throw new Error(`Native inventory has no ${key} array.`);
  const unique = new Set(ids);
  const missing = [...unique].filter((id) => !profileIds.has(id));
  if (unique.size !== ids.length) throw new Error(`${platform} native inventory contains duplicate tool IDs.`);
  if (missing.length) throw new Error(`${platform} has ${missing.length} tool IDs without billing profiles: ${missing.slice(0, 20).join(", ")}`);
  nativeToolCoverage[platform] = unique.size;
}

const dataPath = join(root, "src/data/billing-profiles.json");
await mkdir(dirname(dataPath), { recursive: true });
await writeFile(dataPath, `${JSON.stringify({ pricingVersion: PRICING_VERSION, toolCount: profiles.length, profiles }, null, 2)}\n`);
const indexProfiles = profiles.map(({ toolId, billingKey, pricingMode, provisionalSubunitsPerUnit, unitLabel, optionalAiAssistProfile, premiumRequired }) => ({ toolId, billingKey, pricingMode, provisionalSubunitsPerUnit, unitLabel, optionalAiAssistProfile, premiumRequired }));
await writeFile(join(root, "src/data/billing-profile-index.json"), `${JSON.stringify({ pricingVersion: PRICING_VERSION, toolCount: indexProfiles.length, profiles: indexProfiles })}\n`);
await writeFile(join(root, "src/data/billing-profile-runtime-extensions.json"), `${JSON.stringify({ pricingVersion: PRICING_VERSION, toolCount: runtimeExtensionProfiles.length, profiles: runtimeExtensionProfiles }, null, 2)}\n`);
const localProposals = allGeneratedProfiles.filter((profile) => Number.isSafeInteger(profile.proposedSubunitsPerUnit) && profile.proposedSubunitsPerUnit > 0);
const aiProposals = allGeneratedProfiles.filter((profile) => profile.pricingBasis === "provider-model-rate-card");
const infrastructurePending = allGeneratedProfiles.filter((profile) => profile.pricingBasis === "provider-invoice-and-infrastructure-cost");
const rateDistribution = Object.fromEntries([...localProposals.reduce((map, profile) => {
  const rate = profile.proposedSubunitsPerUnit;
  map.set(rate, (map.get(rate) ?? 0) + 1);
  return map;
}, new Map())].sort((a, b) => Number(a[0]) - Number(b[0])));
const proposalReport = [
  "# enV per-tool proposed workload rates — 2026-11-25",
  "",
  "Version: " + TOOL_PRICE_PROPOSAL_VERSION,
  "",
  "This is the generated draft rate schedule for every tool profile. Local rates are workload-based prices, not a claim about measured handset CPU bills. AI rates are calculated from the selected provider/model and actual returned usage. Cloud/media/document rates remain tied to measured processor and infrastructure cost.",
  "",
  "- Numeric local tool rates: " + localProposals.length.toLocaleString("en-US"),
  "- AI tools with provider/model metering: " + aiProposals.length.toLocaleString("en-US"),
  "- Cloud/remote tools awaiting invoice and infrastructure allocation: " + infrastructurePending.length.toLocaleString("en-US"),
  "- Total generated profiles: " + allGeneratedProfiles.length.toLocaleString("en-US"),
  "",
  "## Proposed local rate distribution",
  "",
  "| Milli-tokens per unit | enV Tokens | USD reference per unit | Tools |",
  "|---:|---:|---:|---:|",
  ...Object.entries(rateDistribution).map(([rate, count]) => "| " + rate + " | " + (Number(rate) / 1000).toFixed(3) + " | $" + (Number(rate) / 100000).toFixed(5) + " | " + count + " |"),
  "",
  "## Metering rules",
  "",
  "- Each local profile contains its own tool ID, unit, proposed milli-token rate, cost-driver dimensions, formula and factors. Rates are calculated from the operation type and workload metadata; they remain provisional pending benchmarks and approval.",
  "- AI operations use provider-specific input/output-token, audio-second or compute-second prices. The selected model and usage record determine the proposed amount. Model registry estimates are not provider invoices.",
  "- Remote media, document and processor operations use measured provider invoices and allocated infrastructure cost. They receive no invented fixed fee while invoice-level cost is missing.",
  "- The separate 267-tool ad-free session access tariff is not an operation price and is not substituted for this per-tool schedule.",
  "- Advertising eligibility is a separate policy. Studio, Labs, Sandbox, AI and high-end tools remain outside Adsterra regardless of their billing profile.",
  "- All proposed rates are non-billable until their profile is audited and production billing is separately enabled.",
].join("\n");
await writeFile(join(root, "docs/billing-proposed-prices-2026-11-25.md"), proposalReport);

const fullCountBy = (key) => Object.fromEntries([...allGeneratedProfiles.reduce((map, profile) => map.set(profile[key], (map.get(profile[key]) ?? 0) + 1), new Map())].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
const fullByRule = fullCountBy("billingKey");
const fullByExecution = fullCountBy("executionMode");
const report = [
  "# enV catalogue-wide per-tool billing audit — 2026-11-25",
  "",
  "Generated from the authoritative Web catalogue and native runtime-extension registry. Every tool ID receives an individually addressable profile. Local workload rates are draft value/usage estimates, not measured handset CPU costs. Variable AI/provider and remote infrastructure work remain usage/invoice-driven. No profile in this report is approved for live token deductions.",
  "",
  "- Base catalogue tools: " + profiles.length.toLocaleString("en-US"),
  "- Runtime extension tools: " + runtimeExtensionProfiles.length.toLocaleString("en-US"),
  "- Total profiles: " + allGeneratedProfiles.length.toLocaleString("en-US"),
  "- Local/web-local profiles with numeric workload tariffs: " + localProposals.length.toLocaleString("en-US"),
  "- Direct AI profiles with model-rate metering: " + aiProposals.length.toLocaleString("en-US"),
  "- Remote profiles awaiting provider/infrastructure allocation: " + infrastructurePending.length.toLocaleString("en-US"),
  "- Android native inventory IDs covered: " + nativeToolCoverage.Android.toLocaleString("en-US"),
  "- iOS native inventory IDs covered: " + nativeToolCoverage.iOS.toLocaleString("en-US"),
  "",
  "## Execution distribution",
  "",
  "| Execution mode | Tools |",
  "|---|---:|",
  ...Object.entries(fullByExecution).map(([key, count]) => "| " + key + " | " + count + " |"),
  "",
  "## Billing classification distribution",
  "",
  "| Billing key | Tools |",
  "|---|---:|",
  ...Object.entries(fullByRule).map(([key, count]) => "| \`" + key + "\` | " + count + " |"),
  "",
  "## Pricing interpretation",
  "",
  "- Local/web-local tools receive an individual numeric draft rate, tool-specific unit, workload tier, formula, factors and metering dimensions. The selected unit must be calculated from the operation actually completed.",
  "- Direct AI tools are priced from the selected provider/model's input/output tokens, audio seconds or compute seconds. Returned usage is recorded with model-registry estimated cost, retries/fallback indicators and a provisional margin. This is not a final provider invoice.",
  "- Other cloud/remote tools remain unpriced until per-tool provider invoices and infrastructure allocations can be recorded. Do not divide Render service-wide graphs across tools as though they were tool-level invoices.",
  "- The separate 267-tool ad-free access/session rate is not an operation price and does not replace the per-tool workload schedule.",
  "- Ad eligibility is determined by the separate Adsterra policy; a billing profile never grants ad eligibility.",
  "- Every row remains manual-audit-required and non-billable until benchmarks, exact measurement wiring, finance approval, reservations, settlement and production tests are complete.",
  "",
  "## Generated source of truth",
  "",
  "- \`src/data/billing-profiles.json\`: full profile for each base catalogue tool.",
  "- \`src/data/billing-profile-runtime-extensions.json\`: additional native/runtime tools.",
  "- \`src/lib/billing/proposed-pricing.mjs\`: deterministic draft workload calculator.",
  "- \`docs/billing-proposed-prices-2026-11-25.md\`: local rate distribution and per-tool pricing policy.",
].join("\n");
await writeFile(join(root, "docs/billing-tool-audit-2026-10-18.md"), report);
console.log(`[billing-profile] generated ${profiles.length} Web tool profiles; native coverage Android=${nativeToolCoverage.Android}, iOS=${nativeToolCoverage.iOS}. Local=${fullByExecution["local-device"] ?? 0}; remote=${fullByExecution["cloud-or-remote"] ?? 0}; rules=${JSON.stringify(fullByRule)}`);
