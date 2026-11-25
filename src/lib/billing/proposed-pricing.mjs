/**
 * Deterministic draft tariff calculator for device-local enV tools.
 *
 * These values are usage/value estimates, not measured device CPU costs or approved
 * prices. Remote provider work is deliberately excluded and priced from metered
 * provider/infrastructure cost instead.
 */
const textOf = (tool) => [
  tool.id, tool.name, tool.description, tool.category, tool.subcategory,
  tool.engine?.type, tool.engine?.op, tool.engine?.id,
  ...(tool.tags ?? []), ...(tool.keywords ?? []),
].filter(Boolean).join(" ").toLowerCase().replace(/[-_]+/g, " ");

const has = (value, pattern) => pattern.test(value);

/**
 * @param {object} tool
 * @param {string} billingKey
 * @param {string} executionMode
 * @returns {{
 *  unitLabel: string,
 *  subunitsPerUnit: number,
 *  usdMicrosPerUnit: number,
 *  tokensPerUnit: number,
 *  workloadTier: "light"|"standard"|"intensive"|"studio",
 *  pricingBasis: "device-workload-draft",
 *  pricingFormula: string,
 *  pricingFactors: string[],
 *  meteringDimensions: string[]
 * } | null}
 */
export function deriveLocalToolPriceProfile(tool, billingKey, executionMode) {
  if (!["local-device", "web-local"].includes(executionMode)) return null;

  const id = String(tool.id ?? "");
  const category = String(tool.category ?? "").toLowerCase();
  const engine = String(tool.engine?.type ?? "").toLowerCase();
  const identity = textOf(tool);
  const factors = [];
  let unitLabel = "operation";
  let subunitsPerUnit = 120;
  let workloadTier = "light";
  let pricingFormula = "120 milli-tokens per completed local operation.";
  let meteringDimensions = ["operation-count"];

  const batch = has(identity, /\b(batch|bulk|multiple files|folder|playlist|many items)\b/);
  const heavy = has(identity, /\b(upscal|denois|noise removal|separat|stems|spectrogram|transcod|render|encoding|compress|compression|archive|merge|merger|extract|ocr|recognition|background remover|cutout|simulation|physics engine)\b/);
  const explicitHighEnd = has(identity, /\b(high end|frontier|premium|advanced|professional|4k|8k|3d|ray tracing)\b/);

  if (id === "scene-studio" || (executionMode === "web-local" && has(identity, /\b(scene renderer|3d scene|world lab renderer)\b/))) {
    unitLabel = "render-minute";
    subunitsPerUnit = 1_500;
    workloadTier = "studio";
    pricingFormula = "1,500 milli-tokens per measured render-minute; scale by render time and output workload.";
    meteringDimensions = ["render-duration", "resolution", "frame-count", "scene-complexity"];
    factors.push("GPU/browser rendering workload", "render duration and output resolution");
  } else if (billingKey === "local.calculator") {
    unitLabel = "calculation";
    meteringDimensions = ["calculation-count", "formula-complexity"];
    const advanced = has(identity, /\b(matrix|calculus|derivative|integral|regression|statistical|statistics|probability distribution|differential|structural|thermodynamic|stoichiometry|molecular|fluid dynamics|engineering|electrical|braking force|stress analysis|beam|truss|mechanical)\b/);
    const business = has(identity, /\b(loan|mortgage|investment|compound interest|cash flow|tax|vat|profit|margin|break even|depreciation|payroll|inventory|pricing)\b/);
    if (advanced) {
      subunitsPerUnit = 250;
      workloadTier = "intensive";
      factors.push("multi-step scientific/engineering formula");
    } else if (business) {
      subunitsPerUnit = 175;
      workloadTier = "standard";
      factors.push("financial or business model with multiple input assumptions");
    } else {
      subunitsPerUnit = 100;
      workloadTier = "light";
      factors.push("single-formula or standard numeric calculation");
    }
    if (batch) {
      subunitsPerUnit += 50;
      factors.push("batch or list-based input");
    }
    pricingFormula = `${subunitsPerUnit} milli-tokens per calculation, based on formula complexity and list/batch workload.`;
  } else if (billingKey === "local.converter") {
    unitLabel = engine === "file-converter" || has(identity, /\b(file|document|pdf|docx|spreadsheet|archive)\b/) ? "file-conversion" : "conversion";
    meteringDimensions = unitLabel === "file-conversion" ? ["input-bytes", "file-count", "conversion-complexity"] : ["conversion-count", "input-precision"];
    subunitsPerUnit = unitLabel === "file-conversion" ? 300 : 100;
    if (batch) subunitsPerUnit += 100;
    workloadTier = subunitsPerUnit >= 300 ? "standard" : "light";
    factors.push(unitLabel === "file-conversion" ? "file parsing and format conversion" : "lightweight unit/value conversion");
    if (batch) factors.push("multiple files or batch conversion");
    pricingFormula = `${subunitsPerUnit} milli-tokens per ${unitLabel}; batch inputs add a workload increment.`;
  } else if (billingKey === "local.text") {
    unitLabel = "10k-characters";
    meteringDimensions = ["input-characters", "output-characters", "operation-count"];
    subunitsPerUnit = has(identity, /\b(compare|diff|deduplicate|sort|batch|extract|summarize|rewrite)\b/) ? 175 : 100;
    if (batch) subunitsPerUnit += 50;
    workloadTier = subunitsPerUnit > 100 ? "standard" : "light";
    factors.push("text length and transformation complexity");
    if (batch) factors.push("batch/list workload");
    pricingFormula = `${subunitsPerUnit} milli-tokens per 10,000 input characters, with a batch increment where applicable.`;
  } else if (billingKey === "local.image_basic" || billingKey === "local.image_intensive") {
    unitLabel = "megapixel-operation";
    meteringDimensions = ["input-pixels", "image-count", "operation-complexity", "output-pixels"];
    subunitsPerUnit = billingKey === "local.image_intensive" ? 600 : 250;
    if (heavy || explicitHighEnd) subunitsPerUnit += 200;
    if (batch) subunitsPerUnit += 150;
    workloadTier = subunitsPerUnit >= 600 ? "intensive" : "standard";
    factors.push("pixel count and image transformation");
    if (heavy) factors.push("computationally intensive image algorithm");
    if (batch) factors.push("multi-image batch");
    pricingFormula = `${subunitsPerUnit} milli-tokens per megapixel processed; multiply by megapixels and image count measured by the tool.`;
  } else if (billingKey === "local.audio_processing") {
    unitLabel = "audio-minute";
    meteringDimensions = ["audio-duration-seconds", "sample-rate", "channels", "codec", "algorithm-complexity"];
    subunitsPerUnit = heavy || explicitHighEnd ? 1_000 : 500;
    if (batch) subunitsPerUnit += 200;
    workloadTier = subunitsPerUnit >= 1_000 ? "intensive" : "standard";
    factors.push("audio duration, sample rate and channel count");
    if (heavy) factors.push("audio analysis, enhancement or multi-track processing");
    if (batch) factors.push("batch or multi-file processing");
    pricingFormula = `${subunitsPerUnit} milli-tokens per audio-minute at the tool's declared processing profile; scale by measured duration and channels.`;
  } else if (billingKey === "local.video_processing") {
    unitLabel = "video-minute-720p";
    meteringDimensions = ["video-duration-seconds", "resolution", "frame-rate", "frame-count", "codec", "operation-complexity"];
    subunitsPerUnit = heavy || explicitHighEnd ? 2_500 : 1_250;
    if (batch) subunitsPerUnit += 500;
    workloadTier = "intensive";
    factors.push("video duration, frame count and resolution");
    if (heavy) factors.push("transcoding, compositing or intensive frame processing");
    if (batch) factors.push("batch or multi-clip processing");
    pricingFormula = `${subunitsPerUnit} milli-tokens per video-minute at 720p baseline; scale by duration and resolution tier.`;
  } else if (category === "pdf" || engine === "document" || engine === "document-backend" || has(identity, /\b(pdf|document|docx|spreadsheet|presentation)\b/)) {
    unitLabel = "10-pages";
    meteringDimensions = ["page-count", "input-bytes", "output-bytes", "document-operation"];
    subunitsPerUnit = has(identity, /\b(ocr|recognition|extract|convert|render)\b/) ? 350 : 200;
    if (batch) subunitsPerUnit += 100;
    workloadTier = subunitsPerUnit > 200 ? "standard" : "light";
    factors.push("document page count and file size");
    if (has(identity, /\b(ocr|recognition|extract|convert|render)\b/)) factors.push("page extraction, OCR or rendering work");
    if (batch) factors.push("multi-document batch");
    pricingFormula = `${subunitsPerUnit} milli-tokens per 10 document pages; use the actual page count and measured output size.`;
  } else if (has(identity, /\b(zip|archive|unzip|compress|decompress|tar|gzip|7z)\b/)) {
    unitLabel = "100-MiB-archive-input";
    meteringDimensions = ["input-bytes", "file-count", "compression-level", "output-bytes"];
    subunitsPerUnit = heavy ? 450 : 250;
    if (batch) subunitsPerUnit += 150;
    workloadTier = subunitsPerUnit >= 400 ? "intensive" : "standard";
    factors.push("archive input size and compression level");
    if (batch) factors.push("many files or directory traversal");
    pricingFormula = `${subunitsPerUnit} milli-tokens per 100 MiB of input data; measure actual bytes and file count.`;
  } else if (has(identity, /\b(studio|laboratory|laboratories|lab|sandbox)\b/)) {
    unitLabel = "studio-operation";
    meteringDimensions = ["operation-count", "asset-count", "input-bytes", "render-duration", "output-bytes"];
    subunitsPerUnit = explicitHighEnd || heavy ? 1_000 : 500;
    if (batch) subunitsPerUnit += 250;
    workloadTier = "studio";
    factors.push("multi-step studio workflow and project assets");
    if (heavy) factors.push("rendering, simulation or media processing");
    if (batch) factors.push("batch or multi-asset operation");
    pricingFormula = `${subunitsPerUnit} milli-tokens per studio operation; resource-heavy sub-operations are measured separately.`;
  } else if (category === "files") {
    unitLabel = "file-operation";
    meteringDimensions = ["input-bytes", "file-count", "output-bytes"];
    subunitsPerUnit = heavy ? 350 : 150;
    if (batch) subunitsPerUnit += 100;
    workloadTier = subunitsPerUnit > 150 ? "standard" : "light";
    factors.push("file count, file size and transformation type");
    if (batch) factors.push("multi-file or folder workflow");
    pricingFormula = `${subunitsPerUnit} milli-tokens per file operation; scale by file count and bytes processed.`;
  } else {
    unitLabel = "operation";
    meteringDimensions = ["operation-count", "input-size-if-relevant", "output-size-if-relevant"];
    subunitsPerUnit = 120;
    if (heavy) subunitsPerUnit += 180;
    if (batch) subunitsPerUnit += 100;
    if (explicitHighEnd) subunitsPerUnit += 200;
    workloadTier = subunitsPerUnit >= 400 ? "intensive" : subunitsPerUnit > 120 ? "standard" : "light";
    factors.push("local operation and input/output size");
    if (heavy) factors.push("resource-intensive operation signal");
    if (batch) factors.push("batch or multi-item workload");
    if (explicitHighEnd) factors.push("explicit high-end output or quality requirement");
    pricingFormula = `${subunitsPerUnit} milli-tokens per operation, with modifiers for complexity, batch size and quality tier.`;
  }

  subunitsPerUnit = Math.max(50, Math.min(20_000, Math.round(subunitsPerUnit)));
  return {
    unitLabel,
    subunitsPerUnit,
    usdMicrosPerUnit: subunitsPerUnit * 10,
    tokensPerUnit: subunitsPerUnit / 1_000,
    workloadTier,
    pricingBasis: "device-workload-draft",
    pricingFormula,
    pricingFactors: factors,
    meteringDimensions,
  };
}
